/**
 * 국회의원 선거구 → 읍면동 코드 매핑 생성 스크립트
 *
 * 출처:
 * - 19/20대: github.com/southkorea/southkorea-maps (TopoJSON)
 * - 21/22대: github.com/OhmyNews (GeoJSON)
 * - 읍면동 경계: src/data/mock/eupmyeondong/ (WGS84)
 *
 * 출력: src/data/static/assembly_district_emd_mapping.json
 * 형식: { "22": { "서울_강서갑": ["11160670", ...] }, ... }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as turf from '@turf/turf';
import topo from 'topojson-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── 시도명 정규화 ──────────────────────────────────────────────────────────
const SIDO_NORM = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구',
  '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전',
  '울산광역시': '울산', '세종특별자치시': '세종', '세종특별자치도': '세종',
  '경기도': '경기', '강원도': '강원', '강원특별자치도': '강원',
  '충청북도': '충북', '충청남도': '충남',
  '전라북도': '전북', '전북특별자치도': '전북', '전라남도': '전남',
  '경상북도': '경북', '경상남도': '경남',
  '제주특별자치도': '제주',
};

function normSido(name) {
  return SIDO_NORM[name] || name;
}

// ── 읍면동 목록 로드 (centroid 포함) ──────────────────────────────────────
function loadAllEmd() {
  const emdDir = path.join(ROOT, 'src/data/mock/eupmyeondong');
  const files = fs.readdirSync(emdDir).filter(f => f.endsWith('.json'));
  const emds = [];
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(emdDir, file), 'utf8'));
    for (const feature of data.features) {
      if (!feature.geometry) continue;
      try {
        const centroid = turf.centroid(feature);
        emds.push({
          adm_cd: feature.properties.adm_cd,
          centroid,
        });
      } catch {}
    }
  }
  console.log(`읍면동 ${emds.length}개 로드 완료`);
  return emds;
}

// ── 선거구 폴리곤과 읍면동 centroid 매핑 ─────────────────────────────────
function matchDistrictToEmd(districtFeatures, emds, getKey) {
  const mapping = {};
  let matched = 0;

  for (const feature of districtFeatures) {
    if (!feature.geometry) continue;
    const key = getKey(feature.properties);
    if (!key) continue;

    // MultiPolygon → Polygon 분리 처리
    const geom = feature.geometry;
    const insideEmds = [];

    for (const emd of emds) {
      try {
        if (turf.booleanPointInPolygon(emd.centroid, feature)) {
          insideEmds.push(emd.adm_cd);
        }
      } catch {}
    }

    if (insideEmds.length > 0) {
      mapping[key] = insideEmds;
      matched++;
    }
  }

  console.log(`  → ${districtFeatures.length}개 선거구 중 ${matched}개 매핑 완료`);
  return mapping;
}

// ── 19대 (TopoJSON) ───────────────────────────────────────────────────────
function process19(emds) {
  console.log('\n[19대] 처리 중...');
  const raw = JSON.parse(fs.readFileSync('/tmp/assembly19.json', 'utf8'));
  const geo = topo.feature(raw, raw.objects['precincts']);
  return matchDistrictToEmd(geo.features, emds, (props) => {
    const sido = normSido(props.province);
    const name = props.precinct_name;
    return sido && name ? `${sido}_${name}` : null;
  });
}

// ── 20대 (TopoJSON) ───────────────────────────────────────────────────────
function process20(emds) {
  console.log('\n[20대] 처리 중...');
  const raw = JSON.parse(fs.readFileSync('/tmp/assembly20.json', 'utf8'));
  const objKey = Object.keys(raw.objects)[0];
  const geo = topo.feature(raw, raw.objects[objKey]);
  return matchDistrictToEmd(geo.features, emds, (props) => {
    const sido = normSido(props.province);
    const name = props.precinct_name;
    return sido && name ? `${sido}_${name}` : null;
  });
}

// ── 21대 (GeoJSON) ────────────────────────────────────────────────────────
function process21(emds) {
  console.log('\n[21대] 처리 중...');
  const raw = JSON.parse(fs.readFileSync('/tmp/assembly21.json', 'utf8'));
  return matchDistrictToEmd(raw.features, emds, (props) => {
    // SGG_3: "서울 강서갑" 또는 "서울 강서갑" 형태
    const sgg3 = props.SGG_3 || props.SGG_2 || '';
    const parts = sgg3.trim().split(' ');
    if (parts.length < 2) return null;
    const sido = parts[0];
    const name = parts.slice(1).join('');  // "강서갑"
    return `${sido}_${name}`;
  });
}

// ── 22대 (GeoJSON) ────────────────────────────────────────────────────────
function process22(emds) {
  console.log('\n[22대] 처리 중...');
  const raw = JSON.parse(fs.readFileSync('/tmp/assembly22.json', 'utf8'));
  return matchDistrictToEmd(raw.features, emds, (props) => {
    // SIDO_SGG: "서울 강서갑"
    const sidoSgg = props.SIDO_SGG || '';
    const parts = sidoSgg.trim().split(' ');
    if (parts.length < 2) return null;
    const sido = parts[0];
    const name = parts.slice(1).join('');
    return `${sido}_${name}`;
  });
}

// ── 메인 ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== 국회의원 선거구 → 읍면동 매핑 생성 ===\n');

  const emds = loadAllEmd();

  const mapping = {
    '19': process19(emds),
    '20': process20(emds),
    '21': process21(emds),
    '22': process22(emds),
  };

  // 통계 출력
  for (const [gen, m] of Object.entries(mapping)) {
    const total = Object.keys(m).length;
    const totalEmd = Object.values(m).reduce((s, v) => s + v.length, 0);
    console.log(`\n${gen}대: ${total}개 선거구, ${totalEmd}개 읍면동 매핑`);
  }

  // 출력
  const outPath = path.join(ROOT, 'src/data/static/assembly_district_emd_mapping.json');
  fs.writeFileSync(outPath, JSON.stringify(mapping));
  console.log(`\n✅ 저장 완료: ${outPath}`);
  console.log(`파일 크기: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);

  // 샘플 확인
  const sample22 = Object.entries(mapping['22']).find(([k]) => k.includes('강서'));
  if (sample22) console.log(`\n샘플 (22대): "${sample22[0]}" → ${sample22[1].slice(0, 3)}...`);
}

main().catch(console.error);
