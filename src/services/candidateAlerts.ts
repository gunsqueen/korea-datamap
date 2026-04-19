import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { LocalNotifications, type PermissionStatus } from '@capacitor/local-notifications';
import type { CandidateRegistrationCandidate } from '../types';
import type { LocalCandidateElectionId } from './candidateRegistration';
import { fetchCandidateRegistration } from './candidateRegistration';
import { FAV_KEY, type RegionHistoryItem } from '../hooks/useRegionHistory';

const SNAPSHOT_KEY = 'datamap.candidate-alerts.snapshot.v1';
const LAST_SCAN_KEY = 'datamap.candidate-alerts.last-scan.v1';
const CHANNEL_ID = 'candidate-alerts';
const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_SUMMARY_LINES = 3;

const WATCH_ELECTION_IDS: LocalCandidateElectionId[] = [
  'local_9_metro_mayor',
  'local_9_mayor',
  'local_9_council_district',
  'local_9_council_pr',
  'local_9_basic_district',
  'local_9_basic_pr',
];

interface CandidateStatusSnapshot {
  name: string;
  party: string;
  district: string;
  status: string;
}

interface CandidateQuerySnapshot {
  label: string;
  candidates: Record<string, CandidateStatusSnapshot>;
}

type SnapshotStore = Record<string, CandidateQuerySnapshot>;

interface CandidateAlertEvent {
  fingerprint: string;
  title: string;
  body: string;
}

function safeLoad<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSave<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage write failure
  }
}

function buildCandidateKey(candidate: CandidateRegistrationCandidate): string {
  return [
    candidate.name.trim(),
    candidate.party.trim(),
    candidate.district.trim(),
  ].join('|');
}

function toSnapshotMap(candidates: CandidateRegistrationCandidate[]): Record<string, CandidateStatusSnapshot> {
  return Object.fromEntries(
    candidates.map((candidate) => [
      buildCandidateKey(candidate),
      {
        name: candidate.name,
        party: candidate.party,
        district: candidate.district,
        status: candidate.status,
      },
    ]),
  );
}

function readFavoriteAreas(): RegionHistoryItem[] {
  return safeLoad<RegionHistoryItem[]>(FAV_KEY, []);
}

function buildQueryLabel(areaName: string, subType: string) {
  return `${areaName} · ${subType}`;
}

function normalizeStatus(value: string) {
  return value.trim() || '상태 미상';
}

function buildDailySummary(events: CandidateAlertEvent[]) {
  const added = events.filter((event) => event.title.includes('후보 추가')).length;
  const withdrawn = events.filter((event) => event.title.includes('후보 사퇴')).length;
  const statusChanged = events.filter((event) => event.title.includes('등록 상태 변경')).length;
  const headlineParts = [
    added > 0 ? `후보 추가 ${added}건` : null,
    withdrawn > 0 ? `후보 사퇴 ${withdrawn}건` : null,
    statusChanged > 0 ? `상태 변경 ${statusChanged}건` : null,
  ].filter(Boolean);
  const previewLines = events
    .slice(0, MAX_SUMMARY_LINES)
    .map((event) => event.body.replace(/\.$/, ''));

  return {
    title: `관심 선거구 일일 업데이트 ${events.length}건`,
    body: [
      headlineParts.join(' · '),
      ...previewLines,
    ].filter(Boolean).join('\n'),
  };
}

function buildAlertEvents(
  previous: CandidateQuerySnapshot | undefined,
  current: CandidateQuerySnapshot,
  queryKey: string,
): CandidateAlertEvent[] {
  if (!previous) return [];

  const events: CandidateAlertEvent[] = [];
  const previousCandidates = previous.candidates;
  const currentCandidates = current.candidates;

  for (const [candidateKey, candidate] of Object.entries(currentCandidates)) {
    const before = previousCandidates[candidateKey];
    if (!before) {
      events.push({
        fingerprint: `${queryKey}|added|${candidateKey}|${candidate.status}`,
        title: `${current.label} 후보 추가`,
        body: `${candidate.name} (${candidate.party}) 후보가 새로 등록되었습니다.`,
      });
      continue;
    }

    if (before.status === candidate.status) continue;

    const nextStatus = normalizeStatus(candidate.status);
    const previousStatus = normalizeStatus(before.status);
    const isWithdrawal = nextStatus === '사퇴';
    events.push({
      fingerprint: `${queryKey}|status|${candidateKey}|${previousStatus}|${nextStatus}`,
      title: isWithdrawal ? `${current.label} 후보 사퇴` : `${current.label} 등록 상태 변경`,
      body: isWithdrawal
        ? `${candidate.name} (${candidate.party}) 후보가 사퇴했습니다.`
        : `${candidate.name} (${candidate.party}) 후보 상태가 ${previousStatus}에서 ${nextStatus}(으)로 변경되었습니다.`,
    });
  }

  return events;
}

async function ensurePermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  let permission: PermissionStatus;
  try {
    permission = await LocalNotifications.checkPermissions();
  } catch {
    return false;
  }

  if (permission.display === 'granted') return true;

  try {
    permission = await LocalNotifications.requestPermissions();
  } catch {
    return false;
  }
  return permission.display === 'granted';
}

let channelReady = false;
async function ensureChannel() {
  if (!Capacitor.isNativePlatform() || channelReady || Capacitor.getPlatform() !== 'android') return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: '관심 선거구 알림',
      description: '후보 등록 변동 알림',
      importance: 4,
      visibility: 1,
    });
    channelReady = true;
  } catch {
    // ignore channel creation failure
  }
}

let listenerRegistered = false;
export async function ensureCandidateAlertNotificationSetup() {
  if (!Capacitor.isNativePlatform() || listenerRegistered) return;

  await ensureChannel();
  CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      void scanFavoriteCandidateAlerts();
    }
  });
  listenerRegistered = true;
}

let scanPromise: Promise<void> | null = null;

export async function scanFavoriteCandidateAlerts(force = false): Promise<void> {
  if (scanPromise) return scanPromise;

  scanPromise = (async () => {
    const favorites = readFavoriteAreas();
    if (favorites.length === 0) return;

    if (!(await ensurePermissions())) return;

    const lastScanAt = safeLoad<number>(LAST_SCAN_KEY, 0);
    if (!force && Date.now() - lastScanAt < SCAN_INTERVAL_MS) return;

    const previousSnapshots = safeLoad<SnapshotStore>(SNAPSHOT_KEY, {});
    const nextSnapshots: SnapshotStore = { ...previousSnapshots };
    const events: CandidateAlertEvent[] = [];

    const seenQueryKeys = new Set<string>();

    for (const favorite of favorites) {
      for (const electionId of WATCH_ELECTION_IDS) {
        const queryKey = `${favorite.adm_cd}|${electionId}`;
        if (seenQueryKeys.has(queryKey)) continue;
        seenQueryKeys.add(queryKey);

        try {
          const data = await fetchCandidateRegistration({
            admCd: favorite.adm_cd,
            electionId,
          });

          const currentSnapshot: CandidateQuerySnapshot = {
            label: buildQueryLabel(data.adm_nm, data.sub_type),
            candidates: toSnapshotMap(data.candidates),
          };

          const previousSnapshot = previousSnapshots[queryKey];
          events.push(...buildAlertEvents(previousSnapshot, currentSnapshot, queryKey));
          nextSnapshots[queryKey] = currentSnapshot;
        } catch {
          // Ignore individual query failures and continue scanning others.
        }
      }
    }

    safeSave(SNAPSHOT_KEY, nextSnapshots);
    safeSave(LAST_SCAN_KEY, Date.now());

    if (events.length === 0) return;

    await ensureChannel();
    const summary = buildDailySummary(events);
    const notifications = [{
      id: Number(`${Date.now()}`.slice(-8)),
      title: summary.title,
      body: summary.body,
      schedule: { at: new Date() },
      channelId: CHANNEL_ID,
    }];

    try {
      await LocalNotifications.schedule({ notifications });
    } catch {
      // Swallow notification scheduling errors so scans still persist snapshots.
    }
  })().finally(() => {
    scanPromise = null;
  });

  return scanPromise;
}
