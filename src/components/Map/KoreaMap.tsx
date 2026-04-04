import { useEffect, useRef } from 'react';
import type { GeoJsonObject } from 'geojson';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AdminArea, AdminGeoCollection, AdminLevel } from '../../types';
import { getSidoColor } from '../../utils/adminCode';
import { formatAdminLabel, getAdminLabelLatLng, shouldRenderAdminLabel } from '../../utils/adminLabel';

interface Props {
  geoData: AdminGeoCollection;
  level: AdminLevel;
  selectedCode: string | null;
  onSelect: (area: AdminArea) => void;
  onHover: (area: AdminArea | null) => void;
}

export function KoreaMap({ geoData, level, selectedCode, onSelect, onHover }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const labelLayerRef = useRef<L.LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletGeoData = geoData as unknown as GeoJsonObject;

  // 지도 초기화
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      center: [36.48, 127.29],
      zoom: 8,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd',
      maxZoom: 18,
    }).addTo(mapRef.current);

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

  // GeoJSON 레이어 업데이트
  useEffect(() => {
    if (!mapRef.current || !geoData.features.length) return;

    if (layerRef.current) {
      mapRef.current.removeLayer(layerRef.current);
    }
    labelLayerRef.current?.clearLayers();

    layerRef.current = L.geoJSON(leafletGeoData, {
      style: (feature) => {
        const adm_cd = feature?.properties?.adm_cd ?? '';
        const isSelected = adm_cd === selectedCode;
        return {
          fillColor: isSelected ? 'rgba(6,182,212,0.20)' : getSidoColor(adm_cd),
          fillOpacity: isSelected ? 1 : 0.45,
          color: isSelected ? '#22d3ee' : '#d946ef',
          weight: isSelected ? 2.5 : 1.5,
          opacity: 1,
        };
      },
      onEachFeature: (feature, layer) => {
        const { adm_cd, adm_nm } = feature.properties;

        layer.on({
          mouseover: (e) => {
            const l = e.target;
            l.setStyle({ fillOpacity: 0.65, weight: 2, color: '#22d3ee' });
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
    requestAnimationFrame(() => {
      if (!map) return;
      map.invalidateSize({ animate: false });
      if (selectedCode) {
        const target = geoData.features.find(
          (f) => f.properties.adm_cd === selectedCode
        );
        if (target) {
          const bounds = L.geoJSON(target as unknown as GeoJsonObject).getBounds();
          map.fitBounds(bounds, { padding: [40, 40], animate: false });
        } else {
          map.fitBounds(L.geoJSON(geoDataSnapshot).getBounds(), { padding: [20, 20], animate: false });
        }
      } else if (level === 'sido') {
        // 전국 뷰(sido 레벨, 선택 없음): fitBounds로 줌 계산 후 세종시 중심으로 고정
        map.fitBounds(L.geoJSON(geoDataSnapshot).getBounds(), { padding: [20, 20], animate: false });
        const targetZoom = map.getZoom() + 0.7;
        map.setView([36.4800, 127.2890], targetZoom, { animate: false });
      } else {
        // 시군구·읍면동 레벨에서 선택 없음: 현재 geoData 전체 영역에 맞게 fitBounds
        map.fitBounds(L.geoJSON(geoDataSnapshot).getBounds(), { padding: [30, 30], animate: false });
      }
      renderLabels();
    });

    map.on('zoomend moveend', renderLabels);

    return () => {
      map.off('zoomend moveend', renderLabels);
      labelLayerRef.current?.clearLayers();
    };
  }, [geoData, leafletGeoData, selectedCode, level, onHover, onSelect]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
