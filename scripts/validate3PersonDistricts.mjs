/**
 * 3인 선거구인데 4인으로 표시되는 지역을 정확히 검증
 * 실제 선거구 정원을 더 정확히 추정하는 알고리즘 사용
 *
 * 실행: node scripts/validate3PersonDistricts.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/**
 * 더 정교한 선거구 정원 추정 알고리즘
 * 1. 득표 갭 분석 (기존)
 * 2. 실제 당선인 수 역추정 (새로운 방법)
 * 3. 경쟁 강도 분석
 */
function estimateQuotaAdvanced(candidates, subType) {
  const validCands = candidates.filter(c => c.votes > 0);
  if (validCands.length <= 1) return validCands.length || 1;

  // 광역의원: 항상 1인
  if (subType === '광역의원(지역구)') return 1;

  // 기초의원: 다중 분석
  const votes = validCands.map(c => c.votes);

  // 방법 1: 득표 갭 분석 (기존)
  let maxGap = 1;
  let gapIdx = 0;
  for (let i = 0; i < votes.length - 1; i++) {
    const ratio = votes[i] / (votes[i + 1] || 1);
    if (ratio > maxGap) {
      maxGap = ratio;
      gapIdx = i + 1;
    }
  }

  // 방법 2: 경쟁 강도 기반 추정
  // 3인 선거구의 특징: 상위 3명의 득표가 비슷하고 4번째부터 급락
  let competitionScore = 0;
  if (votes.length >= 4) {
    // 상위 3명의 표준편차가 작고, 3-4순위 간 갭이 큰 경우 3인 선거구
    const top3 = votes.slice(0, 3);
    const mean = top3.reduce((a, b) => a + b, 0) / 3;
    const variance = top3.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / 3;
    const stdDev = Math.sqrt(variance);
    const competitionRatio = stdDev / mean; // 변동계수

    const gap34 = votes[2] / (votes[3] || 1);

    // 경쟁이 치열하고(변동계수 < 0.15) 3-4순위 갭이 큰 경우(> 1.8배)
    if (competitionRatio < 0.15 && gap34 > 1.8) {
      competitionScore = 3;
    }
  }

  // 방법 3: 득표율 기반 추정
  // 3인 선거구: 상위 3명의 득표율 합계가 60-80% 정도
  const totalVotes = votes.reduce((a, b) => a + b, 0);
  const top3Percentage = votes.slice(0, 3).reduce((a, b) => a + b, 0) / totalVotes;

  let percentageBasedQuota = 1;
  if (top3Percentage > 0.75) percentageBasedQuota = 3;
  else if (top3Percentage > 0.6) percentageBasedQuota = Math.min(4, Math.max(2, Math.round(top3Percentage * 5)));

  // 종합 판단
  const gapBasedQuota = Math.min(gapIdx, 4);
  const finalQuota = competitionScore || percentageBasedQuota || gapBasedQuota;

  return Math.min(finalQuota, 4);
}

async function main() {
  console.log('🔍 3인 선거구 정확 검증 시작...\n');

  const resultsPath = path.join(ROOT, 'src/data/static/local_council_results.json');
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

  const potential3PersonDistricts = [];
  let processed = 0;

  // 모든 기초의원 선거구 검증
  for (const [key, result] of Object.entries(results)) {
    processed++;

    if (result.sub_type !== '기초의원(지역구)') continue;

    const candidates = result.candidates || [];
    const currentElected = candidates.filter(c => c.elected).length;
    const advancedQuota = estimateQuotaAdvanced(candidates, result.sub_type);

    // 3인 선거구로 의심되는 경우들
    const isPotential3Person = (
      // 현재 4인인데 3인으로 추정되는 경우
      (currentElected === 4 && advancedQuota === 3) ||
      // 득표 패턴으로 3인 선거구로 보이는 경우
      (candidates.length >= 4 && (() => {
        const votes = candidates.map(c => c.votes);
        const total = votes.reduce((a, b) => a + b, 0);
        const top3Pct = votes.slice(0, 3).reduce((a, b) => a + b, 0) / total;
        const gap34 = votes[2] / (votes[3] || 1);
        return top3Pct > 0.7 && gap34 > 1.5;
      })())
    );

    if (isPotential3Person) {
      potential3PersonDistricts.push({
        key,
        district: result.adm_nm,
        generation: key.split('_')[0],
        city: key.split('_')[1],
        currentElected,
        advancedQuota,
        numCandidates: candidates.length,
        top3Percentage: (() => {
          const votes = candidates.map(c => c.votes);
          const total = votes.reduce((a, b) => a + b, 0);
          return Math.round(votes.slice(0, 3).reduce((a, b) => a + b, 0) / total * 100);
        })(),
        gap34: (() => {
          const votes = candidates.map(c => c.votes);
          return votes.length >= 4 ? Math.round(votes[2] / (votes[3] || 1) * 100) / 100 : 0;
        })(),
        topCandidates: candidates.slice(0, 5).map(c =>
          `${c.rank}. ${c.name} (${c.votes}표)`
        ),
      });
    }
  }

  console.log(`📊 검증 완료: ${processed}개 선거구 중 ${potential3PersonDistricts.length}개 잠재적 3인 선거구 발견\n`);

  // 지역별 그룹화
  const byGenerationCity = {};
  potential3PersonDistricts.forEach(item => {
    const key = `${item.generation}회_${item.city}`;
    if (!byGenerationCity[key]) byGenerationCity[key] = [];
    byGenerationCity[key].push(item);
  });

  // 결과 출력
  Object.entries(byGenerationCity).forEach(([key, districts]) => {
    console.log(`\n🔴 ${key} (${districts.length}개):`);
    districts.slice(0, 10).forEach(item => {
      console.log(`   📍 ${item.district}`);
      console.log(`      현재: ${item.currentElected}명, 고급추정: ${item.advancedQuota}명, 후보: ${item.numCandidates}명`);
      console.log(`      상위3 득표율: ${item.top3Percentage}%, 3-4순위 갭: ${item.gap34}배`);
      item.topCandidates.forEach(c => console.log(`        ${c}`));
    });
    if (districts.length > 10) {
      console.log(`   ... 외 ${districts.length - 10}개`);
    }
  });

  // CSV export
  const csvPath = path.join(ROOT, 'potential-3person-districts.csv');
  const csvLines = [
    'generation,city,district,key,currentElected,advancedQuota,numCandidates,top3Percentage,gap34',
    ...potential3PersonDistricts.map(i =>
      `${i.generation},${i.city},"${i.district}",${i.key},${i.currentElected},${i.advancedQuota},${i.numCandidates},${i.top3Percentage},${i.gap34}`
    ),
  ];
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`\n✅ CSV 저장: potential-3person-districts.csv`);

  // electionQuotaMap에 추가할 항목들 출력
  console.log('\n📝 electionQuotaMap.json에 추가할 항목들:');
  potential3PersonDistricts.forEach(item => {
    if (item.currentElected === 4 && item.advancedQuota === 3) {
      console.log(`   "${item.key}": 3,`);
    }
  });
}

main().catch(err => {
  console.error('❌ 오류:', err.message);
  process.exit(1);
});
