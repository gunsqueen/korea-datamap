/**
 * 전국 시군구 인구 스냅샷 생성 스크립트
 * 공공데이터포털 행정안전부 인구 API → sigungu_population.json 갱신
 *
 * 실행: node scripts/fetch-sigungu-population.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SERVICE_KEY = 'fcfb6899040b2dc7f9c3bf04402834c6a83364a827417cad9d2052178fce7591';
const BASE_URL = 'https://apis.data.go.kr/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus';

const codeMap = JSON.parse(readFileSync(join(ROOT, 'src/data/mois_code_map.json'), 'utf8'));
const existing = JSON.parse(readFileSync(join(ROOT, 'src/data/mock/sigungu_population.json'), 'utf8'));

// ─── 유틸 ─────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchDong(moisCode, ym) {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo: '1',
    numOfRows: '1000',
    type: 'json',
    admmCd: moisCode,
    srchFrYm: ym,
    srchToYm: ym,
  });
  const res = await fetch(`${BASE_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const items = json?.Response?.items?.item ?? [];
  if (!Array.isArray(items) || items.length === 0) throw new Error('no data');

  let total = 0, male = 0, female = 0, hh = 0;
  for (const item of items) {
    total  += Number(item.totNmprCnt  ?? 0);
    male   += Number(item.maleNmprCnt ?? 0);
    female += Number(item.femlNmprCnt ?? 0);
    hh     += Number(item.hhCnt       ?? 0);
  }
  if (total === 0) throw new Error('zero population');
  return { total, male, female, hh };
}

// 가장 최근 유효 연월 탐색 (최대 4개월 전까지)
async function findLatestYm(moisCode) {
  const now = new Date();
  for (let offset = 2; offset <= 5; offset++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - offset);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    try {
      await fetchDong(moisCode, ym);
      return ym;
    } catch { /* continue */ }
  }
  throw new Error('최신 연월 탐색 실패');
}

// 시군구 하위 동 코드 목록
function childDongCodes(sigunguCode) {
  return Object.keys(codeMap).filter(k => k.startsWith(sigunguCode) && k.length === 8);
}

// 시군구 전체 집계
async function fetchSigungu(sigunguCode, adm_nm, ym) {
  const children = childDongCodes(sigunguCode);
  if (children.length === 0) throw new Error(`하위 동 코드 없음: ${sigunguCode}`);

  // 병렬 호출 (최대 5개씩)
  const results = [];
  for (let i = 0; i < children.length; i += 5) {
    const batch = children.slice(i, i + 5);
    const settled = await Promise.allSettled(
      batch.map(k => fetchDong(codeMap[k], ym))
    );
    results.push(...settled);
    if (i + 5 < children.length) await sleep(200);
  }

  const ok = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  if (ok.length === 0) throw new Error('집계 가능한 동 없음');

  const failCount = results.length - ok.length;
  if (failCount > 0) console.warn(`  ⚠ ${adm_nm}: ${failCount}개 동 실패 (${ok.length}/${results.length} 집계)`);

  return {
    total: ok.reduce((s, d) => s + d.total, 0),
    male:  ok.reduce((s, d) => s + d.male,  0),
    female: ok.reduce((s, d) => s + d.female, 0),
    hh:    ok.reduce((s, d) => s + d.hh,    0),
    coveredDongs: ok.length,
    totalDongs: results.length,
  };
}

// ─── 메인 ─────────────────────────────────────────────────────

async function main() {
  console.log(`\n전국 시군구 인구 스냅샷 생성 시작 (총 ${existing.length}개)\n`);

  // 첫 번째 시군구로 최신 연월 탐색
  const probeCode = childDongCodes(existing[0].adm_cd)[0];
  const probeYm = probeCode ? await findLatestYm(codeMap[probeCode]) : '202602';
  const year = parseInt(probeYm.slice(0, 4));
  const month = parseInt(probeYm.slice(4));
  console.log(`기준 연월: ${year}년 ${month}월\n`);

  const results = [];
  let success = 0, failed = 0;

  for (let i = 0; i < existing.length; i++) {
    const entry = existing[i];
    const { adm_cd, adm_nm } = entry;
    const idx = `[${String(i + 1).padStart(3)}/${existing.length}]`;

    const children = childDongCodes(adm_cd);
    if (children.length === 0) {
      console.log(`${idx} ⏭ ${adm_nm} — 동 코드 없음, 기존 유지`);
      results.push(entry);
      continue;
    }

    try {
      const agg = await fetchSigungu(adm_cd, adm_nm, probeYm);
      const newEntry = {
        ...entry,
        year,
        month,
        total_population:  agg.total,
        male_population:   agg.male,
        female_population: agg.female,
        total_households:  agg.hh,
      };
      // 기존 age_groups 유지 (별도 파일에서 관리)
      results.push(newEntry);
      success++;
      console.log(`${idx} ✅ ${adm_nm}: ${agg.total.toLocaleString()}명 (${agg.coveredDongs}/${agg.totalDongs}동)`);
    } catch (err) {
      console.error(`${idx} ❌ ${adm_nm}: ${err.message} — 기존 유지`);
      results.push(entry);
      failed++;
    }

    // 시군구 간 딜레이 (100ms)
    await sleep(100);
  }

  // 저장
  const outPath = join(ROOT, 'src/data/mock/sigungu_population.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');

  console.log(`\n완료: 성공 ${success}개, 실패 ${failed}개 (기존 유지)`);
  console.log(`저장: ${outPath}`);
  console.log(`기준: ${year}년 ${month}월`);
}

main().catch(err => { console.error(err); process.exit(1); });
