#!/usr/bin/env node
/**
 * cidx_local_high.json (지방선거 - 광역단체장/기초단체장/광역의원 검색 인덱스) 정규화.
 *
 * 문제:
 *   - legacy 영문 라벨(`local_X_sido_mayor`, `local_X_metro_mayor`, `local_X_mayor`,
 *     `local_X_council_district`)이 한글 라벨("X회 지방선거 광역단체장" 등)과 혼재
 *   - legacy 영문 라벨은 광역단체장(시도 단위 선거)인데도 d 필드를 시군구명으로 저장
 *   - 동일 후보가 시군구마다 1건씩 색인되어 검색 시 25건 이상 중복 노출
 *   - 송영길(8회 서울 광역단체장) → 검색 결과 26건 (한글 1 + 영문 25)
 *
 * 정규화 규칙:
 *   1) `local_X_metro_mayor` / `local_X_sido_mayor` → "X회 지방선거 광역단체장",
 *      d = 시도명 (rn 값 사용), 후보·시도당 1건만 유지
 *   2) `local_X_mayor` → "X회 지방선거 단체장", d = 시군구명(그대로),
 *      후보·시군구당 1건만 유지
 *   3) `local_X_council_district` → "X회 지방선거 광역의원(지역구)",
 *      d = 시군구명(그대로 — 5회는 선거구명 정보가 원본에 없음),
 *      후보·시군구당 1건만 유지
 *   4) 한글 라벨이 이미 있는 후보의 영문 항목은 한글이 우선, 영문 자동 dedup
 *   5) 다른 라벨(예: 한글 라벨)은 그대로 유지
 *
 * 멱등(idempotent): 다시 실행해도 동일 결과.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'src/data/static/cidx_local_high.json');

/** 영문 라벨을 한글 라벨로 정규화 + d 보정 */
function normalizeEntry(c) {
  const e = c.e;

  // 광역단체장 (시도 단위)
  let m = e.match(/^local_(\d+)_(metro|sido)_mayor$/);
  if (m) {
    return {
      ...c,
      e: `${m[1]}회 지방선거 광역단체장`,
      d: c.rn, // 시도명 (예: "서울특별시")
    };
  }

  // 기초단체장 (시군구 단위)
  m = e.match(/^local_(\d+)_mayor$/);
  if (m) {
    return {
      ...c,
      e: `${m[1]}회 지방선거 단체장`,
      // d는 시군구명 — 원본 d가 이미 시군구명이라 그대로
    };
  }

  // 광역의원 (지역구) — 5회 데이터는 d가 시군구명까지만
  m = e.match(/^local_(\d+)_council_district$/);
  if (m) {
    return {
      ...c,
      e: `${m[1]}회 지방선거 광역의원(지역구)`,
      // d는 시군구명 그대로 — 정확한 선거구 정보 없음
    };
  }

  return c; // 변경 없음
}

function main() {
  console.log('=== cidx_local_high.json 정규화 시작 ===\n');

  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  console.log(`원본 항목 수: ${raw.length}`);

  // 1단계: 모든 항목을 한글 라벨로 정규화
  const normalized = raw.map(normalizeEntry);

  // 2단계: dedup — (n, p, e, d) 기준으로 첫 번째 항목만 유지
  // 단, eupmyeondong adm_cd(`cd`)는 첫 번째 등장 값으로 고정
  const seen = new Map();
  const result = [];
  for (const c of normalized) {
    const key = `${c.n}|${c.p}|${c.e}|${c.d}`;
    if (seen.has(key)) continue;
    seen.set(key, true);
    result.push(c);
  }

  console.log(`정규화 후 (dedup 전): ${normalized.length}`);
  console.log(`최종 항목 수 (dedup 후): ${result.length}`);
  console.log(`제거된 중복: ${normalized.length - result.length}`);

  // 라벨 분포 출력
  const counts = new Map();
  for (const c of result) {
    counts.set(c.e, (counts.get(c.e) ?? 0) + 1);
  }
  console.log('\n라벨 분포 (정규화 후):');
  for (const [k, v] of [...counts.entries()].sort()) {
    console.log(`  ${k}: ${v}`);
  }

  // 검증: 송영길 항목 수
  const songYoungGil = result.filter((c) => c.n === '송영길');
  console.log(`\n[검증] 송영길 항목 수: ${songYoungGil.length}`);
  for (const c of songYoungGil) {
    console.log(`  ${c.e} | ${c.p} | ${c.d}`);
  }

  fs.writeFileSync(FILE, JSON.stringify(result));
  const size = (fs.statSync(FILE).size / 1024).toFixed(1);
  console.log(`\n✅ 저장 완료: ${FILE} (${size} KB)`);
}

main();
