import { useEffect, useRef } from 'react';
import type { GeoJsonObject } from 'geojson';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AdminArea, AdminGeoCollection, AdminLevel } from '../../types';
import { getSidoColor } from '../../utils/adminCode';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletGeoData = geoData as unknown as GeoJsonObject;

  // 지도 초기화
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      center: [36.0, 127.7],
      zoom: 8,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd',
      maxZoom: 18,
    }).addTo(mapRef.current);

    // 컨테이너 크기 변화(사이드 패널 열림/닫힘) 시 지도 재조정
    const resizeObserver = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ animate: false });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // GeoJSON 레이어 업데이트
  useEffect(() => {
    if (!mapRef.current || !geoData.features.length) return;

    if (layerRef.current) {
      mapRef.current.removeLayer(layerRef.current);
    }

    layerRef.current = L.geoJSON(leafletGeoData, {
      style: (feature) => {
        const adm_cd = feature?.properties?.adm_cd ?? '';
        const isSelected = adm_cd === selectedCode;
        return {
          fillColor: getSidoColor(adm_cd),
          fillOpacity: isSelected ? 0.85 : 0.55,
          color: isSelected ? '#ffffff' : '#ffffff',
          weight: isSelected ? 2.5 : 1,
          opacity: 0.9,
        };
      },
      onEachFeature: (feature, layer) => {
        const { adm_cd, adm_nm } = feature.properties;

        layer.on({
          mouseover: (e) => {
            const l = e.target;
            l.setStyle({ fillOpacity: 0.8, weight: 2.5 });
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

        layer.bindTooltip(adm_nm, {
          permanent: false,
          direction: 'center',
          className: 'map-tooltip',
        });
      },
    }).addTo(mapRef.current);

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
          map.fitBounds(bounds, { padding: [40, 40] });
        } else {
          map.fitBounds(L.geoJSON(geoDataSnapshot).getBounds(), { padding: [20, 20] });
        }
      } else {
        map.fitBounds(L.geoJSON(geoDataSnapshot).getBounds(), { padding: [20, 20] });
      }
    });
  }, [geoData, leafletGeoData, selectedCode, level, onHover, onSelect]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
