/**
 * SGIS API에서 모든 시도의 시군구 경계 데이터를 받아
 * src/data/mock/sigungu/ 폴더에 저장하는 스크립트
 *
 * 실행: node scripts/fetch-all-boundaries.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
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

// proj4 좌표 정의
const UTMK = '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';
proj4.defs('EPSG:5179', UTMK);
proj4.defs('EPSG:4326', WGS84);

function convertRing(ring) {
  return ring.map(([x, y]) => proj4('EPSG:5179', 'EPSG:4326', [x, y]));
}

function convertGeometry(geometry) {
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(convertRing) };
  } else if (geometry.type === 'MultiPolygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(poly => poly.map(convertRing)) };
  }
  return geometry;
}

async function fetchToken() {
  const url = `https://sgisapi.mods.go.kr/OpenAPI3/auth/authentication.json?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.errCd !== 0) throw new Error(`토큰 발급 실패: ${JSON.stringify(data)}`);
  return data.result.accessToken;
}

async function fetchBoundary(token, admCd) {
  const url = `https://sgisapi.mods.go.kr/OpenAPI3/boundary/hadmarea.geojson?accessToken=${token}&year=2024&adm_cd=${admCd}&low_search=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.errCd !== 0) throw new Error(`API 오류: ${data.errMsg}`);
  return data;
}

function convertGeoJson(raw) {
  return {
    type: 'FeatureCollection',
    features: raw.features.map(f => ({
      type: 'Feature',
      geometry: convertGeometry(f.geometry),
      properties: {
        adm_cd: f.properties.adm_cd,
        adm_nm: f.properties.adm_nm,
        addr_en: f.properties.addr_en ?? '',
      },
    })),
  };
}

// 시도 코드 목록
const SIDO_CODES = ['11','21','22','23','24','25','26','29','31','32','33','34','35','36','37','38','39'];

async function main() {
  const outDir = path.resolve(__dirname, '../src/data/mock/sigungu');
  mkdirSync(outDir, { recursive: true });

  console.log('🔑 토큰 발급 중...');
  let token = await fetchToken();
  let tokenTime = Date.now();

  for (const sidoCd of SIDO_CODES) {
    // 토큰 30분마다 갱신
    if (Date.now() - tokenTime > 30 * 60 * 1000) {
      console.log('🔑 토큰 갱신 중...');
      token = await fetchToken();
      tokenTime = Date.now();
    }

    try {
      process.stdout.write(`📥 시도 ${sidoCd} 시군구 데이터 요청 중... `);
      const raw = await fetchBoundary(token, sidoCd);
      const converted = convertGeoJson(raw);
      const outPath = path.join(outDir, `${sidoCd}.json`);
      writeFileSync(outPath, JSON.stringify(converted), 'utf-8');
      console.log(`✅ ${converted.features.length}개 (${(JSON.stringify(converted).length / 1024).toFixed(0)}KB)`);
    } catch (err) {
      console.log(`❌ 실패: ${err.message}`);
    }

    // API 부하 방지
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n✅ 완료!');
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
