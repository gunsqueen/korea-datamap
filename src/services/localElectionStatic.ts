import type { ElectionData, Candidate } from '../types';
import { attachElectionDebugMeta, logElectionDecision } from './electionDebug';
import { getPartyColor } from '../utils/partyColors';
import { fetchUncandidates } from './necUncontested';
import quotaMap from '../data/electionQuotaMap.json';
import local8WinnersData from '../data/static/local_8_winners.json';
import local7WinnersData from '../data/static/local_7_winners.json';
import local6WinnersData from '../data/static/local_6_winners.json';

interface ElectionQuotaFile {
  quotas: Record<string, number | string>;
  comment?: string;
  format?: string;
  example?: string;
}

const ELECTION_QUOTAS = (quotaMap as ElectionQuotaFile).quotas;
const local8Winners = local8WinnersData as Record<string, string[]>;
const local7Winners = local7WinnersData as Record<string, string[]>;
const local6Winners = local6WinnersData as Record<string, string[]>;

const LOCAL_WINNERS: Record<string, Record<string, string[]>> = {
  'local_8': local8Winners,
  'local_7': local7Winners,
  'local_6': local6Winners,
};

// 행정구역 명칭 변경 대응: 현재 명칭 → 선거 당시 명칭(s) 매핑
// - 강원특별자치도: 2023-06-11 이전 '강원도'
// - 전북특별자치도: 2024-01-18 이전 '전라북도'
const SIDO_HISTORICAL_ALIASES: Record<string, string[]> = {
  '강원특별자치도': ['강원도'],
  '전북특별자치도': ['전라북도'],
};

function getQuotaValue(key: string): number | undefined {
  const value = ELECTION_QUOTAS[key];
  return typeof value === 'number' ? value : undefined;
}

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
  const parts = admNm.trim().split(/\s+/).filter(Boolean);
  // 현재 명칭과 역사적 별칭 모두 시도
  const sido = parts[0];
  const sidoCandidates = [sido, ...(SIDO_HISTORICAL_ALIASES[sido] ?? [])];
  for (const s of sidoCandidates) {
    const key = [s, ...parts.slice(1)].join('|');
    if (mapForId[key]) return mapForId[key];
  }
  return null;
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

const SIDO_QUOTA_NAMES: Record<string, string> = {
  '서울특별시': '서울',
  '부산광역시': '부산',
  '대구광역시': '대구',
  '인천광역시': '인천',
  '광주광역시': '광주',
  '대전광역시': '대전',
  '울산광역시': '울산',
  '세종특별자치시': '세종',
  '경기도': '경기',
  '강원도': '강원',           // 8회 지방선거 당시 명칭
  '강원특별자치도': '강원',   // 2023년 이후 명칭
  '충청북도': '충북',
  '충청남도': '충남',
  '전라북도': '전북',
  '전북특별자치도': '전북',   // 2024년 이후 명칭
  '전라남도': '전남',
  '경상북도': '경북',
  '경상남도': '경남',
  '제주특별자치도': '제주',
};

function getQuotaKeyForDistrict(electionId: string, electionDistrict: string, admNm: string): string | null {
  const parts = electionId.split('_');
  if (parts[0] !== 'local' || parts.length < 3) return null;

  const generation = parts[1];
  const subtype = parts[2];
  const sido = admNm.trim().split(/\s+/)[0];
  // 현재 명칭 + 역사적 별칭 순서로 시도
  const sidoCandidates = [sido, ...(SIDO_HISTORICAL_ALIASES[sido] ?? [])];
  const city = sidoCandidates.map(s => SIDO_QUOTA_NAMES[s]).find(Boolean);
  if (!city) return null;

  return `${generation}_${city}_${subtype}_${electionDistrict}`;
}

function getSeatCountForDistrict(electionId: string, electionDistrict: string | undefined, admNm: string): number {
  if (!electionDistrict) return 1;
  const quotaKey = getQuotaKeyForDistrict(electionId, electionDistrict, admNm);
  if (quotaKey) {
    const quotaValue = getQuotaValue(quotaKey);
    if (quotaValue !== undefined) return quotaValue;
  }

  const fallbackKey = `${electionId}_${electionDistrict}`;
  const fallbackValue = getQuotaValue(fallbackKey);
  return fallbackValue ?? 1;
}

function buildStaticLookupKeys(admNm: string): string[] {
  const parts = admNm.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) return [];

  const sido = parts[0];
  const dong = parts[parts.length - 1];
  const middleParts = parts.slice(1, -1);
  const middleJoined = middleParts.join('');
  const middleSpaced = middleParts.join(' ');

  // 현재 시도명 + 역사적 별칭 시도명 모두 시도
  const sidoCandidates = [sido, ...(SIDO_HISTORICAL_ALIASES[sido] ?? [])];

  const keys: string[] = [];
  for (const s of sidoCandidates) {
    keys.push(`${s}|${middleJoined}|${dong}`);
    keys.push(`${s}|${middleSpaced}|${dong}`);
    if (middleParts.length >= 1) {
      keys.push(`${s}|${middleParts[0]}|${dong}`);
    }
    if (middleParts.length >= 2) {
      keys.push(`${s}|${middleParts[middleParts.length - 1]}|${dong}`);
      keys.push(`${s}|${middleParts.slice(-2).join('')}|${dong}`);
    }
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
    .sort((a, b) => {
      if (a.votes !== b.votes) return b.votes - a.votes;
      return a.name.localeCompare(b.name, 'ko');
    });

  candidates.forEach((c, i) => { c.rank = i + 1; });

  if (nationalWinner) {
    // 전국 당선인을 elected로 표시
    const winnerCand = candidates.find((c) => c.name === nationalWinner);
    if (winnerCand) winnerCand.elected = true;
  } else {
    // 지방선거 지역구 당선인 판별
    const quotaKey = getQuotaKeyForDistrict(electionId, entry.election_district, admNm);
    let usedExactMatch = false;

    // 6~8회 지방선거: 당선인 명단 파일로 정확한 당선 여부 표기
    const genPrefix = electionId.match(/^(local_\d+)_/)?.[1];
    const winnersMap = genPrefix ? LOCAL_WINNERS[genPrefix] : undefined;
    if (winnersMap && quotaKey && winnersMap[quotaKey]) {
      const officialWinners = winnersMap[quotaKey];
      candidates.forEach((c) => {
        if (officialWinners.includes(c.name)) {
          c.elected = true;
        }
      });
      usedExactMatch = true;
    }

    // 그 외 선거이거나 명단 매핑이 실패한 경우 정원 개수만큼 상위 후보를 elected로 표시 (Fallback)
    if (!usedExactMatch || !candidates.some(c => c.elected)) {
      const seatCount = getSeatCountForDistrict(electionId, entry.election_district, admNm);
      for (let i = 0; i < Math.min(seatCount, candidates.length); i += 1) {
        candidates[i].elected = true;
      }
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// 지방의원 선거구 전체 집계
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 시도 약칭 → 시도 전체명 (local_council_emd_mapping.json 키 파싱용)
 * 강원/전북은 현재 명칭(특별자치) 기준으로 매핑하고, SIDO_HISTORICAL_ALIASES로 구 명칭도 커버.
 */
const SIDO_ABBR_TO_FULL: Record<string, string> = {
  '서울': '서울특별시', '부산': '부산광역시', '대구': '대구광역시',
  '인천': '인천광역시', '광주': '광주광역시', '대전': '대전광역시',
  '울산': '울산광역시', '세종': '세종특별자치시', '경기': '경기도',
  '강원': '강원특별자치도', '충북': '충청북도', '충남': '충청남도',
  '전북': '전북특별자치도', '전남': '전라남도', '경북': '경상북도',
  '경남': '경상남도', '제주': '제주특별자치도',
};

/**
 * 복수 동으로 구성된 선거구의 득표 데이터를 합산한다.
 */
function aggregateStaticEntries(entries: StaticElectionEntry[]): {
  total_voters: number;
  total_votes: number;
  valid_votes: number;
  invalid_votes: number;
  candidates: StaticCandidateEntry[];
} {
  const candidateMap = new Map<string, { name?: string; party: string; votes: number }>();
  let total_voters = 0, total_votes = 0, valid_votes = 0, invalid_votes = 0;

  for (const entry of entries) {
    total_voters += entry.total_voters;
    total_votes += entry.total_votes;
    valid_votes += entry.valid_votes;
    invalid_votes += entry.invalid_votes;
    for (const cand of entry.candidates) {
      const key = cand.name ?? cand.party;
      const existing = candidateMap.get(key);
      if (existing) {
        existing.votes += cand.votes;
      } else {
        candidateMap.set(key, { name: cand.name, party: cand.party, votes: cand.votes });
      }
    }
  }

  return {
    total_voters,
    total_votes,
    valid_votes,
    invalid_votes,
    candidates: Array.from(candidateMap.values()),
  };
}

/**
 * 지방의원(기초/광역) 선거구 전체 집계 결과 반환.
 *
 * 동별로 분리 저장된 득표 데이터를 선거구 단위로 합산하여 ElectionData를 반환한다.
 * local_council_emd_mapping.json 키 형식에 맞는 localDistrictKey를 사용.
 *
 * @param electionId       "local_8_basic_district" 등
 * @param localDistrictKey "8_basic_서울_강서구나선거구" 형식
 * @param admCd            대표 동의 행정구역 코드 (debug용)
 */
export async function lookupLocalDistrictAggregated(
  electionId: string,
  localDistrictKey: string,
  admCd: string,
): Promise<ElectionData | null> {
  const meta = ELECTION_META[electionId];
  if (!meta) return null;

  // localDistrictKey 파싱: "8_basic_서울_강서구나선거구"
  const parts = localDistrictKey.split('_');
  if (parts.length < 4) return null;
  // parts[0] = "8", parts[1] = "basic"|"council", parts[2] = 시도약칭, parts[3..] = 선거구명
  const sidoAbbr = parts[2];
  const districtName = parts.slice(3).join('_');

  const sidoFull = SIDO_ABBR_TO_FULL[sidoAbbr];
  if (!sidoFull) return null;

  // 역사적 시도명 포함 (강원도, 전라북도 등 구 명칭으로 저장된 데이터 대응)
  const sidoCandidates = [sidoFull, ...(SIDO_HISTORICAL_ALIASES[sidoFull] ?? [])];

  const data = await loadStaticData(electionId);

  // 선거구 내 모든 동 엔트리 수집
  const matchingEntries = Object.values(
    Object.fromEntries(
      Object.entries(data).filter(([key, value]) =>
        sidoCandidates.some((s) => key.startsWith(s + '|')) &&
        value.election_district === districtName
      )
    )
  );

  if (matchingEntries.length === 0) return null;

  const aggregated = aggregateStaticEntries(matchingEntries);

  // 후보 목록 생성
  const candidates: Candidate[] = aggregated.candidates
    .filter((c) => c.votes > 0 || c.party)
    .map((c) => ({
      name: c.name || c.party,
      party: c.party,
      party_color: getPartyColor(c.party),
      votes: c.votes,
      vote_rate: aggregated.valid_votes > 0
        ? Math.round((c.votes / aggregated.valid_votes) * 10000) / 100
        : 0,
      rank: 0,
      elected: false,
    }))
    .sort((a, b) => {
      if (a.votes !== b.votes) return b.votes - a.votes;
      return a.name.localeCompare(b.name, 'ko');
    });

  candidates.forEach((c, i) => { c.rank = i + 1; });

  // 당선인 결정: 공식 당선자 명단 우선, 없으면 정원수만큼 상위 후보
  const genPrefix = electionId.match(/^(local_\d+)_/)?.[1];
  const winnersMap = genPrefix ? LOCAL_WINNERS[genPrefix] : undefined;
  // getSeatCountForDistrict / getQuotaKeyForDistrict는 admNm 첫 토큰(시도명)만 사용하므로 fakeAdmNm 사용
  const fakeAdmNm = sidoFull + ' 구 dummy동';
  const quotaKey = getQuotaKeyForDistrict(electionId, districtName, fakeAdmNm);

  let usedOfficialWinners = false;
  if (winnersMap && quotaKey && winnersMap[quotaKey]) {
    const officialWinners = winnersMap[quotaKey];
    candidates.forEach((c) => { if (officialWinners.includes(c.name)) c.elected = true; });
    usedOfficialWinners = true;
  }

  if (!usedOfficialWinners || !candidates.some((c) => c.elected)) {
    const seatCount = getSeatCountForDistrict(electionId, districtName, fakeAdmNm);
    for (let i = 0; i < Math.min(seatCount, candidates.length); i++) candidates[i].elected = true;
  }

  const turnout = aggregated.total_voters > 0
    ? Math.round((aggregated.total_votes / aggregated.total_voters) * 10000) / 100
    : 0;

  return attachElectionDebugMeta({
    adm_cd: admCd,
    adm_nm: districtName,   // 패널에 "강서구나선거구 선거 결과"로 표시
    election_type: 'local',
    election_name: meta.name,
    election_date: meta.date,
    sub_type: meta.subType || undefined,
    total_voters: aggregated.total_voters,
    total_votes: aggregated.total_votes,
    valid_votes: aggregated.valid_votes,
    invalid_votes: aggregated.invalid_votes,
    turnout_rate: turnout,
    candidates,
  }, {
    sourceType: 'snapshot',
    matchedRegionName: districtName,
    matchedRegionCode: admCd,
    recordCount: matchingEntries.length,
  });
}
