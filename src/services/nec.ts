/**
 * 중앙선거관리위원회 투·개표 정보 Open API
 * https://www.data.go.kr/data/15000900/openapi.do
 */
import type { ElectionData, Candidate } from '../types';
import {
  attachElectionDebugMeta,
  ElectionLookupError,
  logElectionDecision,
} from './electionDebug';

const NEC_BASE = 'https://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2';
const SERVICE_KEY = 'fcfb6899040b2dc7f9c3bf04402834c6a83364a827417cad9d2052178fce7591';

// ── 선거 ID → NEC 파라미터 매핑 ──────────────────────────────
interface NecElectionParam {
  sgId: string;         // 선거일 (YYYYMMDD)
  sgTypecode: string;   // 선거종류코드
  sgTypecodeLocal?: string; // 시도지사/구시군장 분기용
}

const ELECTION_MAP: Record<string, NecElectionParam> = {
  presidential_21: { sgId: '20250603', sgTypecode: '1' },
  presidential_20: { sgId: '20220309', sgTypecode: '1' },
  presidential_19: { sgId: '20170509', sgTypecode: '1' },
  presidential_18: { sgId: '20121219', sgTypecode: '1' },
  assembly_22_district: { sgId: '20240410', sgTypecode: '2' },
  assembly_22_pr:       { sgId: '20240410', sgTypecode: '7' },
  assembly_21_district: { sgId: '20200415', sgTypecode: '2' },
  assembly_21_pr:       { sgId: '20200415', sgTypecode: '7' },
  assembly_20_district: { sgId: '20160413', sgTypecode: '2' },
  assembly_20_pr:       { sgId: '20160413', sgTypecode: '7' },
  assembly_19_district: { sgId: '20120411', sgTypecode: '2' },
  assembly_19_pr:       { sgId: '20120411', sgTypecode: '7' },
  local_8_metro_mayor:      { sgId: '20220601', sgTypecode: '3' },
  local_8_mayor:            { sgId: '20220601', sgTypecode: '3', sgTypecodeLocal: '4' },
  local_8_council_district: { sgId: '20220601', sgTypecode: '5' },
  local_8_council_pr:       { sgId: '20220601', sgTypecode: '8' },
  local_8_basic_district:   { sgId: '20220601', sgTypecode: '6' },
  local_8_basic_pr:         { sgId: '20220601', sgTypecode: '9' },
  local_7_metro_mayor:      { sgId: '20180613', sgTypecode: '3' },
  local_7_mayor:            { sgId: '20180613', sgTypecode: '3', sgTypecodeLocal: '4' },
  local_7_council_district: { sgId: '20180613', sgTypecode: '5' },
  local_7_council_pr:       { sgId: '20180613', sgTypecode: '8' },
  local_7_basic_district:   { sgId: '20180613', sgTypecode: '6' },
  local_7_basic_pr:         { sgId: '20180613', sgTypecode: '9' },
  local_6_metro_mayor:      { sgId: '20140604', sgTypecode: '3' },
  local_6_mayor:            { sgId: '20140604', sgTypecode: '3', sgTypecodeLocal: '4' },
  local_6_council_district: { sgId: '20140604', sgTypecode: '5' },
  local_6_council_pr:       { sgId: '20140604', sgTypecode: '8' },
  local_6_basic_district:   { sgId: '20140604', sgTypecode: '6' },
  local_6_basic_pr:         { sgId: '20140604', sgTypecode: '9' },
};

// ── 행정코드 → NEC 지역명 매핑 ──────────────────────────────
const SIDO_NAME: Record<string, string> = {
  '11': '서울특별시', '21': '부산광역시', '22': '대구광역시',
  '23': '인천광역시', '24': '광주광역시', '25': '대전광역시',
  '26': '울산광역시', '29': '세종특별자치시', '31': '경기도',
  '32': '강원특별자치도', '33': '충청북도', '34': '충청남도',
  '35': '전북특별자치도', '36': '전라남도', '37': '경상북도',
  '38': '경상남도', '39': '제주특별자치도',
};

// 과거 선거에서 사용된 시도명 (강원도→강원특별자치도, 전북→전북특별자치도)
const SIDO_NAME_ALIASES: Record<string, string[]> = {
  '32': ['강원특별자치도', '강원도'],
  '35': ['전북특별자치도', '전라북도'],
};

const SIGUNGU_NAME: Record<string, string> = {
  // 서울
  '11010': '종로구', '11020': '중구', '11030': '용산구', '11040': '성동구',
  '11050': '광진구', '11060': '동대문구', '11070': '중랑구', '11080': '성북구',
  '11090': '강북구', '11100': '도봉구', '11110': '노원구', '11120': '은평구',
  '11130': '서대문구', '11140': '마포구', '11150': '양천구', '11160': '강서구',
  '11170': '구로구', '11180': '금천구', '11190': '영등포구', '11200': '동작구',
  '11210': '관악구', '11220': '서초구', '11230': '강남구', '11240': '송파구',
  '11250': '강동구',
  // 부산
  '21010': '중구', '21020': '서구', '21030': '동구', '21040': '영도구',
  '21050': '부산진구', '21060': '동래구', '21070': '남구', '21080': '북구',
  '21090': '해운대구', '21100': '사하구', '21110': '금정구', '21120': '강서구',
  '21130': '연제구', '21140': '수영구', '21150': '사상구', '21510': '기장군',
  // 대구
  '22010': '중구', '22020': '동구', '22030': '서구', '22040': '남구',
  '22050': '북구', '22060': '수성구', '22070': '달서구', '22510': '달성군',
  '22520': '군위군',
  // 인천
  '23010': '중구', '23020': '동구', '23040': '연수구', '23050': '남동구',
  '23060': '부평구', '23070': '계양구', '23080': '서구', '23090': '미추홀구',
  '23510': '강화군', '23520': '옹진군',
  // 광주
  '24010': '동구', '24020': '서구', '24030': '남구', '24040': '북구', '24050': '광산구',
  // 대전
  '25010': '동구', '25020': '중구', '25030': '서구', '25040': '유성구', '25050': '대덕구',
  // 울산
  '26010': '중구', '26020': '남구', '26030': '동구', '26040': '북구', '26510': '울주군',
  // 세종
  '29010': '세종특별자치시',
  // 경기
  '31011': '장안구', '31012': '권선구', '31013': '팔달구', '31014': '영통구',
  '31021': '수정구', '31022': '중원구', '31023': '분당구',
  '31030': '의정부시', '31041': '만안구', '31042': '동안구',
  '31051': '원미구', '31052': '소사구', '31053': '오정구',
  '31060': '광명시', '31070': '평택시', '31080': '동두천시',
  '31091': '상록구', '31092': '단원구',
  '31101': '덕양구', '31103': '일산동구', '31104': '일산서구',
  '31110': '과천시', '31120': '구리시', '31130': '남양주시', '31140': '오산시',
  '31150': '시흥시', '31160': '군포시', '31170': '의왕시', '31180': '하남시',
  '31191': '처인구', '31192': '기흥구', '31193': '수지구',
  '31200': '파주시', '31210': '이천시', '31220': '안성시', '31230': '김포시',
  '31240': '화성시', '31250': '광주시', '31260': '양주시', '31270': '포천시',
  '31280': '여주시', '31550': '연천군', '31570': '가평군', '31580': '양평군',
  // 강원
  '32010': '춘천시', '32020': '원주시', '32030': '강릉시', '32040': '동해시',
  '32050': '태백시', '32060': '속초시', '32070': '삼척시',
  '32510': '홍천군', '32520': '횡성군', '32530': '영월군', '32540': '평창군',
  '32550': '정선군', '32560': '철원군', '32570': '화천군', '32580': '양구군',
  '32590': '인제군', '32600': '고성군', '32610': '양양군',
  // 충북
  '33020': '충주시', '33030': '제천시',
  '33041': '상당구', '33042': '서원구', '33043': '흥덕구', '33044': '청원구',
  '33520': '보은군', '33530': '옥천군', '33540': '영동군', '33550': '진천군',
  '33560': '괴산군', '33570': '음성군', '33580': '단양군', '33590': '증평군',
  // 충남
  '34011': '동남구', '34012': '서북구',
  '34020': '공주시', '34030': '보령시', '34040': '아산시', '34050': '서산시',
  '34060': '논산시', '34070': '계룡시', '34080': '당진시',
  '34510': '금산군', '34530': '부여군', '34540': '서천군', '34550': '청양군',
  '34560': '홍성군', '34570': '예산군', '34580': '태안군',
  // 전북
  '35011': '완산구', '35012': '덕진구',
  '35020': '군산시', '35030': '익산시', '35040': '정읍시', '35050': '남원시',
  '35060': '김제시', '35510': '완주군', '35520': '진안군', '35530': '무주군',
  '35540': '장수군', '35550': '임실군', '35560': '순창군', '35570': '고창군',
  '35580': '부안군',
  // 전남
  '36010': '목포시', '36020': '여수시', '36030': '순천시', '36040': '나주시',
  '36060': '광양시', '36510': '담양군', '36520': '곡성군', '36530': '구례군',
  '36550': '고흥군', '36560': '보성군', '36570': '화순군', '36580': '장흥군',
  '36590': '강진군', '36600': '해남군', '36610': '영암군', '36620': '무안군',
  '36630': '함평군', '36640': '영광군', '36650': '장성군', '36660': '완도군',
  '36670': '진도군', '36680': '신안군',
  // 경북
  '37011': '남구', '37012': '북구',
  '37020': '경주시', '37030': '김천시', '37040': '안동시', '37050': '구미시',
  '37060': '영주시', '37070': '영천시', '37080': '상주시', '37090': '문경시',
  '37100': '경산시', '37520': '의성군', '37530': '청송군', '37540': '영양군',
  '37550': '영덕군', '37560': '청도군', '37570': '고령군', '37580': '성주군',
  '37590': '칠곡군', '37600': '예천군', '37610': '봉화군', '37620': '울진군',
  '37630': '울릉군',
  // 경남
  '38030': '진주시', '38050': '통영시', '38060': '사천시', '38070': '김해시',
  '38080': '밀양시', '38090': '거제시', '38100': '양산시',
  '38111': '의창구', '38112': '성산구', '38113': '마산합포구',
  '38114': '마산회원구', '38115': '진해구',
  '38510': '의령군', '38520': '함안군', '38530': '창녕군', '38540': '고성군',
  '38550': '남해군', '38560': '하동군', '38570': '산청군', '38580': '함양군',
  '38590': '거창군', '38600': '합천군',
  // 제주
  '39010': '제주시', '39020': '서귀포시',
};

// 행정구 → 상위 시 매핑 (NEC API에서 구 단위가 아닌 시 단위로 조회해야 하는 경우)
const PARENT_CITY: Record<string, string> = {
  // 경기
  '31011': '수원시', '31012': '수원시', '31013': '수원시', '31014': '수원시',
  '31021': '성남시', '31022': '성남시', '31023': '성남시',
  '31041': '안양시', '31042': '안양시',
  '31051': '부천시', '31052': '부천시', '31053': '부천시',
  '31091': '안산시', '31092': '안산시',
  '31101': '고양시', '31103': '고양시', '31104': '고양시',
  '31191': '용인시', '31192': '용인시', '31193': '용인시',
  // 충북
  '33041': '청주시', '33042': '청주시', '33043': '청주시', '33044': '청주시',
  // 충남
  '34011': '천안시', '34012': '천안시',
  // 전북
  '35011': '전주시', '35012': '전주시',
  // 경북
  '37011': '포항시', '37012': '포항시',
  // 경남
  '38111': '창원시', '38112': '창원시', '38113': '창원시', '38114': '창원시', '38115': '창원시',
};

// 정당 색상 매핑
const PARTY_COLORS: Record<string, string> = {
  '더불어민주당': '#004EA2', '민주당': '#004EA2', '더불어민주연합': '#004EA2',
  '국민의힘': '#E61E2B', '자유한국당': '#E61E2B', '새누리당': '#E61E2B',
  '국민의미래': '#E61E2B',
  '정의당': '#FFCC00', '녹색정의당': '#FFCC00',
  '바른미래당': '#00B0B9', '국민의당': '#EA5504', '안철수신당': '#EA5504',
  '개혁신당': '#FF7210', '새로운미래': '#0066B2',
  '진보당': '#D6001C', '노동당': '#D6001C',
  '기본소득당': '#82C8A0', '시대전환': '#5C2D91',
  '더불어시민당': '#004EA2', '미래한국당': '#E61E2B',
  '열린민주당': '#003DA5', '비례자유한국당': '#E61E2B',
  '무소속': '#999999',
};

function getPartyColor(party: string): string {
  return PARTY_COLORS[party] ?? '#888888';
}

// ── 캐시 ─────────────────────────────────────────────────────
const cache = new Map<string, { data: ElectionData; ts: number }>();
const CACHE_TTL = 1000 * 60 * 30; // 30분

// ── NEC API 호출 ─────────────────────────────────────────────
interface NecItem {
  [key: string]: string;
}

interface NecApiResult {
  items: NecItem[];
  requestUrls: string[];
  statusCode: string;
  totalCount: number;
}

function isDistrictElection(electionId: string): boolean {
  return electionId.endsWith('_district');
}

function getFirstRequestUrl(requestUrls: string[]): string | undefined {
  return requestUrls[0];
}

async function fetchNecApiPage(
  sgId: string,
  sgTypecode: string,
  pageNo: number,
  sdName?: string,
  wiwName?: string,
): Promise<{ items: NecItem[]; requestUrl: string; statusCode: string; totalCount: number }> {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo: String(pageNo),
    numOfRows: '1000',
    resultType: 'json',
    sgId,
    sgTypecode,
  });
  if (sdName) params.set('sdName', sdName);
  if (wiwName) params.set('wiwName', wiwName);

  const url = `${NEC_BASE}/getXmntckSttusInfoInqire?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NEC API HTTP ${res.status}`);

  const json = await res.json();
  const code = json?.response?.header?.resultCode;
  if (code !== 'INFO-00') throw new Error(`NEC API error: ${code}`);

  const items = json?.response?.body?.items?.item;
  const totalCount = Number(json?.response?.body?.totalCount ?? 0);
  return {
    items: !items ? [] : Array.isArray(items) ? items : [items],
    requestUrl: url,
    statusCode: code,
    totalCount,
  };
}

async function fetchNecApi(
  sgId: string,
  sgTypecode: string,
  sdName?: string,
  wiwName?: string,
): Promise<NecApiResult> {
  const firstPage = await fetchNecApiPage(sgId, sgTypecode, 1, sdName, wiwName);
  const requestUrls = [firstPage.requestUrl];
  const items = [...firstPage.items];

  if (wiwName) {
    return {
      items,
      requestUrls,
      statusCode: firstPage.statusCode,
      totalCount: firstPage.totalCount,
    };
  }

  const totalPages = firstPage.totalCount > 0
    ? Math.ceil(firstPage.totalCount / Math.max(firstPage.items.length || 100, 1))
    : 1;

  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const nextPage = await fetchNecApiPage(sgId, sgTypecode, pageNo, sdName, wiwName);
    requestUrls.push(nextPage.requestUrl);
    items.push(...nextPage.items);
  }

  return {
    items,
    requestUrls,
    statusCode: firstPage.statusCode,
    totalCount: firstPage.totalCount,
  };
}

// ── NEC 응답 → ElectionData 변환 ─────────────────────────────
function parseNecItem(
  item: NecItem,
  admCd: string,
  admNm: string,
  electionName: string,
  electionDate: string,
  electionType: 'presidential' | 'assembly' | 'local',
  subType?: string,
): ElectionData {
  const sunsu = Number(item.sunsu ?? 0);      // 선거인수
  const tusu = Number(item.tusu ?? 0);        // 투표수
  const yutusu = Number(item.yutusu ?? 0);    // 유효투표수
  const mutusu = Number(item.mutusu ?? 0);    // 무효투표수
  const turnout = sunsu > 0 ? (tusu / sunsu) * 100 : 0;

  // 후보자/정당 파싱 (최대 50명)
  const candidates: Candidate[] = [];
  for (let i = 1; i <= 50; i++) {
    const key = String(i).padStart(2, '0');
    const name = (item[`hbj${key}`] ?? '').trim();
    const party = (item[`jd${key}`] ?? '').trim();
    const votes = Number(item[`dugsu${key}`] ?? 0);
    if (!name && !party) break;
    if (votes === 0 && !name && !party) continue;

    const voteRate = yutusu > 0 ? (votes / yutusu) * 100 : 0;
    candidates.push({
      name: name || party,
      party,
      party_color: getPartyColor(party),
      votes,
      vote_rate: Math.round(voteRate * 100) / 100,
      rank: 0,
      elected: false,
    });
  }

  // 득표순 정렬 후 순위/당선 결정
  candidates.sort((a, b) => b.votes - a.votes);
  candidates.forEach((c, idx) => {
    c.rank = idx + 1;
  });
  if (candidates.length > 0) {
    candidates[0].elected = true;
  }

  return {
    adm_cd: admCd,
    adm_nm: admNm,
    election_type: electionType,
    election_name: electionName,
    election_date: electionDate,
    sub_type: subType,
    total_voters: sunsu,
    total_votes: tusu,
    valid_votes: yutusu,
    invalid_votes: mutusu,
    turnout_rate: Math.round(turnout * 100) / 100,
    candidates,
  };
}

function buildNecResult(
  data: ElectionData,
  requestUrls: string[],
  statusCode: string,
  matchedRegionName: string,
  matchedRegionCode: string,
  recordCount: number,
): ElectionData {
  return attachElectionDebugMeta(data, {
    sourceType: 'real',
    requestUrl: getFirstRequestUrl(requestUrls),
    statusCode,
    matchedRegionName,
    matchedRegionCode,
    recordCount,
  });
}

function validateNecResult(data: ElectionData, admCd: string): string | null {
  if (data.total_votes > data.total_voters) {
    return 'votes exceed electors';
  }

  if (data.turnout_rate < 0 || data.turnout_rate > 100) {
    return 'turnout out of range';
  }

  if (admCd.length === 8) {
    if (data.total_voters > 300000) {
      return 'dong electors unrealistically high';
    }
    if (data.total_votes > 250000) {
      return 'dong votes unrealistically high';
    }
  }

  return null;
}

/**
 * 시군구에 지역구 선거구가 여러 개일 때 정당별 득표 합산 집계
 * (광역의원·기초의원 지역구에서 구 단위 조회 시 사용)
 */
function aggregateDistrictItems(
  items: NecItem[],
  admCd: string,
  admNm: string,
  electionName: string,
  electionDate: string,
  electionType: 'presidential' | 'assembly' | 'local',
  subType?: string,
): ElectionData {
  const totalVoters = items.reduce((s, it) => s + Number(it.sunsu ?? 0), 0);
  const totalVotes  = items.reduce((s, it) => s + Number(it.tusu  ?? 0), 0);
  const validVotes  = items.reduce((s, it) => s + Number(it.yutusu ?? 0), 0);
  const invalidVotes = items.reduce((s, it) => s + Number(it.mutusu ?? 0), 0);

  // 정당별 득표 합산
  const partyVotes: Record<string, number> = {};
  for (const item of items) {
    for (let i = 1; i <= 50; i++) {
      const key = String(i).padStart(2, '0');
      const party = (item[`jd${key}`] ?? '').trim();
      const votes = Number(item[`dugsu${key}`] ?? 0);
      if (!party) break;
      partyVotes[party] = (partyVotes[party] ?? 0) + votes;
    }
  }

  const turnout = totalVoters > 0 ? Math.round((totalVotes / totalVoters) * 10000) / 100 : 0;
  const candidates: Candidate[] = Object.entries(partyVotes)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([party, votes], idx) => ({
      name: party,
      party,
      party_color: getPartyColor(party),
      votes,
      vote_rate: validVotes > 0 ? Math.round((votes / validVotes) * 10000) / 100 : 0,
      rank: idx + 1,
      elected: idx === 0,
    }));

  return {
    adm_cd: admCd,
    adm_nm: admNm,
    election_type: electionType,
    election_name: electionName,
    election_date: electionDate,
    sub_type: subType,
    total_voters: totalVoters,
    total_votes: totalVotes,
    valid_votes: validVotes,
    invalid_votes: invalidVotes,
    turnout_rate: turnout,
    candidates,
  };
}

// ── 메인 API: 선거 결과 조회 ─────────────────────────────────
export async function fetchNecElection(
  admCd: string,
  electionId: string,
  admNm?: string,
): Promise<ElectionData> {
  // 캐시 확인 (8자리 코드는 admNm 포함하여 동 단위로 캐시)
  const cacheKey = admCd.length === 8 && admNm
    ? `${electionId}_${admCd}_${admNm}`
    : `${electionId}_${admCd}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const param = ELECTION_MAP[electionId];
  if (!param) throw new Error(`Unknown election: ${electionId}`);

  const sidoCd = admCd.slice(0, 2);
  const sdName = SIDO_NAME[sidoCd];
  if (!sdName && admCd !== '00') throw new Error(`Unknown sido: ${sidoCd}`);

  // 선거 메타 정보
  const meta = getElectionMeta(electionId);

  // 시도지사/구시군장 분기 (단체장)
  let sgTypecode = param.sgTypecode;
  if (param.sgTypecodeLocal && admCd.length >= 5) {
    sgTypecode = param.sgTypecodeLocal;
  }

  const context = {
    requestedAdminCode: admCd,
    requestedAdminName: admNm,
    electionId,
  };
  let result: ElectionData;
  let mappingFailureReason: string | undefined;

  if (admCd === '00') {
    // 전국 데이터
    const apiResult = await fetchNecApi(param.sgId, sgTypecode);
    const items = apiResult.items;
    const nationalItem = items.find(
      (it) => it.sdName === '합계' && it.wiwName === '합계',
    );
    if (!nationalItem) throw new Error('전국 데이터 없음');
    result = buildNecResult(parseNecItem(
      nationalItem, '00', '전국',
      meta.name, meta.date, meta.type, meta.subType,
    ), apiResult.requestUrls, apiResult.statusCode, '전국', '00', 1);
  } else if (admCd.length === 2) {
    // 시도 데이터
    const apiResult = await fetchNecApi(param.sgId, sgTypecode, sdName);
    const items = apiResult.items;
    const sidoItem = items.find((it) => it.wiwName === '합계');
    if (!sidoItem) throw new Error(`시도 데이터 없음: ${sdName}`);
    result = buildNecResult(parseNecItem(
      sidoItem, admCd, sdName,
      meta.name, meta.date, meta.type, meta.subType,
    ), apiResult.requestUrls, apiResult.statusCode, sdName, admCd, 1);
  } else {
    // 시군구(5자리) / 읍면동(8자리)
    const sigunguCd = admCd.slice(0, 5);
    const wiwName = SIGUNGU_NAME[sigunguCd];
    // 행정구가 상위 시에 속하는 경우 (예: 장안구 → 수원시)
    const parentCity = PARENT_CITY[sigunguCd];
    // NEC API에서 사용할 구시군명
    const necWiwName = parentCity ?? wiwName;

    if (!wiwName) {
      // 매핑이 없는 경우 시도 fallback
      const apiResult = await fetchNecApi(param.sgId, sgTypecode, sdName);
      const items = apiResult.items;
      const sidoItem = items.find((it) => it.wiwName === '합계');
      if (!sidoItem) throw new Error(`시도 데이터 없음: ${sdName}`);
      result = buildNecResult(parseNecItem(
        sidoItem, sidoCd, sdName,
        meta.name, meta.date, meta.type, meta.subType,
      ), apiResult.requestUrls, apiResult.statusCode, sdName, sidoCd, 1);
    } else if (admCd.length === 8 && admNm) {
      // ─── 읍면동(8자리) 단위 조회 ─────────────────────────────
      const dongShortName = admNm.trim().split(/\s+/).pop() ?? '';
      const sdNameForApi = getApiSdName(sidoCd, param.sgId);

      if (['1', '7', '8', '9'].includes(sgTypecode)) {
        const apiResult = await fetchNecApi(param.sgId, sgTypecode, sdNameForApi, necWiwName);
        const itemsWithWiw = apiResult.items;
        let matched: NecItem | null = null;
        if (dongShortName) {
          matched = itemsWithWiw.find((it) => it.wiwName === dongShortName) ?? null;
          if (!matched) {
            matched = itemsWithWiw.find((it) =>
              it.wiwName !== '합계' && it.wiwName?.includes(dongShortName)
            ) ?? null;
          }
        }
        if (!matched) {
          mappingFailureReason = `NEC exact dong match missing: ${dongShortName}`;
          throw new ElectionLookupError('NO_DATA', '선거 데이터 없음', {
            sourceType: 'real',
            requestUrl: getFirstRequestUrl(apiResult.requestUrls),
            statusCode: apiResult.statusCode,
            matchedRegionName: necWiwName,
            matchedRegionCode: sigunguCd,
            recordCount: apiResult.items.length,
            fallbackReason: mappingFailureReason,
          });
        }

        const resultAdmNm = parentCity
          ? `${sdNameForApi} ${parentCity} ${wiwName} ${matched.wiwName}`
          : `${sdNameForApi} ${wiwName} ${matched.wiwName}`;
        result = buildNecResult(parseNecItem(
          matched, admCd, resultAdmNm,
          meta.name, meta.date, meta.type, meta.subType,
        ), apiResult.requestUrls, apiResult.statusCode, matched.wiwName, admCd, 1);
      } else if (['2', '5', '6'].includes(sgTypecode)) {
        const apiResult = await fetchNecApi(param.sgId, sgTypecode, sdNameForApi, necWiwName);
        const items = apiResult.items;
        let matched: NecItem | null = null;

        if (dongShortName && items.length > 0) {
          matched = items.find((it) => it.wiwName === dongShortName)
            ?? items.find((it) => it.wiwName !== '합계' && it.wiwName?.includes(dongShortName))
            ?? null;
        }
        if (!matched) {
          mappingFailureReason = `district election exact dong match missing: ${dongShortName}`;
          throw new ElectionLookupError('NO_DATA', '선거 데이터 없음', {
            sourceType: 'real',
            requestUrl: getFirstRequestUrl(apiResult.requestUrls),
            statusCode: apiResult.statusCode,
            matchedRegionName: necWiwName,
            matchedRegionCode: sigunguCd,
            recordCount: items.length,
            fallbackReason: mappingFailureReason,
          });
        }

        const resultAdmNm = parentCity
          ? `${sdNameForApi} ${parentCity} ${wiwName} ${matched.wiwName}`
          : `${sdNameForApi} ${wiwName} ${matched.wiwName}`;
        result = buildNecResult(parseNecItem(
          matched, admCd, resultAdmNm,
          meta.name, meta.date, meta.type, meta.subType,
        ), apiResult.requestUrls, apiResult.statusCode, matched.wiwName, admCd, 1);
      } else {
        const sdNameForApi2 = getApiSdName(sidoCd, param.sgId);
        const apiResult = await fetchNecApi(param.sgId, sgTypecode, sdNameForApi2, necWiwName);
        const items = apiResult.items;
        let matched: NecItem | null = null;
        if (sgTypecode === '4') {
          matched = items.find(
            (it) => it.sggName?.includes(necWiwName) && it.wiwName === '합계',
          ) ?? null;
        } else {
          matched = items.find((it) => it.wiwName === necWiwName)
            ?? null;
        }
        if (!matched) {
          mappingFailureReason = `NEC exact region match missing: ${necWiwName}`;
          throw new ElectionLookupError('NO_DATA', '선거 데이터 없음', {
            sourceType: 'real',
            requestUrl: getFirstRequestUrl(apiResult.requestUrls),
            statusCode: apiResult.statusCode,
            matchedRegionName: necWiwName,
            matchedRegionCode: sigunguCd,
            recordCount: items.length,
            fallbackReason: mappingFailureReason,
          });
        }
        const resultAdmNm = parentCity
          ? `${sdNameForApi2} ${parentCity} ${wiwName}`
          : `${sdNameForApi2} ${wiwName}`;
        result = buildNecResult(parseNecItem(
          matched, sigunguCd, resultAdmNm,
          meta.name, meta.date, meta.type, meta.subType,
        ), apiResult.requestUrls, apiResult.statusCode, matched.sggName || matched.wiwName, sigunguCd, 1);
      }
    } else {
      const sdNameForApi = getApiSdName(sidoCd, param.sgId);
      const directApiResult = await fetchNecApi(param.sgId, sgTypecode, sdNameForApi, necWiwName);
      const directItems = directApiResult.items;

      if (['2', '5', '6'].includes(sgTypecode) || isDistrictElection(electionId)) {
        if (directItems.length === 0) {
          mappingFailureReason = `district record missing for ${necWiwName}`;
          throw new ElectionLookupError('NO_DATA', '선거 데이터 없음', {
            sourceType: 'real',
            requestUrl: getFirstRequestUrl(directApiResult.requestUrls),
            statusCode: directApiResult.statusCode,
            matchedRegionName: necWiwName,
            matchedRegionCode: sigunguCd,
            recordCount: 0,
            fallbackReason: mappingFailureReason,
          });
        }

        const admNmResult = parentCity
          ? `${sdNameForApi} ${parentCity} ${wiwName}`
          : `${sdNameForApi} ${wiwName}`;

        if (directItems.length === 1) {
          const matched = directItems[0];
          result = buildNecResult(parseNecItem(
            matched, sigunguCd, admNmResult,
            meta.name, meta.date, meta.type, meta.subType,
          ), directApiResult.requestUrls, directApiResult.statusCode, matched.sggName || matched.wiwName, sigunguCd, 1);
        } else {
          // 시군구에 선거구 여러 개 → 정당별 집계
          const aggregated = aggregateDistrictItems(
            directItems, sigunguCd, admNmResult,
            meta.name, meta.date, meta.type, meta.subType,
          );
          result = buildNecResult(aggregated, directApiResult.requestUrls, directApiResult.statusCode,
            `${necWiwName} (${directItems.length}개 선거구 합계)`, sigunguCd, directItems.length);
        }
      } else if (sgTypecode === '4') {
        const apiResult = await fetchNecApi(param.sgId, sgTypecode, sdNameForApi);
        const matched = apiResult.items.find(
          (it) => it.sggName?.includes(necWiwName) && it.wiwName === '합계',
        );
        if (!matched) {
          mappingFailureReason = `NEC local mayor match missing: ${necWiwName}`;
          throw new ElectionLookupError('NO_DATA', '선거 데이터 없음', {
            sourceType: 'real',
            requestUrl: getFirstRequestUrl(apiResult.requestUrls),
            statusCode: apiResult.statusCode,
            matchedRegionName: necWiwName,
            matchedRegionCode: sigunguCd,
            recordCount: apiResult.items.length,
            fallbackReason: mappingFailureReason,
          });
        }

        const admNmResult = parentCity
          ? `${sdNameForApi} ${parentCity} ${wiwName}`
          : `${sdNameForApi} ${wiwName}`;
        result = buildNecResult(parseNecItem(
          matched, sigunguCd, admNmResult,
          meta.name, meta.date, meta.type, meta.subType,
        ), apiResult.requestUrls, apiResult.statusCode, matched.sggName || matched.wiwName, sigunguCd, 1);
      } else {
        const matched = directItems.find((it) => it.wiwName === necWiwName) ?? null;
        if (!matched) {
          mappingFailureReason = `NEC exact region match missing: ${necWiwName}`;
          throw new ElectionLookupError('NO_DATA', '선거 데이터 없음', {
            sourceType: 'real',
            requestUrl: getFirstRequestUrl(directApiResult.requestUrls),
            statusCode: directApiResult.statusCode,
            matchedRegionName: necWiwName,
            matchedRegionCode: sigunguCd,
            recordCount: directItems.length,
            fallbackReason: mappingFailureReason,
          });
        }

        const admNmResult = parentCity
          ? `${sdNameForApi} ${parentCity} ${wiwName}`
          : `${sdNameForApi} ${wiwName}`;
        result = buildNecResult(parseNecItem(
          matched, sigunguCd, admNmResult,
          meta.name, meta.date, meta.type, meta.subType,
        ), directApiResult.requestUrls, directApiResult.statusCode, matched.wiwName, sigunguCd, directItems.length);
      }
    }
  }

  const invalidReason = validateNecResult(result, admCd);
  if (invalidReason) {
    throw new ElectionLookupError('NO_DATA', '선거 데이터 확인 필요', {
      sourceType: 'real',
      requestUrl: result.debug_meta?.requestUrl,
      statusCode: result.debug_meta?.statusCode,
      matchedRegionName: result.debug_meta?.matchedRegionName,
      matchedRegionCode: result.debug_meta?.matchedRegionCode,
      recordCount: result.debug_meta?.recordCount,
      fallbackReason: invalidReason,
    });
  }

  cache.set(cacheKey, { data: result, ts: Date.now() });
  logElectionDecision(context, result.debug_meta!, { data: result, mappingSucceeded: true });
  return result;
}

// 과거 선거의 시도명 호환 처리
function getApiSdName(sidoCd: string, sgId: string): string {
  const year = parseInt(sgId.slice(0, 4));
  const aliases = SIDO_NAME_ALIASES[sidoCd];
  if (aliases) {
    // 강원특별자치도: 2023년부터, 전북특별자치도: 2024년부터
    if (sidoCd === '32' && year < 2023) return '강원도';
    if (sidoCd === '35' && year < 2024) return '전라북도';
  }
  return SIDO_NAME[sidoCd] ?? '';
}

function getElectionMeta(electionId: string) {
  const map: Record<string, { name: string; date: string; type: 'presidential' | 'assembly' | 'local'; subType?: string }> = {
    presidential_21: { name: '제21대 대통령선거', date: '2025-06-03', type: 'presidential' },
    presidential_20: { name: '제20대 대통령선거', date: '2022-03-09', type: 'presidential' },
    presidential_19: { name: '제19대 대통령선거', date: '2017-05-09', type: 'presidential' },
    presidential_18: { name: '제18대 대통령선거', date: '2012-12-19', type: 'presidential' },
    assembly_22_district: { name: '제22대 국회의원선거', date: '2024-04-10', type: 'assembly', subType: '지역구' },
    assembly_22_pr:       { name: '제22대 국회의원선거', date: '2024-04-10', type: 'assembly', subType: '비례대표' },
    assembly_21_district: { name: '제21대 국회의원선거', date: '2020-04-15', type: 'assembly', subType: '지역구' },
    assembly_21_pr:       { name: '제21대 국회의원선거', date: '2020-04-15', type: 'assembly', subType: '비례대표' },
    assembly_20_district: { name: '제20대 국회의원선거', date: '2016-04-13', type: 'assembly', subType: '지역구' },
    assembly_20_pr:       { name: '제20대 국회의원선거', date: '2016-04-13', type: 'assembly', subType: '비례대표' },
    assembly_19_district: { name: '제19대 국회의원선거', date: '2012-04-11', type: 'assembly', subType: '지역구' },
    assembly_19_pr:       { name: '제19대 국회의원선거', date: '2012-04-11', type: 'assembly', subType: '비례대표' },
    local_8_mayor:            { name: '제8회 전국동시지방선거', date: '2022-06-01', type: 'local', subType: '단체장' },
    local_8_council_district: { name: '제8회 전국동시지방선거', date: '2022-06-01', type: 'local', subType: '광역의원(지역구)' },
    local_8_council_pr:       { name: '제8회 전국동시지방선거', date: '2022-06-01', type: 'local', subType: '광역의원(비례)' },
    local_8_basic_district:   { name: '제8회 전국동시지방선거', date: '2022-06-01', type: 'local', subType: '기초의원(지역구)' },
    local_8_basic_pr:         { name: '제8회 전국동시지방선거', date: '2022-06-01', type: 'local', subType: '기초의원(비례)' },
    local_7_mayor:            { name: '제7회 전국동시지방선거', date: '2018-06-13', type: 'local', subType: '단체장' },
    local_7_council_district: { name: '제7회 전국동시지방선거', date: '2018-06-13', type: 'local', subType: '광역의원(지역구)' },
    local_7_council_pr:       { name: '제7회 전국동시지방선거', date: '2018-06-13', type: 'local', subType: '광역의원(비례)' },
    local_7_basic_district:   { name: '제7회 전국동시지방선거', date: '2018-06-13', type: 'local', subType: '기초의원(지역구)' },
    local_7_basic_pr:         { name: '제7회 전국동시지방선거', date: '2018-06-13', type: 'local', subType: '기초의원(비례)' },
    local_6_mayor:            { name: '제6회 전국동시지방선거', date: '2014-06-04', type: 'local', subType: '단체장' },
    local_6_council_district: { name: '제6회 전국동시지방선거', date: '2014-06-04', type: 'local', subType: '광역의원(지역구)' },
    local_6_council_pr:       { name: '제6회 전국동시지방선거', date: '2014-06-04', type: 'local', subType: '광역의원(비례)' },
    local_6_basic_district:   { name: '제6회 전국동시지방선거', date: '2014-06-04', type: 'local', subType: '기초의원(지역구)' },
    local_6_basic_pr:         { name: '제6회 전국동시지방선거', date: '2014-06-04', type: 'local', subType: '기초의원(비례)' },
  };
  return map[electionId] ?? { name: electionId, date: '', type: 'presidential' as const };
}
