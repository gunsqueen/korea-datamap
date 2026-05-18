/**
 * 모든 선거구를 검증하여 현재 당선인 수와 실제 정원의 차이를 분석
 * 정원 추정이 잘못된 선거구들을 자동으로 검출
 * 
 * 실행: node scripts/validateAllElectionQuotas.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/**
 * 후보자 득표 분석으로 실제 당선인 수 추정
 * (현재 inferQuota 로직과 동일)
 */
function inferQuota(candidates, subType) {
  const validCands = candidates.filter(c => c.votes > 0);
  if (validCands.length <= 1) return validCands.length || 1;

  // 광역의원: 항상 1인
  if (subType === '광역의원(지역구)') return 1;

  // 기초의원: 득표 갭 분석
  const votes = validCands.map(c => c.votes);
  let maxRatio = 1;
  let gapIdx = 0;

  for (let i = 0; i < votes.length - 1; i++) {
    const ratio = votes[i] / (votes[i + 1] || 1);
    if (ratio > maxRatio) {
      maxRatio = ratio;
      gapIdx = i + 1;
    }
  }

  const MIN_RATIO = 1.5;
  const MAX_QUOTA = 4;
  if (maxRatio < MIN_RATIO) return 1;
  return Math.min(gapIdx, MAX_QUOTA);
}

async function main() {
  console.log('🔍 전국 선거구 정원 검증 시작...\n');

  const resultsPath = path.join(ROOT, 'src/data/static/local_council_results.json');
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

  const issues = [];
  const corrected = [];
  let processed = 0;
  let totalIssues = 0;

  // 모든 선거구 순회
  for (const [key, result] of Object.entries(results)) {
    processed++;
    
    const candidates = result.candidates || [];
    const currentElected = candidates.filter(c => c.elected).length;
    const estimatedQuota = inferQuota(candidates, result.sub_type);
    
    // 기초의원(2~4인 선거구)만 검증 (광역의원은 항상 1인)
    if (result.sub_type !== '기초의원(지역구)') continue;
    
    // 문제 감지: 현재 당선인 수 != 추정 정원
    if (currentElected !== estimatedQuota) {
      // 득표를 보고 더 정확한 정원 추정
      let actualQuota = estimatedQuota;
      
      // 더 정교한 갭 분석: 모든 갭 계산
      const gaps = [];
      for (let i = 0; i < candidates.length - 1; i++) {
        const ratio = candidates[i].votes / (candidates[i + 1].votes || 1);
        gaps.push({ idx: i + 1, ratio });
      }
      gaps.sort((a, b) => b.ratio - a.ratio);
      
      // 상위 3개 갭 출력
      const topGaps = gaps.slice(0, 3).map(g => `${g.idx}번째(${g.ratio.toFixed(2)}배)`).join(', ');
      
      const issue = {
        key,
        district: result.adm_nm,
        generation: key.split('_')[0],
        city: key.split('_')[1],
        currentElected,
        estimatedQuota,
        numCandidates: candidates.length,
        topCandidates: candidates.slice(0, estimatedQuota + 2).map(c => 
          `${c.rank}. ${c.name} (${c.votes}표)`
        ),
        topGaps,
      };
      
      issues.push(issue);
      totalIssues++;
    }
  }

  // 결과 출력
  console.log(`📊 검증 완료: ${processed}개 선거구 검사\n`);
  console.log(`⚠️  문제 감지: ${totalIssues}개 선거구\n`);

  // 지역별/회차별로 정렬
  const byGenerationCity = {};
  issues.forEach(issue => {
    const key = `${issue.generation}회_${issue.city}`;
    if (!byGenerationCity[key]) byGenerationCity[key] = [];
    byGenerationCity[key].push(issue);
  });

  // 상위 문제 선거구 출력
  Object.entries(byGenerationCity).forEach(([key, districtIssues]) => {
    console.log(`\n🔴 ${key} (${districtIssues.length}개):`);
    districtIssues.slice(0, 5).forEach(issue => {
      console.log(`   📍 ${issue.district}`);
      console.log(`      현재: ${issue.currentElected}명, 추정: ${issue.estimatedQuota}명, 후보: ${issue.numCandidates}명`);
      console.log(`      상위 갭: ${issue.topGaps}`);
      issue.topCandidates.forEach(c => console.log(`        ${c}`));
    });
    if (districtIssues.length > 5) {
      console.log(`   ... 외 ${districtIssues.length - 5}개`);
    }
  });

  // 회차별 통계
  console.log('\n\n📈 회차별 문제 선거구 통계:');
  const byGen = {};
  issues.forEach(i => {
    if (!byGen[i.generation]) byGen[i.generation] = { count: 0, cities: {} };
    byGen[i.generation].count++;
    if (!byGen[i.generation].cities[i.city]) byGen[i.generation].cities[i.city] = 0;
    byGen[i.generation].cities[i.city]++;
  });
  
  Object.entries(byGen).sort().forEach(([gen, data]) => {
    const cityStr = Object.entries(data.cities)
      .map(([city, count]) => `${city}(${count})`)
      .join(', ');
    console.log(`   ${gen}회: ${data.count}개 (${cityStr})`);
  });

  // CSV export
  const csvPath = path.join(ROOT, 'election-quota-issues.csv');
  const csvLines = [
    'generation,city,district,key,currentElected,estimatedQuota,numCandidates',
    ...issues.map(i => 
      `${i.generation},${i.city},"${i.district}",${i.key},${i.currentElected},${i.estimatedQuota},${i.numCandidates}`
    ),
  ];
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`\n✅ CSV 저장: election-quota-issues.csv (Excel에서 열기 가능)`);
}

main().catch(err => {
  console.error('❌ 오류:', err.message);
  process.exit(1);
});
