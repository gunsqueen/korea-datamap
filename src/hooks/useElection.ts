import { useState, useEffect } from 'react';
import type { ElectionData } from '../types';
import { getElection } from '../services';

export function useElection(admCd: string | null, electionId?: string, admNm?: string) {
  const [data, setData] = useState<ElectionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admCd) return;
    setLoading(true);
    setError(null);
    getElection(admCd, electionId, admNm)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [admCd, electionId, admNm]);

  return { data, loading, error };
}
