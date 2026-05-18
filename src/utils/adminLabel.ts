import type { GeoJsonObject } from 'geojson';
import L from 'leaflet';
import type { AdminGeoFeature, AdminLevel } from '../types';

const SIDO_SHORT_NAME: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원특별자치도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전북특별자치도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
};

export function formatAdminLabel(name: string, level: AdminLevel): string {
  const normalized = `${name ?? ''}`.trim();
  if (!normalized) {
    return '';
  }

  if (level === 'sido') {
    return SIDO_SHORT_NAME[normalized] ?? normalized;
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  const shortName = parts[parts.length - 1] ?? normalized;
  return shortName;
}

/**
 * 섬 포함 등으로 bounding box 중심이 실제 육지와 멀어지는 시도는 직접 좌표 지정.
 * 예) 경상북도: 울릉도(130.9°E)가 포함돼 bbox 중심이 동해로 치우침 → 안동 인근 내륙으로 고정
 */
const SIDO_CUSTOM_CENTER: Record<string, [number, number]> = {
  경상북도: [36.50, 128.55],  // 울릉도 영향 배제, 내륙 중심
};

const SIDO_LABEL_OFFSET: Record<string, [number, number]> = {
  서울특별시: [0, -28],
  인천광역시: [-40, 2],
  경기도: [18, 8],
  세종특별자치시: [0, 22],
  대전광역시: [0, 18],
  광주광역시: [0, 18],
  대구광역시: [2, 20],
  울산광역시: [-30, 4],   // 기존 [28, 4] → 동해 방향이라 수정
  부산광역시: [-22, 12],  // 기존 [22, 12] → 동해 방향이라 수정
  제주특별자치도: [0, 10],
};

export function getAdminLabelLatLng(
  feature: AdminGeoFeature,
  map: L.Map,
  level: AdminLevel,
): L.LatLng | null {
  const bounds = L.geoJSON(feature as unknown as GeoJsonObject).getBounds();
  if (!bounds.isValid()) {
    return null;
  }

  if (level !== 'sido') {
    return bounds.getCenter();
  }

  // 커스텀 중심 좌표가 있으면 사용 (울릉도 등 도서 포함 시도)
  const customCenter = SIDO_CUSTOM_CENTER[feature.properties.adm_nm];
  const baseCenter = customCenter
    ? L.latLng(customCenter[0], customCenter[1])
    : bounds.getCenter();

  const offset = SIDO_LABEL_OFFSET[feature.properties.adm_nm];
  if (!offset) {
    return baseCenter;
  }

  const centerPoint = map.latLngToContainerPoint(baseCenter);
  return map.containerPointToLatLng(L.point(centerPoint.x + offset[0], centerPoint.y + offset[1]));
}

export function shouldRenderAdminLabel(
  feature: AdminGeoFeature,
  map: L.Map,
  level: AdminLevel,
  placedPoints: L.Point[],
  _totalFeatureCount: number,
): boolean {
  const bounds = L.geoJSON(feature as unknown as GeoJsonObject).getBounds();
  if (!bounds.isValid()) return false;

  // 시도는 항상 표시
  if (level === 'sido') return true;

  const zoom = map.getZoom();

  // ③ 행정구역 계층 판별: 이름의 마지막 단어가 "구"로 끝나면 자치구/행정구
  const shortName = (feature.properties.adm_nm ?? '').split(/\s+/).pop() ?? '';
  const isGu = shortName.endsWith('구');

  // ④ 줌 레벨 기반
  // - 구(자치구/행정구): zoom 8 미만이면 숨김 (전국 시도 뷰에서 구 레이블 제거)
  // - 읍면동: zoom 제한 없음 — 면적·충돌 감지로 자연스럽게 솎아냄
  if (level === 'sigungu' && isGu && zoom < 8) return false;

  // ① 폴리곤 면적 기반 필터링
  const nw = map.latLngToContainerPoint(bounds.getNorthWest());
  const se = map.latLngToContainerPoint(bounds.getSouthEast());
  const width = Math.abs(se.x - nw.x);
  const height = Math.abs(se.y - nw.y);
  const area = width * height;

  // 구는 일반 시/군보다 큰 폴리곤일 때만 레이블 표시 (zoom 8 기준 완산구·덕진구 등도 통과)
  const minArea   = level === 'eupmyeondong' ? 150  : isGu ? 800 : 700;
  const minWidth  = level === 'eupmyeondong' ? 16   : isGu ? 30  : 26;
  const minHeight = level === 'eupmyeondong' ? 10   : isGu ? 18  : 15;

  if (area < minArea || width < minWidth || height < minHeight) return false;

  // 충돌 감지: 이미 배치된 레이블과 너무 가까우면 숨김
  const center = map.latLngToContainerPoint(bounds.getCenter());
  const minDist = level === 'eupmyeondong' ? 32 : isGu ? 44 : 30;

  if (placedPoints.some((p) => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return Math.sqrt(dx * dx + dy * dy) < minDist;
  })) return false;

  placedPoints.push(center);
  return true;
}
