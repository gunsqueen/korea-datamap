/**
 * 제8회 지방선거 전국 기초의원 선거구 자동 검증 스크립트
 * 현재 데이터의 패턴을 분석하여 의심스러운 선거구들을 식별
 *
 * 실행: node scripts/verify-all-basic-districts.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/**
 * 선거구 정원 추정 알고리즘 (개선된 버전)
 */
function estimateQuota(candidates, districtName) {
  const validCands = candidates.filter(c => c.votes > 0);
  if (validCands.length <= 1) return validCands.length || 1;

  const votes = validCands.map(c => c.votes).sort((a, b) => b - a);
  const totalVotes = votes.reduce((a, b) => a + b, 0);

  // 1. 득표율 기반 분석
  const top3Percentage = votes.slice(0, 3).reduce((a, b) => a + b, 0) / totalVotes;

  // 2. 득표 갭 분석
  let maxGapRatio = 1;
  for (let i = 0; i < Math.min(votes.length - 1, 4); i++) {
    const ratio = votes[i] / votes[i + 1];
    if (ratio > maxGapRatio) maxGapRatio = ratio;
  }

  // 3. 경쟁 강도 분석
  let competitionScore = 0;
  if (votes.length >= 4) {
    const top3 = votes.slice(0, 3);
    const mean = top3.reduce((a, b) => a + b, 0) / 3;
    const variance = top3.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / 3;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean; // 변동계수

    if (cv < 0.15 && maxGapRatio > 1.8) {
      competitionScore = 3; // 3인 선거구로 강력 의심
    }
  }

  // 종합 판단
  if (competitionScore === 3) return 3;
  if (top3Percentage > 0.75) return 3;
  if (top3Percentage > 0.6 && maxGapRatio > 1.5) return 3;

  return Math.min(4, Math.max(2, Math.round(top3Percentage * 5)));
}

/**
 * 선거구 검증 결과 분류
 */
function classifyDistrict(candidates, currentElected, estimatedQuota, districtName) {
  const electedCount = currentElected.length;

  // 특수 케이스: 1인 선거구
  if (electedCount === 1) return 'normal';

  // 정상 케이스
  if (Math.abs(electedCount - estimatedQuota) <= 1) return 'normal';

  // 주의 케이스: 추정치와 2명 차이
  if (Math.abs(electedCount - estimatedQuota) === 2) return 'warning';

  // 수정 필요: 추정치와 2명 이상 차이
  if (Math.abs(electedCount - estimatedQuota) > 2) return 'needs_fix';

  // 기타 의심 케이스
  return 'needs_check';
}

/**
 * 메인 검증 함수
 */
function verifyAllBasicDistricts() {
  console.log('🏛️ 제8회 지방선거 전국 기초의원 선거구 검증 시작\n');

  const dataPath = path.join(ROOT, 'src/data/static/local_council_results.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  const results = {
    summary: {
      total: 0,
      normal: 0,
      warning: 0,
      needs_fix: 0,
      needs_check: 0
    },
    details: {
      normal: [],
      warning: [],
      needs_fix: [],
      needs_check: []
    }
  };

  // 8회 지방선거 기초의원만 필터링
  const basicDistricts = Object.keys(data).filter(key =>
    key.includes('8_') && key.includes('_basic_')
  );

  results.summary.total = basicDistricts.length;

  console.log(`총 검증 대상: ${results.summary.total}개 선거구\n`);

  // 각 선거구 검증
  basicDistricts.forEach(key => {
    const result = data[key];
    const candidates = result.candidates || [];
    const elected = candidates.filter(c => c.elected);
    const estimatedQuota = estimateQuota(candidates, result.adm_nm);

    const classification = classifyDistrict(candidates, elected, estimatedQuota, result.adm_nm);

    // 결과 저장
    results.summary[classification.replace('_', '')]++;
    results.details[classification.replace('_', '')].push({
      key,
      district: result.adm_nm,
      currentElected: elected.length,
      estimatedQuota,
      difference: Math.abs(elected.length - estimatedQuota),
      candidates: candidates.length,
      top3Percentage: candidates.length >= 3 ?
        (candidates.slice(0, 3).reduce((sum, c) => sum + c.votes, 0) /
         candidates.reduce((sum, c) => sum + c.votes, 0) * 100).toFixed(1) : 'N/A'
    });
  });

  // 결과 출력
  console.log('📊 검증 결과 요약:');
  console.log(`✅ 정상: ${results.summary.normal}개`);
  console.log(`⚠️  주의: ${results.summary.warning}개`);
  console.log(`🔴 수정필요: ${results.summary.needs_fix}개`);
  console.log(`❓ 확인필요: ${results.summary.needs_check}개\n`);

  // 수정이 필요한 선거구들 상세 출력
  if (results.details.needs_fix.length > 0) {
    console.log('🔴 수정이 필요한 선거구들:');
    results.details.needs_fix
      .sort((a, b) => b.difference - a.difference)
      .slice(0, 20) // 상위 20개만
      .forEach(item => {
        console.log(`  ${item.district}: ${item.currentElected}명 → ${item.estimatedQuota}명 (차이: ${item.difference}명)`);
      });

    if (results.details.needs_fix.length > 20) {
      console.log(`  ... 외 ${results.details.needs_fix.length - 20}개`);
    }
    console.log();
  }

  // 확인이 필요한 선거구들
  if (results.details.needs_check.length > 0) {
    console.log('❓ 확인이 필요한 선거구들:');
    results.details.needs_check.slice(0, 10).forEach(item => {
      console.log(`  ${item.district}: ${item.currentElected}명 (추정: ${item.estimatedQuota}명)`);
    });
    console.log();
  }

  // 결과 파일 저장
  const outputPath = path.join(ROOT, 'district-verification-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`📄 상세 결과가 ${outputPath}에 저장되었습니다.`);

  return results;
}

// 실행
const results = verifyAllBasicDistricts();

// 수정 명령어 생성
if (results.details.needs_fix.length > 0) {
  console.log('🔧 자동 수정 명령어 생성:');
  console.log('node -e "');
  console.log('const fs = require(\'fs\');');
  console.log('const map = JSON.parse(fs.readFileSync(\'src/data/electionQuotaMap.json\', \'utf8\'));');

  results.details.needs_fix.slice(0, 10).forEach(item => {
    console.log(`map.quotas['${item.key}'] = ${item.estimatedQuota};`);
  });

  console.log('fs.writeFileSync(\'src/data/electionQuotaMap.json\', JSON.stringify(map, null, 2));');
  console.log('console.log(\'✅ quota map 업데이트 완료\');');
  console.log('"');

  console.log('\n# 적용:');
  console.log('node scripts/applyElectionQuotaMap.mjs');
}