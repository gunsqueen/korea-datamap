import { useState, useMemo, useRef } from 'react';
import type { AdminLevel } from '../../types';
import searchIndex from '../../data/static/search_index.json';

export interface SearchResult {
  adm_cd: string;
  adm_nm: string;
  level: AdminLevel;
  sido_cd: string | null;
  sido_nm: string | null;
  /** 검색어에서 일치한 부분 (하이라이팅용) */
  matchedText: string;
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

/** 시군구 단축 이름: "서울특별시 강서구" → "강서구" */
function shortName(adm_nm: string, level: AdminLevel): string {
  if (level === 'sido') return adm_nm;
  return adm_nm.split(/\s+/).pop() ?? adm_nm;
}

export function SearchBar({ onSelect, autoFocus }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo((): SearchResult[] => {
    const q = query.trim();
    if (!q) return [];

    const lower = q.toLowerCase();
    return (searchIndex as SearchResult[])
      .filter((item) =>
        item.adm_nm.toLowerCase().includes(lower) ||
        shortName(item.adm_nm, item.level).toLowerCase().includes(lower)
      )
      .sort((a, b) => {
        // 정확히 일치하는 단축 이름 우선
        const aShort = shortName(a.adm_nm, a.level).toLowerCase();
        const bShort = shortName(b.adm_nm, b.level).toLowerCase();
        const aExact = aShort === lower ? 0 : aShort.startsWith(lower) ? 1 : 2;
        const bExact = bShort === lower ? 0 : bShort.startsWith(lower) ? 1 : 2;
        return aExact - bExact;
      })
      .slice(0, 12)
      .map((item) => ({ ...item, matchedText: query }));
  }, [query]);

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
          placeholder="시도·시군구 검색 (예: 강서구, 수원시)"
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
