import axios from 'axios';
import type { AdminLevel, CandidateRegistrationCandidate, CandidateRegistrationData, ElectionHint } from '../types';
import { NEC_API_KEY, PARENT_CITY, SIDO_NAME, getNecQueryRegion, getSidoNameByCode, getSigunguNameByCode } from './necRegion';
import searchIndex from '../data/static/search_index.json';
import { findLocalCouncilDistrictByAdmCd, getLocalCouncilDistrictCodes } from './localCouncilMapping';

const CANDIDATE_REGISTRATION_BASE = 'https://apis.data.go.kr/9760000/PofelcddInfoInqireService';

export type LocalCandidateElectionId =
  | 'local_9_metro_mayor'
  | 'local_9_mayor'
  | 'local_9_council_district'
  | 'local_9_council_pr'
  | 'local_9_basic_district'
  | 'local_9_basic_pr';

interface CandidateRegistrationQuery {
  admCd: string;
  electionId: LocalCandidateElectionId;
  sdName?: string;
  sggName?: string;
}

interface LocalCandidateParam {
  sgId: string;
  sgTypecode: string;
  electionName: string;
  electionDate: string;
  subType: string;
  scope: 'sido' | 'sigungu';
}

interface LocalDistrictMatch {
  districtName: string;
  districtKey: string;
}

const LOCAL_9_CANDIDATE_MAP: Record<LocalCandidateElectionId, LocalCandidateParam> = {
  local_9_metro_mayor: {
    sgId: '20260603',
    sgTypecode: '3',
    electionName: '제9회 전국동시지방선거',
    electionDate: '2026-06-03',
    subType: '광역단체장 후보자 등록 현황',
    scope: 'sido',
  },
  local_9_mayor: {
    sgId: '20260603',
    sgTypecode: '4',
    electionName: '제9회 전국동시지방선거',
    electionDate: '2026-06-03',
    subType: '기초단체장 후보자 등록 현황',
    scope: 'sigungu',
  },
  local_9_council_district: {
    sgId: '20260603',
    sgTypecode: '5',
    electionName: '제9회 전국동시지방선거',
    electionDate: '2026-06-03',
    subType: '광역의원 후보자 등록 현황',
    scope: 'sigungu',
  },
  local_9_council_pr: {
    sgId: '20260603',
    sgTypecode: '8',
    electionName: '제9회 전국동시지방선거',
    electionDate: '2026-06-03',
    subType: '광역비례 후보자 등록 현황',
    scope: 'sido',
  },
  local_9_basic_district: {
    sgId: '20260603',
    sgTypecode: '6',
    electionName: '제9회 전국동시지방선거',
    electionDate: '2026-06-03',
    subType: '기초의원 후보자 등록 현황',
    scope: 'sigungu',
  },
  local_9_basic_pr: {
    sgId: '20260603',
    sgTypecode: '9',
    electionName: '제9회 전국동시지방선거',
    electionDate: '2026-06-03',
    subType: '기초비례 후보자 등록 현황',
    scope: 'sigungu',
  },
};

interface CandidateRegistrationApiItem {
  name?: string;
  jdName?: string;
  sdName?: string;
  sggName?: string;
  wiwName?: string;
  gender?: string;
  birthday?: string;
  age?: string;
  job?: string;
  edu?: string;
  career1?: string;
  career2?: string;
  status?: string;
  regdate?: string;
}

interface CandidateRegistrationApiResponse {
  response?: {
    header?: {
      resultCode?: string;
      resultMsg?: string;
    };
    body?: {
      items?: {
        item?: CandidateRegistrationApiItem | CandidateRegistrationApiItem[];
      };
      totalCount?: number | string;
    };
  };
}

interface SearchIndexEntry {
  adm_cd: string;
  adm_nm: string;
  level: AdminLevel;
  sido_cd?: string | null;
  sido_nm?: string | null;
  sigungu_cd?: string | null;
  sigungu_nm?: string | null;
}

export interface Local9CandidateSearchEntry {
  adm_cd: string;
  adm_nm: string;
  level: AdminLevel;
  sido_cd: string | null;
  sido_nm: string | null;
  sigungu_cd?: string | null;
  sigungu_nm?: string | null;
  localDistrictKey?: string;
  electionHint: ElectionHint;
  electionLabel: string;
  name: string;
  party: string;
  district: string;
}

const SEARCH_INDEX = searchIndex as SearchIndexEntry[];
const SEARCH_INDEX_BY_CODE = new Map(SEARCH_INDEX.map((item) => [item.adm_cd, item]));
const SIDO_SHORT: Record<string, string> = {
  '서울특별시': '서울',
  '부산광역시': '부산',
  '대구광역시': '대구',
  '인천광역시': '인천',
  '광주광역시': '광주',
  '대전광역시': '대전',
  '울산광역시': '울산',
  '세종특별자치시': '세종',
  '경기도': '경기',
  '강원도': '강원',
  '강원특별자치도': '강원',
  '충청북도': '충북',
  '충청남도': '충남',
  '전라북도': '전북',
  '전북특별자치도': '전북',
  '전라남도': '전남',
  '경상북도': '경북',
  '경상남도': '경남',
  '제주특별자치도': '제주',
};

const SIGUNGU_BY_KEY = new Map<string, SearchIndexEntry>();
const PARENT_CITY_BY_KEY = new Map<string, SearchIndexEntry>();
const SIDO_BY_NAME = new Map<string, SearchIndexEntry>();

for (const row of SEARCH_INDEX) {
  if (row.level === 'sido') {
    SIDO_BY_NAME.set(row.adm_nm, row);
    continue;
  }
  if (row.level !== 'sigungu') continue;

  const short = row.adm_nm.split(/\s+/).pop() ?? row.adm_nm;
  const sidoName = row.sido_nm ?? row.adm_nm.split(/\s+/)[0] ?? '';
  SIGUNGU_BY_KEY.set(`${sidoName}|${short}`, row);

  const parentCity = PARENT_CITY[row.adm_cd];
  if (parentCity && !PARENT_CITY_BY_KEY.has(`${sidoName}|${parentCity}`)) {
    PARENT_CITY_BY_KEY.set(`${sidoName}|${parentCity}`, row);
  }
}

const LOCAL_9_SEARCH_IDS: LocalCandidateElectionId[] = [
  'local_9_metro_mayor',
  'local_9_mayor',
  'local_9_council_district',
  'local_9_council_pr',
  'local_9_basic_district',
  'local_9_basic_pr',
];

let local9CandidateIndexPromise: Promise<Local9CandidateSearchEntry[]> | null = null;

function parseCandidate(item: CandidateRegistrationApiItem): CandidateRegistrationCandidate {
  const age = Number(item.age ?? 0);
  const career = [item.career1, item.career2]
    .map((entry) => `${entry ?? ''}`.trim())
    .filter(Boolean)
    .join(' / ');

  return {
    name: `${item.name ?? ''}`.trim() || '이름 미상',
    party: `${item.jdName ?? ''}`.trim() || '무소속',
    district: `${item.sggName ?? item.wiwName ?? ''}`.trim() || '선거구 정보 없음',
    age: Number.isFinite(age) ? age : 0,
    gender: `${item.gender ?? ''}`.trim() || '-',
    job: `${item.job ?? ''}`.trim() || '-',
    education: `${item.edu ?? ''}`.trim() || '-',
    career: career || '-',
    status: `${item.status ?? ''}`.trim() || '상태 미상',
    registration_date: `${item.regdate ?? ''}`.trim() || undefined,
  };
}

function toItemArray(item?: CandidateRegistrationApiItem | CandidateRegistrationApiItem[]) {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

function getLocal9ElectionHint(electionId: LocalCandidateElectionId): ElectionHint {
  return {
    type: 'local',
    localPrefix: 'local_9',
    localSubType: electionId.replace('local_9_', ''),
  };
}

function getLocal9ElectionLabel(electionId: LocalCandidateElectionId): string {
  const meta = LOCAL_9_CANDIDATE_MAP[electionId];
  return `9회 지방선거 ${meta.subType.replace(' 후보자 등록 현황', '')}`;
}

function getLocal9DistrictKey(item: CandidateRegistrationApiItem, electionId: LocalCandidateElectionId): string | undefined {
  if (!item.sdName || !item.sggName) return undefined;
  if (electionId !== 'local_9_council_district' && electionId !== 'local_9_basic_district') return undefined;

  const kind = electionId === 'local_9_council_district' ? 'council' : 'basic';
  const sidoShort = SIDO_SHORT[item.sdName] ?? item.sdName;
  const districtKey = `${sidoShort}_${item.sggName}`;
  const codes = getLocalCouncilDistrictCodes('9', kind, districtKey);
  if (!codes.length) return undefined;
  return `9_${kind}_${districtKey}`;
}

function toSearchEntry(area: SearchIndexEntry, item: CandidateRegistrationApiItem, electionId: LocalCandidateElectionId): Local9CandidateSearchEntry {
  return {
    adm_cd: area.adm_cd,
    adm_nm: area.adm_nm,
    level: area.level,
    sido_cd: area.sido_cd ?? null,
    sido_nm: area.sido_nm ?? null,
    sigungu_cd: area.sigungu_cd ?? null,
    sigungu_nm: area.sigungu_nm ?? null,
    localDistrictKey: getLocal9DistrictKey(item, electionId),
    electionHint: getLocal9ElectionHint(electionId),
    electionLabel: getLocal9ElectionLabel(electionId),
    name: `${item.name ?? ''}`.trim() || '이름 미상',
    party: `${item.jdName ?? ''}`.trim() || '무소속',
    district: `${item.sggName ?? item.wiwName ?? ''}`.trim() || '선거구 정보 없음',
  };
}

function findSidoArea(sdName?: string): SearchIndexEntry | null {
  if (!sdName) return null;
  return SIDO_BY_NAME.get(sdName) ?? null;
}

function findSigunguArea(sdName?: string, sigunguName?: string): SearchIndexEntry | null {
  if (!sdName || !sigunguName) return null;
  return (
    SIGUNGU_BY_KEY.get(`${sdName}|${sigunguName}`) ??
    PARENT_CITY_BY_KEY.get(`${sdName}|${sigunguName}`) ??
    null
  );
}

function findDistrictRepresentativeArea(item: CandidateRegistrationApiItem, electionId: LocalCandidateElectionId): SearchIndexEntry | null {
  if (!item.sdName || !item.sggName) return null;
  const kind = electionId === 'local_9_council_district' ? 'council' : 'basic';
  const sidoShort = SIDO_SHORT[item.sdName] ?? item.sdName;
  const districtKey = `${sidoShort}_${item.sggName}`;
  const codes = getLocalCouncilDistrictCodes('9', kind, districtKey);
  if (!codes.length) return null;

  const exactArea = SEARCH_INDEX_BY_CODE.get(codes[0]);
  if (exactArea) return exactArea;

  const sigunguArea = findSigunguArea(item.sdName, item.wiwName) ?? findSigunguArea(item.sdName, item.sggName);
  const sidoArea = findSidoArea(item.sdName);
  return {
    adm_cd: codes[0],
    adm_nm: `${item.sdName} ${item.sggName}`,
    level: 'eupmyeondong',
    sido_cd: sigunguArea?.sido_cd ?? sidoArea?.adm_cd ?? null,
    sido_nm: sigunguArea?.sido_nm ?? sidoArea?.adm_nm ?? item.sdName,
    sigungu_cd: sigunguArea?.adm_cd ?? sigunguArea?.sigungu_cd ?? null,
    sigungu_nm: sigunguArea?.adm_nm?.split(/\s+/).pop() ?? item.wiwName ?? null,
  };
}

function resolveLocal9CandidateArea(item: CandidateRegistrationApiItem, electionId: LocalCandidateElectionId): SearchIndexEntry | null {
  if (electionId === 'local_9_metro_mayor' || electionId === 'local_9_council_pr') {
    return findSidoArea(item.sdName);
  }

  if (electionId === 'local_9_council_district' || electionId === 'local_9_basic_district') {
    return findDistrictRepresentativeArea(item, electionId) ??
      findSigunguArea(item.sdName, item.wiwName) ??
      findSigunguArea(item.sdName, item.sggName);
  }

  return findSigunguArea(item.sdName, item.wiwName) ??
    findSigunguArea(item.sdName, item.sggName);
}

async function fetchCandidateRegistrationPage(
  electionId: LocalCandidateElectionId,
  pageNo: number,
): Promise<{ items: CandidateRegistrationApiItem[]; totalCount: number }> {
  const meta = LOCAL_9_CANDIDATE_MAP[electionId];
  const params: Record<string, string | number> = {
    ServiceKey: NEC_API_KEY,
    sgId: meta.sgId,
    sgTypecode: meta.sgTypecode,
    pageNo,
    numOfRows: 1000,
    resultType: 'json',
  };

  const { data } = await axios.get<CandidateRegistrationApiResponse>(
    `${CANDIDATE_REGISTRATION_BASE}/getPoelpcddRegistSttusInfoInqire`,
    { params },
  );

  const resultCode = data.response?.header?.resultCode;
  if (resultCode === 'INFO-03') {
    return { items: [], totalCount: 0 };
  }
  if (resultCode !== 'INFO-00') {
    throw new Error(data.response?.header?.resultMsg || '후보자 등록 현황 API 오류');
  }

  const items = toItemArray(data.response?.body?.items?.item);
  const totalCount = Number(data.response?.body?.totalCount ?? items.length);
  return {
    items,
    totalCount: Number.isFinite(totalCount) ? totalCount : items.length,
  };
}

async function fetchAllCandidateRegistrationItems(electionId: LocalCandidateElectionId): Promise<CandidateRegistrationApiItem[]> {
  const firstPage = await fetchCandidateRegistrationPage(electionId, 1);
  const totalPages = Math.max(1, Math.ceil(firstPage.totalCount / 1000));
  if (totalPages === 1) return firstPage.items;

  const restPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetchCandidateRegistrationPage(electionId, index + 2)),
  );
  return [firstPage, ...restPages].flatMap((page) => page.items);
}

export async function loadLocal9CandidateSearchIndex(): Promise<Local9CandidateSearchEntry[]> {
  if (!NEC_API_KEY) return [];
  if (local9CandidateIndexPromise) return local9CandidateIndexPromise;

  local9CandidateIndexPromise = Promise.all(
    LOCAL_9_SEARCH_IDS.map(async (electionId) => {
      const items = await fetchAllCandidateRegistrationItems(electionId);
      return items
        .filter((item) => `${item.name ?? ''}`.trim())
        .map((item) => {
          const area = resolveLocal9CandidateArea(item, electionId);
          return area ? toSearchEntry(area, item, electionId) : null;
        })
        .filter((entry): entry is Local9CandidateSearchEntry => entry !== null);
    }),
  ).then((groups) => groups.flat());

  return local9CandidateIndexPromise;
}

function normalizeScope(admCd: string, electionId: LocalCandidateElectionId, sdName?: string, sggName?: string) {
  const meta = LOCAL_9_CANDIDATE_MAP[electionId];
  const region = getNecQueryRegion(admCd, meta.sgId);
  const districtMatch = findLocalCouncilDistrict(admCd, electionId);

  const resolvedSdName = sdName || getSidoNameByCode(admCd, meta.sgId) || region.sdName;
  const resolvedSggName =
    districtMatch?.districtName ||
    sggName ||
    getSigunguNameByCode(admCd) ||
    region.displaySggName;

  return {
    sdName: resolvedSdName,
    sggName: meta.scope === 'sigungu' ? resolvedSggName : undefined,
    districtMatch,
  };
}

function isLocalCouncilDistrictElection(electionId: LocalCandidateElectionId) {
  return electionId === 'local_9_council_district' || electionId === 'local_9_basic_district';
}

export function getLocal9CandidateMeta(electionId: LocalCandidateElectionId) {
  return LOCAL_9_CANDIDATE_MAP[electionId];
}

export function getDefaultCandidateRegion(admCd: string, electionId: LocalCandidateElectionId) {
  const meta = LOCAL_9_CANDIDATE_MAP[electionId];
  const region = getNecQueryRegion(admCd, meta.sgId);
  const districtMatch = findLocalCouncilDistrict(admCd, electionId);

  return {
    sdName: region.sdName || SIDO_NAME[region.sidoCd] || '',
    sggName: meta.scope === 'sigungu' ? (districtMatch?.districtName || region.displaySggName || '') : '',
    requiresSigungu: meta.scope === 'sigungu',
    selectedSidoCode: region.sidoCd,
    selectedSigunguCode: region.sigunguCd,
    districtName: districtMatch?.districtName,
    districtKey: districtMatch?.districtKey,
  };
}

export function findLocalCouncilDistrict(admCd: string, electionId: LocalCandidateElectionId): LocalDistrictMatch | null {
  if (admCd.length !== 8) return null;
  if (!['local_9_council_district', 'local_9_basic_district'].includes(electionId)) return null;

  const kind = electionId === 'local_9_council_district' ? 'council' : 'basic';
  const match = findLocalCouncilDistrictByAdmCd(admCd, '9', kind);
  if (!match) return null;

  return {
    districtKey: `9_${kind}_${match.districtKey}`,
    districtName: match.districtKey.split('_').slice(1).join('_'),
  };
}

export async function fetchCandidateRegistration(
  query: CandidateRegistrationQuery,
): Promise<CandidateRegistrationData> {
  if (!NEC_API_KEY) {
    throw new Error('NEC API 키가 설정되지 않았습니다');
  }

  const meta = LOCAL_9_CANDIDATE_MAP[query.electionId];
  if (!meta) {
    throw new Error(`지원하지 않는 선거 ID입니다: ${query.electionId}`);
  }

  const { sdName, sggName, districtMatch } = normalizeScope(
    query.admCd,
    query.electionId,
    query.sdName,
    query.sggName,
  );
  if (isLocalCouncilDistrictElection(query.electionId) && query.admCd.length === 8 && !districtMatch) {
    return {
      election_id: query.electionId,
      election_name: meta.electionName,
      election_date: meta.electionDate,
      adm_cd: query.admCd,
      adm_nm: `${sdName} 선거구 매핑 없음`,
      sub_type: meta.subType,
      total_count: 0,
      candidates: [],
      request_scope: { sdName },
    };
  }

  const params: Record<string, string | number> = {
    ServiceKey: NEC_API_KEY,
    sgId: meta.sgId,
    sgTypecode: meta.sgTypecode,
    pageNo: 1,
    numOfRows: 1000,
    resultType: 'json',
    sdName,
  };
  if (sggName) {
    params.sggName = sggName;
  }

  const { data } = await axios.get<CandidateRegistrationApiResponse>(
    `${CANDIDATE_REGISTRATION_BASE}/getPoelpcddRegistSttusInfoInqire`,
    { params },
  );

  const resultCode = data.response?.header?.resultCode;
  if (resultCode === 'INFO-03') {
    return {
      election_id: query.electionId,
      election_name: meta.electionName,
      election_date: meta.electionDate,
      adm_cd: query.admCd,
      adm_nm: sggName ? `${sdName} ${sggName}` : sdName,
      sub_type: meta.subType,
      total_count: 0,
      candidates: [],
      request_scope: { sdName, sggName },
    };
  }

  if (resultCode !== 'INFO-00') {
    throw new Error(data.response?.header?.resultMsg || '후보자 등록 현황 API 오류');
  }

  const items = toItemArray(data.response?.body?.items?.item).map(parseCandidate);
  const totalCount = Number(data.response?.body?.totalCount ?? items.length);

  return {
    election_id: query.electionId,
    election_name: meta.electionName,
    election_date: meta.electionDate,
    adm_cd: query.admCd,
    adm_nm: sggName ? `${sdName} ${sggName}` : sdName,
    sub_type: meta.subType,
    total_count: Number.isFinite(totalCount) ? totalCount : items.length,
    candidates: items,
    request_scope: { sdName, sggName },
  };
}
