import type { AdminGeoCollection, PopulationData, ElectionData, AdminLevel, DataMode, AgeGroup, HouseholdStructure } from '../types';
import { fetchBoundary } from './sgis';
import { fetchPopulation } from './population';
import { fetchElectionResult, getElectionByCode, ELECTIONS_META } from './election';
import sidoMock from '../data/mock/sido.json';
import populationMock from '../data/mock/population.json';
import sigunguPopulationMock from '../data/mock/sigungu_population.json';
import emdPopulationSeoulMock from '../data/mock/emd_population_seoul.json';

// 경계 모드: real(기본) / mock(오프라인 개발용)
// 인구·선거 모드: mock(기본) / real
const BOUNDARY_MODE = (import.meta.env.VITE_BOUNDARY_MODE ?? 'real') as 'real' | 'mock';
const DATA_MODE: DataMode = (import.meta.env.VITE_DATA_MODE as DataMode) ?? 'mock';

// ─── 경계 데이터 ───────────────────────────────────────────
// 경계는 항상 real SGIS API → 메모리 캐시 활용
// BOUNDARY_MODE=mock 시에만 sido.json fallback

export async function getBoundary(
  admCd: string,
  level: AdminLevel
): Promise<AdminGeoCollection> {
  if (BOUNDARY_MODE === 'mock') {
    return sidoMock as AdminGeoCollection;
  }
  try {
    return await fetchBoundary(admCd, level);
  } catch (err) {
    console.warn('SGIS 경계 API 실패 → sido mock fallback', err);
    // API 실패 시 최소한 시도 지도라도 보여줌
    return sidoMock as AdminGeoCollection;
  }
}

// ─── 인구 데이터 ───────────────────────────────────────────

export async function getPopulation(admCd: string): Promise<PopulationData> {
  // 동 단위(8자리)는 DATA_MODE와 무관하게 실제 API 우선 시도
  if (admCd.length === 8) {
    try {
      const apiData = await fetchPopulation(admCd);
      // API 데이터에 연령별/세대원수별이 없으면 시도 비율로 추정
      supplementDemographics(apiData, admCd);
      return apiData;
    } catch (err) {
      console.warn('인구 API 실패 → mock fallback', err);
      const mockData = getMockPopulation(admCd);
      supplementDemographics(mockData, admCd);
      return mockData;
    }
  }

  // 시도(2자리), 시군구(5자리)는 mock 데이터 사용
  if (DATA_MODE !== 'mock') {
    try {
      const apiData = await fetchPopulation(admCd);
      supplementDemographics(apiData, admCd);
      return apiData;
    } catch (err) {
      console.warn('인구 API 실패 → mock fallback', err);
    }
  }
  const mockData = getMockPopulation(admCd);
  supplementDemographics(mockData, admCd);
  return mockData;
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

  // 실제 NEC API 우선 시도
  try {
    return await fetchElectionResult(admCd, id, admNm);
  } catch (err) {
    console.warn('NEC API 실패 → mock fallback', err);
  }

  // mock fallback
  const result = getElectionByCode(admCd, id);
  if (result) return result;
  throw new Error(`선거 데이터 없음: ${id}`);
}
