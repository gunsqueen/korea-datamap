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

const SIDO_LABEL_OFFSET: Record<string, [number, number]> = {
  서울특별시: [0, -28],
  인천광역시: [-40, 2],
  경기도: [18, 8],
  세종특별자치시: [0, 22],
  대전광역시: [0, 18],
  광주광역시: [0, 18],
  대구광역시: [2, 20],
  울산광역시: [28, 4],
  부산광역시: [22, 12],
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

  const center = bounds.getCenter();

  if (level !== 'sido') {
    return center;
  }

  const offset = SIDO_LABEL_OFFSET[feature.properties.adm_nm];
  if (!offset) {
    return center;
  }

  const centerPoint = map.latLngToContainerPoint(center);
  return map.containerPointToLatLng(L.point(centerPoint.x + offset[0], centerPoint.y + offset[1]));
}

export function shouldRenderAdminLabel(
  feature: AdminGeoFeature,
  map: L.Map,
  level: AdminLevel,
  placedPoints: L.Point[],
  totalFeatureCount: number,
): boolean {
  const bounds = L.geoJSON(feature as unknown as GeoJsonObject).getBounds();
  if (!bounds.isValid()) {
    return false;
  }

  if (level === 'sido') {
    return true;
  }

  if (level === 'sigungu' && totalFeatureCount <= 50) {
    return true;
  }

  if (level === 'eupmyeondong' && totalFeatureCount <= 24) {
    return true;
  }

  const northWest = map.latLngToContainerPoint(bounds.getNorthWest());
  const southEast = map.latLngToContainerPoint(bounds.getSouthEast());
  const width = Math.abs(southEast.x - northWest.x);
  const height = Math.abs(southEast.y - northWest.y);
  const area = width * height;

  const minAreaByLevel: Record<AdminLevel, number> = {
    sido: 1200,
    sigungu: totalFeatureCount <= 40 ? 420 : 900,
    eupmyeondong: 900,
  };

  const minWidthByLevel: Record<AdminLevel, number> = {
    sido: 34,
    sigungu: totalFeatureCount <= 40 ? 24 : 34,
    eupmyeondong: 36,
  };

  const minHeightByLevel: Record<AdminLevel, number> = {
    sido: 16,
    sigungu: totalFeatureCount <= 40 ? 12 : 16,
    eupmyeondong: 18,
  };

  if (area < minAreaByLevel[level] || width < minWidthByLevel[level] || height < minHeightByLevel[level]) {
    return false;
  }

  const center = map.latLngToContainerPoint(bounds.getCenter());
  const minDistanceByLevel: Record<AdminLevel, number> = {
    sido: 28,
    sigungu: totalFeatureCount <= 40 ? 0 : 28,
    eupmyeondong: 40,
  };

  if (minDistanceByLevel[level] <= 0) {
    placedPoints.push(center);
    return true;
  }

  if (
    placedPoints.some((point) => {
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      return Math.sqrt(dx * dx + dy * dy) < minDistanceByLevel[level];
    })
  ) {
    return false;
  }

  placedPoints.push(center);
  return true;
}
