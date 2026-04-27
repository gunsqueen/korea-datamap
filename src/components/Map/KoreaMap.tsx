import { useEffect, useRef } from 'react';
import type { GeoJsonObject } from 'geojson';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AdminArea, AdminGeoCollection, AdminLevel } from '../../types';
import { getSidoColor } from '../../utils/adminCode';
import { formatAdminLabel, getAdminLabelLatLng, shouldRenderAdminLabel } from '../../utils/adminLabel';

export interface ChoroplethEntry {
  color: string;
  party: string;
  voteRate: number;
  winnerName?: string;
}

export interface DistrictColorEntry {
  color: string;
  districtKey: string;
  label: string;
}

interface Props {
  geoData: AdminGeoCollection;
  level: AdminLevel;
  selectedCode: string | null;
  theme?: 'dark' | 'light';
  onSelect: (area: AdminArea) => void;
  onHover: (area: AdminArea | null) => void;
  highlightedEmdCodes?: Set<string>;
  /** 지방의원 선거구 묶음 채색: adm_cd → 선거구 색상 */
  districtColorMap?: Map<string, DistrictColorEntry>;
  /** 선거 결과 코로플레스 채색: adm_cd → 승자 정당 정보 */
  choroplethMap?: Map<string, ChoroplethEntry>;
  /**
   * 하단에 가려진 영역(px). 모바일 바텀시트가 있을 때 지도의 시각적 중심을
   * 보이는 영역(지도 컨테이너 상단 ~ (height - bottomInset))에 맞추기 위해 사용.
   */
  bottomInset?: number;
}

export function KoreaMap({ geoData, level, selectedCode, theme = 'dark', onSelect, onHover, highlightedEmdCodes, districtColorMap, choroplethMap, bottomInset = 0 }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const labelLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletGeoData = geoData as unknown as GeoJsonObject;

  // 지도 초기화
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      center: [36.48, 127.29],
      zoom: 9,
      zoomControl: false,   // 좌상단 기본 위치 비활성 → 우하단으로 재배치
      attributionControl: true,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);

    const tileStyle = theme === 'light' ? 'light_nolabels' : 'dark_nolabels';
    tileLayerRef.current = L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/${tileStyle}/{z}/{x}/{y}{r}.png`,
      { attribution: '© OpenStreetMap contributors © CARTO', subdomains: 'abcd', maxZoom: 18 }
    ).addTo(mapRef.current);

    labelLayerRef.current = L.layerGroup().addTo(mapRef.current);

    // 컨테이너 크기 변화(사이드 패널 열림/닫힘) 시 지도 재조정
    const resizeObserver = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ animate: false });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      labelLayerRef.current = null;
    };
  }, []);

  // 테마 변경 시 타일 레이어 교체
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    const tileStyle = theme === 'light' ? 'light_nolabels' : 'dark_nolabels';
    const newUrl = `https://{s}.basemaps.cartocdn.com/${tileStyle}/{z}/{x}/{y}{r}.png`;
    tileLayerRef.current.setUrl(newUrl);
  }, [theme]);

  // GeoJSON 레이어 업데이트
  useEffect(() => {
    if (!mapRef.current || !geoData.features.length) return;

    if (layerRef.current) {
      mapRef.current.removeLayer(layerRef.current);
    }
    labelLayerRef.current?.clearLayers();

    const isDark = theme !== 'light';
    const baseBorder = isDark ? 'rgba(255,255,255,0.32)' : 'rgba(71,85,105,0.55)';
    const choroBorder = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(30,41,59,0.55)';
    const selectBorder = isDark ? '#22d3ee' : '#0891b2';

    layerRef.current = L.geoJSON(leafletGeoData, {
      style: (feature) => {
        const adm_cd = feature?.properties?.adm_cd ?? '';
        const isSelected = adm_cd === selectedCode;
        const isHighlighted = highlightedEmdCodes?.has(adm_cd) ?? false;
        const district = districtColorMap?.get(adm_cd);
        const choro = choroplethMap?.get(adm_cd);
        // 코로플레스 색 (정당색) 적용: 득표율 기반 투명도
        const choroOpacity = choro
          ? Math.min(0.82, Math.max(0.40, 0.40 + (choro.voteRate / 100) * 0.5))
          : 0.45;
        const fillColor = district?.color ?? choro?.color ?? getSidoColor(adm_cd);
        const fillOpacity = district
          ? (isHighlighted ? 0.92 : isSelected ? 0.88 : 0.72)
          : isHighlighted ? 1 : isSelected ? Math.min(1, choroOpacity + 0.20) : choroOpacity;
        return {
          fillColor: isHighlighted
            ? (isDark ? 'rgba(251,191,36,0.35)' : 'rgba(234,179,8,0.30)')
            : isSelected
              ? (district ? fillColor : (choro ? choro.color : 'rgba(6,182,212,0.22)'))
              : fillColor,
          fillOpacity,
          color: isHighlighted
            ? '#f59e0b'
            : isSelected
              ? selectBorder
              : (district ? district.color : (choro ? choroBorder : baseBorder)),
          weight: isHighlighted ? 2.5 : isSelected ? 3.2 : (district ? 1.6 : (choro ? 0.9 : 1.2)),
          opacity: 1,
        };
      },
      onEachFeature: (feature, layer) => {
        const { adm_cd, adm_nm } = feature.properties;

        layer.on({
          mouseover: (e) => {
            const l = e.target;
            l.setStyle({ fillOpacity: 0.65, weight: 2.2, color: selectBorder });
            onHover({
              adm_cd,
              adm_nm,
              level,
            });
          },
          mouseout: (e) => {
            layerRef.current?.resetStyle(e.target);
            onHover(null);
          },
          click: () => {
            onSelect({
              adm_cd,
              adm_nm,
              level,
            });
          },
        });
      },
    }).addTo(mapRef.current);

    const renderLabels = () => {
      if (!mapRef.current || !labelLayerRef.current) return;

      labelLayerRef.current.clearLayers();
      const placedPoints: L.Point[] = [];

      geoData.features.forEach((feature) => {
        if (!shouldRenderAdminLabel(feature, mapRef.current!, level, placedPoints, geoData.features.length)) {
          return;
        }

        const labelLatLng = getAdminLabelLatLng(feature, mapRef.current!, level);
        if (!labelLatLng) {
          return;
        }

        const label = formatAdminLabel(feature.properties.adm_nm, level);
        if (!label) {
          return;
        }

        const icon = L.divIcon({
          className: `region-label-marker region-label-${level}`,
          html: `<span class="region-label-text">${label}</span>`,
          iconSize: undefined,
        });

        L.marker(labelLatLng, {
          icon,
          interactive: false,
          keyboard: false,
        }).addTo(labelLayerRef.current!);
      });
    };

    // 선택된 지역이 있으면 해당 지역으로 이동
    // requestAnimationFrame으로 컨테이너 레이아웃이 완전히 확정된 후 fitBounds 실행
    const map = mapRef.current;
    const geoDataSnapshot = leafletGeoData;

    // 바텀시트에 가려지는 아래쪽 영역만큼 보정: 하단에 padding을 더해
    // fitBounds가 실제로 "보이는 영역"을 기준으로 맞추도록 한다.
    const insetPadding = (pad: [number, number]): L.FitBoundsOptions => ({
      paddingTopLeft: [pad[0], pad[1]],
      paddingBottomRight: [pad[0], pad[1] + bottomInset],
      animate: false,
    });

    // setView 시 center를 보이는 영역의 가운데로 맞추기 위해 pixel 공간에서 아래로 이동 보정
    const offsetCenter = (center: L.LatLng, zoom: number): L.LatLng => {
      if (!bottomInset) return center;
      const point = map.project(center, zoom);
      const shifted = L.point(point.x, point.y + bottomInset / 2);
      return map.unproject(shifted, zoom);
    };

    requestAnimationFrame(() => {
      if (!map) return;
      map.invalidateSize({ animate: false });
      if (selectedCode) {
        const target = geoData.features.find(
          (f) => f.properties.adm_cd === selectedCode
        );
        if (target) {
          const bounds = L.geoJSON(target as unknown as GeoJsonObject).getBounds();
          // 읍면동 레벨(구 클릭)은 zoom 12 고정, 그 외는 fitBounds 자동 계산
          if (level === 'eupmyeondong') {
            map.setView(offsetCenter(bounds.getCenter(), 12), 12, { animate: false });
          } else {
            map.fitBounds(bounds, insetPadding([40, 40]));
          }
        } else {
          map.fitBounds(L.geoJSON(geoDataSnapshot).getBounds(), insetPadding([20, 20]));
        }
      } else if (level === 'sido') {
        // 전국 뷰(sido 레벨, 선택 없음): fitBounds로 줌 계산 후 세종시 중심으로 고정 (바텀시트 보정)
        map.fitBounds(L.geoJSON(geoDataSnapshot).getBounds(), insetPadding([20, 20]));
        const targetZoom = map.getZoom() + 0.7;
        map.setView(offsetCenter(L.latLng(36.4800, 127.2890), targetZoom), targetZoom, { animate: false });
      } else {
        // 시군구·읍면동 레벨에서 선택 없음: 현재 geoData 전체 영역에 맞게 fitBounds
        map.fitBounds(L.geoJSON(geoDataSnapshot).getBounds(), insetPadding([30, 30]));
      }
      renderLabels();
    });

    map.on('zoomend moveend', renderLabels);

    return () => {
      map.off('zoomend moveend', renderLabels);
      labelLayerRef.current?.clearLayers();
    };
  // bottomInset은 별도 useEffect에서 처리 (전체 GeoJSON 재생성 방지)
  }, [geoData, leafletGeoData, selectedCode, level, theme, onHover, onSelect, highlightedEmdCodes, districtColorMap, choroplethMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // 바텀시트 스냅 변경(= bottomInset 변경) 시 현재 뷰를 보이는 영역에 맞춰 재중앙화
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geoData.features.length) return;

    const run = () => {
      map.invalidateSize({ animate: false });
      const insetPadding = (pad: [number, number]): L.FitBoundsOptions => ({
        paddingTopLeft: [pad[0], pad[1]],
        paddingBottomRight: [pad[0], pad[1] + bottomInset],
        animate: false,
      });
      const offsetCenter = (center: L.LatLng, zoom: number): L.LatLng => {
        if (!bottomInset) return center;
        const point = map.project(center, zoom);
        const shifted = L.point(point.x, point.y + bottomInset / 2);
        return map.unproject(shifted, zoom);
      };

      if (selectedCode) {
        const target = geoData.features.find((f) => f.properties.adm_cd === selectedCode);
        if (target) {
          const bounds = L.geoJSON(target as unknown as GeoJsonObject).getBounds();
          if (level === 'eupmyeondong') {
            map.setView(offsetCenter(bounds.getCenter(), 12), 12, { animate: false });
          } else {
            map.fitBounds(bounds, insetPadding([40, 40]));
          }
          return;
        }
      }
      if (level === 'sido') {
        map.fitBounds(L.geoJSON(leafletGeoData).getBounds(), insetPadding([20, 20]));
        const targetZoom = map.getZoom() + 0.7;
        map.setView(offsetCenter(L.latLng(36.4800, 127.2890), targetZoom), targetZoom, { animate: false });
      } else {
        map.fitBounds(L.geoJSON(leafletGeoData).getBounds(), insetPadding([30, 30]));
      }
    };

    // 첫 렌더 직후는 메인 useEffect에서 이미 처리되므로 생략, 이후 bottomInset 변경 시에만 실행
    requestAnimationFrame(run);
  }, [bottomInset]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
