/**
 * NEC API로 국회의원선거 실제 당선인 데이터를 가져와
 * assembly_XX_district.json 의 national_winner 필드를 교정하는 스크립트.
 *
 * 실행: node scripts/fixAssemblyWinners.mjs [대수]
 *   예: node scripts/fixAssemblyWinners.mjs 22   (22대)
 *       node scripts/fixAssemblyWinners.mjs       (22, 21, 20, 19대 모두)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const STATIC = path.join(ROOT, 'src/data/static');

const NEC_BASE = 'https://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2';
const SERVICE_KEY = 'fcfb6899040b2dc7f9c3bf04402834c6a83364a827417cad9d2052178fce7591';

const GEN_CONFIG = {
  '22': '20240410',
  '21': '20200415',
  '20': '20160413',
  '19': '20120411',
};

async function fetchDistrictResult(sgId, sdName, sggName) {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo: '1',
    numOfRows: '1',
    resultType: 'json',
    sgId,
    sgTypecode: '2',
    sdName,
    sggName,
    wiwName: '합계',
  });
  const url = `${NEC_BASE}/getXmntckSttusInfoInqire?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const code = json?.response?.header?.resultCode;
  if (code !== 'INFO-00') throw new Error(`NEC error ${code}`);

  const rawItems = json?.response?.body?.items?.item;
  const items = !rawItems ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];

  // 합계 행만 필터
  const sumRow = items.find(it => it.wiwName === '합계') ?? items[0];
  if (!sumRow) return null;

  // 후보자별 득표수 집계 → 최고득표자 = 당선인
  const cands = [];
  for (let i = 1; i <= 50; i++) {
    const name = sumRow[`hbj${String(i).padStart(2, '0')}`]?.trim();
    const votes = parseInt(sumRow[`dugsu${String(i).padStart(2, '0')}`] ?? '0', 10);
    if (name) cands.push({ name, votes });
  }
  if (cands.length === 0) return null;

  cands.sort((a, b) => b.votes - a.votes);
  return cands[0].name; // 당선인
}

// assembly_XX_district.json 에서 sido별 districts를 추출
function extractDistrictsBySido(data) {
  const map = new Map(); // "sido|distName" → Set<dongKey>
  for (const [k, v] of Object.entries(data)) {
    const parts = k.split('|');
    const sido = parts[0];
    const dist = v.election_district;
    if (!sido || !dist) continue;
    const key = `${sido}|${dist}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(k);
  }
  return map;
}

async function fixGeneration(gen) {
  const sgId = GEN_CONFIG[gen];
  if (!sgId) { console.error(`Unknown generation: ${gen}`); return; }

  const filePath = path.join(STATIC, `assembly_${gen}_district.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const distMap = extractDistrictsBySido(data);

  console.log(`\n=== ${gen}대 (${sgId}) ===`);
  console.log(`선거구 수: ${distMap.size}, 동 수: ${Object.keys(data).length}`);

  let updated = 0;
  let errors = 0;
  let correct = 0;
  let processed = 0;

  for (const [sidoDist, dongKeys] of distMap) {
    const [sdName, sggName] = sidoDist.split('|');

    let actualWinner;
    try {
      actualWinner = await fetchDistrictResult(sgId, sdName, sggName);
      await new Promise(r => setTimeout(r, 100)); // rate limit
    } catch (err) {
      console.error(`  ❌ ${sidoDist}: ${err.message}`);
      errors++;
      continue;
    }

    if (!actualWinner) {
      console.warn(`  ⚠️  ${sidoDist}: 당선인 데이터 없음`);
      continue;
    }

    // 현재 national_winner 확인
    const currentWinners = new Set();
    for (const dk of dongKeys) {
      const nw = data[dk]?.national_winner;
      if (nw) currentWinners.add(nw);
    }

    const needsUpdate = !currentWinners.has(actualWinner) || currentWinners.size > 1;

    if (needsUpdate) {
      for (const dk of dongKeys) {
        if (data[dk]) data[dk].national_winner = actualWinner;
      }
      console.log(`  ✏️  ${sggName}: ${[...currentWinners].join(',')} → ${actualWinner} (${dongKeys.size}개 동)`);
      updated++;
    } else {
      correct++;
    }

    processed++;
    if (processed % 50 === 0) {
      process.stdout.write(`  진행: ${processed}/${distMap.size}\n`);
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data));

  const size = (fs.statSync(filePath).size / 1024).toFixed(1);
  console.log(`\n  교정된 선거구: ${updated}개`);
  console.log(`  이미 정확: ${correct}개`);
  console.log(`  API 오류: ${errors}개`);
  console.log(`  저장: ${filePath} (${size} KB)`);
}

async function main() {
  const args = process.argv.slice(2);
  const gens = args.length > 0 ? args : ['22', '21', '20', '19'];

  for (const gen of gens) {
    await fixGeneration(gen);
  }

  console.log('\n✅ 완료');
}

main().catch(err => {
  console.error('오류:', err);
  process.exit(1);
});
