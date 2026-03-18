import type { AdminGeoCollection, PopulationData, ElectionData, AdminLevel, DataMode, AgeGroup, HouseholdStructure } from '../types';
import { fetchBoundary } from './sgis';
import { fetchPopulation } from './population';
import { fetchElectionResult, getElectionByCode, ELECTIONS_META } from './election';
import { isElectionLookupError } from './electionDebug';
import sidoMock from '../data/mock/sido.json';
import populationMock from '../data/mock/population.json';
import sigunguPopulationMock from '../data/mock/sigungu_population.json';
import emdPopulationSeoulMock from '../data/mock/emd_population_seoul.json';

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
      supplementDemographics(apiData, admCd);
      return { ...apiData, source_type: 'realtime' as const };
    } catch (err) {
      console.warn('인구 API 실패 → snapshot fallback', err);
      const mockData = getMockPopulation(admCd);
      supplementDemographics(mockData, admCd);
      return { ...mockData, source_type: 'snapshot' as const };
    }
  }

  // 시도(2자리), 시군구(5자리)는 snapshot 데이터 사용 (동 레벨 API만 지원)
  const mockData = getMockPopulation(admCd);
  supplementDemographics(mockData, admCd);
  return { ...mockData, source_type: 'snapshot' as const };
}

/**
 * 연령별/세대원수별 데이터가 없으면 상위 시도의 비율로 추정
 */
function supplementDemographics(data: PopulationData, admCd: string): void {
  const sidoCd = admCd.slice(0, 2);
  const sidoList = populationMock as PopulationData[];
  const sido = sidoList.find((d) => d.adm_cd === sidoCd);
  if (!sido) return;

  // 연령별 인구 추정
  if ((!data.age_groups || data.age_groups.length === 0) && sido.age_groups && sido.age_groups.length > 0) {
    const sidoTotal = sido.total_population || 1;
    data.age_groups = sido.age_groups.map((g) => {
      const ratio = g.total / sidoTotal;
      const total = Math.round(data.total_population * ratio);
      const maleRatio = g.total > 0 ? g.male / g.total : 0.5;
      const male = Math.round(total * maleRatio);
      return {
        age_range: g.age_range,
        male,
        female: total - male,
        total,
      } as AgeGroup;
    });
  }

  // 세대원수별 세대 추정
  if ((!data.household_structure || data.household_structure.length === 0) && sido.household_structure && sido.household_structure.length > 0) {
    const sidoHH = sido.total_households || 1;
    data.household_structure = sido.household_structure.map((h) => {
      const ratio = h.count / sidoHH;
      const count = Math.round(data.total_households * ratio);
      return {
        members: h.members,
        members_label: h.members_label,
        count,
        percentage: h.percentage,
      } as HouseholdStructure;
    });
  }
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
