import type { PopulationData } from '../types';
import moisCodeMap from '../data/mois_code_map.json';

// 공공데이터포털 행정안전부_행정동별(통반단위) 주민등록 인구 및 세대현황 API
const BASE_URL = 'https://apis.data.go.kr/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus';
const SERVICE_KEY = 'fcfb6899040b2dc7f9c3bf04402834c6a83364a827417cad9d2052178fce7591';

type YearMonth = { year: number; month: number };

/** 연월 문자열 생성 (YYYYMM) */
function ymStr(year: number, month: number): string {
  return `${year}${String(month).padStart(2, '0')}`;
}

/** 최근 N개월 후보 목록 생성 (가장 최근부터) */
function recentMonths(maxOffset = 6): YearMonth[] {
  const now = new Date();
  return Array.from({ length: maxOffset - 1 }, (_, i) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - (i + 2));
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
}

/**
 * 특정 연월에 단일 동 데이터를 조회 (admmCd = MOIS 10자리 코드)
 */
async function fetchDongForMonth(
  sgisCode: string,
  admmCd: string,
  ym: YearMonth,
): Promise<PopulationData> {
  const ymS = ymStr(ym.year, ym.month);
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo: '1',
    numOfRows: '1000',
    type: 'json',
    admmCd,
    srchFrYm: ymS,
    srchToYm: ymS,
  });

  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  const resultCode =
    json?.Response?.head?.resultCode ?? json?.response?.head?.resultCode;
  if (resultCode && resultCode !== '0') throw new Error(`API code ${resultCode}`);

  const items: Record<string, string>[] =
    json?.Response?.items?.item ?? json?.response?.items?.item ?? [];

  if (!Array.isArray(items) || items.length === 0) throw new Error('no data');

  let totalPop = 0, malePop = 0, femalePop = 0, households = 0;
  let adm_nm = '';

  for (const item of items) {
    totalPop  += Number(item.totNmprCnt  ?? 0);
    malePop   += Number(item.maleNmprCnt ?? 0);
    femalePop += Number(item.femlNmprCnt ?? 0);
    households += Number(item.hhCnt      ?? 0);
    if (!adm_nm && item.dongNm) {
      adm_nm = [item.ctpvNm, item.sggNm, item.dongNm].filter(Boolean).join(' ');
    }
  }

  if (totalPop === 0) throw new Error('zero population');

  return {
    adm_cd: sgisCode,
    adm_nm,
    year: ym.year,
    month: ym.month,
    total_population: totalPop,
    male_population: malePop,
    female_population: femalePop,
    total_households: households,
    source_type: 'real',
  };
}

/**
 * 동 코드 하나로 최신 유효 연월 탐색
 */
async function findLatestMonth(sgisCode: string, admmCd: string): Promise<YearMonth> {
  for (const ym of recentMonths(6)) {
    try {
      const data = await fetchDongForMonth(sgisCode, admmCd, ym);
      if (data.total_population > 0) return ym;
    } catch {
      continue;
    }
  }
  throw new Error('최신 연월 탐색 실패');
}

/**
 * 동 단위 (8자리 SGIS 코드) 인구 조회
 */
async function fetchForDong(sgisCode: string): Promise<PopulationData> {
  const codeMap = moisCodeMap as Record<string, string>;
  const admmCd = codeMap[sgisCode];
  if (!admmCd) throw new Error(`MOIS 코드 매핑 없음: ${sgisCode}`);

  for (const ym of recentMonths(6)) {
    try {
      const data = await fetchDongForMonth(sgisCode, admmCd, ym);
      if (data.total_population > 0) {
        console.info(`[인구 API] ${sgisCode} → ${ym.year}년 ${ym.month}월`);
        return data;
      }
    } catch {
      continue;
    }
  }
  throw new Error('최근 6개월 데이터 없음');
}

/**
 * 시군구 단위 (5자리 SGIS 코드) - 하위 동 전체 집계
 * 모든 하위 동을 동일한 최신 연월로 병렬 조회 후 합산
 */
async function fetchForSigungu(sigunguCode: string): Promise<PopulationData> {
  const codeMap = moisCodeMap as Record<string, string>;

  // 하위 동 코드 목록
  const childKeys = Object.keys(codeMap).filter(
    (k) => k.startsWith(sigunguCode) && k.length === 8
  );
  if (childKeys.length === 0) throw new Error(`하위 동 코드 없음: ${sigunguCode}`);

  // 첫 번째 동으로 최신 유효 월 탐색
  const probeKey = childKeys[0];
  const latestYm = await findLatestMonth(probeKey, codeMap[probeKey]);
  console.info(`[인구 API] ${sigunguCode} 기준월: ${latestYm.year}년 ${latestYm.month}월 (${childKeys.length}개 동 집계)`);

  // 모든 하위 동 병렬 조회
  const results = await Promise.allSettled(
    childKeys.map((key) => fetchDongForMonth(key, codeMap[key], latestYm))
  );

  const successful = results
    .filter((r): r is PromiseFulfilledResult<PopulationData> => r.status === 'fulfilled')
    .map((r) => r.value);

  if (successful.length === 0) throw new Error('집계 가능한 동 없음');

  return {
    adm_cd: sigunguCode,
    adm_nm: '',  // index.ts의 getMockPopulation에서 채움
    year: latestYm.year,
    month: latestYm.month,
    total_population: successful.reduce((s, d) => s + d.total_population, 0),
    male_population:  successful.reduce((s, d) => s + d.male_population,  0),
    female_population: successful.reduce((s, d) => s + d.female_population, 0),
    total_households:  successful.reduce((s, d) => s + d.total_households,  0),
    source_type: 'real',
  };
}

/**
 * 공개 API: 동(8자리) 또는 시군구(5자리) 인구 조회
 * 시도(2자리)는 지원하지 않음 (호출 측에서 snapshot 사용)
 */
export async function fetchPopulation(admCd: string): Promise<PopulationData> {
  if (admCd.length === 8) return fetchForDong(admCd);
  if (admCd.length === 5) return fetchForSigungu(admCd);
  throw new Error(`지원하지 않는 코드: ${admCd} (8자리 동 또는 5자리 시군구만 지원)`);
}
