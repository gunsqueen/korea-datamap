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

/** 색상 팔레트 - 시도별 구분색 (HSL) */
const SIDO_COLORS_HSL: Record<string, [number, number, number]> = {
  '11': [354, 74, 57], // 서울 - 빨강
  '21': [207, 38, 44], // 부산 - 파랑
  '22': [171, 58, 39], // 대구 - 청록
  '23': [43,  74, 66], // 인천 - 노랑
  '24': [27,  87, 67], // 광주 - 주황
  '25': [195, 33, 22], // 대전 - 짙은 청
  '26': [311, 10, 43], // 울산 - 보라
  '29': [347, 29, 60], // 세종 - 핑크
  '31': [182, 47, 76], // 경기 - 하늘
  '32': [234, 20, 29], // 강원 - 남색
  '33': [150, 26, 60], // 충북 - 녹색
  '34': [39,  77, 75], // 충남 - 연노랑
  '35': [14,  67, 62], // 전북 - 연주황
  '36': [153, 44, 42], // 전라남도 - 초록
  '37': [0,   100, 71], // 경북 - 연빨강
  '38': [177, 55, 55], // 경남 - 민트
  '39': [213, 18, 65], // 제주 - 회청
};

/** 문자열 → 0~1 사이 결정적 해시값 */
function codeHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return (h & 0xffff) / 0xffff;
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s));
  l = Math.max(15, Math.min(85, l));
  const sl = s / 100, ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = ll - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export const SIDO_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(SIDO_COLORS_HSL).map(([k, [h, s, l]]) => [k, hslToHex(h, s, l)])
);

/**
 * 지역 코드에 따라 색상 반환.
 * 시도 → 기본색, 시군구/읍면동 → 시도 기본색에서 명도·색조 미세 변형
 */
export function getSidoColor(admCd: string): string {
  const sido = admCd.slice(0, 2);
  const base = SIDO_COLORS_HSL[sido];
  if (!base) return '#cccccc';

  // 시도 레벨: 기본색 그대로
  if (admCd.length <= 2) return hslToHex(...base);

  // 시군구 / 읍면동: 명도 ±12%, 색조 ±8° 변형
  const t = codeHash(admCd);
  const [h, s, l] = base;
  const dh = (t - 0.5) * 16;       // -8 ~ +8°
  const dl = (t - 0.5) * 24;       // -12 ~ +12%
  return hslToHex(h + dh, s, l + dl);
}
