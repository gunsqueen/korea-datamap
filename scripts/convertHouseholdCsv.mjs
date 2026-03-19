/**
 * 행정안전부 세대원수별 세대수 CSV → JSON 변환 스크립트
 *
 * 입력: 행정안전부_지역별(행정동) 세대원수별 주민등록 세대수_YYYYMMDD.csv (EUC-KR)
 * 출력: src/data/real/household-size.json
 *
 * 실행: node scripts/convertHouseholdCsv.mjs <csv경로>
 * 예:   node scripts/convertHouseholdCsv.mjs \
 *         "Downloads/행정안전부_지역별(행정동) 세대원수별 주민등록 세대수_20260228.csv"
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── 인자 처리 ──────────────────────────────────────────────────────
const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: node scripts/convertHouseholdCsv.mjs <csv경로>');
  process.exit(1);
}

// ── EUC-KR → UTF-8 변환 ─────────────────────────────────────────
console.log(`Converting: ${csvPath}`);
let raw;
try {
  raw = execSync(`iconv -f EUC-KR -t UTF-8 "${csvPath}"`, { maxBuffer: 32 * 1024 * 1024 }).toString('utf8');
} catch (e) {
  console.error('iconv 변환 실패:', e.message);
  process.exit(1);
}

// ── MOIS 역매핑(10자리 → SGIS 8자리) 생성 ──────────────────────
const moisMap = JSON.parse(readFileSync(join(ROOT, 'src/data/mois_code_map.json'), 'utf8'));
// moisMap: { sgis8: mois10 }
const reverseMois = Object.fromEntries(Object.entries(moisMap).map(([sgis, mois]) => [mois, sgis]));

// ── CSV 파싱 ─────────────────────────────────────────────────────
const lines = raw.split('\n').filter(l => l.trim());
const header = lines[0].split(',').map(s => s.trim());
console.log('컬럼:', header);

// 컬럼 인덱스
const COL = {
  code:   header.indexOf('행정기관코드'),
  date:   header.indexOf('기준연월'),
  sido:   header.indexOf('시도명'),
  sgg:    header.indexOf('시군구명'),
  dong:   header.indexOf('읍면동명'),
  total:  header.indexOf('전체세대수'),
  s1:     header.indexOf('1인세대'),
  s2:     header.indexOf('2인세대'),
  s3:     header.indexOf('3인세대'),
  s4:     header.indexOf('4인세대'),
  s5:     header.indexOf('5인세대'),
  s6:     header.indexOf('6인세대'),
  s7:     header.indexOf('7인세대'),
  s8:     header.indexOf('8인세대'),
  s9:     header.indexOf('9인세대'),
  s10:    header.indexOf('10인이상세대'),
};

// 필수 컬럼 확인
const missing = Object.entries(COL).filter(([, v]) => v === -1).map(([k]) => k);
if (missing.length > 0) {
  console.error('누락된 컬럼:', missing);
  process.exit(1);
}

const data = {};
let matched = 0, unmatched = 0;
let sourceDate = '';

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  if (cols.length < 16) continue;

  const moisCode = cols[COL.code]?.trim();
  const date     = cols[COL.date]?.trim();
  const dong     = cols[COL.dong]?.trim();
  const total    = parseInt(cols[COL.total]) || 0;
  const sizes    = [
    parseInt(cols[COL.s1]) || 0,
    parseInt(cols[COL.s2]) || 0,
    parseInt(cols[COL.s3]) || 0,
    parseInt(cols[COL.s4]) || 0,
    parseInt(cols[COL.s5]) || 0,
    parseInt(cols[COL.s6]) || 0,
    parseInt(cols[COL.s7]) || 0,
    parseInt(cols[COL.s8]) || 0,
    parseInt(cols[COL.s9]) || 0,
    parseInt(cols[COL.s10]) || 0,
  ];

  if (!sourceDate && date) sourceDate = date;

  // MOIS 10자리 → SGIS 8자리 역매핑
  const sgisCode = reverseMois[moisCode];
  if (!sgisCode) {
    unmatched++;
    if (unmatched <= 5) {
      console.warn(`  미매핑: mois=${moisCode} dong=${dong}`);
    }
    continue;
  }

  // 합계 검증 (DEV)
  const sizeSum = sizes.reduce((a, b) => a + b, 0);
  if (Math.abs(sizeSum - total) > 1) {
    console.warn(`  [검증] ${dong}(${sgisCode}): 구간합(${sizeSum}) ≠ 전체세대수(${total})`);
  }

  data[sgisCode] = {
    moisCode,
    name: dong,
    total,
    sizes,  // [1인, 2인, 3인, 4인, 5인, 6인, 7인, 8인, 9인, 10인이상]
  };
  matched++;
}

console.log(`\n매핑 성공: ${matched}, 실패(역매핑 없음): ${unmatched}`);

// 검증 샘플
const samples = ['11160670', '11240670', '11560560'];  // 발산1동, 가락2동, 화곡3동
for (const sgis of samples) {
  const e = data[sgis];
  if (e) {
    console.log(`  [검증] ${e.name}(${sgis}): 전체=${e.total} sizes=[${e.sizes.join(',')}]`);
  } else {
    console.log(`  [검증] ${sgis}: 데이터 없음`);
  }
}

// ── JSON 출력 ────────────────────────────────────────────────────
const output = {
  meta: {
    sourceDate,
    source: '행정안전부_지역별(행정동) 세대원수별 주민등록 세대수',
    note: '행정기관코드(MOIS 10자리)를 SGIS 8자리 코드로 역매핑하여 생성',
    matched,
    unmatched,
    generatedAt: new Date().toISOString(),
  },
  data,
};

const outPath = join(ROOT, 'src/data/real/household-size.json');
writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
console.log(`\n✓ 저장 완료: ${outPath} (${matched}개 행정동)`);
