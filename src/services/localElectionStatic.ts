import type { ElectionData, Candidate } from '../types';
import { attachElectionDebugMeta, logElectionDecision } from './electionDebug';
import { getPartyColor } from '../utils/partyColors';
import { fetchUncandidates } from './necUncontested';

// 동→선거구 매핑 캐시 (파일별 lazy load)
const dongDistrictMapCache = new Map<string, Record<string, Record<string, string>>>();

async function getDongDistrict(electionId: string, admNm: string): Promise<string | null> {
  const filePrefix = electionId.split('_').slice(0, 2).join('_');
  const cacheKey = filePrefix;
  if (!dongDistrictMapCache.has(cacheKey)) {
    try {
      const mod = await import(`../data/static/${filePrefix}_dong_district_map.json`);
      dongDistrictMapCache.set(cacheKey, mod.default as Record<string, Record<string, string>>);
    } catch {
      dongDistrictMapCache.set(cacheKey, {});
    }
  }
  const mapForPrefix = dongDistrictMapCache.get(cacheKey)!;
  const mapForId = mapForPrefix[electionId];
  if (!mapForId) return null;
  const key = admNm.trim().split(/\s+/).filter(Boolean).join('|');
  return mapForId[key] ?? null;
}

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

/**
 * 무투표당선 선거구 조회
 * - `lookupLocalElectionDong`이 null을 반환했을 때 호출
 * - NEC 무투표선거구 API로 당선인 정보를 조회
 * - admNm 형태: "서울특별시 강서구 발산1동"
 */
export async function lookupUncandidateDong(
  electionId: string,
  admCd: string,
  admNm: string,
): Promise<ElectionData | null> {
  const meta = ELECTION_META[electionId];
  if (!meta) return null;

  // 지역구 선거만 무투표 가능
  if (!electionId.endsWith('_district') && !electionId.includes('_mayor')) return null;

  const parts = admNm.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const sdName = parts[0]; // 시도명

  const candidates = await fetchUncandidates(electionId, sdName);
  if (candidates.length === 0) return null;

  // 1. 동 단위 선거구 매핑 우선 확인 (정확한 매핑)
  const exactDistrict = await getDongDistrict(electionId, admNm);

  // 2. 시군구명으로 1차 필터링
  const sigungu = parts.length >= 2 ? parts[1] : '';
  const sggFiltered = candidates.filter(
    (c) => !sigungu || c.sggName.includes(sigungu.replace(/[시군구]$/, ''))
  );
  if (sggFiltered.length === 0) return null;

  // 3. 동 단위 매핑이 있으면 해당 선거구만, 없으면 첫 번째 선거구 그룹만 사용
  const targetDistrict = exactDistrict ?? sggFiltered[0].sggName;
  const matched = sggFiltered.filter((c) => c.sggName === targetDistrict);

  if (matched.length === 0) return null;

  const electionCandidates = matched.map((c, i) => ({
    name: c.name || c.party,
    party: c.party,
    party_color: getPartyColor(c.party),
    votes: 0,
    vote_rate: 0,
    rank: i + 1,
    elected: true,
  }));

  const result: ElectionData = {
    adm_cd: admCd,
    adm_nm: admNm,
    election_type: meta.electionType as 'presidential' | 'assembly' | 'local',
    election_name: meta.name,
    election_date: meta.date,
    sub_type: meta.subType || undefined,
    total_voters: 0,
    total_votes: 0,
    valid_votes: 0,
    invalid_votes: 0,
    turnout_rate: 0,
    candidates: electionCandidates,
    is_uncontested: true,
    uncontested_district: matched[0]?.sggName,
  };

  return attachElectionDebugMeta(result, {
    sourceType: 'real',
    matchedRegionName: matched[0]?.sggName,
    matchedRegionCode: admCd,
    recordCount: matched.length,
    fallbackReason: 'uncontested election',
  });
}
