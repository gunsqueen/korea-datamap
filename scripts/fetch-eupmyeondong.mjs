/**
 * SGIS API에서 읍면동 경계 데이터를 받아
 * src/data/mock/eupmyeondong/{sigungu_cd}.json 으로 저장
 *
 * 실행: node scripts/fetch-eupmyeondong.mjs
 *
 * 기본: 서울 25개 구
 * --all 옵션: 전국 (매우 오래 걸림)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import proj4 from 'proj4';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALL_MODE = process.argv.includes('--all');

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

// proj4 정의
proj4.defs('EPSG:5179', '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

function convertRing(ring) {
  return ring.map(([x, y]) => proj4('EPSG:5179', 'EPSG:4326', [x, y]));
}
function convertGeometry(geometry) {
  if (geometry.type === 'Polygon')
    return { ...geometry, coordinates: geometry.coordinates.map(convertRing) };
  if (geometry.type === 'MultiPolygon')
    return { ...geometry, coordinates: geometry.coordinates.map(p => p.map(convertRing)) };
  return geometry;
}

let tokenCache = null;
let tokenTime = 0;

async function getToken() {
  if (tokenCache && Date.now() - tokenTime < 30 * 60 * 1000) return tokenCache;
  const res = await fetch(`https://sgisapi.mods.go.kr/OpenAPI3/auth/authentication.json?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`);
  const data = await res.json();
  if (data.errCd !== 0) throw new Error(`토큰 실패: ${data.errMsg}`);
  tokenCache = data.result.accessToken;
  tokenTime = Date.now();
  return tokenCache;
}

async function fetchEmd(sigunguCd) {
  const token = await getToken();
  const url = `https://sgisapi.mods.go.kr/OpenAPI3/boundary/hadmarea.geojson?accessToken=${token}&year=2024&adm_cd=${sigunguCd}&low_search=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.errCd !== 0) throw new Error(`API 오류: ${data.errMsg}`);
  return {
    type: 'FeatureCollection',
    features: data.features.map(f => ({
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

function getSigunguCodes(sidoCd) {
  const sigunguPath = path.resolve(__dirname, `../src/data/mock/sigungu/${sidoCd}.json`);
  const data = JSON.parse(readFileSync(sigunguPath, 'utf-8'));
  return data.features.map(f => f.properties.adm_cd);
}

// 전국 시도 코드
const ALL_SIDO = ['11','21','22','23','24','25','26','29','31','32','33','34','35','36','37','38','39'];
// 기본: 서울(11) + 광역시들만
const DEFAULT_SIDO = ['11','21','22','23','24','25','26'];

async function main() {
  const targetSido = ALL_MODE ? ALL_SIDO : DEFAULT_SIDO;
  const outDir = path.resolve(__dirname, '../src/data/mock/eupmyeondong');
  mkdirSync(outDir, { recursive: true });

  let total = 0, success = 0, fail = 0;

  for (const sidoCd of targetSido) {
    const codes = getSigunguCodes(sidoCd);
    total += codes.length;
    console.log(`\n📍 시도 ${sidoCd} (${codes.length}개 시군구)`);

    for (const code of codes) {
      const outPath = path.join(outDir, `${code}.json`);
      process.stdout.write(`  ${code}... `);
      try {
        const data = await fetchEmd(code);
        writeFileSync(outPath, JSON.stringify(data), 'utf-8');
        const kb = (JSON.stringify(data).length / 1024).toFixed(0);
        console.log(`✅ ${data.features.length}개 동 (${kb}KB)`);
        success++;
      } catch (err) {
        console.log(`❌ ${err.message}`);
        fail++;
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`\n✅ 완료: ${success}/${total} 성공, ${fail} 실패`);
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
