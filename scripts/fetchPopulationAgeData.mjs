/**
 * 행정안전부 주민등록 연령별 인구 현황 데이터를 다운로드하여
 * src/data/real/age-distribution.json 으로 저장하는 스크립트
 *
 * 실행: npm run fetch:age-data [YYYYMM]
 * 예시: npm run fetch:age-data 202602
 *
 * 데이터 소스:
 * - 행정안전부 주민등록인구통계 (jumin.mois.go.kr)
 * - URL: https://jumin.mois.go.kr/downloadCsvAge.do
 * - xlsStats=3 → 전체 읍면동 현황 (약 3,500개 행정동)
 *
 * CSV 컬럼 구조 (총 40열):
 *   [0] 행정구역 (이름(10자리 MOIS 코드))
 *   [1~13] 계_총인구수, 계_연령구간인구수, 계_0~9세, 계_10~19세, ..., 계_100세이상
 *   [14~26] 남_총인구수, 남_연령구간인구수, 남_0~9세, ..., 남_100세이상
 *   [27~39] 여_총인구수, 여_연령구간인구수, 여_0~9세, ..., 여_100세이상
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.resolve(ROOT, 'src/data/real/age-distribution.json');
const MOIS_CODE_MAP_PATH = path.resolve(ROOT, 'src/data/mois_code_map.json');

// SGIS 8자리 → MOIS 10자리
const sgisToMois = JSON.parse(readFileSync(MOIS_CODE_MAP_PATH, 'utf-8'));
// MOIS 10자리 → SGIS 8자리 (역방향 매핑)
const moisToSgis = Object.fromEntries(
  Object.entries(sgisToMois).map(([sgis, mois]) => [mois, sgis])
);

// ─── 연월 생성 ─────────────────────────────────────────────────
function getDefaultYearMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 2); // 보통 2개월 후행 발표
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}${mm}`;
}

// ─── 10년 단위 그룹 정의 ─────────────────────────────────────
// CSV 컬럼 인덱스 (0-based):
// [3]  계_0~9세    [4]  계_10~19세  [5]  계_20~29세  [6]  계_30~39세
// [7]  계_40~49세  [8]  계_50~59세  [9]  계_60~69세  [10] 계_70~79세
// [11] 계_80~89세  [12] 계_90~99세  [13] 계_100세이상
// 남: offset +13, 여: offset +26
const AGE_RANGE_COLS = [
  { range: '0-9',   totalIdx: 3 },
  { range: '10-19', totalIdx: 4 },
  { range: '20-29', totalIdx: 5 },
  { range: '30-39', totalIdx: 6 },
  { range: '40-49', totalIdx: 7 },
  { range: '50-59', totalIdx: 8 },
  { range: '60-69', totalIdx: 9 },
  { range: '70-79', totalIdx: 10 },
  // 80+: 80~89 + 90~99 + 100세이상 합산
  { range: '80+',   totalIdx: null, multiIdx: [11, 12, 13] },
];
const MALE_OFFSET = 13;   // 남 컬럼 = 계 컬럼 + 13
const FEMALE_OFFSET = 26; // 여 컬럼 = 계 컬럼 + 26

// ─── CSV 파싱 ────────────────────────────────────────────────
function parseRow(line) {
  const cols = [];
  let current = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { cols.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  cols.push(current.trim());
  return cols;
}

function parseNum(s) {
  if (!s) return 0;
  return parseInt(String(s).replace(/,/g, ''), 10) || 0;
}

function parseMoisCsv(csvText) {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const header = parseRow(lines[0]);
  console.log(`CSV 컬럼 수: ${header.length}, 총 행: ${lines.length}`);

  const result = {};
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseRow(line);
    if (cols.length < 40) continue;

    // 행정구역 이름에서 10자리 MOIS 코드 추출
    // 형식: "서울특별시 종로구 청운효자동(1111051500)"
    const nameCell = cols[0].replace(/"/g, '');
    const codeMatch = nameCell.match(/\((\d{10})\)/);
    if (!codeMatch) { skipped++; continue; }

    const moisCode = codeMatch[1];
    const sgisCode = moisToSgis[moisCode];
    if (!sgisCode) { skipped++; continue; }

    // 연령 그룹 파싱
    const ageGroups = AGE_RANGE_COLS.map(({ range, totalIdx, multiIdx }) => {
      let male, female, total;

      if (multiIdx) {
        // 80+: 여러 컬럼 합산
        total  = multiIdx.reduce((s, idx) => s + parseNum(cols[idx]), 0);
        male   = multiIdx.reduce((s, idx) => s + parseNum(cols[idx + MALE_OFFSET]), 0);
        female = multiIdx.reduce((s, idx) => s + parseNum(cols[idx + FEMALE_OFFSET]), 0);
      } else {
        total  = parseNum(cols[totalIdx]);
        male   = parseNum(cols[totalIdx + MALE_OFFSET]);
        female = parseNum(cols[totalIdx + FEMALE_OFFSET]);
      }

      return { ageRange: range, male, female, total };
    });

    // 유효성: 모든 그룹이 0이면 스킵
    if (ageGroups.reduce((s, g) => s + g.total, 0) === 0) { skipped++; continue; }

    result[sgisCode] = ageGroups;
  }

  if (skipped > 0) console.log(`  → 스킵된 행: ${skipped}개 (코드 매핑 없음 포함)`);
  return result;
}

// ─── MOIS CSV 다운로드 ────────────────────────────────────────
async function downloadFromMois(yyyymm) {
  console.log(`[다운로드] MOIS 주민등록 연령별 인구 현황 (${yyyymm})...`);

  // 1단계: 세션 쿠키 획득
  const sessionRes = await fetch('https://jumin.mois.go.kr/ageStatMonth.do', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; korea-datamap-script)' },
  });
  if (!sessionRes.ok) throw new Error(`세션 획득 실패: HTTP ${sessionRes.status}`);

  const cookies = sessionRes.headers.getSetCookie?.() ?? [];
  const sessionCookie = cookies
    .map((c) => c.split(';')[0])
    .join('; ');

  // 2단계: CSV 다운로드 (POST, xlsStats=3 = 전체 읍면동)
  const yyyy = yyyymm.slice(0, 4);
  const mm = yyyymm.slice(4, 6);
  const formData = new URLSearchParams({
    sltOrgType: '1',
    sltOrgLvl1: 'A',
    sltOrgLvl2: '',
    gender: 'gender',
    sum: 'sum',
    sltUndefType: '',
    searchYearStart: yyyy,
    searchMonthStart: mm,
    searchYearEnd: yyyy,
    searchMonthEnd: mm,
    sltOrderType: '1',
    sltOrderValue: 'ASC',
    sltArgTypes: '10',
    sltArgTypeA: '0',
    sltArgTypeB: '100',
    category: 'month',
    state: '3',
  });

  const downloadRes = await fetch(
    `https://jumin.mois.go.kr/downloadCsvAge.do?searchYearMonth=${yyyymm}&xlsStats=3`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://jumin.mois.go.kr/ageStatMonth.do',
        'Origin': 'https://jumin.mois.go.kr',
        'Cookie': sessionCookie,
        'User-Agent': 'Mozilla/5.0 (compatible; korea-datamap-script)',
      },
      body: formData.toString(),
    }
  );

  if (!downloadRes.ok) throw new Error(`다운로드 실패: HTTP ${downloadRes.status}`);

  const contentType = downloadRes.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    throw new Error('CSV 대신 HTML 응답. 파라미터나 세션을 확인하세요.');
  }

  const buffer = await downloadRes.arrayBuffer();
  const sizeMb = (buffer.byteLength / 1024 / 1024).toFixed(2);
  console.log(`  → 다운로드 완료 (${sizeMb} MB)`);

  // EUC-KR 디코딩 (Node.js 18+ 기본 지원)
  let text;
  try {
    text = new TextDecoder('euc-kr').decode(buffer);
  } catch {
    text = new TextDecoder('utf-8').decode(buffer);
  }
  return text.replace(/^\uFEFF/, ''); // BOM 제거
}

// ─── 수동 파일 모드 ────────────────────────────────────────────
function readManualFile() {
  const candidates = [
    path.resolve(ROOT, 'scripts/age-data-input.csv'),
    path.resolve(ROOT, 'scripts/age-data-input.txt'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      console.log(`[수동 파일] ${p}`);
      const buf = readFileSync(p);
      try { return new TextDecoder('euc-kr').decode(buf).replace(/^\uFEFF/, ''); }
      catch { return readFileSync(p, 'utf-8').replace(/^\uFEFF/, ''); }
    }
  }
  return null;
}

// ─── 메인 ─────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const yyyymm = args[0] ?? getDefaultYearMonth();
  console.log(`\n=== 연령별 인구 데이터 수집 (${yyyymm.slice(0,4)}년 ${yyyymm.slice(4)}월) ===\n`);

  let csvText = readManualFile();

  if (!csvText) {
    try {
      csvText = await downloadFromMois(yyyymm);
    } catch (err) {
      console.error('[다운로드 실패]', err.message);
      console.log('\n수동 다운로드 방법:');
      console.log('  1. https://jumin.mois.go.kr/ageStatMonth.do 접속');
      console.log('  2. 연도/월 선택 후 "전체읍면동현황" → CSV 파일 다운로드');
      console.log('  3. 다운로드 파일을 scripts/age-data-input.csv 로 저장');
      console.log('  4. npm run fetch:age-data 재실행\n');
      process.exit(1);
    }
  }

  console.log('\n[파싱] CSV 분석 중...');
  let data;
  try {
    data = parseMoisCsv(csvText);
  } catch (err) {
    console.error('[파싱 실패]', err.message);
    process.exit(1);
  }

  const count = Object.keys(data).length;
  console.log(`  → 파싱 완료: ${count}개 읍면동`);
  if (count === 0) {
    console.error('[오류] 파싱된 데이터가 없습니다.');
    process.exit(1);
  }

  // ─── 검증 ──────────────────────────────────────────────────
  console.log('\n[검증] 샘플 지역 확인:');
  const checks = {
    '11010530': '청운효자동',
    '11160580': '화곡3동',
    '11160670': '발산1동',
    '11240510': '가락2동',
  };
  let passed = 0;
  for (const [code, name] of Object.entries(checks)) {
    const entry = data[code];
    if (entry) {
      const total = entry.reduce((s, g) => s + g.total, 0);
      const g1019 = entry.find((g) => g.ageRange === '10-19');
      console.log(`  ✅ ${name} (${code}): 총 ${total.toLocaleString()}명, 10-19세 ${g1019?.total.toLocaleString() ?? '-'}명`);
      passed++;
    } else {
      console.log(`  ⚠️  ${name} (${code}): 데이터 없음`);
    }
  }

  // ─── 저장 ──────────────────────────────────────────────────
  const yyyy = yyyymm.slice(0, 4);
  const mm = yyyymm.slice(4, 6);
  const output = {
    meta: {
      yearMonth: `${yyyy}-${mm}`,
      source: '행정안전부 주민등록 연령별 인구현황 (jumin.mois.go.kr)',
      url: `https://jumin.mois.go.kr/downloadCsvAge.do?searchYearMonth=${yyyymm}&xlsStats=3`,
      generatedAt: new Date().toISOString(),
      count,
    },
    data,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n[저장 완료] ${OUTPUT_PATH}`);
  console.log(`  → ${count}개 읍면동 (검증 통과: ${passed}/${Object.keys(checks).length})`);
}

main().catch((err) => {
  console.error('[오류]', err);
  process.exit(1);
});
