import type {
  AdminGeoCollection,
  PopulationData,
  AgeGroup,
  ElectionData,
  AdminLevel,
  DataMode,
  PopulationFieldSources,
  PopulationSourceType,
} from '../types';
import { fetchBoundary } from './sgis';
import { fetchPopulation } from './population';
import { fetchElectionResult, getElectionByCode, ELECTIONS_META } from './election';
import { isElectionLookupError } from './electionDebug';
import sidoMock from '../data/mock/sido.json';
import populationMock from '../data/mock/population.json';
import sigunguPopulationMock from '../data/mock/sigungu_population.json';
import emdPopulationSeoulMock from '../data/mock/emd_population_seoul.json';
import ageDistributionFile from '../data/real/age-distribution.json';

// 파일 기반 연령 분포 데이터 로드
type AgeDistributionEntry = { ageRange: string; male: number; female: number; total: number };
type AgeDistributionFile = {
  meta?: { yearMonth?: string };
  data?: Record<string, AgeDistributionEntry[]>;
};
const ageDistFile = ageDistributionFile as AgeDistributionFile;
const AGE_FILE_DATA: Record<string, AgeDistributionEntry[]> = ageDistFile.data ?? {};
const AGE_FILE_YEAR_MONTH: string = ageDistFile.meta?.yearMonth ?? '';

function getAgeGroupsFromFile(admCd: string): AgeGroup[] | null {
  const entry = AGE_FILE_DATA[admCd];
  if (!entry?.length) return null;
  return entry.map((g) => ({ age_range: g.ageRange, male: g.male, female: g.female, total: g.total }));
}

// 시도/시군구 수준: 하위 코드 집계
function aggregateAgeGroupsFromFile(admCd: string): AgeGroup[] | null {
  const prefixLen = admCd.length;
  const matching = Object.entries(AGE_FILE_DATA).filter(([code]) => code.startsWith(admCd) && code.length === 8);
  if (matching.length === 0) return null;

  const rangeMap: Record<string, { male: number; female: number; total: number }> = {};
  for (const [, groups] of matching) {
    for (const g of groups) {
      if (!rangeMap[g.ageRange]) rangeMap[g.ageRange] = { male: 0, female: 0, total: 0 };
      rangeMap[g.ageRange].male += g.male;
      rangeMap[g.ageRange].female += g.female;
      rangeMap[g.ageRange].total += g.total;
    }
  }
  const result = Object.entries(rangeMap).map(([age_range, v]) => ({ age_range, ...v }));
  return result.length > 0 ? result : null;
  void prefixLen;
}

// 시군구 mock 데이터 (시도코드 → GeoJSON)
const sigunguMocks = import.meta.glob('../data/mock/sigungu/*.json', { eager: true }) as
  Record<string, { default: AdminGeoCollection }>;

// 읍면동 mock 데이터 (시군구코드 → GeoJSON)
const eupmyeondongMocks = import.meta.glob('../data/mock/eupmyeondong/*.json', { eager: true }) as
  Record<string, { default: AdminGeoCollection }>;

function getSigunguMock(sidoCd: string): AdminGeoCollection | null {
  const key = `../data/mock/sigungu/${sidoCd}.json`;
  return sigunguMocks[key]?.default ?? null;
}

function getEupmyeondongMock(sigunguCd: string): AdminGeoCollection | null {
  const key = `../data/mock/eupmyeondong/${sigunguCd}.json`;
  return eupmyeondongMocks[key]?.default ?? null;
}

// 경계 모드: real(기본) / mock(오프라인 개발용)
// 인구·선거 모드: mock(기본) / real
const BOUNDARY_MODE = (import.meta.env.VITE_BOUNDARY_MODE ?? 'real') as 'real' | 'mock';
// DATA_MODE: 선거 데이터 등 다른 서비스에서 사용될 수 있으나 인구는 동 레벨 API 직접 사용
const _DATA_MODE: DataMode = (import.meta.env.VITE_DATA_MODE as DataMode) ?? 'mock';
void _DATA_MODE;

// ─── 경계 데이터 ───────────────────────────────────────────

export async function getBoundary(
  admCd: string,
  level: AdminLevel
): Promise<AdminGeoCollection> {
  // mock 모드: 레벨별 사전 생성 파일 사용
  if (BOUNDARY_MODE === 'mock') {
    if (level === 'sido') return sidoMock as AdminGeoCollection;
    if (level === 'sigungu') {
      const sidoCd = admCd.slice(0, 2);
      return getSigunguMock(sidoCd) ?? sidoMock as AdminGeoCollection;
    }
    // eupmyeondong: 시군구 코드(5자리)로 조회
    const sigunguCd = admCd.slice(0, 5);
    return getEupmyeondongMock(sigunguCd) ?? getSigunguMock(admCd.slice(0, 2)) ?? sidoMock as AdminGeoCollection;
  }

  try {
    return await fetchBoundary(admCd, level);
  } catch (err) {
    console.warn('SGIS 경계 API 실패 → mock fallback', err);
    if (level === 'sido') return sidoMock as AdminGeoCollection;
    if (level === 'sigungu') {
      const sidoCd = admCd.slice(0, 2);
      return getSigunguMock(sidoCd) ?? sidoMock as AdminGeoCollection;
    }
    const sigunguCd = admCd.slice(0, 5);
    return getEupmyeondongMock(sigunguCd) ?? getSigunguMock(admCd.slice(0, 2)) ?? sidoMock as AdminGeoCollection;
  }
}

// ─── 인구 데이터 ───────────────────────────────────────────

export async function getPopulation(admCd: string): Promise<PopulationData> {
  // 동 단위(8자리)는 DATA_MODE와 무관하게 실제 API 우선 시도 (가장 최신 월)
  if (admCd.length === 8) {
    try {
      const apiData = await fetchPopulation(admCd);
      return finalizePopulationData({ ...apiData, source_type: 'real' }, admCd);
    } catch (err) {
      console.warn('인구 API 실패 → snapshot fallback', err);
      const mockData = getMockPopulation(admCd);
      return finalizePopulationData({ ...mockData, source_type: 'snapshot' }, admCd);
    }
  }

  // 시군구(5자리)는 실제 API 시도 후 실패 시 snapshot fallback
  if (admCd.length === 5) {
    try {
      const apiData = await fetchPopulation(admCd);
      return finalizePopulationData({ ...apiData, source_type: 'real' }, admCd);
    } catch (err) {
      console.warn('시군구 인구 API 실패 → snapshot fallback', err);
    }
  }

  // 시도(2자리)는 snapshot 데이터 사용
  const mockData = getMockPopulation(admCd);
  return finalizePopulationData({ ...mockData, source_type: 'snapshot' }, admCd);
}

function createPopulationFieldSources(
  rootSource: PopulationSourceType,
  ageSource: PopulationSourceType | 'unavailable',
  data: PopulationData,
): PopulationFieldSources {
  const totalsSource = {
    status: rootSource,
    note: rootSource === 'real' ? '행정안전부 인구 API' : '저장된 스냅샷 데이터',
  } as const;

  const ageNote: Record<string, string> = {
    real: '행정안전부 인구 API',
    snapshot: '저장된 스냅샷 데이터',
    file: AGE_FILE_YEAR_MONTH
      ? `공공데이터 기반 (${AGE_FILE_YEAR_MONTH})`
      : '공공데이터 기반 연령 분포',
    unavailable: '연령 분포 데이터 없음',
  };

  const hasAge = (data.age_groups?.length ?? 0) > 0;

  return {
    total_population: totalsSource,
    male_population: totalsSource,
    female_population: totalsSource,
    total_households: totalsSource,
    age_distribution: {
      status: hasAge ? ageSource : 'unavailable',
      note: hasAge ? ageNote[ageSource] : '연령 분포 데이터 없음',
    },
    youth_ratio: {
      status: hasAge ? ageSource : 'unavailable',
      note: hasAge ? '연령 분포에서 계산' : '연령 분포 데이터 없음',
    },
    elderly_ratio: {
      status: hasAge ? ageSource : 'unavailable',
      note: hasAge ? '연령 분포에서 계산' : '연령 분포 데이터 없음',
    },
    household_structure: {
      status: data.household_structure?.length ? rootSource : 'unavailable',
      note: data.household_structure?.length ? '공식 세대구조 통계' : '세대구조 데이터 미지원',
    },
  };
}

function finalizePopulationData(data: PopulationData, admCd: string): PopulationData {
  const isSido = admCd.length === 2;
  const rootSource = data.source_type ?? 'snapshot';

  // ─── 연령 분포: 파일 데이터 우선 ───────────────────────────
  let ageGroups = data.age_groups;
  let ageSource: PopulationSourceType | 'unavailable' = isSido
    ? (ageGroups?.length ? rootSource : 'unavailable')
    : 'unavailable';

  if (!isSido && Object.keys(AGE_FILE_DATA).length > 0) {
    // 동 단위: 직접 조회
    const fileAgeGroups = admCd.length === 8
      ? getAgeGroupsFromFile(admCd)
      : aggregateAgeGroupsFromFile(admCd);

    if (fileAgeGroups) {
      ageGroups = fileAgeGroups;
      ageSource = 'file';
    }
  }

  const fieldSources = createPopulationFieldSources(rootSource, ageSource, {
    ...data,
    age_groups: ageGroups,
  });

  const normalized: PopulationData = {
    ...data,
    age_groups: ageGroups,
    source_type: rootSource,
    field_sources: fieldSources,
  };

  // 세대구조: 시도만 mock 보유
  if (!isSido) {
    delete normalized.household_structure;
  }

  if (import.meta.env.DEV) {
    console.debug('population.lookup', {
      admCd,
      admNm: normalized.adm_nm,
      sourceType: normalized.source_type,
      ageSource,
      totalPopulationSource: normalized.field_sources?.total_population.status,
      ageDistributionSource: normalized.field_sources?.age_distribution.status,
      ageGroupsCount: normalized.age_groups?.length ?? 0,
      ageTotalSum: normalized.age_groups?.reduce((s, g) => s + g.total, 0) ?? 0,
    });
  }

  return normalized;
}

function getMockPopulation(admCd: string): PopulationData {
  const emdSeoulList = emdPopulationSeoulMock as PopulationData[];
  const sigunguList = sigunguPopulationMock as PopulationData[];
  const sidoList = populationMock as PopulationData[];

  // 1순위: 읍면동 8자리 코드 직접 매칭 (서울)
  const emdExact = emdSeoulList.find((d) => d.adm_cd === admCd);
  if (emdExact) return emdExact;

  // 2순위: 서울 읍면동인 경우 앞 5자리로 시군구 찾고, 그 시군구의 읍면동 중 매칭 시도
  // (다른 시도 읍면동이 서울 시군구 코드와 겹칠 수 있으므로 시도 코드 확인)
  if (admCd.startsWith('11') && admCd.length === 8) {
    // 서울 읍면동인데 직접 매칭 실패 → 시군구 fallback
    const sigunguCd = admCd.slice(0, 5);
    const sigunguMatch = sigunguList.find((d) => d.adm_cd === sigunguCd);
    if (sigunguMatch) return sigunguMatch;
  }

  // 3순위: 시군구 5자리 코드 직접 매칭
  const sigunguExact = sigunguList.find((d) => d.adm_cd === admCd);
  if (sigunguExact) return sigunguExact;

  // 4순위: 읍면동 → 앞 5자리 시군구 매칭
  if (admCd.length >= 5) {
    const sigunguCd = admCd.slice(0, 5);
    const sigunguMatch = sigunguList.find((d) => d.adm_cd === sigunguCd);
    if (sigunguMatch) return sigunguMatch;
  }

  // 5순위: 앞 2자리 시도 코드로 매칭
  const sidoCd = admCd.slice(0, 2);
  const sidoMatch = sidoList.find((d) => d.adm_cd === admCd || d.adm_cd === sidoCd);
  return sidoMatch ?? sidoList[0];
}

// ─── 선거 데이터 ───────────────────────────────────────────

export { ELECTIONS_META };

export async function getElection(
  admCd: string,
  electionId?: string,
  admNm?: string,
): Promise<ElectionData> {
  const id = electionId ?? ELECTIONS_META[0]?.id ?? 'presidential_20';

  try {
    return await fetchElectionResult(admCd, id, admNm);
  } catch (err) {
    if (isElectionLookupError(err)) {
      throw new Error(err.code === 'NEEDS_REVIEW' ? '선거 데이터 확인 필요' : '선거 데이터 없음');
    }
    console.warn('선거 데이터 조회 실패', err);
  }

  const result = getElectionByCode(admCd, id);
  if (result) return result;
  throw new Error('선거 데이터 없음');
}
