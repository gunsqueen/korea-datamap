/**
 * 5회 지방선거(2010-06-02) 정적 스냅샷 생성 스크립트
 *
 * NEC 공개 API는 5회에서 시군구 단위 데이터만 제공합니다.
 * 6회 정적 파일의 동 목록을 참조해 각 동에 시군구 집계값을 분배하여
 * src/data/static/local_5_*.json 파일을 생성합니다.
 *
 * 실행: node scripts/generate-local5-static.mjs
 */

import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.resolve(__dirname, '../src/data/static');

const SERVICE_KEY = 'fcfb6899040b2dc7f9c3bf04402834c6a83364a827417cad9d2052178fce7591';
const NEC_BASE = 'https://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2/getXmntckSttusInfoInqire';
const SG_ID = '20100602';

const SIDO_NAMES = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시',
  '대전광역시', '울산광역시', '경기도', '강원도', '충청북도',
  '충청남도', '전라북도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
];

// 2010년 시도명 → 현재 시도명 매핑 (강원도, 전라북도 등)
const SIDO_NAME_2010_TO_CURRENT = {
  '강원도': '강원특별자치도',
  '전라북도': '전북특별자치도',
};

// 선거 유형별 NEC sgTypecode
const ELECTION_TYPES = [
  { id: 'metro_mayor',      sgTypecode: '3' },
  { id: 'mayor',            sgTypecode: '4' },
  { id: 'council_district', sgTypecode: '5' },
  { id: 'council_pr',       sgTypecode: '8' },
  { id: 'basic_district',   sgTypecode: '6' },
  { id: 'basic_pr',         sgTypecode: '9' },
];

async function fetchNecSigunguData(sgTypecode, sdName) {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo: '1',
    numOfRows: '1000',
    resultType: 'json',
    sgId: SG_ID,
    sgTypecode,
    sdName,
  });
  const url = `${NEC_BASE}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${sdName}`);
  const json = await res.json();
  const code = json?.response?.header?.resultCode;
  if (code !== 'INFO-00') throw new Error(`NEC error ${code} for ${sdName}`);
  const items = json?.response?.body?.items?.item;
  return !items ? [] : Array.isArray(items) ? items : [items];
}

function parseItem(item) {
  const candidates = [];
  for (let i = 1; i <= 20; i++) {
    const key = String(i).padStart(2, '0');
    const party = (item[`jd${key}`] ?? '').trim();
    const name = (item[`hbj${key}`] ?? '').trim();
    const votes = Number(item[`dugsu${key}`] ?? 0);
    if (!party && !name) break;
    candidates.push({ name: name || party, party, votes });
  }
  return {
    election_district: (item.sggName ?? item.sdName ?? '').trim(),
    total_voters: Number(item.sunsu ?? 0),
    total_votes: Number(item.tusu ?? 0),
    valid_votes: Number(item.yutusu ?? 0),
    invalid_votes: Number(item.mutusu ?? 0),
    candidates,
  };
}

// 6회 정적 파일에서 동 목록 로드 (dong key → 시군구명)
function loadDongList(electionTypeId) {
  // metro_mayor와 mayor는 시군구→동 매핑이 같음 (투표 단위가 동)
  const refFile = `local_6_metro_mayor.json`;
  const filePath = path.join(STATIC_DIR, refFile);
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return Object.keys(data); // ["서울특별시|종로구|청운효자동", ...]
  } catch (e) {
    console.warn(`6회 참조 파일 로드 실패: ${refFile}`, e.message);
    return [];
  }
}

// 시군구명 → NEC wiwName 매칭
function normalizeWiw(s) {
  return (s ?? '').replace(/\s+/g, '').trim();
}

async function generateElectionType(typeInfo, dongKeys) {
  const { id: electionTypeId, sgTypecode } = typeInfo;
  console.log(`\n[${electionTypeId}] 생성 시작...`);

  // 시도별로 시군구 데이터 수집
  const sigunguMap = {}; // "시도명|시군구명" → necItem

  for (const sdName of SIDO_NAMES) {
    try {
      const items = await fetchNecSigunguData(sgTypecode, sdName);
      // wiwName이 '합계'가 아닌 항목만 (시군구 단위 항목)
      const sigunguItems = items.filter(it => it.wiwName && it.wiwName !== '합계');
      for (const item of sigunguItems) {
        const wiwNorm = normalizeWiw(item.wiwName);
        sigunguMap[`${sdName}|${wiwNorm}`] = item;
      }
      // 시군구명이 없고 시도 합계만 있는 경우 (세종 등)
      if (sigunguItems.length === 0) {
        const sidoItem = items.find(it => it.wiwName === '합계');
        if (sidoItem) sigunguMap[`${sdName}|합계`] = sidoItem;
      }
      console.log(`  ${sdName}: ${sigunguItems.length}개 시군구`);
      await sleep(120);
    } catch (e) {
      console.warn(`  ${sdName} 실패: ${e.message}`);
    }
  }

  // 동 → 시군구 매핑으로 static 파일 생성
  const result = {};
  let matched = 0, skipped = 0;

  for (const dongKey of dongKeys) {
    const parts = dongKey.split('|');
    if (parts.length !== 3) continue;
    const [sidoName2024, sigunguName, dongName] = parts;

    // 2024년 시도명 → 2010년 시도명 역매핑
    const sdName2010 = Object.entries(SIDO_NAME_2010_TO_CURRENT)
      .find(([, v]) => v === sidoName2024)?.[0] ?? sidoName2024;

    // 시군구 찾기 (정규화 후 매칭)
    const sigunguNorm = normalizeWiw(sigunguName);
    const necItem = sigunguMap[`${sdName2010}|${sigunguNorm}`]
      ?? sigunguMap[`${sidoName2024}|${sigunguNorm}`];

    if (!necItem) {
      skipped++;
      continue;
    }

    const parsed = parseItem(necItem);
    result[dongKey] = {
      ...parsed,
      election_district: sigunguName,
    };
    matched++;
  }

  console.log(`  매핑: ${matched}개 동 / ${skipped}개 스킵`);

  const outPath = path.join(STATIC_DIR, `local_5_${electionTypeId}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 0), 'utf-8');
  console.log(`  저장 완료: local_5_${electionTypeId}.json (${Object.keys(result).length}개 동)`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('5회 지방선거 정적 스냅샷 생성 시작\n');

  // 6회 동 목록 로드
  const dongKeys = loadDongList();
  if (dongKeys.length === 0) {
    console.error('6회 참조 파일(local_6_metro_mayor.json)이 없습니다. 종료.');
    process.exit(1);
  }
  console.log(`동 목록: ${dongKeys.length}개`);

  for (const typeInfo of ELECTION_TYPES) {
    await generateElectionType(typeInfo, dongKeys);
    await sleep(300);
  }

  console.log('\n완료!');
}

main().catch(e => { console.error(e); process.exit(1); });
