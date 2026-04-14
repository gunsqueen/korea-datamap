/**
 * 6~8회 지방선거 광역의원/기초의원 지역구별 결과 일괄 수집
 *
 * NEC Open API 에서 전체 세부선거구(종로구제1선거구, 종로구가선거구 등)
 * 단위 결과를 수집하여 src/data/static/local_council_results.json 에 저장합니다.
 *
 * 실행: node scripts/fetchLocalCouncilResults.mjs
 *
 * 키 형식:
 *   "{gen}_{sidoShort}_council_{districtName}"  (광역의원 지역구, sgTypecode=5)
 *   "{gen}_{sidoShort}_basic_{districtName}"    (기초의원 지역구,   sgTypecode=6)
 *   예: "8_서울_council_종로구제1선거구", "8_서울_basic_종로구가선거구"
 *
 * cidx 의 d 필드와 정확히 일치하는 sggName 을 사용하여 매칭합니다.
 * wiwName==='합계' 인 행만 사용하여 중복을 제거합니다.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const NEC_BASE = 'https://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2';
const SERVICE_KEY = 'fcfb6899040b2dc7f9c3bf04402834c6a83364a827417cad9d2052178fce7591';

const GEN_CONFIG = [
  { gen: '8', sgId: '20220601', electionDate: '2022-06-01' },
  { gen: '7', sgId: '20180613', electionDate: '2018-06-13' },
  { gen: '6', sgId: '20140604', electionDate: '2014-06-04' },
];

const SUBTYPE_CONFIG = [
  {
    key: 'council',
    sgTypecode: '5',
    cidxFile: 'cidx_local_high.json',
    labelPrefix: (gen) => `${gen}회 지방선거 광역의원(지역구)`,
    subType: '광역의원(지역구)',
  },
  {
    key: 'basic',
    sgTypecode: '6',
    cidxFile: 'cidx_local_basic.json',
    labelPrefix: (gen) => `${gen}회 지방선거 기초의원(지역구)`,
    subType: '기초의원(지역구)',
  },
];

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

// 세종/제주는 광역의원 지역구 데이터가 없을 수 있음
const PARTY_COLORS = {
  '더불어민주당': '#004EA2',
  '민주당': '#004EA2',
  '새정치민주연합': '#004EA2',
  '국민의힘': '#C9151E',
  '자유한국당': '#C9151E',
  '새누리당': '#C9151E',
  '정의당': '#FFCC00',
  '진보당': '#D6001C',
  '조국혁신당': '#0055A5',
  '개혁신당': '#FF6400',
  '무소속': '#888888',
};

function getPartyColor(party) {
  for (const [k, v] of Object.entries(PARTY_COLORS)) {
    if (party.includes(k)) return v;
  }
  return '#888888';
}

async function fetchSidoResults(sgId, sgTypecode, sdName) {
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
    const url = `${NEC_BASE}/getXmntckSttusInfoInqire?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const code = json?.response?.header?.resultCode;
    if (code !== 'INFO-00') throw new Error(`NEC error ${code}`);

    const rawItems = json?.response?.body?.items?.item;
    const items = !rawItems ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];
    allItems = allItems.concat(items);

    const totalCount = Number(json?.response?.body?.totalCount ?? 0);
    if (allItems.length >= totalCount || items.length < PAGE_SIZE) break;
    pageNo++;
  }
  return allItems;
}

/**
 * 후보자 득표 분포로 당선인 수(정원) 추정
 * NEC API에 당선여부 필드가 없어 갭 분석으로 추정.
 *
 * 규칙:
 * 1. 광역의원(council) → 1인 선거구 (항상 1명)
 * 2. 기초의원(basic) → 연속 후보 사이의 최대 득표 비율 갭 위치로 정원 추정
 *    - 갭 비율 threshold: 1.5배 이상이면 그 위치에서 자름
 *    - 최대 정원: 4명
 * 3. 무투표당선(후보 = 1명)은 1명 당선
 */
function inferQuota(candidates, subType) {
  const validCands = candidates.filter(c => c.votes > 0);
  if (validCands.length <= 1) return validCands.length || 1;

  // 광역의원은 항상 1인 선거구
  if (subType === '광역의원(지역구)') return 1;

  // 기초의원: 득표 갭 분석
  const votes = validCands.map(c => c.votes);
  let maxRatio = 1;
  let gapIdx = 0;

  for (let i = 0; i < votes.length - 1; i++) {
    const ratio = votes[i] / (votes[i + 1] || 1);
    if (ratio > maxRatio) {
      maxRatio = ratio;
      gapIdx = i + 1; // gap 이후 첫 번째 낙선 인덱스
    }
  }

  // threshold: 1.5배 미만이면 모든 후보가 거의 동점 → 1명으로 보수적 처리
  const MIN_RATIO = 1.5;
  const MAX_QUOTA = 4;

  if (maxRatio < MIN_RATIO) return 1;
  return Math.min(gapIdx, MAX_QUOTA);
}

function parseItem(item, sigunguCd, districtNm, electionName, electionDate, subType, quotaMap, quotaKey) {
  const sunsu = Number(item.sunsu ?? 0);
  const tusu = Number(item.tusu ?? 0);
  const yutusu = Number(item.yutusu ?? 0);
  const mutusu = Number(item.mutusu ?? 0);
  const turnout = sunsu > 0 ? Math.round((tusu / sunsu) * 10000) / 100 : 0;

  const candidates = [];
  for (let i = 1; i <= 50; i++) {
    const key = String(i).padStart(2, '0');
    const name = (item[`hbj${key}`] ?? '').trim();
    const party = (item[`jd${key}`] ?? '').trim();
    const votes = Number(item[`dugsu${key}`] ?? 0);
    if (!name && !party) break;
    candidates.push({
      name: name || party,
      party,
      party_color: getPartyColor(party),
      votes,
      vote_rate: yutusu > 0 ? Math.round((votes / yutusu) * 10000) / 100 : 0,
      rank: 0,
      elected: false,
    });
  }
  candidates.sort((a, b) => b.votes - a.votes);
  candidates.forEach((c, idx) => { c.rank = idx + 1; });

  // 당선인 수 결정
  // 1. 먼저 electionQuotaMap에서 정적 정원 조회
  // 2. 없으면 휴리스틱 추정(inferQuota)
  let quota = quotaMap.quotas[quotaKey] || inferQuota(candidates, subType);
  candidates.forEach((c, idx) => { c.elected = idx < quota; });

  return {
    adm_cd: sigunguCd,
    adm_nm: districtNm,
    election_type: 'local',
    election_name: electionName,
    election_date: electionDate,
    sub_type: subType,
    total_voters: sunsu,
    total_votes: tusu,
    valid_votes: yutusu,
    invalid_votes: mutusu,
    turnout_rate: turnout,
    candidates,
  };
}

async function main() {
  console.log('=== 지방선거 광역의원/기초의원 지역구 결과 수집 (6~8회) ===\n');

  // 선거구별 정원 매핑 로드
  const quotaMap = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'src/data/electionQuotaMap.json'), 'utf8'
  ));
  console.log(`✓ 정원 매핑 로드: ${Object.keys(quotaMap.quotas).length}개 선거구\n`);

  const outPath = path.join(ROOT, 'src/data/static/local_council_results.json');
  const results = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, 'utf8'))
    : {};

  let grandTotal = 0;
  let grandUnmatched = 0;

  for (const sub of SUBTYPE_CONFIG) {
    const cidx = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'src/data/static', sub.cidxFile), 'utf8'
    ));

    for (const { gen, sgId, electionDate } of GEN_CONFIG) {
      const label = sub.labelPrefix(gen);
      const electionName = `제${gen}회 전국동시지방선거`;
      console.log(`\n══ ${label} (${electionDate}) ══`);

      // sidoCd → { d → sigunguCd }
      const bySido = {};
      for (const c of cidx) {
        if (c.e !== label) continue;
        if (!bySido[c.rc]) bySido[c.rc] = {};
        if (!bySido[c.rc][c.d]) bySido[c.rc][c.d] = c.sc;
      }

      const totalDistricts = Object.values(bySido).reduce((s, m) => s + Object.keys(m).length, 0);
      console.log(`총 ${totalDistricts}개 세부선거구`);

      let matched = 0;
      let unmatched = 0;

      for (const [sidoCd, districtMap] of Object.entries(bySido)) {
        const sdName = SIDO_CODE_TO_NEC_NAME[sidoCd];
        const sidoShort = SIDO_CODE_TO_SHORT[sidoCd];
        if (!sdName) continue;

        const districtList = Object.keys(districtMap);
        const keyPrefix = `${gen}_${sidoShort}_${sub.key}_`;
        const missing = districtList.filter(d => !results[`${keyPrefix}${d}`]);
        if (missing.length === 0) {
          matched += districtList.length;
          continue;
        }

        let items;
        try {
          items = await fetchSidoResults(sgId, sub.sgTypecode, sdName);
        } catch (err) {
          console.error(`  ❌ [${sdName}] ${err.message}`);
          unmatched += missing.length;
          continue;
        }

        const sggMap = {};
        for (const it of items) {
          const sgg = (it.sggName ?? '').trim();
          const wiw = (it.wiwName ?? '').trim();
          if (sgg && wiw === '합계') sggMap[sgg] = it;
        }

        const localUnmatched = [];
        for (const d of missing) {
          const item = sggMap[d];
          if (!item) { localUnmatched.push(d); unmatched++; continue; }
          const quotaKey = `${gen}_${sidoShort}_${sub.key}_${d}`;
          results[`${keyPrefix}${d}`] = parseItem(
            item, districtMap[d], d, electionName, electionDate, sub.subType, quotaMap, quotaKey
          );
          matched++;
        }
        matched += districtList.length - missing.length;

        if (localUnmatched.length) {
          console.log(`  [${sdName}] 미매핑: ${localUnmatched.slice(0, 3).join(', ')}${localUnmatched.length > 3 ? `...(${localUnmatched.length}개)` : ''}`);
        }

        await new Promise(r => setTimeout(r, 200));
      }

      console.log(`${gen}회 ${sub.key}: ${matched}/${totalDistricts} 완료, 미매핑 ${unmatched}개`);
      grandTotal += matched;
      grandUnmatched += unmatched;

      // 중간 저장 (중단 시 복구)
      fs.writeFileSync(outPath, JSON.stringify(results));
    }
  }

  const size = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`\n✅ 저장 완료: ${outPath}`);
  console.log(`전체 ${grandTotal}개 매핑, ${grandUnmatched}개 미매핑, 파일 크기: ${size} KB`);
}

main().catch(err => {
  console.error('오류:', err);
  process.exit(1);
});
