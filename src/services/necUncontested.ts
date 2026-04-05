/**
 * NEC 무투표선거구 정보 조회 서비스
 * https://www.data.go.kr/data/15094964/openapi.do
 * 서비스: WtvtelpcInfoInqireService
 * 오퍼레이션: getWtvtelpccndaInfoInqire (후보자 = 무투표 시 곧 당선인)
 *
 * NOTE: 이 API는 선거 진행 중(후보 등록 기간)에만 데이터를 제공한다.
 * 과거 선거(8회 이하) 무투표당선인은 static JSON fallback을 사용한다.
 */

// 정적 fallback: { [electionId]: { [sdName]: UncElectedCandidate[] } }
const STATIC_UNCONTESTED: Partial<Record<string, Record<string, UncElectedCandidate[]>>> = {};

async function loadStaticUncontested(electionId: string): Promise<Record<string, UncElectedCandidate[]> | null> {
  const byId = STATIC_UNCONTESTED[electionId];
  if (byId !== undefined) return byId;

  try {
    const mod = await import(`../data/static/${electionId.split('_').slice(0, 2).join('_')}_uncontested.json`);
    const full = mod.default as Record<string, Record<string, UncElectedCandidate[]>>;
    const data = full[electionId] ?? null;
    STATIC_UNCONTESTED[electionId] = data ?? {};
    return data;
  } catch {
    STATIC_UNCONTESTED[electionId] = {};
    return null;
  }
}

const NEC_BASE = 'https://apis.data.go.kr/9760000/WtvtelpcInfoInqireService';
const SERVICE_KEY = 'fcfb6899040b2dc7f9c3bf04402834c6a83364a827417cad9d2052178fce7591';

// 선거 ID → NEC sgId / sgTypecode 매핑 (무투표가 발생할 수 있는 지역구 선거만)
const UNCONTESTED_ELECTION_MAP: Record<string, { sgId: string; sgTypecode: string }> = {
  local_8_basic_district:   { sgId: '20220601', sgTypecode: '6' },
  local_8_council_district: { sgId: '20220601', sgTypecode: '5' },
  local_8_mayor:            { sgId: '20220601', sgTypecode: '4' },
  local_7_basic_district:   { sgId: '20180613', sgTypecode: '6' },
  local_7_council_district: { sgId: '20180613', sgTypecode: '5' },
  local_7_mayor:            { sgId: '20180613', sgTypecode: '4' },
  local_6_basic_district:   { sgId: '20140604', sgTypecode: '6' },
  local_6_council_district: { sgId: '20140604', sgTypecode: '5' },
  assembly_22_district:     { sgId: '20240410', sgTypecode: '2' },
  assembly_21_district:     { sgId: '20200415', sgTypecode: '2' },
};

export interface UncElectedCandidate {
  name: string;
  party: string;
  sggName: string; // 선거구명
}

// sdName(시도명) 기준 전체 무투표 당선인 조회
async function fetchUncandidatesForSido(
  sgId: string,
  sgTypecode: string,
  sdName: string,
): Promise<UncElectedCandidate[]> {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    sgId,
    sgTypecode,
    sdName,
    numOfRows: '500',
    pageNo: '1',
    resultType: 'json',
  });

  const url = `${NEC_BASE}/getWtvtelpccndaInfoInqire?${params}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const json = await res.json();
    const items = json?.response?.body?.items?.item;
    if (!items) return [];
    const list = Array.isArray(items) ? items : [items];
    return list.map((item: Record<string, string>) => ({
      name: item.name ?? '',
      party: item.jdName ?? '',
      sggName: item.sggName ?? '',
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// 캐시: `${electionId}|${sdName}` → 후보자 배열
const cache = new Map<string, UncElectedCandidate[]>();

export async function fetchUncandidates(
  electionId: string,
  sdName: string,
): Promise<UncElectedCandidate[]> {
  const cacheKey = `${electionId}|${sdName}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  // 정적 JSON fallback 우선 시도
  const staticData = await loadStaticUncontested(electionId);
  if (staticData && staticData[sdName] && staticData[sdName].length > 0) {
    const result = staticData[sdName];
    cache.set(cacheKey, result);
    return result;
  }

  // 실시간 API fallback (현재 진행 중인 선거)
  const param = UNCONTESTED_ELECTION_MAP[electionId];
  if (!param) {
    cache.set(cacheKey, []);
    return [];
  }

  const result = await fetchUncandidatesForSido(param.sgId, param.sgTypecode, sdName);
  cache.set(cacheKey, result);
  return result;
}

// 특정 동(시도|시군구|읍면동)에서 무투표 당선인 찾기
// sggName은 선관위 선거구명(예: "강서구가선거구") - 동 → 선거구 매핑은 별도 필요
// 여기서는 시도 전체를 가져온 후 sggName으로 필터링
export async function findUncandidateForDong(
  electionId: string,
  sdName: string,
  sggName?: string,
): Promise<UncElectedCandidate[]> {
  const all = await fetchUncandidates(electionId, sdName);
  if (!sggName) return all;
  return all.filter((c) => c.sggName === sggName || c.sggName.includes(sggName));
}
