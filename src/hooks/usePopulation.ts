import { useState, useEffect } from 'react';
import type { PopulationData } from '../types';
import { getPopulation } from '../services';

export function usePopulation(admCd: string | null) {
  const [data, setData] = useState<PopulationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admCd) return;
    Promise.resolve()
      .then(() => {
        setLoading(true);
        setError(null);
        return getPopulation(admCd);
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [admCd]);

  return { data, loading, error };
}
