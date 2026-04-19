import { useState, useCallback, useEffect } from 'react';
import type { AdminLevel } from '../types';

export interface RegionHistoryItem {
  adm_cd: string;
  adm_nm: string;
  level: AdminLevel;
  sido_cd?: string | null;
  sido_nm?: string | null;
  sigungu_cd?: string | null;
  sigungu_nm?: string | null;
  visitedAt: number; // epoch ms
}

const RECENT_KEY = 'datamap.recent.v1';
export const FAV_KEY = 'datamap.favorites.v1';
const MAX_RECENT = 12;

function safeLoad<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSave<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage 접근 실패 (시크릿 모드 등) 무시
  }
}

/** 크로스 탭 동기화용 커스텀 이벤트 */
const CHANGE_EVENT = 'datamap:history:change';

export function useRegionHistory() {
  const [recent, setRecent] = useState<RegionHistoryItem[]>(() =>
    safeLoad<RegionHistoryItem[]>(RECENT_KEY, []),
  );
  const [favorites, setFavorites] = useState<RegionHistoryItem[]>(() =>
    safeLoad<RegionHistoryItem[]>(FAV_KEY, []),
  );

  // 동일 윈도우 내 다른 컴포넌트 인스턴스 간 동기화
  useEffect(() => {
    const handler = () => {
      setRecent(safeLoad<RegionHistoryItem[]>(RECENT_KEY, []));
      setFavorites(safeLoad<RegionHistoryItem[]>(FAV_KEY, []));
    };
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener('storage', handler); // 다른 탭
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const addRecent = useCallback((item: Omit<RegionHistoryItem, 'visitedAt'>) => {
    const current = safeLoad<RegionHistoryItem[]>(RECENT_KEY, []);
    const filtered = current.filter((r) => r.adm_cd !== item.adm_cd);
    const next = [{ ...item, visitedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT);
    safeSave(RECENT_KEY, next);
    setRecent(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const clearRecent = useCallback(() => {
    safeSave(RECENT_KEY, []);
    setRecent([]);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const toggleFavorite = useCallback((item: Omit<RegionHistoryItem, 'visitedAt'>) => {
    const current = safeLoad<RegionHistoryItem[]>(FAV_KEY, []);
    const exists = current.some((f) => f.adm_cd === item.adm_cd);
    const next = exists
      ? current.filter((f) => f.adm_cd !== item.adm_cd)
      : [{ ...item, visitedAt: Date.now() }, ...current].slice(0, 30);
    safeSave(FAV_KEY, next);
    setFavorites(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const isFavorite = useCallback(
    (adm_cd: string) => favorites.some((f) => f.adm_cd === adm_cd),
    [favorites],
  );

  return {
    recent,
    favorites,
    addRecent,
    clearRecent,
    toggleFavorite,
    isFavorite,
  };
}
