import { useState, useEffect } from 'react';
import type { PopulationData } from '../types';
import { getAggregatedPopulation, getPopulation } from '../services';

export function usePopulation(admCd: string | null, aggregate?: { admCds: string[]; admNm: string } | null) {
  const [data, setData] = useState<PopulationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admCd) return;
    Promise.resolve()
      .then(() => {
        setLoading(true);
        setError(null);
        if (aggregate?.admCds?.length) {
          return getAggregatedPopulation(aggregate.admCds, aggregate.admNm, admCd);
        }
        return getPopulation(admCd);
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [admCd, aggregate]);

  return { data, loading, error };
}
