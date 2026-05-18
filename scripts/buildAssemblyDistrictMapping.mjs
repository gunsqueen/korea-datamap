/**
 * 국회의원 선거구 → 읍면동 코드 매핑 생성 스크립트
 *
 * 출처:
 * - 19/20대: github.com/southkorea/southkorea-maps (TopoJSON)
 * - 21/22대: github.com/OhmyNews (GeoJSON)
 * - 읍면동 경계: src/data/mock/eupmyeondong/ (WGS84)
 *
 * 출력: src/data/static/assembly_district_emd_mapping.json
 * 키 형식: { "22": { "서울_강서구갑": ["11160670", ...] }, ... }
 * (cidx_assembly.json의 d 필드와 동일한 형식)
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

function normSido(name) { return SIDO_NORM[name] || name; }

/**
 * 비교용 정규화: 시/군/구 제거 후 갑/을/병/정/무 suffix 분리
 * 양쪽 모두 동일하게 적용하여 cidx ↔ GeoJSON 매핑에 사용
 * 예: "군산시김제시부안군갑" ↔ "군산김제부안갑" → 둘 다 "산김제부안갑" 으로 일치
 */
function normForMatch(district) {
  const suffixMatch = district.match(/([갑을병정무])$/);
  const suffix = suffixMatch ? suffixMatch[1] : '';
  const base = suffix ? district.slice(0, -1) : district;
  return base.replace(/[시군구]/g, '') + suffix;
}

// ── 읍면동 centroid 로드 ──────────────────────────────────────────────────
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
        emds.push({ adm_cd: feature.properties.adm_cd, centroid });
      } catch {}
    }
  }
  console.log(`읍면동 ${emds.length}개 로드 완료`);
  return emds;
}

// ── cidx 데이터 로드 ──────────────────────────────────────────────────────
function loadCidxForGen(gen) {
  const cidx = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'src/data/static/cidx_assembly.json'), 'utf8'
  ));
  const label = `${gen}대 총선 지역구`;
  // 고유 (sido, d) 쌍 반환
  const seen = new Set();
  const result = [];
  for (const c of cidx) {
    if (c.e !== label) continue;
    const sido = normSido(c.rn);
    const key = `${sido}_${c.d}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ sido, d: c.d, key });
    }
  }
  return result;
}

// ── GeoJSON 피처 → 읍면동 코드 매핑 ─────────────────────────────────────
function buildGeoLookup(features, getDistrict) {
  /** sido_normDistrict → { geoKey, codes[] } */
  const lookup = {};
  for (const feature of features) {
    if (!feature.geometry) continue;
    const { sido, district } = getDistrict(feature.properties) || {};
    if (!sido || !district) continue;
    const normKey = `${sido}_${normForMatch(district)}`;
    if (!lookup[normKey]) lookup[normKey] = { geoKey: `${sido}_${district}`, codes: [] };
    // emd 코드는 나중에 채움 (geometry가 필요)
    lookup[normKey].feature = feature;
  }
  return lookup;
}

function matchDistrictToEmd(districtFeatures, getDistrict, cidxEntries, emds) {
  const result = {};
  let matched = 0;

  // Step 1: GeoJSON에서 (sido, normDistrict) → feature 맵 빌드
  const geoLookup = {};
  for (const feature of districtFeatures) {
    if (!feature.geometry) continue;
    const info = getDistrict(feature.properties);
    if (!info) continue;
    const normKey = `${info.sido}_${normForMatch(info.district)}`;
    if (!geoLookup[normKey]) geoLookup[normKey] = feature;
  }

  // Step 2: cidx 엔트리마다 매칭 GeoJSON feature 찾기
  for (const { sido, d, key: cidxKey } of cidxEntries) {
    const normKey = `${sido}_${normForMatch(d)}`;
    const feature = geoLookup[normKey];
    if (!feature) continue;

    // 읍면동 centroid가 선거구 폴리곤 안에 있는지 확인
    const codes = [];
    for (const emd of emds) {
      try {
        if (turf.booleanPointInPolygon(emd.centroid, feature)) {
          codes.push(emd.adm_cd);
        }
      } catch {}
    }

    if (codes.length > 0) {
      result[cidxKey] = codes;
      matched++;
    }
  }

  console.log(`  → cidx ${cidxEntries.length}개 중 ${matched}개 매핑 완료`);
  return result;
}

// ── 19대 (TopoJSON) ───────────────────────────────────────────────────────
function process19(emds) {
  console.log('\n[19대] 처리 중...');
  const raw = JSON.parse(fs.readFileSync('/tmp/assembly19.json', 'utf8'));
  const geo = topo.feature(raw, raw.objects['precincts']);
  const cidx = loadCidxForGen('19');
  return matchDistrictToEmd(geo.features, (props) => {
    const sido = normSido(props.province || '');
    const district = props.precinct_name || '';
    return sido && district ? { sido, district } : null;
  }, cidx, emds);
}

// ── 20대 (TopoJSON) ───────────────────────────────────────────────────────
function process20(emds) {
  console.log('\n[20대] 처리 중...');
  const raw = JSON.parse(fs.readFileSync('/tmp/assembly20.json', 'utf8'));
  const objKey = Object.keys(raw.objects)[0];
  const geo = topo.feature(raw, raw.objects[objKey]);
  const cidx = loadCidxForGen('20');
  return matchDistrictToEmd(geo.features, (props) => {
    const sido = normSido(props.province || '');
    const district = props.precinct_name || '';
    return sido && district ? { sido, district } : null;
  }, cidx, emds);
}

// ── 21대 (GeoJSON) ────────────────────────────────────────────────────────
function process21(emds) {
  console.log('\n[21대] 처리 중...');
  const raw = JSON.parse(fs.readFileSync('/tmp/assembly21.json', 'utf8'));
  const cidx = loadCidxForGen('21');
  return matchDistrictToEmd(raw.features, (props) => {
    const sgg3 = props.SGG_3 || props.SGG_2 || '';
    const parts = sgg3.trim().split(' ');
    if (parts.length < 2) return null;
    const sido = normSido(parts[0]) || parts[0];
    const district = parts.slice(1).join('');
    return { sido, district };
  }, cidx, emds);
}

// ── 22대 (GeoJSON) ────────────────────────────────────────────────────────
function process22(emds) {
  console.log('\n[22대] 처리 중...');
  const raw = JSON.parse(fs.readFileSync('/tmp/assembly22.json', 'utf8'));
  const cidx = loadCidxForGen('22');
  return matchDistrictToEmd(raw.features, (props) => {
    const sidoSgg = props.SIDO_SGG || '';
    const parts = sidoSgg.trim().split(' ');
    if (parts.length < 2) return null;
    const sido = normSido(parts[0]) || parts[0];
    const district = parts.slice(1).join('');
    return { sido, district };
  }, cidx, emds);
}

// ── 메인 ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== 국회의원 선거구 → 읍면동 매핑 생성 ===\n');
  console.log('키 형식: cidx 호환 (예: "서울_강서구갑")\n');

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
    // 샘플 출력
    const sample = Object.entries(m).find(([k]) => k.includes('강서'));
    if (sample) console.log(`  샘플: "${sample[0]}" → ${sample[1].slice(0, 3)}...`);
  }

  // 출력
  const outPath = path.join(ROOT, 'src/data/static/assembly_district_emd_mapping.json');
  fs.writeFileSync(outPath, JSON.stringify(mapping));
  console.log(`\n✅ 저장 완료: ${outPath}`);
  console.log(`파일 크기: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
