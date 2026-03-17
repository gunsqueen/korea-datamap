import type { AdminLevel } from '../types';

/** 행정구역 코드로 레벨 판단 */
export function getAdminLevel(code: string): AdminLevel {
  const clean = code.replace(/0+$/, '');
  if (clean.length <= 2) return 'sido';
  if (clean.length <= 5) return 'sigungu';
  return 'eupmyeondong';
}

/** 시도 코드 추출 (앞 2자리) */
export function getSidoCode(code: string): string {
  return code.slice(0, 2);
}

/** 시군구 코드 추출 (앞 5자리) */
export function getSigunguCode(code: string): string {
  return code.slice(0, 5);
}

/** SGIS API용 adm_cd 변환 (시도: 2자리, 시군구: 5자리, 읍면동: 8자리) */
export function toSgisCode(code: string, level: AdminLevel): string {
  if (level === 'sido') return code.slice(0, 2);
  if (level === 'sigungu') return code.slice(0, 5);
  return code.slice(0, 8);
}

/** 색상 팔레트 - 시도별 구분색 */
export const SIDO_COLORS: Record<string, string> = {
  '11': '#E63946', // 서울
  '21': '#457B9D', // 부산
  '22': '#2A9D8F', // 대구
  '23': '#E9C46A', // 인천
  '24': '#F4A261', // 광주
  '25': '#264653', // 대전
  '26': '#6D6875', // 울산
  '29': '#B5838D', // 세종
  '31': '#A8DADC', // 경기
  '32': '#3D405B', // 강원
  '33': '#81B29A', // 충북
  '34': '#F2CC8F', // 충남
  '35': '#E07A5F', // 전북
  '36': '#3D9970', // 전남
  '37': '#FF6B6B', // 경북
  '38': '#4ECDC4', // 경남
  '39': '#95A3B3', // 제주
};

export function getSidoColor(admCd: string): string {
  const sido = admCd.slice(0, 2);
  return SIDO_COLORS[sido] ?? '#cccccc';
}
