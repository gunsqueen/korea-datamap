import { useEffect, useState, useRef } from 'react';
import type { AdminGeoFeature } from '../types';
import { getElection } from '../services';

export interface ChoroplethEntry {
  color: string;
  party: string;
  voteRate: number;
  winnerName?: string;
}

/** (electionId, adm_cd) → 승자 정당 색상 캐시 (세션 단위) */
const CACHE = new Map<string, ChoroplethEntry | null>();

/**
 * 선거 탭이 활성화되고 electionId가 있을 때,
 * 현재 화면의 features 각 지역별 1위 후보 정당 색을 조회한다.
 *
 * 결과는 Map<adm_cd, ChoroplethEntry>로 반환되며, 진행 중인 데이터는 점진적으로 채워진다.
 */
export function useChoropleth(
  electionId: string | null | undefined,
  features: AdminGeoFeature[],
  enabled: boolean,
): { map: Map<string, ChoroplethEntry>; loading: boolean; progress: number } {
  const [map, setMap] = useState<Map<string, ChoroplethEntry>>(new Map());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(1); // 0~1
  const abortRef = useRef<{ aborted: boolean } | null>(null);

  useEffect(() => {
    // 이전 요청 취소
    if (abortRef.current) abortRef.current.aborted = true;

    if (!enabled || !electionId || features.length === 0) {
      setMap(new Map());
      setLoading(false);
      setProgress(1);
      return;
    }

    const token = { aborted: false };
    abortRef.current = token;

    const result = new Map<string, ChoroplethEntry>();
    setLoading(true);
    setProgress(0);

    // 캐시 선주입
    for (const f of features) {
      const key = `${electionId}|${f.properties.adm_cd}`;
      const cached = CACHE.get(key);
      if (cached) result.set(f.properties.adm_cd, cached);
    }
    setMap(new Map(result));

    const toFetch = features.filter(
      (f) => !CACHE.has(`${electionId}|${f.properties.adm_cd}`),
    );

    if (toFetch.length === 0) {
      setLoading(false);
      setProgress(1);
      return;
    }

    let done = 0;
    const total = toFetch.length;

    // 동시 실행 개수 제한 (UI 반응성)
    const CONCURRENCY = 6;
    let idx = 0;

    const runNext = async (): Promise<void> => {
      if (token.aborted) return;
      const i = idx++;
      if (i >= total) return;
      const feat = toFetch[i];
      const admCd = feat.properties.adm_cd;
      const admNm = feat.properties.adm_nm;
      const cacheKey = `${electionId}|${admCd}`;
      try {
        const data = await getElection(admCd, electionId, admNm);
        if (token.aborted) return;
        // 1위 후보 (rank === 1 또는 votes 최대)
        const top = data.candidates[0];
        if (top && top.votes > 0) {
          const entry: ChoroplethEntry = {
            color: top.party_color,
            party: top.party,
            voteRate: top.vote_rate,
            winnerName: top.name,
          };
          CACHE.set(cacheKey, entry);
          result.set(admCd, entry);
        } else if (top && data.is_uncontested) {
          const entry: ChoroplethEntry = {
            color: top.party_color,
            party: top.party,
            voteRate: 100,
            winnerName: top.name,
          };
          CACHE.set(cacheKey, entry);
          result.set(admCd, entry);
        } else {
          CACHE.set(cacheKey, null);
        }
      } catch {
        CACHE.set(cacheKey, null);
      }
      done += 1;
      if (!token.aborted) {
        // 점진 업데이트 - 과도한 리렌더 방지 위해 몇 개씩 배치
        if (done % 3 === 0 || done === total) {
          setMap(new Map(result));
          setProgress(done / total);
        }
      }
      return runNext();
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => runNext());
    Promise.all(workers).then(() => {
      if (token.aborted) return;
      setMap(new Map(result));
      setProgress(1);
      setLoading(false);
    });

    return () => {
      token.aborted = true;
    };
  }, [electionId, features, enabled]);

  return { map, loading, progress };
}
