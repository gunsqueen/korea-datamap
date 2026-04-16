import { useState, useMemo, useRef, useEffect } from 'react';
import type { AdminLevel, ElectionHint } from '../../types';
import searchIndex from '../../data/static/search_index.json';

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

function cidxToResult(c: CidxEntry): SearchResult {
  return {
    adm_cd: c.cd,
    adm_nm: c.an,  // 읍면동 전체명 (예: "서울특별시 강서구 화곡3동") — 선거 데이터 조회 필수
    level: 'eupmyeondong',
    sido_cd: c.rc,
    sido_nm: c.rn,
    sigungu_cd: c.sc,
    sigungu_nm: c.sn,
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
    electionHint: getElectionHint(c.e),
  };
}

interface Props {
  onSelect: (result: SearchResult) => void;
  autoFocus?: boolean;
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
  const inputRef = useRef<HTMLInputElement>(null);

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

  const results = useMemo((): SearchResult[] => {
    const q = query.trim();
    if (!q) return [];
    const lower = q.toLowerCase();

    // 지역 검색
    const regionResults = (searchIndex as SearchResult[])
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
      .map((item) => ({ ...item, matchedText: query }));

    // 후보자 검색 — 이름 매치 후 최신 선거 우선 정렬 (배열 순서가 최신순)
    const candidateResults: SearchResult[] = cidxAll
      .filter((c) => c.n.toLowerCase().includes(lower))
      .slice(0, 6)
      .map(cidxToResult)
      .map((r) => ({ ...r, matchedText: query }));

    return [...candidateResults, ...regionResults];
  }, [query, cidxAll]);

  const handleSelect = (result: SearchResult) => {
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
        <span className="search-icon">🔍</span>
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
          <button className="search-clear" onClick={() => { setQuery(''); setOpen(false); }}>✕</button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="search-dropdown">
          {results.map((r, i) => {
            if (r.candidate) {
              const c = r.candidate;
              // 시군구명에서 시도 제거 (예: '서울특별시 종로구' → '종로구')
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

            const short = shortName(r.adm_nm, r.level);
            const parent = r.sido_nm ?? '';
            return (
              <li
                key={r.adm_cd}
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
                  {r.level === 'sido' ? '시도' : '시군구'}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {open && query.trim() && results.length === 0 && (
        <div className="search-empty">검색 결과가 없습니다</div>
      )}
    </div>
  );
}
