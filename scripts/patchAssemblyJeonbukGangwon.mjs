#!/usr/bin/env node
/**
 * 19/20/21대 국회의원선거의 전라북도·강원도 항목이
 *   - cidx_assembly.json (검색 인덱스)
 *   - assembly_district_emd_mapping.json (선거구→읍면동 매핑)
 * 두 파일에서 통째로 누락되어 있던 문제를 패치한다.
 *
 * 원인:
 *   - 경계(boundary) 데이터는 새 명칭("전북특별자치도", "강원특별자치도")만 보유
 *   - 선거 원본(assembly_NN_district.json)은 옛 명칭("전라북도", "강원도") 사용
 *   - 시도명 정규화가 안 되어 인덱스 빌드 시 이 두 시도가 매칭 실패
 *
 * 해결:
 *   - 옛 시도명 ↔ 새 시도명 매핑으로 boundary 동을 매칭
 *   - cidx 엔트리는 옛 시도명을 사용 (선거 당시 공식 명칭)
 *   - emd 이름이 시도 내에서 중복(춘천시 동면 vs 양구군 동면 등)이면
 *     election_district 힌트(시군구명 prefix)로 disambiguate
 *
 * 멱등(idempotent): 이미 추가된 항목은 재추가하지 않는다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const EMD_DIR = path.join(ROOT, 'src/data/mock/eupmyeondong');

const SIDO_OLD_TO_NEW = {
  '강원도': '강원특별자치도',
  '전라북도': '전북특별자치도',
};

const SIDO_SHORT = {
  '강원도': '강원', '강원특별자치도': '강원',
  '전라북도': '전북', '전북특별자치도': '전북',
};

// ── 1) 모든 boundary 동을 (new_sido, emd_name) 키로 색인 ──────────────
function buildBoundaryIndex() {
  const index = new Map(); // key: `${sido}|${emd}` → [{ adm_cd, adm_nm, sigungu_nm }]
  for (const fname of fs.readdirSync(EMD_DIR)) {
    if (!fname.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(EMD_DIR, fname), 'utf8'));
    for (const ft of data.features ?? []) {
      const adm_cd = ft.properties?.adm_cd;
      const adm_nm = ft.properties?.adm_nm;
      if (!adm_cd || !adm_nm) continue;
      const tokens = adm_nm.split(' ');
      if (tokens.length < 2) continue;
      const sido_new = tokens[0];
      const emd = tokens[tokens.length - 1];
      const sigungu_nm = tokens.slice(0, -1).join(' '); // sido + sigungu(+자치구)
      const key = `${sido_new}|${emd}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ adm_cd, adm_nm, sigungu_nm });
    }
  }
  return index;
}

// ── 2) 동 이름 중복 시 election_district로 disambiguate. 통합 선거구는 다중 매칭 ─
// 반환: 매칭된 boundary entry 배열 (0개~N개)
function findBoundaryMatches(boundaryIndex, sido_new, emd, election_district) {
  const candidates = boundaryIndex.get(`${sido_new}|${emd}`) ?? [];
  if (candidates.length === 0) return [];
  if (candidates.length === 1) return candidates;

  // 1순위: 시군구(자치구 포함) 결합 이름이 election_district의 prefix와 일치
  for (const c of candidates) {
    const tokens = c.sigungu_nm.split(' ').slice(1); // 시도 제외
    const combined = tokens.join('');                 // 예: "전주시완산구"
    if (combined && election_district.startsWith(combined)) return [c];
  }
  // 2순위: 첫 번째 시군구 이름이 election_district의 prefix와 일치
  for (const c of candidates) {
    const firstSgg = c.sigungu_nm.split(' ')[1] ?? '';
    if (firstSgg && election_district.startsWith(firstSgg)) return [c];
  }
  // 3순위: 통합 선거구(예: "동해시삼척시") — 시군구명이 election_district의 부분문자열
  // 같은 동 이름이 양쪽에 있을 때 둘 다 매칭
  const partial = candidates.filter((c) => {
    const sgg = c.sigungu_nm.split(' ')[1] ?? '';
    return sgg && election_district.includes(sgg);
  });
  return partial;
}

// ── 3) 메인 패치 ──────────────────────────────────────────────────
function main() {
  console.log('=== cidx_assembly.json + assembly_district_emd_mapping.json 패치 ===\n');

  const boundaryIndex = buildBoundaryIndex();
  console.log(`Boundary 동 인덱스: ${boundaryIndex.size}개 키\n`);

  const cidxPath = path.join(ROOT, 'src/data/static/cidx_assembly.json');
  const mappingPath = path.join(ROOT, 'src/data/static/assembly_district_emd_mapping.json');

  const cidx = JSON.parse(fs.readFileSync(cidxPath, 'utf8'));
  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

  // 기존 cidx에서 (gen, name, party, district, adm_cd) 중복 체크용 set
  const existingCidxKeys = new Set();
  for (const e of cidx) {
    existingCidxKeys.add(`${e.e}|${e.n}|${e.p}|${e.d}|${e.cd}`);
  }

  const summary = { total: 0, addedCidx: 0, skippedCidx: 0, addedMappingKeys: 0, unmatched: [] };

  for (const gen of ['19', '20', '21']) {
    const srcPath = path.join(ROOT, `src/data/static/assembly_${gen}_district.json`);
    if (!fs.existsSync(srcPath)) continue;
    const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    const label = `${gen}대 총선 지역구`;

    let genAddCidx = 0, genUnmatched = 0;

    for (const [key, val] of Object.entries(src)) {
      const [sido_old, sgg_election, emd] = key.split('|');
      if (!SIDO_OLD_TO_NEW[sido_old]) continue;
      const sido_new = SIDO_OLD_TO_NEW[sido_old];
      const matches = findBoundaryMatches(boundaryIndex, sido_new, emd, sgg_election);

      if (matches.length === 0) {
        genUnmatched++;
        if (summary.unmatched.length < 8) summary.unmatched.push(`${gen}: ${key}`);
        continue;
      }

      for (const match of matches) {
        const adm_nm_old = match.adm_nm.replace(sido_new, sido_old);
        const sigungu_nm_old = match.sigungu_nm.replace(sido_new, sido_old);

        // cidx 엔트리 (후보별)
        for (const c of val.candidates ?? []) {
          const entryKey = `${label}|${c.name}|${c.party}|${sgg_election}|${match.adm_cd}`;
          if (existingCidxKeys.has(entryKey)) {
            summary.skippedCidx++;
            continue;
          }
          cidx.push({
            n: c.name,
            p: c.party,
            e: label,
            d: sgg_election,
            cd: match.adm_cd,
            sc: match.adm_cd.slice(0, 5),
            sn: sigungu_nm_old,
            rc: match.adm_cd.slice(0, 2),
            rn: sido_old,
            an: adm_nm_old,
          });
          existingCidxKeys.add(entryKey);
          genAddCidx++;
        }

        // 선거구→동 매핑
        const sidoShort = SIDO_SHORT[sido_old];
        const mapKey = `${sidoShort}_${sgg_election}`;
        if (!mapping[gen]) mapping[gen] = {};
        if (!mapping[gen][mapKey]) {
          mapping[gen][mapKey] = [];
          summary.addedMappingKeys++;
        }
        if (!mapping[gen][mapKey].includes(match.adm_cd)) {
          mapping[gen][mapKey].push(match.adm_cd);
        }
      }
    }

    summary.total += genAddCidx;
    summary.addedCidx += genAddCidx;
    console.log(`${gen}대: cidx +${genAddCidx} (skipped ${summary.skippedCidx}), 미매칭 ${genUnmatched}개`);
  }

  fs.writeFileSync(cidxPath, JSON.stringify(cidx));
  fs.writeFileSync(mappingPath, JSON.stringify(mapping));

  console.log(`\n총 cidx 추가: ${summary.addedCidx}개`);
  console.log(`스킵(중복): ${summary.skippedCidx}개`);
  console.log(`mapping 신규 키: ${summary.addedMappingKeys}개`);
  if (summary.unmatched.length) {
    console.log(`\n미매칭 샘플 (최대 8개):`);
    summary.unmatched.forEach(u => console.log(`  ${u}`));
  }
}

main();
