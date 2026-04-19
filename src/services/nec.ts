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
import { getPartyColor } from '../utils/partyColors';
import {
  NEC_API_KEY,
  SIDO_NAME,
  SIGUNGU_NAME,
  PARENT_CITY,
  getApiSdName,
} from './necRegion';

const NEC_BASE = 'https://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2';
const SERVICE_KEY = NEC_API_KEY;

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
        const apiResult = await fetchNecApi(
          param.sgId,
          sgTypecode,
          sdNameForApi,
          necWiwName,
        );
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
        const apiResult = await fetchNecApi(
          param.sgId,
          sgTypecode,
          sdNameForApi,
          necWiwName,
        );
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
        const apiResult = await fetchNecApi(
          param.sgId,
          sgTypecode,
          sdNameForApi2,
          necWiwName,
        );
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
      const directApiResult = await fetchNecApi(
        param.sgId,
        sgTypecode,
        sdNameForApi,
        necWiwName,
      );
      const directItems = directApiResult.items;

      if (['2', '5', '6'].includes(sgTypecode) || isDistrictElection(electionId)) {
        const regionItems = directItems;

        if (regionItems.length === 0) {
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

        if (regionItems.length === 1) {
          const matched = regionItems[0];
          result = buildNecResult(parseNecItem(
            matched, sigunguCd, admNmResult,
            meta.name, meta.date, meta.type, meta.subType,
          ), directApiResult.requestUrls, directApiResult.statusCode, matched.sggName || matched.wiwName, sigunguCd, 1);
        } else {
          // 시군구에 선거구 여러 개 → 정당별 집계
          const aggregated = aggregateDistrictItems(
            regionItems, sigunguCd, admNmResult,
            meta.name, meta.date, meta.type, meta.subType,
          );
          result = buildNecResult(aggregated, directApiResult.requestUrls, directApiResult.statusCode,
            `${wiwName} (${regionItems.length}개 선거구 합계)`, sigunguCd, regionItems.length);
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
    local_8_metro_mayor:      { name: '제8회 전국동시지방선거', date: '2022-06-01', type: 'local', subType: '광역단체장' },
    local_8_mayor:            { name: '제8회 전국동시지방선거', date: '2022-06-01', type: 'local', subType: '단체장' },
    local_8_council_district: { name: '제8회 전국동시지방선거', date: '2022-06-01', type: 'local', subType: '광역의원(지역구)' },
    local_8_council_pr:       { name: '제8회 전국동시지방선거', date: '2022-06-01', type: 'local', subType: '광역의원(비례)' },
    local_8_basic_district:   { name: '제8회 전국동시지방선거', date: '2022-06-01', type: 'local', subType: '기초의원(지역구)' },
    local_8_basic_pr:         { name: '제8회 전국동시지방선거', date: '2022-06-01', type: 'local', subType: '기초의원(비례)' },
    local_7_metro_mayor:      { name: '제7회 전국동시지방선거', date: '2018-06-13', type: 'local', subType: '광역단체장' },
    local_7_mayor:            { name: '제7회 전국동시지방선거', date: '2018-06-13', type: 'local', subType: '단체장' },
    local_7_council_district: { name: '제7회 전국동시지방선거', date: '2018-06-13', type: 'local', subType: '광역의원(지역구)' },
    local_7_council_pr:       { name: '제7회 전국동시지방선거', date: '2018-06-13', type: 'local', subType: '광역의원(비례)' },
    local_7_basic_district:   { name: '제7회 전국동시지방선거', date: '2018-06-13', type: 'local', subType: '기초의원(지역구)' },
    local_7_basic_pr:         { name: '제7회 전국동시지방선거', date: '2018-06-13', type: 'local', subType: '기초의원(비례)' },
    local_6_metro_mayor:      { name: '제6회 전국동시지방선거', date: '2014-06-04', type: 'local', subType: '광역단체장' },
    local_6_mayor:            { name: '제6회 전국동시지방선거', date: '2014-06-04', type: 'local', subType: '단체장' },
    local_6_council_district: { name: '제6회 전국동시지방선거', date: '2014-06-04', type: 'local', subType: '광역의원(지역구)' },
    local_6_council_pr:       { name: '제6회 전국동시지방선거', date: '2014-06-04', type: 'local', subType: '광역의원(비례)' },
    local_6_basic_district:   { name: '제6회 전국동시지방선거', date: '2014-06-04', type: 'local', subType: '기초의원(지역구)' },
    local_6_basic_pr:         { name: '제6회 전국동시지방선거', date: '2014-06-04', type: 'local', subType: '기초의원(비례)' },
  };
  return map[electionId] ?? { name: electionId, date: '', type: 'presidential' as const };
}
