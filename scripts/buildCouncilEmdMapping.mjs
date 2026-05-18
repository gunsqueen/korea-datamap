/**
 * 광역의원/기초의원 세부선거구 → 읍면동 코드 매핑 생성
 *
 * 입력:
 *   src/data/static/local_elections_dong.json
 *     — "시도|시군구|읍면동" → { election_district: "...", ... }
 *   src/data/mock/eupmyeondong/*.json
 *     — 읍면동 경계 (adm_nm: "시도 시군구 읍면동", adm_cd)
 *
 * 출력: src/data/static/local_council_emd_mapping.json
 *   {
 *     "8": {
 *       "council": { "서울_강서구제5선거구": ["11160..."], ... },
 *       "basic":   { "서울_강서구나선거구": ["11160610","11160760"], ... }
 *     },
 *     "7": { ... },
 *     "6": { ... },
 *   }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const SIDO_SHORT = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구',
  '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전',
  '울산광역시': '울산', '세종특별자치시': '세종',
  '경기도': '경기', '강원도': '강원', '강원특별자치도': '강원',
  '충청북도': '충북', '충청남도': '충남',
  '전라북도': '전북', '전북특별자치도': '전북', '전라남도': '전남',
  '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주',
};

/** "화곡제3동" ↔ "화곡3동" 등 정규화 */
function normDong(s) {
  return s
    .replace(/\s+/g, '')
    .replace(/제(\d+)/g, '$1')   // 화곡제3동 → 화곡3동
    .replace(/[·∙・]/g, '')       // 면목3·8동 → 면목38동
    .trim();
}

// ── 모든 읍면동 로드: 정규화된 "시도|시군구|읍면동" → adm_cd ───
function loadAllEmd() {
  const emdDir = path.join(ROOT, 'src/data/mock/eupmyeondong');
  const files = fs.readdirSync(emdDir).filter(f => f.endsWith('.json'));
  const byKey = {};
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(emdDir, file), 'utf8'));
    for (const ft of data.features) {
      const nm = ft.properties.adm_nm; // "서울특별시 강서구 화곡3동"
      const parts = nm.split(/\s+/);
      if (parts.length < 3) continue;
      const sido = parts[0];
      const sigungu = parts.slice(1, -1).join('');
      const dong = parts[parts.length - 1];
      const key = `${sido}|${sigungu}|${normDong(dong)}`;
      byKey[key] = ft.properties.adm_cd;
    }
  }
  return byKey;
}

function processGen(dongData, emdMap, gen) {
  const result = { council: {}, basic: {} };

  const configs = [
    { srcKey: `local_${gen}_council_district`, subKey: 'council' },
    { srcKey: `local_${gen}_basic_district`,   subKey: 'basic' },
  ];

  let missingDongs = 0;
  let matchedDongs = 0;

  for (const { srcKey, subKey } of configs) {
    const src = dongData[srcKey];
    if (!src) {
      console.log(`  ${srcKey}: 없음`);
      continue;
    }

    for (const [dongKey, info] of Object.entries(src)) {
      const [sido, sigungu, dong] = dongKey.split('|');
      const district = info.election_district;
      if (!district || !sido || !sigungu || !dong) continue;
      const sidoShort = SIDO_SHORT[sido];
      if (!sidoShort) continue;

      const normKey = `${sido}|${sigungu}|${normDong(dong)}`;
      const admCd = emdMap[normKey];
      if (!admCd) {
        missingDongs++;
        continue;
      }
      matchedDongs++;

      const outKey = `${sidoShort}_${district}`;
      if (!result[subKey][outKey]) result[subKey][outKey] = [];
      if (!result[subKey][outKey].includes(admCd)) {
        result[subKey][outKey].push(admCd);
      }
    }
    console.log(`  ${srcKey}: ${Object.keys(result[subKey]).length}개 선거구`);
  }

  console.log(`  ${gen}회: 동 매칭 ${matchedDongs}개, 미매칭 ${missingDongs}개`);
  return result;
}

function main() {
  console.log('=== 광역/기초의원 세부선거구 → 읍면동 매핑 생성 ===\n');

  const dongData = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'src/data/static/local_elections_dong.json'), 'utf8'
  ));
  console.log('local_elections_dong.json 로드:', Object.keys(dongData).length, '키');

  const emdMap = loadAllEmd();
  console.log('읍면동 경계 로드:', Object.keys(emdMap).length, '개\n');

  const mapping = {};
  for (const gen of ['8', '7', '6']) {
    console.log(`══ ${gen}회 ══`);
    mapping[gen] = processGen(dongData, emdMap, gen);
  }

  const outPath = path.join(ROOT, 'src/data/static/local_council_emd_mapping.json');
  fs.writeFileSync(outPath, JSON.stringify(mapping));
  const size = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`\n✅ 저장 완료: ${outPath} (${size} KB)`);

  // 샘플 검증
  const sample = mapping['8']?.basic?.['서울_강서구나선거구'];
  if (sample) console.log(`샘플 서울_강서구나선거구 → ${sample}`);
}

main();
