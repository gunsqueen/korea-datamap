import { useState, useEffect } from 'react';
import type { AdminGeoCollection, AdminLevel } from '../types';
import { getBoundary } from '../services';

export function useBoundary(admCd: string, level: AdminLevel) {
  const [data, setData] = useState<AdminGeoCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setLoading(true);
        setError(null);
        return getBoundary(admCd, level);
      })
      .then((result) => {
        if (!cancelled && result) setData(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [admCd, level]);

  return { data, loading, error };
}
