/**
 * API를 사용한 실제 선거구 정수 검증 스크립트
 * 중앙선거관리위원회 API로 실제 당선자 명단을 확인하고 선거구 정수를 검증
 *
 * 사용법:
 * node scripts/verify-district-quota.mjs [선거구명] [시도명]
 * 예: node scripts/verify-district-quota.mjs "강서구가선거구" "서울특별시"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const SERVICE_KEY = 'fcfb6899040b2dc7f9c3bf04402834c6a83364a827417cad9d2052178fce7591';
const NEC_BASE = 'https://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2/getXmntckSttusInfoInqire';

// 선거구 타입 매핑
const ELECTION_TYPES = {
  '기초의원(지역구)': '3',  // 시군구의회의원선거
  '광역의원(지역구)': '2',  // 시도의회의원선거
  '교육의원': '4'           // 시도교육의회의원선거
};

/**
 * NEC API에서 구 단위 결과 조회 (기존 verify-election-samples.mjs 방식과 동일)
 */
async function fetchDistrictRows(wiwName, sgTypecode) {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo: '1',
    numOfRows: '1000',
    resultType: 'json',
    sgId: '20220601',
    sgTypecode,
    sdName: '서울특별시',  // 하드코딩
    wiwName,
  });

  const url = `${NEC_BASE}?${params}`;

  try {
    const response = await fetch(url);
    const json = await response.json();

    const items = json?.response?.body?.items?.item;
    const candidates = !items ? [] : Array.isArray(items) ? items : [items];

    return {
      success: true,  // INFO-00도 성공으로 처리
      items: candidates,
      statusCode: json?.response?.header?.resultCode,
      url
    };

  } catch (error) {
    console.log(`❌ 네트워크 오류: ${error.message}`);
    return { success: false, items: [], statusCode: 'NETWORK_ERROR', url };
  }
}

/**
 * 현재 데이터에서 선거구 정보 조회
 */
function getCurrentData(districtName, sidoName) {
  const dataPath = path.join(ROOT, 'src/data/static/local_council_results.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  // 8회 지방선거 데이터만 확인
  const key = `8_${sidoName.replace('특별시', '').replace('광역시', '').replace('특별자치시', '').replace('특별자치도', '')}_basic_${districtName}`;

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
 * 선거구 정수 분석 및 추천
 */
function analyzeQuota(officialCandidates, currentData) {
  const officialCount = officialCandidates.length;
  const currentElected = currentData ? currentData.candidates.filter(c => c.elected).length : 0;

  console.log(`\n📊 정수 분석 결과:`);
  console.log(`공식 당선자 수: ${officialCount}명`);
  console.log(`현재 데이터 당선자 수: ${currentElected}명`);

  if (officialCount === currentElected) {
    console.log(`✅ 일치: 선거구 정수가 올바르게 설정됨`);
    return { correct: true, recommendedQuota: officialCount };
  } else {
    console.log(`⚠️ 불일치: 수정 필요`);
    console.log(`추천 정수: ${officialCount}명`);
    return { correct: false, recommendedQuota: officialCount };
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  const args = process.argv.slice(2);
  let districtName = args[0];
  let sidoName = args[1] || '서울특별시';

  if (!districtName) {
    console.log('사용법: node scripts/verify-district-quota.mjs [선거구명] [시도명]');
    console.log('예시: node scripts/verify-district-quota.mjs "강서구가선거구" "서울특별시"');
    process.exit(1);
  }

  // 선거구명이 "구선거구" 형식이면 구 이름 추출
  let guName = districtName;
  if (districtName.includes('선거구')) {
    // "강서구가선거구" -> "강서구"
    const match = districtName.match(/^(.+구)[가-힣]*선거구$/);
    guName = match ? match[1] : districtName;
  }

  console.log(`🏛️ 선거구 정수 검증 시작`);
  console.log(`대상: ${sidoName} ${districtName} (구: ${guName})`);
  console.log(`선거: 제8회 전국동시지방선거\n`);

  // 1. 현재 데이터 확인
  const currentData = getCurrentData(districtName, sidoName);
  if (currentData) {
    console.log(`📁 현재 데이터 정보:`);
    console.log(`선거구: ${currentData.adm_nm}`);
    console.log(`유형: ${currentData.sub_type}`);
    const elected = currentData.candidates.filter(c => c.elected);
    console.log(`현재 당선자: ${elected.length}명`);
    elected.forEach(c => console.log(`  ✓ ${c.name} (${c.party}) ${c.votes}표`));
  } else {
    console.log(`⚠️ 현재 데이터에서 ${districtName} 정보를 찾을 수 없습니다.`);
  }

  // 2. API로 공식 데이터 조회 (구 단위)
  console.log(`🔍 API 호출: ${sidoName} ${guName}의 모든 선거구`);
  const apiResult = await fetchDistrictRows(guName, '6'); // 6 = 기초의원 지역구

  if (!apiResult.success) {
    console.log(`❌ API 조회 실패: ${apiResult.statusCode}`);
    return;
  }

  console.log(`📡 API 결과: ${apiResult.items.length}개 선거구 발견`);

  // 디버깅: 모든 선거구 목록 출력
  console.log(`\n📋 발견된 선거구 목록:`);
  apiResult.items.forEach(item => {
    const candidateFields = ['hbj01', 'hbj02', 'hbj03', 'hbj04', 'hbj05'];
    const candidates = candidateFields
      .map(key => item[key])
      .filter(name => name && name.trim());
    console.log(`  - ${item.wiwName}: ${candidates.join(', ')} (${candidates.length}명)`);
  });

  // 특정 선거구 찾기
  const targetDistrict = apiResult.items.find(item => item.wiwName === districtName);

  if (!targetDistrict) {
    console.log(`\n❌ ${districtName}을 찾을 수 없습니다.`);
    return;
  }

  // 당선자 정보 추출
  const candidateFields = ['hbj01', 'hbj02', 'hbj03', 'hbj04', 'hbj05'];
  const officialCandidates = candidateFields
    .map(key => targetDistrict[key])
    .filter(name => name && name.trim());

  console.log(`\n📊 공식 API 결과 (${districtName}):`);
  console.log(`당선자 수: ${officialCandidates.length}명`);
  officialCandidates.forEach((name, i) => {
    console.log(`  ${i+1}. ${name}`);
  });

  // 3. 정수 분석
  if (currentData) {
    const analysis = analyzeQuota(officialCandidates, currentData);

    if (!analysis.correct) {
      const key = `8_${sidoName.replace('특별시', '').replace('광역시', '').replace('특별자치시', '').replace('특별자치도', '')}_basic_${districtName}`;
      console.log(`\n🔧 수정 명령어:`);
      console.log(`# 1. electionQuotaMap.json에 추가`);
      console.log(`node -e "const fs = require('fs'); const map = JSON.parse(fs.readFileSync('src/data/electionQuotaMap.json', 'utf8')); map.quotas['${key}'] = ${analysis.recommendedQuota}; fs.writeFileSync('src/data/electionQuotaMap.json', JSON.stringify(map, null, 2)); console.log('✅ quota map 업데이트 완료');"`);
      console.log(`\n# 2. 변경사항 적용`);
      console.log(`node scripts/applyElectionQuotaMap.mjs`);
    }
  }
}

// 실행
main().catch(console.error);