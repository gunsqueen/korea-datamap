/**
 * SGIS API에서 시도 경계 데이터를 받아 WGS84 GeoJSON으로 변환 후
 * src/data/mock/sido.json 에 저장하는 스크립트
 *
 * 실행: node scripts/fetch-sido-mock.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import proj4 from 'proj4';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env 파싱
const envPath = path.resolve(__dirname, '../.env');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const CONSUMER_KEY = env.VITE_SGIS_CONSUMER_KEY;
const CONSUMER_SECRET = env.VITE_SGIS_CONSUMER_SECRET;

if (!CONSUMER_KEY || !CONSUMER_SECRET) {
  console.error('SGIS API 키를 .env에서 찾을 수 없습니다.');
  process.exit(1);
}

// proj4 좌표 정의
const UTMK = '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';
proj4.defs('EPSG:5179', UTMK);
proj4.defs('EPSG:4326', WGS84);

function utmkToWgs84(x, y) {
  return proj4('EPSG:5179', 'EPSG:4326', [x, y]);
}

function convertRing(ring) {
  return ring.map(([x, y]) => utmkToWgs84(x, y));
}

function convertGeometry(geometry) {
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(convertRing) };
  } else if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((poly) => poly.map(convertRing)),
    };
  }
  return geometry;
}

async function fetchToken() {
  const url = `https://sgisapi.mods.go.kr/OpenAPI3/auth/authentication.json?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.errCd !== 0) throw new Error(`토큰 발급 실패: ${JSON.stringify(data)}`);
  console.log('✅ 토큰 발급 완료');
  return data.result.accessToken;
}

async function fetchSidoBoundary(token) {
  const url = `https://sgisapi.mods.go.kr/OpenAPI3/boundary/hadmarea.geojson?accessToken=${token}&year=2024&adm_cd=0`;
  console.log('🌏 시도 경계 데이터 요청 중...');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  console.log(`✅ 피처 수: ${data.features?.length ?? 0}`);
  return data;
}

async function main() {
  const token = await fetchToken();
  const rawGeoJson = await fetchSidoBoundary(token);

  // UTM-K → WGS84 변환
  const converted = {
    type: 'FeatureCollection',
    features: rawGeoJson.features.map((f) => ({
      type: 'Feature',
      geometry: convertGeometry(f.geometry),
      properties: {
        adm_cd: f.properties.adm_cd,
        adm_nm: f.properties.adm_nm,
        addr_en: f.properties.addr_en ?? '',
      },
    })),
  };

  const outPath = path.resolve(__dirname, '../src/data/mock/sido.json');
  writeFileSync(outPath, JSON.stringify(converted, null, 2), 'utf-8');
  console.log(`✅ 저장 완료: ${outPath}`);
  console.log(`   시도 수: ${converted.features.length}`);
  converted.features.forEach((f) =>
    console.log(`   - ${f.properties.adm_nm} (${f.properties.adm_cd})`)
  );
}

main().catch((e) => {
  console.error('❌ 오류:', e.message);
  process.exit(1);
});
