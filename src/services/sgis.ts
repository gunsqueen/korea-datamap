import type { AdminGeoCollection, AdminGeoFeature, AdminLevel } from '../types';
import { convertCoordinates } from '../utils/projection';

const SGIS_AUTH_URL = 'https://sgisapi.mods.go.kr/OpenAPI3/auth/authentication.json';
const SGIS_BOUNDARY_URL = 'https://sgisapi.mods.go.kr/OpenAPI3/boundary/hadmarea.geojson';

// ─── 토큰 캐시 ────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

  const params = new URLSearchParams({
    consumer_key: import.meta.env.VITE_SGIS_CONSUMER_KEY,
    consumer_secret: import.meta.env.VITE_SGIS_CONSUMER_SECRET,
  });

  const res = await fetch(`${SGIS_AUTH_URL}?${params}`);
  const data = await res.json();

  if (data.errCd !== 0) {
    throw new Error(`SGIS 인증 실패: ${data.errMsg}`);
  }

  cachedToken = data.result.accessToken;
  tokenExpiry = Number(data.result.accessTimeout);
  return cachedToken!;
}

// ─── 경계 데이터 캐시 (메모리) ───────────────────
// 키: `${level}:${admCd}` → 한 번 받은 데이터는 세션 동안 재사용
const boundaryCache = new Map<string, AdminGeoCollection>();

interface SgisFeatureGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

interface SgisFeature {
  type: 'Feature';
  geometry: SgisFeatureGeometry;
  properties: AdminGeoFeature['properties'];
}

interface SgisBoundaryResponse {
  errCd: number;
  errMsg?: string;
  features?: SgisFeature[];
}

/** 경계 GeoJSON 가져오기 (UTM-K → WGS84 변환 + 메모리 캐시) */
export async function fetchBoundary(
  admCd: string,
  level: AdminLevel,
  year = '2024'
): Promise<AdminGeoCollection> {
  const cacheKey = `${level}:${admCd}`;

  // 캐시 hit → 즉시 반환
  if (boundaryCache.has(cacheKey)) {
    return boundaryCache.get(cacheKey)!;
  }

  const token = await getAccessToken();

  // SGIS adm_cd 매핑:
  //   sido       → '0'          (전체 17 시도)
  //   sigungu    → admCd (2자리 시도코드, 예: '11')  → 해당 시도의 시군구
  //   eupmyeondong → admCd (5자리 시군구코드, 예: '11010') → 해당 시군구의 읍면동
  const sgisAdmCd = level === 'sido' ? '0' : admCd;

  const params = new URLSearchParams({
    accessToken: token,
    year,
    adm_cd: sgisAdmCd,
    low_search: '1',
  });

  const res = await fetch(`${SGIS_BOUNDARY_URL}?${params}`);
  const raw = await res.json() as SgisBoundaryResponse;

  if (raw.errCd !== 0) {
    throw new Error(`SGIS 경계 조회 실패: ${raw.errMsg} (adm_cd=${sgisAdmCd})`);
  }

  if (!raw.features?.length) {
    throw new Error(`경계 데이터 없음 (adm_cd=${sgisAdmCd})`);
  }

  // UTM-K → WGS84 좌표 변환
  const converted: AdminGeoCollection = {
    type: 'FeatureCollection',
    features: raw.features.map((f) => ({
      ...f,
      geometry: {
        ...f.geometry,
        coordinates: convertCoordinates(f.geometry.coordinates, f.geometry.type),
      },
    })),
  };

  // 캐시 저장
  boundaryCache.set(cacheKey, converted);

  return converted;
}

/** 캐시 초기화 (개발용) */
export function clearBoundaryCache() {
  boundaryCache.clear();
  cachedToken = null;
}
