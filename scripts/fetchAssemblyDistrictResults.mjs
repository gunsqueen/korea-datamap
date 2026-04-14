/**
 * 22대 국회의원선거 지역구별 결과 일괄 수집 스크립트
 *
 * NEC Open API (data.go.kr)에서 전체 254개 선거구 결과를 수집하여
 * src/data/static/assembly_district_results.json 에 저장합니다.
 *
 * 실행: node scripts/fetchAssemblyDistrictResults.mjs
 *
 * API 응답 구조:
 *   wiwName: 시군구명 (조회용)
 *   sggName: 선거구명 (강서구갑, 중구성동구갑 등) — cidx.d 와 일치
 *   hbj01, jd01, dugsu01 ... : 후보자 이름, 정당, 득표수
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const NEC_BASE = 'https://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2';
const SERVICE_KEY = 'fcfb6899040b2dc7f9c3bf04402834c6a83364a827417cad9d2052178fce7591';

const SG_TYPECODE = '2'; // 국회의원 지역구

const GEN_CONFIG = [
  { gen: '22', sgId: '20240410', label: '22대 총선 지역구', electionName: '제22대 국회의원선거', electionDate: '2024-04-10' },
  { gen: '21', sgId: '20200415', label: '21대 총선 지역구', electionName: '제21대 국회의원선거', electionDate: '2020-04-15' },
  { gen: '20', sgId: '20160413', label: '20대 총선 지역구', electionName: '제20대 국회의원선거', electionDate: '2016-04-13' },
  { gen: '19', sgId: '20120411', label: '19대 총선 지역구', electionName: '제19대 국회의원선거', electionDate: '2012-04-11' },
];

const SIDO_CODE_TO_NEC_NAME = {
  '11': '서울특별시',
  '21': '부산광역시',
  '22': '대구광역시',
  '23': '인천광역시',
  '24': '광주광역시',
  '25': '대전광역시',
  '26': '울산광역시',
  '29': '세종특별자치시',
  '31': '경기도',
  '32': '강원특별자치도',
  '33': '충청북도',
  '34': '충청남도',
  '35': '전북특별자치도',
  '36': '전라남도',
  '37': '경상북도',
  '38': '경상남도',
  '39': '제주특별자치도',
};

const SIDO_CODE_TO_SHORT = {
  '11': '서울', '21': '부산', '22': '대구', '23': '인천',
  '24': '광주', '25': '대전', '26': '울산', '29': '세종',
  '31': '경기', '32': '강원', '33': '충북', '34': '충남',
  '35': '전북', '36': '전남', '37': '경북', '38': '경남',
  '39': '제주',
};

const PARTY_COLORS = {
  '더불어민주당': '#004EA2',
  '국민의힘': '#C9151E',
  '조국혁신당': '#0055A5',
  '개혁신당': '#FF6400',
  '진보당': '#D6001C',
  '새로운미래': '#0095DA',
  '녹색정의당': '#00A650',
  '기본소득당': '#6ABF4B',
  '사회민주당': '#E8001C',
  '무소속': '#888888',
};

function getPartyColor(party) {
  for (const [k, v] of Object.entries(PARTY_COLORS)) {
    if (party.includes(k)) return v;
  }
  return '#888888';
}

// ── NEC API: 시도 전체 지역구 조회 (페이지네이션 포함) ────────
async function fetchSidoResults(sgId, sdName) {
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
      sgTypecode: SG_TYPECODE,
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

// ── NEC 항목 → ElectionData 변환 ─────────────────────────────
function parseItem(item, sigunguCd, districtNm, electionName, electionDate) {
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
  candidates.forEach((c, idx) => {
    c.rank = idx + 1;
    c.elected = idx === 0;
  });

  return {
    adm_cd: sigunguCd,
    adm_nm: districtNm,
    election_type: 'assembly',
    election_name: electionName,
    election_date: electionDate,
    sub_type: '지역구',
    total_voters: sunsu,
    total_votes: tusu,
    valid_votes: yutusu,
    invalid_votes: mutusu,
    turnout_rate: turnout,
    candidates,
  };
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  console.log('=== 국회의원 지역구 선거 결과 수집 (19~22대) ===\n');

  const cidx = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'src/data/static/cidx_assembly.json'), 'utf8'
  ));

  const outPath = path.join(ROOT, 'src/data/static/assembly_district_results.json');
  const results = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, 'utf8'))
    : {};

  let grandTotal = 0;
  let grandUnmatched = 0;

  for (const { gen, sgId, label, electionName, electionDate } of GEN_CONFIG) {
    console.log(`\n══ ${gen}대 총선 (${electionDate}) ══`);

    // sido코드 → { d → sigunguCd }
    const bySido = {};
    for (const c of cidx) {
      if (c.e !== label) continue;
      if (!bySido[c.rc]) bySido[c.rc] = {};
      if (!bySido[c.rc][c.d]) bySido[c.rc][c.d] = c.sc;
    }

    const totalDistricts = Object.values(bySido).reduce((s, m) => s + Object.keys(m).length, 0);
    console.log(`총 ${totalDistricts}개 지역구`);

    let genMatched = 0;
    let genUnmatched = 0;

    for (const [sidoCd, districtMap] of Object.entries(bySido)) {
      const sdName = SIDO_CODE_TO_NEC_NAME[sidoCd];
      const sidoShort = SIDO_CODE_TO_SHORT[sidoCd];
      if (!sdName) continue;

      const districtList = Object.keys(districtMap);

      // 이미 모두 있으면 건너뜀
      const missing = districtList.filter(d => !results[`${gen}_${sidoShort}_${d}`]);
      if (missing.length === 0) {
        genMatched += districtList.length;
        continue;
      }

      let items;
      try {
        items = await fetchSidoResults(sgId, sdName);
      } catch (err) {
        console.error(`  ❌ [${sdName}] ${err.message}`);
        genUnmatched += missing.length;
        continue;
      }

      const sggMap = {};
      for (const it of items) {
        const sgg = (it.sggName ?? '').trim();
        if (sgg) sggMap[sgg] = it;
      }

      const unmatched = [];
      for (const d of missing) {
        const item = sggMap[d];
        if (!item) { unmatched.push(d); genUnmatched++; continue; }
        results[`${gen}_${sidoShort}_${d}`] = parseItem(item, districtMap[d], d, electionName, electionDate);
        genMatched++;
      }
      genMatched += districtList.length - missing.length;

      if (unmatched.length) {
        console.log(`  [${sdName}] 미매핑: ${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? `...(${unmatched.length}개)` : ''}`);
      }

      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`${gen}대: ${genMatched}/${totalDistricts} 완료, 미매핑 ${genUnmatched}개`);
    grandTotal += genMatched;
    grandUnmatched += genUnmatched;
  }

  fs.writeFileSync(outPath, JSON.stringify(results));
  const size = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`\n✅ 저장 완료: ${outPath}`);
  console.log(`전체 ${grandTotal}개 매핑, ${grandUnmatched}개 미매핑, 파일 크기: ${size} KB`);
}

main().catch(err => {
  console.error('오류:', err);
  process.exit(1);
});
