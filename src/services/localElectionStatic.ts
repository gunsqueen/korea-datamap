import type { ElectionData, Candidate } from '../types';
import { attachElectionDebugMeta, logElectionDecision } from './electionDebug';

interface StaticCandidateEntry {
  name?: string;
  party: string;
  votes: number;
}

interface StaticElectionEntry {
  election_district: string;
  total_voters: number;
  total_votes: number;
  valid_votes: number;
  invalid_votes: number;
  national_winner?: string;
  candidates: StaticCandidateEntry[];
}

type StaticElectionMap = Record<string, StaticElectionEntry>;

// 파일별 지연 로딩 캐시
const dataCache = new Map<string, StaticElectionMap>();
// assembly 지역구: sido|dong → entry (선거구명 우회)
const dongIndexCache = new Map<string, Record<string, StaticElectionEntry | null>>();

const PARTY_COLORS: Record<string, string> = {
  '더불어민주당': '#004EA2', '민주당': '#004EA2', '더불어민주연합': '#004EA2',
  '국민의힘': '#E61E2B', '자유한국당': '#E61E2B', '새누리당': '#E61E2B', '국민의미래': '#E61E2B',
  '정의당': '#FFCC00', '녹색정의당': '#FFCC00',
  '바른미래당': '#00B0B9', '국민의당': '#EA5504', '안철수신당': '#EA5504',
  '개혁신당': '#FF7210', '새로운미래': '#0066B2',
  '진보당': '#D6001C', '노동당': '#D6001C',
  '기본소득당': '#82C8A0', '시대전환': '#5C2D91',
  '더불어시민당': '#004EA2', '미래한국당': '#E61E2B',
  '새정치민주연합': '#004EA2', '통합진보당': '#D6001C', '새정치당': '#999999',
  '열린민주당': '#003DA5', '민중당': '#D6001C', '무소속': '#999999',
};

function getPartyColor(party: string): string {
  return PARTY_COLORS[party] ?? '#888888';
}

// 선거 ID → 메타정보 매핑
const ELECTION_META: Record<string, { name: string; date: string; subType: string; electionType: string; nationalWinner?: string }> = {
  presidential_18: { name: '제18대 대통령선거', date: '2012-12-19', subType: '', electionType: 'presidential', nationalWinner: '박근혜' },
  presidential_19: { name: '제19대 대통령선거', date: '2017-05-09', subType: '', electionType: 'presidential', nationalWinner: '문재인' },
  presidential_20: { name: '제20대 대통령선거', date: '2022-03-09', subType: '', electionType: 'presidential', nationalWinner: '윤석열' },
  presidential_21: { name: '제21대 대통령선거', date: '2025-06-03', subType: '', electionType: 'presidential', nationalWinner: '이재명' },
  local_8_metro_mayor:      { name: '제8회 전국동시지방선거', date: '2022-06-01', subType: '광역단체장', electionType: 'local' },
  local_8_mayor:            { name: '제8회 전국동시지방선거', date: '2022-06-01', subType: '단체장', electionType: 'local' },
  local_8_council_district: { name: '제8회 전국동시지방선거', date: '2022-06-01', subType: '광역의원(지역구)', electionType: 'local' },
  local_8_council_pr:       { name: '제8회 전국동시지방선거', date: '2022-06-01', subType: '광역의원(비례)', electionType: 'local' },
  local_8_basic_district:   { name: '제8회 전국동시지방선거', date: '2022-06-01', subType: '기초의원(지역구)', electionType: 'local' },
  local_8_basic_pr:         { name: '제8회 전국동시지방선거', date: '2022-06-01', subType: '기초의원(비례)', electionType: 'local' },
  local_7_metro_mayor:      { name: '제7회 전국동시지방선거', date: '2018-06-13', subType: '광역단체장', electionType: 'local' },
  local_7_mayor:            { name: '제7회 전국동시지방선거', date: '2018-06-13', subType: '단체장', electionType: 'local' },
  local_7_council_district: { name: '제7회 전국동시지방선거', date: '2018-06-13', subType: '광역의원(지역구)', electionType: 'local' },
  local_7_council_pr:       { name: '제7회 전국동시지방선거', date: '2018-06-13', subType: '광역의원(비례)', electionType: 'local' },
  local_7_basic_district:   { name: '제7회 전국동시지방선거', date: '2018-06-13', subType: '기초의원(지역구)', electionType: 'local' },
  local_7_basic_pr:         { name: '제7회 전국동시지방선거', date: '2018-06-13', subType: '기초의원(비례)', electionType: 'local' },
  local_6_metro_mayor:      { name: '제6회 전국동시지방선거', date: '2014-06-04', subType: '광역단체장', electionType: 'local' },
  local_6_mayor:            { name: '제6회 전국동시지방선거', date: '2014-06-04', subType: '단체장', electionType: 'local' },
  local_6_council_district: { name: '제6회 전국동시지방선거', date: '2014-06-04', subType: '광역의원(지역구)', electionType: 'local' },
  local_6_council_pr:       { name: '제6회 전국동시지방선거', date: '2014-06-04', subType: '광역의원(비례)', electionType: 'local' },
  local_6_basic_district:   { name: '제6회 전국동시지방선거', date: '2014-06-04', subType: '기초의원(지역구)', electionType: 'local' },
  local_6_basic_pr:         { name: '제6회 전국동시지방선거', date: '2014-06-04', subType: '기초의원(비례)', electionType: 'local' },
  assembly_22_district: { name: '제22대 국회의원선거', date: '2024-04-10', subType: '지역구', electionType: 'assembly' },
  assembly_22_pr:       { name: '제22대 국회의원선거', date: '2024-04-10', subType: '비례대표', electionType: 'assembly' },
  assembly_21_district: { name: '제21대 국회의원선거', date: '2020-04-15', subType: '지역구', electionType: 'assembly' },
  assembly_21_pr:       { name: '제21대 국회의원선거', date: '2020-04-15', subType: '비례대표', electionType: 'assembly' },
  assembly_20_district: { name: '제20대 국회의원선거', date: '2016-04-13', subType: '지역구', electionType: 'assembly' },
  assembly_20_pr:       { name: '제20대 국회의원선거', date: '2016-04-13', subType: '비례대표', electionType: 'assembly' },
  assembly_19_district: { name: '제19대 국회의원선거', date: '2012-04-11', subType: '지역구', electionType: 'assembly' },
  assembly_19_pr:       { name: '제19대 국회의원선거', date: '2012-04-11', subType: '비례대표', electionType: 'assembly' },
};

async function loadStaticData(electionId: string): Promise<StaticElectionMap> {
  if (dataCache.has(electionId)) return dataCache.get(electionId)!;
  try {
    const mod = await import(`../data/static/${electionId}.json`);
    const data = mod.default as StaticElectionMap;
    dataCache.set(electionId, data);
    return data;
  } catch {
    const emptyData: StaticElectionMap = {};
    dataCache.set(electionId, emptyData);
    return emptyData;
  }
}

function buildStaticLookupKeys(admNm: string): string[] {
  const parts = admNm.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) return [];

  const sido = parts[0];
  const dong = parts[parts.length - 1];
  const middleParts = parts.slice(1, -1);
  const middleJoined = middleParts.join('');
  const middleSpaced = middleParts.join(' ');

  const keys = [
    `${sido}|${middleJoined}|${dong}`,
    `${sido}|${middleSpaced}|${dong}`,
  ];

  if (middleParts.length >= 1) {
    keys.push(`${sido}|${middleParts[0]}|${dong}`);
  }

  if (middleParts.length >= 2) {
    keys.push(`${sido}|${middleParts[middleParts.length - 1]}|${dong}`);
    keys.push(`${sido}|${middleParts.slice(-2).join('')}|${dong}`);
  }

  return [...new Set(keys.filter(Boolean))];
}

export async function lookupLocalElectionDong(
  electionId: string,
  admCd: string,
  admNm: string,
): Promise<ElectionData | null> {
  const meta = ELECTION_META[electionId];
  if (!meta) return null;

  const data = await loadStaticData(electionId);
  const parts = admNm.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;

  const sido = parts[0];
  const dong = parts[parts.length - 1];
  const candidateKeys = buildStaticLookupKeys(admNm);

  let matchedKey = candidateKeys[0] ?? admNm;
  let entry: StaticElectionEntry | undefined;

  for (const key of candidateKeys) {
    if (data[key]) {
      matchedKey = key;
      entry = data[key];
      break;
    }
  }

  // assembly 지역구만: 선거구명(강서구갑)이 key에 쓰이므로 시군구명(강서구)으로 찾을 수 없음
  // sido|dong 인덱스로 재시도 (local 선거는 시군구 기반 키이므로 제외)
  if (!entry && electionId.startsWith('assembly_') && electionId.endsWith('_district')) {
    if (!dongIndexCache.has(electionId)) {
      const idx: Record<string, StaticElectionEntry | null> = {};
      for (const [k, v] of Object.entries(data)) {
        const [s, , d] = k.split('|');
        if (!s || !d) continue;
        const dongKey = `${s}|${d}`;
        idx[dongKey] = idx[dongKey] && idx[dongKey] !== v ? null : v;
      }
      dongIndexCache.set(electionId, idx);
    }
    matchedKey = `${sido}|${dong}`;
    entry = dongIndexCache.get(electionId)![matchedKey] ?? undefined;
  }

  if (!entry) {
    logElectionDecision(
      { requestedAdminCode: admCd, requestedAdminName: admNm, electionId },
      {
        sourceType: 'snapshot',
        matchedRegionName: matchedKey,
        matchedRegionCode: admCd,
        recordCount: 0,
        fallbackReason: 'static exact match missing',
      },
      { data: null, mappingSucceeded: false },
    );
    return null;
  }

  // 실제 당선인: presidential은 전국 당선인, local은 지역 1위
  const nationalWinner = entry.national_winner ?? meta.nationalWinner;

  const candidates: Candidate[] = entry.candidates
    .filter((c) => c.votes > 0 || c.party)
    .map((c) => ({
      name: c.name || c.party,
      party: c.party,
      party_color: getPartyColor(c.party),
      votes: c.votes,
      vote_rate: entry.valid_votes > 0 ? Math.round((c.votes / entry.valid_votes) * 10000) / 100 : 0,
      rank: 0,
      elected: false,
    }))
    .sort((a, b) => b.votes - a.votes);

  candidates.forEach((c, i) => { c.rank = i + 1; });

  if (nationalWinner) {
    // 전국 당선인을 elected로 표시
    const winnerCand = candidates.find((c) => c.name === nationalWinner);
    if (winnerCand) winnerCand.elected = true;
  } else {
    // 지방선거 등 지역 당선자: 1위
    if (candidates.length > 0) candidates[0].elected = true;
  }

  const turnout = entry.total_voters > 0 ? Math.round((entry.total_votes / entry.total_voters) * 10000) / 100 : 0;

  const result = attachElectionDebugMeta({
    adm_cd: admCd,
    adm_nm: admNm,
    election_type: meta.electionType as 'presidential' | 'assembly' | 'local',
    election_name: meta.name,
    election_date: meta.date,
    sub_type: meta.subType || undefined,
    total_voters: entry.total_voters,
    total_votes: entry.total_votes,
    valid_votes: entry.valid_votes,
    invalid_votes: entry.invalid_votes,
    turnout_rate: turnout,
    candidates,
  }, {
    sourceType: 'snapshot',
    matchedRegionName: matchedKey,
    matchedRegionCode: admCd,
    recordCount: 1,
  });

  logElectionDecision(
    { requestedAdminCode: admCd, requestedAdminName: admNm, electionId },
    result.debug_meta!,
    { data: result, mappingSucceeded: true },
  );

  return result;
}
