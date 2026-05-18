import { useState, useEffect, useCallback } from 'react';

export type Density = 'comfortable' | 'compact';

function getInitialDensity(): Density {
  try {
    const stored = localStorage.getItem('density') as Density | null;
    if (stored === 'comfortable' || stored === 'compact') return stored;
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches) {
    return 'compact';
  }
  return 'comfortable';
}

export function useDensity() {
  const [density, setDensity] = useState<Density>(getInitialDensity);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
    try {
      localStorage.setItem('density', density);
    } catch {
      // ignore
    }
  }, [density]);

  const toggle = useCallback(() => {
    setDensity(d => (d === 'comfortable' ? 'compact' : 'comfortable'));
  }, []);

  return { density, toggle };
}
