import type { PopulationData } from '../types';
import moisCodeMap from '../data/mois_code_map.json';

// 공공데이터포털 행정안전부_행정동별(통반단위) 주민등록 인구 및 세대현황 API
// https://www.data.go.kr/data/15108065/openapi.do
const BASE_URL = 'https://apis.data.go.kr/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus';
const SERVICE_KEY = 'fcfb6899040b2dc7f9c3bf04402834c6a83364a827417cad9d2052178fce7591';

/**
 * 행정동 단위 인구 통계 조회
 * 가장 최신 데이터를 반환하기 위해 최근 6개월을 순차 시도
 */
export async function fetchPopulation(admCd: string): Promise<PopulationData> {
  if (admCd.length !== 8) {
    throw new Error(`읍면동 8자리 코드만 지원: ${admCd}`);
  }

  const admmCd = (moisCodeMap as Record<string, string>)[admCd];
  if (!admmCd) {
    throw new Error(`MOIS 코드 매핑 없음: ${admCd}`);
  }

  // 최신 데이터를 얻기 위해 2개월 전부터 6개월 전까지 순차 시도
  const now = new Date();
  for (let offset = 2; offset <= 6; offset++) {
    const target = new Date(now);
    target.setMonth(target.getMonth() - offset);
    const targetYear = target.getFullYear();
    const targetMonth = target.getMonth() + 1;
    const ymStr = `${targetYear}${String(targetMonth).padStart(2, '0')}`;

    try {
      const data = await fetchPopulationForMonth(admCd, admmCd, targetYear, targetMonth, ymStr);
      if (data.total_population > 0) {
        console.info(`[인구 API] ${admCd} → ${targetYear}년 ${targetMonth}월 데이터 획득`);
        return data;
      }
    } catch {
      // 해당 월 데이터 없음, 다음 월 시도
      continue;
    }
  }

  throw new Error('최근 6개월 인구 데이터 없음');
}

async function fetchPopulationForMonth(
  admCd: string,
  admmCd: string,
  targetYear: number,
  targetMonth: number,
  ymStr: string,
): Promise<PopulationData> {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo: '1',
    numOfRows: '1000',
    type: 'json',
    admmCd,
    srchFrYm: ymStr,
    srchToYm: ymStr,
  });

  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) throw new Error(`인구 API HTTP 오류: ${res.status}`);

  const data = await res.json();

  const resultCode =
    data?.Response?.head?.resultCode ??
    data?.response?.head?.resultCode;
  if (resultCode && resultCode !== '0') {
    throw new Error(`인구 API 오류 코드: ${resultCode}`);
  }

  const items: Record<string, string>[] =
    data?.Response?.items?.item ??
    data?.response?.items?.item ??
    [];

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('인구 데이터 없음');
  }

  // 통/반 단위 데이터를 동 단위로 집계
  let totalPop = 0;
  let malePop = 0;
  let femalePop = 0;
  let households = 0;
  let adm_nm = '';

  for (const item of items) {
    totalPop += Number(item.totNmprCnt ?? 0);
    malePop += Number(item.maleNmprCnt ?? 0);
    femalePop += Number(item.femlNmprCnt ?? 0);
    households += Number(item.hhCnt ?? 0);
    if (!adm_nm && item.dongNm) {
      adm_nm = [item.ctpvNm, item.sggNm, item.dongNm]
        .filter(Boolean)
        .join(' ');
    }
  }

  return {
    adm_cd: admCd,
    adm_nm,
    year: targetYear,
    month: targetMonth,
    total_population: totalPop,
    male_population: malePop,
    female_population: femalePop,
    total_households: households,
    source_type: 'realtime',
  };
}
