import { useEffect, useRef } from 'react';
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

  // 지도 초기화
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      center: [36.5, 127.8],
      zoom: 7,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd',
      maxZoom: 18,
    }).addTo(mapRef.current);

    return () => {
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

    layerRef.current = L.geoJSON(geoData as any, {
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
    if (selectedCode) {
      const target = geoData.features.find(
        (f) => f.properties.adm_cd === selectedCode
      );
      if (target) {
        const bounds = L.geoJSON(target as any).getBounds();
        mapRef.current.fitBounds(bounds, { padding: [40, 40] });
      } else {
        // 현재 레벨의 데이터에 selectedCode가 없을 때 (예: 읍면동 레벨 전환 시)
        // 전체 피처 범위로 fitBounds
        mapRef.current.fitBounds(L.geoJSON(geoData as any).getBounds(), {
          padding: [20, 20],
        });
      }
    } else {
      mapRef.current.fitBounds(L.geoJSON(geoData as any).getBounds(), {
        padding: [20, 20],
      });
    }
  }, [geoData, selectedCode, level, onHover, onSelect]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
