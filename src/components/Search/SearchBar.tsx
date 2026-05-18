import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Star, Clock, X } from 'lucide-react';
import type { AdminLevel, ElectionHint } from '../../types';
import searchIndex from '../../data/static/search_index.json';
import { useRegionHistory, type RegionHistoryItem } from '../../hooks/useRegionHistory';
import { loadLocal9CandidateSearchIndex, type Local9CandidateSearchEntry } from '../../services/candidateRegistration';
import assemblyEmdMapping from '../../data/static/assembly_district_emd_mapping.json';
import {
  getLocalCouncilDistrictEntries,
  getLocalCouncilGenerations,
  getLocalCouncilKinds,
} from '../../services/localCouncilMapping';

export interface SearchResult {
  adm_cd: string;
  adm_nm: string;
  level: AdminLevel;
  sido_cd: string | null;
  sido_nm: string | null;
  sigungu_cd?: string | null;
  sigungu_nm?: string | null;
  matchedText: string;
  candidate?: {
    name: string;
    party: string;
    party_color?: string;
    election_label: string;  // e.g. '22대 총선 지역구', '8회 지방선거 기초의원'
    election_district: string;
  };
  /** 국회의원 선거구 하이라이트용: "22_서울_강서갑" 형식 */
  assemblyDistrictKey?: string;
  /**
   * 지방의원(기초/광역) 선거구 하이라이트용: "8_basic_서울_강서구나선거구" 형식.
   * local_council_emd_mapping.json의 [회차][basic|council][시도_선거구명] 키와 대응.
   */
  localDistrictKey?: string;
  /** 선거 패널 자동 전환용 힌트 */
  electionHint?: ElectionHint;
  searchLabel?: string;
  /** 검색 결과 렌더링용 커스텀 부모/배지 */
  searchParent?: string;
  searchBadge?: string;
}

/** cidx_*.json 공통 엔트리 형식 (필드명 축약) */
interface CidxEntry {
  n: string;   // name
  p: string;   // party
  e: string;   // election label
  d: string;   // election_district
  cd: string;  // emd adm_cd
  sc: string;  // sigungu_cd
  sn: string;  // sigungu_nm
  rc: string;  // sido_cd
  rn: string;  // sido_nm
  an: string;  // emd adm_nm (예: "서울특별시 강서구 화곡3동") — election data lookup 필수
}

const PARTY_COLOR: Record<string, string> = {
  '더불어민주당': '#004EA2',
  '민주통합당': '#004EA2',
  '국민의힘': '#E61E2B',
  '정의당': '#FFCC00',
  '국민의당': '#FF7F00',
  '기본소득당': '#00C4A1',
  '진보당': '#D0021B',
  '녹색정의당': '#00A650',
  '새로운미래': '#0095DA',
  '개혁신당': '#F26522',
  '열린민주당': '#005BAC',
  '무소속': '#888888',
};

function partyColor(party: string): string {
  return PARTY_COLOR[party] ?? '#888888';
}

const SIDO_NORM: Record<string, string> = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구',
  '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전',
  '울산광역시': '울산', '세종특별자치시': '세종', '경기도': '경기',
  '강원도': '강원', '강원특별자치도': '강원', '충청북도': '충북',
  '충청남도': '충남', '전라북도': '전북', '전북특별자치도': '전북',
  '전라남도': '전남', '경상북도': '경북', '경상남도': '경남',
  '제주특별자치도': '제주',
};

function getAssemblyDistrictKey(c: CidxEntry): string | undefined {
  // "22대 총선 지역구" → "22"
  const genMatch = c.e.match(/^(\d+)대 총선/);
  if (!genMatch) return undefined;
  const gen = genMatch[1];
  const sido = SIDO_NORM[c.rn] || c.rn;
  return `${gen}_${sido}_${c.d}`;
}

/**
 * 지방의원(기초/광역) 지역구 후보의 경우 local_council_emd_mapping.json 조회용 키 반환.
 * 형식: "{회차}_{basic|council}_{시도약칭}_{선거구명}"
 * 예: "8_basic_서울_강서구나선거구"
 * 단체장·비례·대선·총선은 undefined 반환.
 */
function getLocalDistrictKey(c: CidxEntry): string | undefined {
  const sido = SIDO_NORM[c.rn] || c.rn;
  const basicMatch = c.e.match(/^(\d+)회 지방선거 기초의원\(지역구\)/);
  if (basicMatch) return `${basicMatch[1]}_basic_${sido}_${c.d}`;
  const councilMatch = c.e.match(/^(\d+)회 지방선거 광역의원\(지역구\)/);
  if (councilMatch) return `${councilMatch[1]}_council_${sido}_${c.d}`;
  return undefined;
}

/**
 * cidx 엔트리의 선거 라벨(e 필드)을 파싱해 ElectionPanel 자동 전환용 힌트 반환.
 *
 * 지원 형식 예시:
 *   "21대 대선"
 *   "22대 총선 지역구"
 *   "8회 지방선거 기초의원(지역구)"
 *   "8회 지방선거 광역단체장"
 *   "8회 지방선거 단체장"
 *   "local_5_basic_district"  (5회 이전 레거시 포맷)
 */
function getElectionHint(e: string): ElectionHint | undefined {
  // 레거시 "local_X_Y" 포맷
  if (e.startsWith('local_')) {
    const parts = e.split('_');
    if (parts.length >= 3) {
      const prefix = `local_${parts[1]}`;
      const subType = parts.slice(2).join('_');
      return { type: 'local', localPrefix: prefix, localSubType: subType };
    }
  }

  // 대선: "21대 대선"
  const presMatch = e.match(/^(\d+)대 대선/);
  if (presMatch) {
    return { type: 'presidential', presidentialId: `presidential_${presMatch[1]}` };
  }

  // 총선: "22대 총선 지역구" / "22대 총선 비례"
  const assemblyMatch = e.match(/^(\d+)대 총선\s*(지역구|비례)?/);
  if (assemblyMatch) {
    const subType = assemblyMatch[2] === '비례' ? 'pr' : 'district';
    return { type: 'assembly', assemblySuffix: assemblyMatch[1], assemblySubType: subType };
  }

  // 지방선거: "8회 지방선거 기초의원(지역구)" / "8회 지방선거 광역단체장" 등
  const localMatch = e.match(/^(\d+)회 지방선거\s*(광역단체장|단체장|기초단체장|광역의원|기초의원)?\s*(\(지역구\)|\(비례\))?/);
  if (localMatch) {
    const num = localMatch[1];
    const kind = localMatch[2] ?? '';
    const variant = localMatch[3] ?? '';
    let localSubType: string;
    if (kind === '광역단체장') localSubType = 'metro_mayor';
    else if (kind === '단체장' || kind === '기초단체장') localSubType = 'mayor';
    else if (kind === '광역의원') localSubType = variant.includes('비례') ? 'council_pr' : 'council_district';
    else if (kind === '기초의원') localSubType = variant.includes('비례') ? 'basic_pr' : 'basic_district';
    else localSubType = 'metro_mayor';
    return { type: 'local', localPrefix: `local_${num}`, localSubType };
  }

  return undefined;
}

function getScopedAreaForCandidate(c: CidxEntry, electionHint?: ElectionHint): Pick<
  SearchResult,
  'adm_cd' | 'adm_nm' | 'level' | 'sido_cd' | 'sido_nm' | 'sigungu_cd' | 'sigungu_nm' | 'searchLabel' | 'searchParent' | 'searchBadge'
> {
  if (electionHint?.type === 'presidential') {
    return {
      adm_cd: '00',
      adm_nm: '전국',
      level: 'sido',
      sido_cd: null,
      sido_nm: null,
      sigungu_cd: null,
      sigungu_nm: null,
      searchLabel: '전국',
      searchParent: electionHint.presidentialId
        ? `${electionHint.presidentialId.replace('presidential_', '')}대 대선`
        : '대통령선거',
      searchBadge: '대통령선거',
    };
  }

  if (electionHint?.type === 'local') {
    if (electionHint.localSubType === 'metro_mayor' || electionHint.localSubType === 'council_pr') {
      return {
        adm_cd: c.rc,
        adm_nm: c.rn,
        level: 'sido',
        sido_cd: c.rc,
        sido_nm: c.rn,
        sigungu_cd: null,
        sigungu_nm: null,
        searchLabel: c.rn,
        searchParent: c.e,
        searchBadge: electionHint.localSubType === 'metro_mayor' ? '광역단체장' : '광역비례',
      };
    }

    if (electionHint.localSubType === 'mayor' || electionHint.localSubType === 'basic_pr') {
      return {
        adm_cd: c.sc,
        adm_nm: c.sn,
        level: 'sigungu',
        sido_cd: c.rc,
        sido_nm: c.rn,
        sigungu_cd: c.sc,
        sigungu_nm: c.sn,
        searchLabel: c.sn,
        searchParent: c.e,
        searchBadge: electionHint.localSubType === 'mayor' ? '기초단체장' : '기초비례',
      };
    }
  }

  return {
    adm_cd: c.cd,
    adm_nm: c.an,
    level: 'eupmyeondong',
    sido_cd: c.rc,
    sido_nm: c.rn,
    sigungu_cd: c.sc,
    sigungu_nm: c.sn,
  };
}

function cidxToResult(c: CidxEntry): SearchResult {
  const electionHint = getElectionHint(c.e);
  const scopedArea = getScopedAreaForCandidate(c, electionHint);

  return {
    ...scopedArea,
    matchedText: '',
    candidate: {
      name: c.n,
      party: c.p,
      party_color: partyColor(c.p),
      election_label: c.e,
      election_district: c.d,
    },
    assemblyDistrictKey: getAssemblyDistrictKey(c),
    localDistrictKey: getLocalDistrictKey(c),
    electionHint,
  };
}

interface Props {
  onSelect: (result: SearchResult) => void;
  autoFocus?: boolean;
}

interface SearchIndexEntry {
  adm_cd: string;
  adm_nm: string;
  level: AdminLevel;
  sido_cd?: string | null;
  sido_nm?: string | null;
  sigungu_cd?: string | null;
  sigungu_nm?: string | null;
}

const SEARCH_INDEX_ENTRIES = searchIndex as SearchIndexEntry[];
const SEARCH_INDEX_BY_CODE = new Map(SEARCH_INDEX_ENTRIES.map((item) => [item.adm_cd, item]));

interface ShortcutEntry {
  label: string;
  normalized: string;
  result: SearchResult;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[\s_·\-/(),]/g, '');
}

function mergeLocal9CandidateEntries(
  current: Local9CandidateSearchEntry[],
  incoming: Local9CandidateSearchEntry[],
): Local9CandidateSearchEntry[] {
  if (incoming.length === 0) return current;
  const merged = new Map<string, Local9CandidateSearchEntry>();

  for (const item of current) {
    merged.set(`${item.name}|${item.party}|${item.electionLabel}|${item.district}|${item.adm_cd}`, item);
  }
  for (const item of incoming) {
    merged.set(`${item.name}|${item.party}|${item.electionLabel}|${item.district}|${item.adm_cd}`, item);
  }

  return Array.from(merged.values());
}

function resolveAreaFromCode(admCd: string, fallbackLabel: string): SearchResult {
  const exact = SEARCH_INDEX_BY_CODE.get(admCd);
  if (exact) {
    return {
      adm_cd: exact.adm_cd,
      adm_nm: exact.adm_nm,
      level: exact.level,
      sido_cd: exact.sido_cd ?? null,
      sido_nm: exact.sido_nm ?? null,
      sigungu_cd: exact.sigungu_cd ?? null,
      sigungu_nm: exact.sigungu_nm ?? null,
      matchedText: '',
    };
  }

  const sigungu = SEARCH_INDEX_BY_CODE.get(admCd.slice(0, 5));
  const sido = SEARCH_INDEX_BY_CODE.get(admCd.slice(0, 2));
  return {
    adm_cd: admCd,
    adm_nm: fallbackLabel,
    level: 'eupmyeondong',
    sido_cd: sigungu?.sido_cd ?? sido?.adm_cd ?? null,
    sido_nm: sigungu?.sido_nm ?? sido?.adm_nm ?? null,
    sigungu_cd: sigungu?.adm_cd ?? null,
    sigungu_nm: sigungu?.adm_nm?.split(/\s+/).pop() ?? null,
    matchedText: '',
  };
}

function buildAssemblyShortcutEntries(): ShortcutEntry[] {
  const entries: ShortcutEntry[] = [];
  const mapping = assemblyEmdMapping as Record<string, Record<string, string[]>>;
  for (const generation of Object.keys(mapping).sort((a, b) => Number(b) - Number(a))) {
    for (const key of Object.keys(mapping[generation])) {
      const codes = mapping[generation][key];
      if (!codes?.length) continue;
      const area = resolveAreaFromCode(codes[0], key.replace('_', ' '));
      const label = key.replace('_', ' ');
      entries.push({
        label,
        normalized: normalizeSearchText(label),
        result: {
          ...area,
          searchLabel: label,
          assemblyDistrictKey: `${generation}_${key}`,
          electionHint: {
            type: 'assembly',
            assemblySuffix: generation,
            assemblySubType: 'district',
          },
          searchParent: `${generation}대 총선`,
          searchBadge: '국회의원 지역구',
        },
      });
    }
  }
  return entries;
}

function buildLocalShortcutEntries(): ShortcutEntry[] {
  const entries: ShortcutEntry[] = [];
  const sourceGenerations = getLocalCouncilGenerations().filter((generation) => generation !== '9');
  const generations = ['9', ...sourceGenerations];

  for (const generation of generations) {
    for (const kind of getLocalCouncilKinds(generation)) {
      for (const [key, codes] of getLocalCouncilDistrictEntries(generation, kind)) {
        if (!codes?.length) continue;
        const label = key.replace('_', ' ');
        const area = resolveAreaFromCode(codes[0], label);
        entries.push({
          label,
          normalized: normalizeSearchText(label),
          result: {
            ...area,
            searchLabel: label,
            localDistrictKey: `${generation}_${kind}_${key}`,
            electionHint: {
              type: 'local',
              localPrefix: `local_${generation}`,
              localSubType: kind === 'basic' ? 'basic_district' : 'council_district',
            },
            searchParent: `${generation}회 지방선거`,
            searchBadge: kind === 'basic' ? '기초의원 선거구' : '광역의원 선거구',
          },
        });
      }
    }
  }
  return entries;
}

function buildPrShortcutEntries(): ShortcutEntry[] {
  const prConfigs: Array<{ label: string; result: SearchResult }> = [
    {
      label: '9회 지방선거 광역 비례',
      result: {
        adm_cd: '11',
        adm_nm: '서울특별시',
        level: 'sido' as const,
        sido_cd: '11',
        sido_nm: '서울특별시',
        matchedText: '',
        searchLabel: '9회 지방선거 광역 비례',
        electionHint: { type: 'local', localPrefix: 'local_9', localSubType: 'council_pr' },
        searchParent: '시도별',
        searchBadge: '광역의원 비례',
      },
    },
    {
      label: '9회 지방선거 기초 비례',
      result: {
        adm_cd: '11160',
        adm_nm: '서울특별시 강서구',
        level: 'sigungu' as const,
        sido_cd: '11',
        sido_nm: '서울특별시',
        matchedText: '',
        searchLabel: '9회 지방선거 기초 비례',
        electionHint: { type: 'local', localPrefix: 'local_9', localSubType: 'basic_pr' },
        searchParent: '시군구별',
        searchBadge: '기초의원 비례',
      },
    },
    {
      label: '22대 총선 비례대표',
      result: {
        adm_cd: '00',
        adm_nm: '전국',
        level: 'sido' as const,
        sido_cd: null,
        sido_nm: null,
        matchedText: '',
        searchLabel: '22대 총선 비례대표',
        electionHint: { type: 'assembly', assemblySuffix: '22', assemblySubType: 'pr' },
        searchParent: '전국',
        searchBadge: '국회의원 비례대표',
      },
    },
    {
      label: '21대 총선 비례대표',
      result: {
        adm_cd: '00',
        adm_nm: '전국',
        level: 'sido' as const,
        sido_cd: null,
        sido_nm: null,
        matchedText: '',
        searchLabel: '21대 총선 비례대표',
        electionHint: { type: 'assembly', assemblySuffix: '21', assemblySubType: 'pr' },
        searchParent: '전국',
        searchBadge: '국회의원 비례대표',
      },
    },
  ];

  return prConfigs.map((item) => ({
    label: item.label,
    normalized: normalizeSearchText(item.label),
    result: item.result,
  }));
}

const DISTRICT_SHORTCUTS = [
  ...buildAssemblyShortcutEntries(),
  ...buildLocalShortcutEntries(),
  ...buildPrShortcutEntries(),
];

const SEARCH_QUERY_KEY = 'datamap.searchQueries.v1';
const SEARCH_QUERY_EVENT = 'datamap:search-query:change';
const MAX_SEARCH_QUERIES = 5;

function loadSearchQueries(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_QUERY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function saveSearchQueries(queries: string[]) {
  try {
    localStorage.setItem(SEARCH_QUERY_KEY, JSON.stringify(queries));
  } catch {
    // localStorage 접근 실패는 무시
  }
}

function highlight(text: string, query: string): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

function shortName(adm_nm: string, level: AdminLevel): string {
  if (level === 'sido') return adm_nm;
  return adm_nm.split(/\s+/).pop() ?? adm_nm;
}

export function SearchBar({ onSelect, autoFocus }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [recentQueries, setRecentQueries] = useState<string[]>(() => loadSearchQueries());
  const [local9Candidates, setLocal9Candidates] = useState<Local9CandidateSearchEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { recent, favorites, clearRecent, toggleFavorite, isFavorite } = useRegionHistory();

  // 히스토리 아이템 → 검색 결과 형태로 변환 (선택 시 onSelect 호출 가능)
  const historyToSearchResult = (h: RegionHistoryItem): SearchResult => ({
    adm_cd: h.adm_cd,
    adm_nm: h.adm_nm,
    level: h.level,
    sido_cd: h.sido_cd ?? null,
    sido_nm: h.sido_nm ?? null,
    sigungu_cd: h.sigungu_cd ?? null,
    sigungu_nm: h.sigungu_nm ?? null,
    matchedText: '',
  });

  // 4개 그룹 후보자 인덱스 — 각각 별도 청크로 지연 로드
  const [cidxAll, setCidxAll] = useState<CidxEntry[]>([]);

  useEffect(() => {
    Promise.all([
      import('../../data/static/cidx_presidential.json'),
      import('../../data/static/cidx_assembly.json'),
      import('../../data/static/cidx_local_high.json'),
      import('../../data/static/cidx_local_basic.json'),
    ]).then(([a, b, c, d]) => {
      setCidxAll([
        ...(a.default as CidxEntry[]),
        ...(b.default as CidxEntry[]),
        ...(c.default as CidxEntry[]),
        ...(d.default as CidxEntry[]),
      ]);
    });
  }, []);

  useEffect(() => {
    const syncQueries = () => setRecentQueries(loadSearchQueries());
    window.addEventListener(SEARCH_QUERY_EVENT, syncQueries);
    window.addEventListener('storage', syncQueries);
    return () => {
      window.removeEventListener(SEARCH_QUERY_EVENT, syncQueries);
      window.removeEventListener('storage', syncQueries);
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < 2 || local9Candidates.length > 0) return;
    let cancelled = false;
    loadLocal9CandidateSearchIndex((items) => {
      if (!cancelled) {
        setLocal9Candidates((current) => mergeLocal9CandidateEntries(current, items));
      }
    })
      .then((items) => {
        if (!cancelled) setLocal9Candidates(items);
      })
      .catch(() => {
        if (!cancelled) setLocal9Candidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query, local9Candidates.length]);

  const addRecentQuery = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    const current = loadSearchQueries();
    const next = [normalized, ...current.filter((item) => item !== normalized)].slice(0, MAX_SEARCH_QUERIES);
    saveSearchQueries(next);
    setRecentQueries(next);
    window.dispatchEvent(new Event(SEARCH_QUERY_EVENT));
  };

  const clearRecentQueries = () => {
    saveSearchQueries([]);
    setRecentQueries([]);
    window.dispatchEvent(new Event(SEARCH_QUERY_EVENT));
  };

  const results = useMemo((): SearchResult[] => {
    const q = query.trim();
    if (!q) return [];
    const lower = q.toLowerCase();

    // 지역 검색
    const regionResults = SEARCH_INDEX_ENTRIES
      .filter((item) =>
        item.adm_nm.toLowerCase().includes(lower) ||
        shortName(item.adm_nm, item.level).toLowerCase().includes(lower)
      )
      .sort((a, b) => {
        const aShort = shortName(a.adm_nm, a.level).toLowerCase();
        const bShort = shortName(b.adm_nm, b.level).toLowerCase();
        const aExact = aShort === lower ? 0 : aShort.startsWith(lower) ? 1 : 2;
        const bExact = bShort === lower ? 0 : bShort.startsWith(lower) ? 1 : 2;
        return aExact - bExact;
      })
      .slice(0, 6)
      .map((item) => ({
        adm_cd: item.adm_cd,
        adm_nm: item.adm_nm,
        level: item.level,
        sido_cd: item.sido_cd ?? null,
        sido_nm: item.sido_nm ?? null,
        sigungu_cd: item.sigungu_cd ?? null,
        sigungu_nm: item.sigungu_nm ?? null,
        matchedText: query,
      }));

    const shortcutResults: SearchResult[] = DISTRICT_SHORTCUTS
      .filter((entry) => entry.normalized.includes(normalizeSearchText(q)))
      .slice(0, 6)
      .map((entry) => ({ ...entry.result, matchedText: query }));

    // 후보자 검색 — 이름 매치, 같은 (후보·정당·선거·선거구) 조합은 1개만 (동 단위 중복 제거)
    const historicalCandidateResults: SearchResult[] = (() => {
      const matched = cidxAll.filter((c) => c.n.toLowerCase().includes(lower));
      const seen = new Set<string>();
      const dedup: CidxEntry[] = [];
      for (const c of matched) {
        const key = `${c.n}|${c.p}|${c.e}|${c.d}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dedup.push(c);
        if (dedup.length >= 6) break;
      }
      return dedup.map(cidxToResult).map((r) => ({ ...r, matchedText: query }));
    })();

    const local9CandidateResults: SearchResult[] = local9Candidates
      .filter((candidate) => candidate.name.toLowerCase().includes(lower))
      .slice(0, 6)
      .map((candidate) => ({
        adm_cd: candidate.adm_cd,
        adm_nm: candidate.adm_nm,
        level: candidate.level,
        sido_cd: candidate.sido_cd,
        sido_nm: candidate.sido_nm,
        sigungu_cd: candidate.sigungu_cd,
        sigungu_nm: candidate.sigungu_nm,
        localDistrictKey: candidate.localDistrictKey,
        matchedText: query,
        electionHint: candidate.electionHint,
        candidate: {
          name: candidate.name,
          party: candidate.party,
          party_color: partyColor(candidate.party),
          election_label: candidate.electionLabel,
          election_district: candidate.district,
        },
      }));

    return [...local9CandidateResults, ...historicalCandidateResults, ...shortcutResults, ...regionResults];
  }, [query, cidxAll, local9Candidates]);

  const handleSelect = (result: SearchResult) => {
    addRecentQuery(query);
    onSelect(result);
    setQuery('');
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      handleSelect(results[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="search-wrap">
      <div className="search-box">
        <span className="search-icon"><Search size={15} strokeWidth={2.2} /></span>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="지역·후보자 검색 (예: 강서구, 이재명)"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIdx(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button className="search-clear" onClick={() => { setQuery(''); setOpen(false); }} aria-label="검색어 지우기">
            <X size={14} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="search-dropdown">
          {results.map((r, i) => {
            if (r.candidate) {
              const c = r.candidate;
              const sgShort = c.election_district;
              return (
                <li
                  key={`c-${r.adm_cd}-${c.name}-${c.election_label}-${i}`}
                  className={`search-item${i === activeIdx ? ' search-item-active' : ''}`}
                  onMouseDown={() => handleSelect(r)}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <span
                    className="search-item-name"
                    dangerouslySetInnerHTML={{ __html: highlight(c.name, query) }}
                  />
                  <span className="search-item-party" style={{ color: c.party_color }}>
                    {c.party}
                  </span>
                  <span className="search-item-parent">{sgShort}</span>
                  <span className="search-item-badge">{c.election_label}</span>
                </li>
              );
            }

            const short = r.searchLabel ?? shortName(r.adm_nm, r.level);
            const parent = r.searchParent ?? r.sido_nm ?? '';
            const fav = isFavorite(r.adm_cd);
            const badge = r.searchBadge ?? (r.level === 'sido' ? '시도' : r.level === 'sigungu' ? '시군구' : '읍면동');
            return (
              <li
                key={`${r.adm_cd}-${r.searchBadge ?? r.level}-${r.assemblyDistrictKey ?? r.localDistrictKey ?? r.electionHint?.localSubType ?? ''}`}
                className={`search-item${i === activeIdx ? ' search-item-active' : ''}`}
                onMouseDown={() => handleSelect(r)}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <span
                  className="search-item-name"
                  dangerouslySetInnerHTML={{ __html: highlight(short, query) }}
                />
                {parent && (
                  <span className="search-item-parent">{parent}</span>
                )}
                <span className="search-item-badge">
                  {badge}
                </span>
                {!r.searchBadge && (
                  <button
                    className={`search-item-fav${fav ? ' active' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleFavorite({
                        adm_cd: r.adm_cd,
                        adm_nm: r.adm_nm,
                        level: r.level,
                        sido_cd: r.sido_cd,
                        sido_nm: r.sido_nm,
                        sigungu_cd: r.sigungu_cd,
                        sigungu_nm: r.sigungu_nm,
                      });
                    }}
                    aria-label={fav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                    title={fav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                  >
                    <Star size={13} strokeWidth={2} fill={fav ? 'currentColor' : 'none'} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 빈 입력 상태: 즐겨찾기 + 최근 검색 */}
      {open && !query.trim() && (recentQueries.length > 0 || favorites.length > 0 || recent.length > 0) && (
        <div className="search-dropdown search-history">
          {recentQueries.length > 0 && (
            <div className="search-history-section">
              <div className="search-history-header">
                <Clock size={12} strokeWidth={2.5} />
                <span>최근 검색어</span>
                <button
                  className="search-history-clear"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    clearRecentQueries();
                  }}
                  aria-label="최근 검색어 모두 삭제"
                  title="모두 삭제"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </div>
              <ul className="search-history-list">
                {recentQueries.map((item) => (
                  <li
                    key={`q-${item}`}
                    className="search-item search-history-item"
                    onMouseDown={() => {
                      setQuery(item);
                      setOpen(true);
                      setActiveIdx(-1);
                    }}
                  >
                    <span className="search-item-name">{item}</span>
                    <span className="search-item-badge">검색어</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {favorites.length > 0 && (
            <div className="search-history-section">
              <div className="search-history-header">
                <Star size={12} strokeWidth={2.5} />
                <span>즐겨찾기</span>
              </div>
              <ul className="search-history-list">
                {favorites.slice(0, 8).map((h) => (
                  <li
                    key={`f-${h.adm_cd}`}
                    className="search-item search-history-item"
                    onMouseDown={() => handleSelect(historyToSearchResult(h))}
                  >
                    <span className="search-item-name">{shortName(h.adm_nm, h.level)}</span>
                    {h.sido_nm && h.level !== 'sido' && (
                      <span className="search-item-parent">{h.sido_nm}</span>
                    )}
                    <button
                      className="search-item-fav active"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavorite(h);
                      }}
                      aria-label="즐겨찾기 해제"
                    >
                      <Star size={13} strokeWidth={2} fill="currentColor" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recent.length > 0 && (
            <div className="search-history-section">
              <div className="search-history-header">
                <Clock size={12} strokeWidth={2.5} />
                <span>최근 방문</span>
                <button
                  className="search-history-clear"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    clearRecent();
                  }}
                  aria-label="최근 검색 모두 삭제"
                  title="모두 삭제"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </div>
              <ul className="search-history-list">
                {recent.slice(0, 8).map((h) => {
                  const fav = isFavorite(h.adm_cd);
                  return (
                    <li
                      key={`r-${h.adm_cd}`}
                      className="search-item search-history-item"
                      onMouseDown={() => handleSelect(historyToSearchResult(h))}
                    >
                      <span className="search-item-name">{shortName(h.adm_nm, h.level)}</span>
                      {h.sido_nm && h.level !== 'sido' && (
                        <span className="search-item-parent">{h.sido_nm}</span>
                      )}
                      <button
                        className={`search-item-fav${fav ? ' active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorite(h);
                        }}
                        aria-label={fav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                      >
                        <Star size={13} strokeWidth={2} fill={fav ? 'currentColor' : 'none'} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {open && query.trim() && results.length === 0 && (
        <div className="search-empty">검색 결과가 없습니다</div>
      )}
    </div>
  );
}
