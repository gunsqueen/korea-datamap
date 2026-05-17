import axios from 'axios';
import type { AdminLevel, CandidateRegistrationCandidate, CandidateRegistrationData, ElectionHint } from '../types';
import { NEC_API_KEY, PARENT_CITY, SIDO_NAME, getNecQueryRegion, getSidoNameByCode, getSigunguNameByCode } from './necRegion';
import searchIndex from '../data/static/search_index.json';
import local9CandidateIndex from '../data/static/local_9_candidate_index.json';
import { findLocalCouncilDistrictByAdmCd, getLocalCouncilDistrictCodes } from './localCouncilMapping';

const CANDIDATE_REGISTRATION_BASE = import.meta.env.DEV
  ? '/api/nec/9760000/PofelcddInfoInqireService'
  : 'https://apis.data.go.kr/9760000/PofelcddInfoInqireService';

const NEC_INFO_BASE = import.meta.env.DEV ? '/api/nec-info' : 'https://info.nec.go.kr';
const NEC_INFO_ELECTION_ID = '0020260603';

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
const STATIC_LOCAL_9_CANDIDATE_INDEX = local9CandidateIndex as Local9CandidateSearchEntry[];
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

const NEC_INFO_CITY_CODE_BY_SIDO_CODE: Record<string, string> = {
  '11': '1100',
  '21': '2600',
  '22': '2700',
  '23': '2800',
  '24': '2900',
  '25': '3000',
  '26': '3100',
  '29': '5100',
  '31': '4100',
  '32': '5200',
  '33': '4300',
  '34': '4400',
  '35': '5300',
  '36': '4600',
  '37': '4700',
  '38': '4800',
  '39': '4900',
};

const NEC_INFO_ELECTION_CODE_BY_ID: Record<LocalCandidateElectionId, string> = {
  local_9_metro_mayor: '3',
  local_9_mayor: '4',
  local_9_council_district: '5',
  local_9_basic_district: '6',
  local_9_council_pr: '8',
  local_9_basic_pr: '9',
};

const SIGUNGU_BY_KEY = new Map<string, SearchIndexEntry>();
const PARENT_CITY_BY_KEY = new Map<string, SearchIndexEntry>();
const SIDO_BY_NAME = new Map<string, SearchIndexEntry>();
const SIGUNGU_BY_ADM_CD = new Map<string, SearchIndexEntry>();

for (const row of SEARCH_INDEX) {
  if (row.level === 'sido') {
    SIDO_BY_NAME.set(row.adm_nm, row);
    continue;
  }
  if (row.level !== 'sigungu') continue;

  SIGUNGU_BY_ADM_CD.set(row.adm_cd, row);

  const short = row.adm_nm.split(/\s+/).pop() ?? row.adm_nm;
  const sidoName = row.sido_nm ?? row.adm_nm.split(/\s+/)[0] ?? '';
  SIGUNGU_BY_KEY.set(`${sidoName}|${short}`, row);

  const parentCity = PARENT_CITY[row.adm_cd];
  if (parentCity && !PARENT_CITY_BY_KEY.has(`${sidoName}|${parentCity}`)) {
    PARENT_CITY_BY_KEY.set(`${sidoName}|${parentCity}`, row);
  }
}

/** admCd(5자리)로부터 시군구 short name 추출. SEARCH_INDEX 기반이라 강서구·하남시 같은 일반 시군구도 처리. */
function getSigunguShortNameByAdmCd(admCd: string): string {
  const row = SIGUNGU_BY_ADM_CD.get(admCd.slice(0, 5));
  if (!row) return '';
  return row.adm_nm.split(/\s+/).pop() ?? '';
}

const LOCAL_9_SEARCH_IDS: LocalCandidateElectionId[] = [
  'local_9_council_district',
  'local_9_basic_district',
  'local_9_mayor',
  'local_9_metro_mayor',
  'local_9_council_pr',
  'local_9_basic_pr',
];

let local9CandidateIndexPromise: Promise<Local9CandidateSearchEntry[]> | null = null;
const local9CandidateIndexProgressListeners = new Set<(items: Local9CandidateSearchEntry[]) => void>();

function notifyLocal9CandidateIndexProgress(items: Local9CandidateSearchEntry[]) {
  if (items.length === 0) return;
  local9CandidateIndexProgressListeners.forEach((listener) => listener(items));
}

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

function normalizeKoreanKey(value?: string | null): string {
  return `${value ?? ''}`.replace(/\s+/g, '').trim();
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function textFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(
    html.replace(/<br\s*\/?>/gi, ' / '),
    'text/html',
  );
  return normalizeText(doc.body.textContent ?? '');
}

function textFromCell(cell: Element | undefined): string {
  if (!cell) return '';
  return textFromHtml(cell.innerHTML);
}

function getCandidateNameFromOfficialCell(cell: Element | undefined): string {
  const link = cell?.querySelector('a');
  const textNode = link
    ? Array.from(link.childNodes).find((node) => node.nodeType === 3)
    : null;
  return normalizeText(textNode?.textContent ?? textFromCell(cell).replace(/\(.+\)/, ''));
}

function getAgeFromBirthAge(value: string): number {
  const age = Number(value.match(/\((\d+)세\)/)?.[1] ?? 0);
  return Number.isFinite(age) ? age : 0;
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

function getLocal9SubType(electionId: LocalCandidateElectionId): string {
  return electionId.replace('local_9_', '');
}

function getStaticCandidateKey(candidate: CandidateRegistrationCandidate) {
  return `${candidate.party}|${candidate.name}|${candidate.district}`;
}

function staticEntryToCandidate(entry: Local9CandidateSearchEntry): CandidateRegistrationCandidate {
  return {
    name: entry.name,
    party: entry.party,
    district: entry.district,
    age: 0,
    gender: '-',
    job: '-',
    education: '-',
    career: '-',
    status: '등록',
  };
}

function matchesStaticSido(entry: Local9CandidateSearchEntry, admCd: string, sdName?: string) {
  const sidoCd = admCd.slice(0, 2);
  return (
    entry.adm_cd === sidoCd ||
    entry.sido_cd === sidoCd ||
    (!!sdName && (entry.adm_nm === sdName || entry.sido_nm === sdName))
  );
}

function matchesStaticSigungu(entry: Local9CandidateSearchEntry, admCd: string, sggName?: string) {
  const sigunguCd = admCd.length >= 5 ? admCd.slice(0, 5) : '';
  const normalizedSggName = `${sggName ?? ''}`.replace(/\s+/g, '');

  return (
    (!!sigunguCd && (entry.adm_cd === sigunguCd || entry.sigungu_cd === sigunguCd)) ||
    (!!normalizedSggName && (
      entry.adm_nm.replace(/\s+/g, '').endsWith(normalizedSggName) ||
      `${entry.sigungu_nm ?? ''}`.replace(/\s+/g, '') === normalizedSggName ||
      entry.district.replace(/\s+/g, '') === normalizedSggName
    ))
  );
}

function getStaticLocal9CandidateEntries(
  query: CandidateRegistrationQuery,
  sdName?: string,
  sggName?: string,
  districtMatch?: LocalDistrictMatch | null,
): Local9CandidateSearchEntry[] {
  const localSubType = getLocal9SubType(query.electionId);
  const entries = STATIC_LOCAL_9_CANDIDATE_INDEX.filter((entry) => (
    entry.electionHint?.localPrefix === 'local_9' &&
    entry.electionHint.localSubType === localSubType
  ));

  if (query.electionId === 'local_9_metro_mayor' || query.electionId === 'local_9_council_pr') {
    return entries.filter((entry) => matchesStaticSido(entry, query.admCd, sdName));
  }

  if (query.electionId === 'local_9_council_district' || query.electionId === 'local_9_basic_district') {
    if (districtMatch?.districtKey) {
      return entries.filter((entry) => entry.localDistrictKey === districtMatch.districtKey);
    }

    return entries.filter((entry) => matchesStaticSigungu(entry, query.admCd, sggName));
  }

  return entries.filter((entry) => matchesStaticSigungu(entry, query.admCd, sggName));
}

function buildStaticLocal9CandidateData(
  query: CandidateRegistrationQuery,
  sdName: string,
  sggName: string | undefined,
  districtMatch?: LocalDistrictMatch | null,
): CandidateRegistrationData | null {
  const entries = getStaticLocal9CandidateEntries(query, sdName, sggName, districtMatch);
  if (entries.length === 0) return null;

  const candidates = new Map<string, CandidateRegistrationCandidate>();
  for (const entry of entries) {
    const candidate = staticEntryToCandidate(entry);
    candidates.set(getStaticCandidateKey(candidate), candidate);
  }

  const meta = LOCAL_9_CANDIDATE_MAP[query.electionId];
  return {
    election_id: query.electionId,
    election_name: meta.electionName,
    election_date: meta.electionDate,
    adm_cd: query.admCd,
    adm_nm: sggName ? `${sdName} ${sggName}` : sdName,
    sub_type: meta.subType,
    total_count: candidates.size,
    candidates: Array.from(candidates.values()),
    request_scope: { sdName, sggName },
  };
}

interface NecInfoSelectboxResponse {
  jsonResult?: {
    body?: Array<{ CODE: string; NAME: string }>;
  };
}

const necInfoTownCodeCache = new Map<string, Promise<string | null>>();
const necInfoSggCityCodeCache = new Map<string, Promise<string | null>>();

async function fetchNecInfoSelectbox(
  path: string,
  params: Record<string, string>,
): Promise<Array<{ CODE: string; NAME: string }>> {
  const body = new URLSearchParams(params);
  const { data } = await axios.post<NecInfoSelectboxResponse>(
    `${NEC_INFO_BASE}${path}`,
    body,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  return data.jsonResult?.body ?? [];
}

function findCodeByName(
  rows: Array<{ CODE: string; NAME: string }>,
  name?: string | null,
): string | null {
  const key = normalizeKoreanKey(name);
  if (!key) return null;
  return rows.find((row) => normalizeKoreanKey(row.NAME) === key)?.CODE ?? null;
}

function getNecInfoCityCode(admCd: string): string | null {
  return NEC_INFO_CITY_CODE_BY_SIDO_CODE[admCd.slice(0, 2)] ?? null;
}

async function getNecInfoTownCode(
  electionCode: string,
  cityCode: string,
  townName?: string | null,
): Promise<string | null> {
  const key = `${electionCode}|${cityCode}|${normalizeKoreanKey(townName)}`;
  if (!necInfoTownCodeCache.has(key)) {
    necInfoTownCodeCache.set(key, (async () => {
      const rows = await fetchNecInfoSelectbox('/bizcommon/selectbox/selectbox_townCodeBySgJson.json', {
        electionId: NEC_INFO_ELECTION_ID,
        electionCode,
        cityCode,
      });
      return findCodeByName(rows, townName);
    })());
  }
  return necInfoTownCodeCache.get(key)!;
}

async function getNecInfoSggCityCode(
  electionCode: string,
  cityCode: string,
  sigunguName?: string | null,
): Promise<string | null> {
  const key = `${electionCode}|${cityCode}|${normalizeKoreanKey(sigunguName)}`;
  if (!necInfoSggCityCodeCache.has(key)) {
    necInfoSggCityCodeCache.set(key, (async () => {
      const rows = await fetchNecInfoSelectbox('/bizcommon/selectbox/selectbox_getSggCityCodeJson.json', {
        electionId: NEC_INFO_ELECTION_ID,
        electionCode,
        cityCode,
      });
      return findCodeByName(rows, sigunguName);
    })());
  }
  return necInfoSggCityCodeCache.get(key)!;
}

async function fetchNecInfoCandidateHtml(params: Record<string, string>): Promise<string> {
  const body = new URLSearchParams({
    electionId: NEC_INFO_ELECTION_ID,
    requestURI: '/electioninfo/0020260603/cp/cpri03.jsp',
    topMenuId: 'CP',
    secondMenuId: 'CPRI03',
    menuId: 'CPRI03',
    dateCode: '0',
    ...params,
  });

  const { data } = await axios.post<string>(
    `${NEC_INFO_BASE}/electioninfo/electionInfo_report.xhtml`,
    body,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  return data;
}

function parseNecInfoCandidateRows(html: string, electionId: LocalCandidateElectionId): CandidateRegistrationCandidate[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = Array.from(doc.querySelectorAll('#table01 tbody tr'));
  const candidates: CandidateRegistrationCandidate[] = [];

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length < 11 || textFromCell(cells[0]).includes('검색된 결과가 없습니다')) continue;

    const name = getCandidateNameFromOfficialCell(cells[4]);
    if (!name) continue;

    candidates.push({
      name,
      party: textFromCell(cells[3]) || '무소속',
      district: textFromCell(cells[0]) || '선거구 정보 없음',
      age: getAgeFromBirthAge(textFromCell(cells[6])),
      gender: textFromCell(cells[5]) || '-',
      job: textFromCell(cells[8]) || '-',
      education: textFromCell(cells[9]) || '-',
      career: textFromCell(cells[10]) || '-',
      status: '등록',
    });
  }

  if (electionId === 'local_9_council_pr' || electionId === 'local_9_basic_pr') {
    return candidates.filter((candidate) => candidate.party !== '계');
  }
  return candidates;
}

function getNecInfoTownName(query: CandidateRegistrationQuery, sggName?: string, districtMatch?: LocalDistrictMatch | null): string {
  if (districtMatch?.districtName) {
    return extractSigunguFromDistrictName(districtMatch.districtName) ?? districtMatch.districtName;
  }
  return (
    getSigunguShortNameByAdmCd(query.admCd) ||
    getSigunguNameByCode(query.admCd) ||
    extractSigunguFromDistrictName(sggName) ||
    sggName ||
    ''
  );
}

function filterNecInfoCandidates(
  candidates: CandidateRegistrationCandidate[],
  query: CandidateRegistrationQuery,
  districtMatch?: LocalDistrictMatch | null,
): CandidateRegistrationCandidate[] {
  if (query.electionId === 'local_9_council_district' || query.electionId === 'local_9_basic_district') {
    const districtName = districtMatch?.districtName;
    if (!districtName) return candidates;
    const districtKey = normalizeKoreanKey(districtName);
    return candidates.filter((candidate) => normalizeKoreanKey(candidate.district) === districtKey);
  }
  return candidates;
}

async function fetchNecInfoCandidateRegistration(
  query: CandidateRegistrationQuery,
  sdName: string,
  sggName: string | undefined,
  districtMatch?: LocalDistrictMatch | null,
): Promise<CandidateRegistrationData | null> {
  const meta = LOCAL_9_CANDIDATE_MAP[query.electionId];
  const electionCode = NEC_INFO_ELECTION_CODE_BY_ID[query.electionId];
  const cityCode = getNecInfoCityCode(query.admCd);
  if (!electionCode || !cityCode) return null;

  const params: Record<string, string> = {
    statementId: `CPRI03_#${electionCode}`,
    electionCode,
    cityCode,
  };

  if (query.electionId === 'local_9_mayor' || query.electionId === 'local_9_basic_pr') {
    const officialSigunguCode = await getNecInfoSggCityCode(electionCode, cityCode, sggName);
    if (!officialSigunguCode) return null;
    params.sggCityCode = officialSigunguCode;
  } else if (query.electionId === 'local_9_council_district' || query.electionId === 'local_9_basic_district') {
    const townName = getNecInfoTownName(query, sggName, districtMatch);
    const townCode = await getNecInfoTownCode(electionCode, cityCode, townName);
    if (!townCode) return null;
    params.townCode = townCode;
    params.sggTownCode = '0';
  }

  const html = await fetchNecInfoCandidateHtml(params);
  const candidates = filterNecInfoCandidates(
    parseNecInfoCandidateRows(html, query.electionId),
    query,
    districtMatch,
  );
  if (candidates.length === 0) return null;

  return {
    election_id: query.electionId,
    election_name: meta.electionName,
    election_date: meta.electionDate,
    adm_cd: query.admCd,
    adm_nm: sggName ? `${sdName} ${sggName}` : sdName,
    sub_type: meta.subType,
    total_count: candidates.length,
    candidates,
    request_scope: { sdName, sggName },
  };
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
  if (sdName === '세종특별자치시' && sigunguName === '세종특별자치시') {
    return SIGUNGU_BY_KEY.get(`${sdName}|세종시`) ?? null;
  }
  return (
    SIGUNGU_BY_KEY.get(`${sdName}|${sigunguName}`) ??
    PARENT_CITY_BY_KEY.get(`${sdName}|${sigunguName}`) ??
    null
  );
}

/**
 * 광역의원·기초의원 선거구명에서 시군구명을 추출.
 *  "하남시제1선거구" → "하남시"
 *  "수원시영통구제1선거구" → "영통구" (자치구가 있는 도시는 자치구 short 우선)
 *  "하남시" → "하남시" (이미 시군구명인 경우 그대로 반환)
 *
 * 9회 광역의원 매핑이 local_council_emd_mapping.json에 누락된 경우의 fallback 용도.
 * 시군구 단위까지만 매칭되며, 선거구 폴리곤 하이라이트는 못 함.
 */
function extractSigunguFromDistrictName(districtName?: string): string | null {
  if (!districtName) return null;
  let work = districtName.trim();
  work = work.replace(/(제(\d+|[일이삼사오육칠팔구십]+)|[가-힣])선거구$/, '');
  work = work.replace(/선거구$/, '');
  work = work.replace(/제(\d+|[일이삼사오육칠팔구십]+)$/, '');
  work = work.replace(/\d+$/, '');
  if (!work) return null;
  const guMatch = work.match(/^(.+?시)(.+구)$/);
  if (guMatch) return guMatch[2];
  return work;
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
      findSigunguArea(item.sdName, extractSigunguFromDistrictName(item.wiwName) ?? undefined) ??
      findSigunguArea(item.sdName, item.sggName) ??
      findSigunguArea(item.sdName, extractSigunguFromDistrictName(item.sggName) ?? undefined);
  }

  return findSigunguArea(item.sdName, item.wiwName) ??
    findSigunguArea(item.sdName, item.sggName);
}

async function fetchCandidateRegistrationPage(
  electionId: LocalCandidateElectionId,
  pageNo: number,
  sdName?: string,
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
  if (sdName) {
    params.sdName = sdName;
  }

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

async function fetchCandidateRegistrationPageWithRetry(
  electionId: LocalCandidateElectionId,
  pageNo: number,
  sdName?: string,
  retries = 2,
): Promise<{ items: CandidateRegistrationApiItem[]; totalCount: number }> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchCandidateRegistrationPage(electionId, pageNo, sdName);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('후보자 등록 현황 API 오류');
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function toSearchEntries(
  items: CandidateRegistrationApiItem[],
  electionId: LocalCandidateElectionId,
): Local9CandidateSearchEntry[] {
  return items
    .filter((item) => `${item.name ?? ''}`.trim())
    .map((item) => {
      const area = resolveLocal9CandidateArea(item, electionId);
      return area ? toSearchEntry(area, item, electionId) : null;
    })
    .filter((entry): entry is Local9CandidateSearchEntry => entry !== null);
}

async function fetchAllCandidateRegistrationItems(
  electionId: LocalCandidateElectionId,
  sdName?: string,
  onPageItems?: (items: CandidateRegistrationApiItem[]) => void,
): Promise<CandidateRegistrationApiItem[]> {
  const firstPage = await fetchCandidateRegistrationPageWithRetry(electionId, 1, sdName);
  onPageItems?.(firstPage.items);
  // NEC API는 요청한 numOfRows(1000)와 무관하게 응답을 100건으로 캡한다.
  // 실제 응답 길이를 페이지 크기로 사용해야 누락 없이 전체를 가져올 수 있다.
  const pageSize = Math.max(1, firstPage.items.length);
  const totalPages = Math.max(1, Math.ceil(firstPage.totalCount / pageSize));
  if (totalPages === 1) return firstPage.items;

  const restPages = await mapWithConcurrency(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      index + 2,
    ),
    6,
    async (pageNo) => {
      const page = await fetchCandidateRegistrationPageWithRetry(electionId, pageNo, sdName);
      onPageItems?.(page.items);
      return page;
    },
  );
  return [firstPage, ...restPages].flatMap((page) => page.items);
}

export async function loadLocal9CandidateSearchIndex(
  onProgress?: (items: Local9CandidateSearchEntry[]) => void,
): Promise<Local9CandidateSearchEntry[]> {
  if (STATIC_LOCAL_9_CANDIDATE_INDEX.length > 0) {
    onProgress?.(STATIC_LOCAL_9_CANDIDATE_INDEX);
  }
  if (!NEC_API_KEY) return STATIC_LOCAL_9_CANDIDATE_INDEX;
  if (onProgress) {
    local9CandidateIndexProgressListeners.add(onProgress);
  }
  if (local9CandidateIndexPromise) {
    return local9CandidateIndexPromise.finally(() => {
      if (onProgress) {
        local9CandidateIndexProgressListeners.delete(onProgress);
      }
    });
  }

  local9CandidateIndexPromise = Promise.allSettled(
    LOCAL_9_SEARCH_IDS.map(async (electionId) => {
      const items = await fetchAllCandidateRegistrationItems(electionId, undefined, (pageItems) => {
        notifyLocal9CandidateIndexProgress(toSearchEntries(pageItems, electionId));
      });
      return toSearchEntries(items, electionId);
    }),
  ).then((groups) => {
    const liveItems = groups.flatMap((group) => (group.status === 'fulfilled' ? group.value : []));
    return liveItems.length > 0 ? liveItems : STATIC_LOCAL_9_CANDIDATE_INDEX;
  });

  return local9CandidateIndexPromise.finally(() => {
    if (onProgress) {
      local9CandidateIndexProgressListeners.delete(onProgress);
    }
  });
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

  const staticFallback = () => buildStaticLocal9CandidateData(query, sdName, sggName, districtMatch);
  let officialFallbackPromise: Promise<CandidateRegistrationData | null> | null = null;
  const officialFallback = () => {
    officialFallbackPromise ??= fetchNecInfoCandidateRegistration(query, sdName, sggName, districtMatch)
      .catch(() => null);
    return officialFallbackPromise;
  };
  const fallback = async () => (await officialFallback()) ?? staticFallback();

  if (!NEC_API_KEY) {
    const fallbackData = await fallback();
    if (fallbackData) return fallbackData;
    throw new Error('NEC API 키가 설정되지 않았습니다');
  }

  if (isLocalCouncilDistrictElection(query.electionId) && query.admCd.length === 8 && !districtMatch) {
    return (await fallback()) ?? {
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

  // 시군구(5자리) + 광역의원/기초의원: 시군구명을 그대로 sggName에 보내면
  // NEC API가 0건 응답하므로(API는 선거구명을 기대), 시도 전체를 받아 시군구명 prefix로 필터한다.
  if (isLocalCouncilDistrictElection(query.electionId) && query.admCd.length === 5) {
    // SEARCH_INDEX 기반 시군구명을 우선 사용 (necRegion의 SIGUNGU_NAME은 자치구만 담고 있음)
    const sigunguName = (
      getSigunguShortNameByAdmCd(query.admCd) ||
      getSigunguNameByCode(query.admCd) ||
      ''
    ).replace(/\s+/g, '');
    if (!sigunguName) {
      return (await fallback()) ?? {
        election_id: query.electionId,
        election_name: meta.electionName,
        election_date: meta.electionDate,
        adm_cd: query.admCd,
        adm_nm: sdName,
        sub_type: meta.subType,
        total_count: 0,
        candidates: [],
        request_scope: { sdName },
      };
    }
    // 자치구가 있는 도시(예: 수원시 영통구)의 경우 NEC sggName/wiwName은
    // "수원시영통구..." 형태이므로 부모시 + 시군구명 결합형도 함께 검사한다.
    const parentCity = (PARENT_CITY[query.admCd] ?? '').replace(/\s+/g, '');
    const fullSigunguName = parentCity ? `${parentCity}${sigunguName}` : sigunguName;

    let sidoItems: CandidateRegistrationApiItem[] = [];
    try {
      sidoItems = await fetchAllCandidateRegistrationItems(query.electionId, sdName);
    } catch (error) {
      const fallbackData = await fallback();
      if (fallbackData) return fallbackData;
      throw error;
    }

    const filtered = sidoItems.filter((it) => {
      const sgg = (it.sggName ?? '').replace(/\s+/g, '');
      const wiw = (it.wiwName ?? '').replace(/\s+/g, '');
      return (
        sgg.startsWith(fullSigunguName) ||
        wiw === fullSigunguName ||
        wiw.startsWith(fullSigunguName) ||
        (!parentCity && (sgg.startsWith(sigunguName) || wiw.startsWith(sigunguName)))
      );
    });

    if (filtered.length === 0) {
      const fallbackData = await fallback();
      if (fallbackData) return fallbackData;
    }

    return {
      election_id: query.electionId,
      election_name: meta.electionName,
      election_date: meta.electionDate,
      adm_cd: query.admCd,
      adm_nm: `${sdName} ${parentCity ? `${parentCity} ` : ''}${sigunguName}`.trim(),
      sub_type: meta.subType,
      total_count: filtered.length,
      candidates: filtered.map(parseCandidate),
      request_scope: { sdName, sggName: sigunguName },
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

  let data: CandidateRegistrationApiResponse;
  try {
    const response = await axios.get<CandidateRegistrationApiResponse>(
      `${CANDIDATE_REGISTRATION_BASE}/getPoelpcddRegistSttusInfoInqire`,
      { params },
    );
    data = response.data;
  } catch (error) {
    const fallbackData = await fallback();
    if (fallbackData) return fallbackData;
    throw error;
  }

  const resultCode = data.response?.header?.resultCode;
  if (resultCode === 'INFO-03') {
    return (await fallback()) ?? {
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
    const fallbackData = await fallback();
    if (fallbackData) return fallbackData;
    throw new Error(data.response?.header?.resultMsg || '후보자 등록 현황 API 오류');
  }

  const items = toItemArray(data.response?.body?.items?.item).map(parseCandidate);
  const totalCount = Number(data.response?.body?.totalCount ?? items.length);

  if (items.length === 0) {
    const fallbackData = await fallback();
    if (fallbackData) return fallbackData;
  }

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
