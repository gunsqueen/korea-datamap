/**
 * WinnerInfoInqireService2 API를 사용하여 실제 당선인 데이터로
 * local_council_results.json 의 elected 필드를 교정하는 스크립트.
 *
 * 실행: node scripts/fixElectedStatus.mjs
 *
 * 작동 원리:
 * 1. NEC WinnerInfoInqireService2 에서 기초의원(6) + 광역의원(5) 당선인 목록을 수집
 * 2. 당선인 이름 기준으로 local_council_results.json 의 candidates.elected 를 수정
 * 3. 득표 갭 휴리스틱 오류를 실제 데이터로 대체
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const NEC_BASE = 'https://apis.data.go.kr/9760000/WinnerInfoInqireService2';
const SERVICE_KEY = 'fcfb6899040b2dc7f9c3bf04402834c6a83364a827417cad9d2052178fce7591';

const GEN_CONFIG = [
  { gen: '8', sgId: '20220601' },
  { gen: '7', sgId: '20180613' },
  { gen: '6', sgId: '20140604' },
];

const SIDO_CODE_TO_NEC_NAME = {
  '11': '서울특별시', '21': '부산광역시', '22': '대구광역시', '23': '인천광역시',
  '24': '광주광역시', '25': '대전광역시', '26': '울산광역시', '29': '세종특별자치시',
  '31': '경기도', '32': '강원특별자치도', '33': '충청북도', '34': '충청남도',
  '35': '전북특별자치도', '36': '전라남도', '37': '경상북도', '38': '경상남도',
  '39': '제주특별자치도',
};

const SIDO_CODE_TO_SHORT = {
  '11': '서울', '21': '부산', '22': '대구', '23': '인천',
  '24': '광주', '25': '대전', '26': '울산', '29': '세종',
  '31': '경기', '32': '강원', '33': '충북', '34': '충남',
  '35': '전북', '36': '전남', '37': '경북', '38': '경남',
  '39': '제주',
};

async function fetchWinners(sgId, sgTypecode, sdName) {
  const PAGE_SIZE = 100;
  let allItems = [];
  let pageNo = 1;

  while (true) {
    const params = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      pageNo: String(pageNo),
      numOfRows: String(PAGE_SIZE),
      resultType: 'json',
      sgId,
      sgTypecode,
      sdName,
    });
    const url = `${NEC_BASE}/getWinnerInfoInqire?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${sdName}`);
    const json = await res.json();
    const code = json?.response?.header?.resultCode;
    if (code !== 'INFO-00') throw new Error(`NEC error ${code} for ${sdName}`);

    const rawItems = json?.response?.body?.items?.item;
    const items = !rawItems ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];
    allItems = allItems.concat(items);

    const totalCount = Number(json?.response?.body?.totalCount ?? 0);
    if (allItems.length >= totalCount || items.length < PAGE_SIZE) break;
    pageNo++;
  }
  return allItems;
}

async function main() {
  console.log('=== 당선인 정보 API로 elected 필드 교정 ===\n');

  const outPath = path.join(ROOT, 'src/data/static/local_council_results.json');
  const results = JSON.parse(fs.readFileSync(outPath, 'utf8'));

  // key → Set of elected candidate names
  const winnerMap = new Map(); // "8_서울_council_종로구제1선거구" → Set<string>

  const SUBTYPE_CONFIG = [
    { key: 'council', sgTypecode: '5' },
    { key: 'basic',   sgTypecode: '6' },
  ];

  for (const sub of SUBTYPE_CONFIG) {
    for (const { gen, sgId } of GEN_CONFIG) {
      console.log(`\n── ${gen}회 ${sub.key} 당선인 수집 중 ──`);

      for (const [sidoCd, sdName] of Object.entries(SIDO_CODE_TO_NEC_NAME)) {
        const sidoShort = SIDO_CODE_TO_SHORT[sidoCd];
        let items;
        try {
          items = await fetchWinners(sgId, sub.sgTypecode, sdName);
        } catch (err) {
          console.error(`  ❌ [${sdName}] ${err.message}`);
          continue;
        }

        if (items.length === 0) continue;

        // sggName → Set<name>
        for (const it of items) {
          const sggName = (it.sggName ?? '').trim();
          const name = (it.name ?? '').trim();
          if (!sggName || !name) continue;

          const key = `${gen}_${sidoShort}_${sub.key}_${sggName}`;
          if (!winnerMap.has(key)) winnerMap.set(key, new Set());
          winnerMap.get(key).add(name);
        }

        process.stdout.write(`  [${sdName}] ${items.length}명 당선인\n`);
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }

  console.log(`\n총 ${winnerMap.size}개 선거구 당선인 데이터 수집 완료\n`);

  // results 를 순회하며 elected 필드 갱신
  let updatedDistricts = 0;
  let updatedCandidates = 0;
  let noWinnerData = 0;

  for (const [key, distResult] of Object.entries(results)) {
    const winners = winnerMap.get(key);
    if (!winners) {
      noWinnerData++;
      continue;
    }

    let changed = false;
    for (const c of distResult.candidates) {
      const shouldBeElected = winners.has(c.name);
      if (c.elected !== shouldBeElected) {
        c.elected = shouldBeElected;
        updatedCandidates++;
        changed = true;
      }
    }
    if (changed) updatedDistricts++;
  }

  // 저장
  fs.writeFileSync(outPath, JSON.stringify(results));

  const size = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`✅ 저장 완료: ${outPath}`);
  console.log(`  교정된 선거구: ${updatedDistricts}개`);
  console.log(`  교정된 후보자: ${updatedCandidates}명`);
  console.log(`  당선인 데이터 없음: ${noWinnerData}개 선거구`);
  console.log(`  파일 크기: ${size} KB`);
}

main().catch(err => {
  console.error('오류:', err);
  process.exit(1);
});
