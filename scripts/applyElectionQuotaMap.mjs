/**
 * electionQuotaMap.json 의 정원 정보를 사용하여
 * local_council_results.json 의 당선인을 재설정하는 스크립트
 * 
 * API 호출 없이 기존 후보자 데이터에 올바른 정원을 적용합니다.
 * 
 * 실행: node scripts/applyElectionQuotaMap.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

async function main() {
  console.log('=== electionQuotaMap 적용하여 당선인 재설정 ===\n');

  const quotaMapPath = path.join(ROOT, 'src/data/electionQuotaMap.json');
  const resultsPath = path.join(ROOT, 'src/data/static/local_council_results.json');

  if (!fs.existsSync(quotaMapPath)) {
    console.error(`❌ 매핑 파일 없음: ${quotaMapPath}`);
    process.exit(1);
  }

  const quotaMap = JSON.parse(fs.readFileSync(quotaMapPath, 'utf8'));
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

  console.log(`📊 로드 완료:`);
  console.log(`   - 정원 매핑: ${Object.keys(quotaMap.quotas).length}개 선거구`);
  console.log(`   - 선거결과: ${Object.keys(results).length}개 선거구\n`);

  let applied = 0;
  let corrected = 0;
  let noMapping = 0;

  for (const [key, result] of Object.entries(results)) {
    // quotaKey: "{gen}_{sidoShort}_{subtype}_{districtName}"
    const quotaKey = key;
    const mapQuota = quotaMap.quotas[quotaKey];

    if (mapQuota === undefined) {
      noMapping++;
      continue;
    }

    const candidates = result.candidates || [];
    const oldElected = candidates.filter(c => c.elected).length;

    // 득표 순서로 상위 mapQuota 명을 당선인으로 설정
    candidates.forEach((c, idx) => {
      c.elected = idx < mapQuota;
    });

    const newElected = candidates.filter(c => c.elected).length;

    if (oldElected !== newElected) {
      corrected++;
      console.log(`✓ ${result.adm_nm}: ${oldElected}명 → ${newElected}명`);
    }
    applied++;
  }

  // 저장
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

  console.log(`\n🎯 결과:`);
  console.log(`   ✓ 적용된 선거구: ${applied}개 (정원 매핑 적용)`);
  console.log(`   ✓ 수정된 선거구: ${corrected}개 (당선인 수 변경)`);
  console.log(`   - 미매핑 선거구: ${noMapping}개 (매핑 테이블 없음)`);
  console.log(`\n✅ 저장 완료: ${resultsPath}`);
}

main().catch(err => {
  console.error('❌ 오류:', err.message);
  process.exit(1);
});
