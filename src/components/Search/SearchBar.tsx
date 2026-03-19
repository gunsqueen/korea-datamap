import { useState, useMemo } from 'react';
import type { AdminArea } from '../../types';
import sidoData from '../../data/mock/sido.json';

interface Props {
  onSelect: (area: AdminArea) => void;
  autoFocus?: boolean;
}

export function SearchBar({ onSelect, autoFocus }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return sidoData.features
      .filter((f) =>
        f.properties.adm_nm.includes(query) ||
        (f.properties.addr_en?.toLowerCase().includes(query.toLowerCase()) ?? false)
      )
      .slice(0, 8)
      .map((f) => ({
        adm_cd: f.properties.adm_cd,
        adm_nm: f.properties.adm_nm,
        level: 'sido' as const,
      }));
  }, [query]);

  const handleSelect = (area: AdminArea) => {
    onSelect(area);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="search-wrap">
      <div className="search-box">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          placeholder="지역 검색 (예: 서울, 부산)"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery('')}>✕</button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="search-dropdown">
          {results.map((r) => (
            <li
              key={r.adm_cd}
              className="search-item"
              onMouseDown={() => handleSelect(r)}
            >
              <span className="search-item-name">{r.adm_nm}</span>
              <span className="search-item-code">{r.adm_cd}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
