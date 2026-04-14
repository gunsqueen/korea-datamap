/**
 * 중앙선거관리위원회 웹사이트에서 실제 당선자 데이터를 확인하고
 * 선거구 정수를 검증하는 도구
 *
 * 사용법:
 * 1. 웹사이트에서 데이터를 확인
 * 2. 이 스크립트로 현재 데이터와 비교
 * 3. 불일치 시 자동 수정
 *
 * 실행: node scripts/verify-manual-data.mjs [선거구명] [실제당선자수]
 * 예: node scripts/verify-manual-data.mjs "강서구가선거구" 3
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/**
 * 현재 데이터에서 선거구 정보 조회
 */
function getCurrentData(districtName) {
  const dataPath = path.join(ROOT, 'src/data/static/local_council_results.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  // 8회 지방선거 데이터만 확인
  const possibleKeys = Object.keys(data).filter(k =>
    k.includes('8_') &&
    k.includes(districtName) &&
    k.includes('basic')
  );

  if (possibleKeys.length === 0) {
    return null;
  }

  return data[possibleKeys[0]];
}

/**
 * 메인 실행 함수
 */
function main() {
  const args = process.argv.slice(2);
  const districtName = args[0];
  const officialQuota = parseInt(args[1]);

  if (!districtName || isNaN(officialQuota)) {
    console.log('사용법: node scripts/verify-manual-data.mjs [선거구명] [실제당선자수]');
    console.log('예시: node scripts/verify-manual-data.mjs "강서구가선거구" 3');
    console.log('');
    console.log('📋 실제 당선자 수 확인 방법:');
    console.log('1. https://www.nec.go.kr 접속');
    console.log('2. 선거통계 → 지방선거 → 제8회 전국동시지방선거');
    console.log('3. 시·도별 개표현황 선택');
    console.log('4. 해당 시도 → 구 → 기초의원 → 선거구 선택');
    console.log('5. 실제 당선자 수를 확인하여 위 명령어 실행');
    process.exit(1);
  }

  console.log(`🏛️ 수동 데이터 검증`);
  console.log(`선거구: ${districtName}`);
  console.log(`입력한 실제 당선자 수: ${officialQuota}명\n`);

  // 현재 데이터 확인
  const currentData = getCurrentData(districtName);
  if (!currentData) {
    console.log(`❌ ${districtName} 데이터를 찾을 수 없습니다.`);
    return;
  }

  console.log(`📁 현재 데이터:`);
  console.log(`선거구: ${currentData.adm_nm}`);
  const currentElected = currentData.candidates.filter(c => c.elected);
  console.log(`현재 당선자 수: ${currentElected.length}명`);
  currentElected.forEach((c, i) => {
    console.log(`  ${i+1}. ${c.name} (${c.party}) ${c.votes}표`);
  });

  // 검증
  console.log(`\n📊 검증 결과:`);
  console.log(`현재 데이터: ${currentElected.length}명`);
  console.log(`공식 데이터: ${officialQuota}명`);

  if (currentElected.length === officialQuota) {
    console.log(`✅ 일치: 선거구 정수가 올바르게 설정됨`);
  } else {
    console.log(`⚠️ 불일치: 수정 필요`);

    // 수정 명령어 생성
    const key = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/static/local_council_results.json'), 'utf8')))
      .find(k => k.includes(districtName) && k.includes('8_') && k.includes('basic'));

    if (key) {
      console.log(`\n🔧 수정 명령어:`);
      console.log(`# 1. electionQuotaMap.json에 추가`);
      console.log(`node -e "const fs = require('fs'); const map = JSON.parse(fs.readFileSync('src/data/electionQuotaMap.json', 'utf8')); map.quotas['${key}'] = ${officialQuota}; fs.writeFileSync('src/data/electionQuotaMap.json', JSON.stringify(map, null, 2)); console.log('✅ quota map 업데이트 완료');"`);

      console.log(`\n# 2. 변경사항 적용`);
      console.log(`node scripts/applyElectionQuotaMap.mjs`);

      console.log(`\n# 3. 검증`);
      console.log(`node scripts/verify-manual-data.mjs "${districtName}" ${officialQuota}`);
    } else {
      console.log(`❌ 키를 찾을 수 없습니다.`);
    }
  }
}

// 실행
main();