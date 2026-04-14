/**
 * WinnerInfoInqireService2 API를 사용한 실제 당선자 데이터 검증
 * 투표 패턴 분석이 아닌 실제 공식 데이터를 통해 선거구 정수 확인
 *
 * 사용법:
 * node scripts/verify-official-winners.mjs [선거구명] [시도명]
 * 예: node scripts/verify-official-winners.mjs "강서구가선거구" "서울특별시"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const NEC_BASE = 'https://apis.data.go.kr/9760000/WinnerInfoInqireService2';
const SERVICE_KEY = 'fcfb6899040b2dc7f9c3bf04402834c6a83364a827417cad9d2052178fce7591';

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

/**
 * WinnerInfoInqireService2 API에서 당선자 데이터 조회
 */
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

    try {
      const response = await fetch(url);
      const json = await response.json();

      if (json?.response?.header?.resultCode !== '00') {
        console.log(`API 오류: ${json?.response?.header?.resultMsg}`);
        break;
      }

      const items = json?.response?.body?.items?.item;
      const candidates = !items ? [] : Array.isArray(items) ? items : [items];

      if (candidates.length === 0) break;

      allItems.push(...candidates);
      pageNo++;

      // 최대 10페이지로 제한
      if (pageNo > 10) break;

    } catch (error) {
      console.log(`네트워크 오류: ${error.message}`);
      break;
    }
  }

  return allItems;
}

/**
 * 현재 데이터에서 선거구 정보 조회
 */
function getCurrentData(districtName, sidoName) {
  const dataPath = path.join(ROOT, 'src/data/static/local_council_results.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  // 8회 지방선거 데이터만 확인
  const key = `8_${SIDO_CODE_TO_SHORT[Object.keys(SIDO_CODE_TO_NEC_NAME).find(k => SIDO_CODE_TO_NEC_NAME[k] === sidoName)]}_basic_${districtName}`;

  if (!data[key]) {
    // 다른 키 패턴 시도
    const possibleKeys = Object.keys(data).filter(k =>
      k.includes('8_') &&
      k.includes(districtName) &&
      k.includes('basic')
    );

    if (possibleKeys.length > 0) {
      return data[possibleKeys[0]];
    }

    return null;
  }

  return data[key];
}

/**
 * 당선자 데이터를 선거구별로 그룹화
 */
function groupWinnersByDistrict(winners) {
  const districtGroups = {};

  winners.forEach(winner => {
    const districtName = winner.wiwName;
    if (!districtGroups[districtName]) {
      districtGroups[districtName] = [];
    }
    districtGroups[districtName].push(winner);
  });

  return districtGroups;
}

/**
 * 메인 실행 함수
 */
async function main() {
  const args = process.argv.slice(2);
  let districtName = args[0];
  let sidoName = args[1] || '서울특별시';

  if (!districtName) {
    console.log('사용법: node scripts/verify-official-winners.mjs [선거구명] [시도명]');
    console.log('예시: node scripts/verify-official-winners.mjs "강서구가선거구" "서울특별시"');
    process.exit(1);
  }

  console.log(`🏛️ 공식 당선자 데이터 검증`);
  console.log(`대상: ${sidoName} ${districtName}`);
  console.log(`선거: 제8회 전국동시지방선거\n`);

  // 1. 현재 데이터 확인
  const currentData = getCurrentData(districtName, sidoName);
  if (currentData) {
    console.log(`📁 현재 데이터:`);
    console.log(`선거구: ${currentData.adm_nm}`);
    const elected = currentData.candidates.filter(c => c.elected);
    console.log(`당선자 수: ${elected.length}명`);
    elected.forEach(c => console.log(`  ✓ ${c.name} (${c.jdName})`));
  } else {
    console.log(`⚠️ 현재 데이터에서 ${districtName} 정보를 찾을 수 없습니다.`);
  }

  // 2. 공식 당선자 데이터 조회 (기초의원)
  console.log(`\n🔍 공식 당선자 데이터 조회 중...`);
  const winners = await fetchWinners('20220601', '6', sidoName); // 6 = 기초의원

  if (winners.length === 0) {
    console.log(`❌ 당선자 데이터를 가져올 수 없습니다.`);
    return;
  }

  console.log(`📊 ${sidoName} 기초의원 당선자: ${winners.length}명`);

  // 3. 선거구별 그룹화
  const districtGroups = groupWinnersByDistrict(winners);

  // 4. 특정 선거구 확인
  const targetWinners = districtGroups[districtName];

  if (!targetWinners) {
    console.log(`\n❌ ${districtName}의 당선자 데이터를 찾을 수 없습니다.`);
    console.log(`\n📋 발견된 선거구 목록 (처음 10개):`);
    Object.keys(districtGroups).slice(0, 10).forEach(district => {
      console.log(`  - ${district}: ${districtGroups[district].length}명`);
    });
    return;
  }

  console.log(`\n✅ ${districtName} 공식 당선자 데이터:`);
  console.log(`당선자 수: ${targetWinners.length}명`);
  targetWinners.forEach((winner, i) => {
    console.log(`  ${i+1}. ${winner.name} (${winner.jdName})`);
  });

  // 5. 현재 데이터와 비교
  if (currentData) {
    const currentElected = currentData.candidates.filter(c => c.elected).length;
    const officialCount = targetWinners.length;

    console.log(`\n📊 검증 결과:`);
    console.log(`현재 데이터 당선자: ${currentElected}명`);
    console.log(`공식 데이터 당선자: ${officialCount}명`);

    if (currentElected === officialCount) {
      console.log(`✅ 일치: 선거구 정수가 올바르게 설정됨`);
    } else {
      console.log(`⚠️ 불일치: 수정 필요`);

      // 수정 명령어 출력
      const sidoShort = SIDO_CODE_TO_SHORT[Object.keys(SIDO_CODE_TO_NEC_NAME).find(k => SIDO_CODE_TO_NEC_NAME[k] === sidoName)];
      const key = `8_${sidoShort}_basic_${districtName}`;

      console.log(`\n🔧 수정 명령어:`);
      console.log(`# 1. electionQuotaMap.json에 추가`);
      console.log(`node -e "const fs = require('fs'); const map = JSON.parse(fs.readFileSync('src/data/electionQuotaMap.json', 'utf8')); map.quotas['${key}'] = ${officialCount}; fs.writeFileSync('src/data/electionQuotaMap.json', JSON.stringify(map, null, 2)); console.log('✅ quota map 업데이트 완료');"`);

      console.log(`\n# 2. 변경사항 적용`);
      console.log(`node scripts/applyElectionQuotaMap.mjs`);
    }
  }
}

// 실행
main().catch(console.error);