import { useEffect, useState } from 'react';

const KEY = 'quantify_density';

export type Density = 'comfortable' | 'compact';

function read(): Density {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

/** Persist UI density on <html data-density>. */
export function useDensity() {
  const [density, setDensity] = useState<Density>(() => (typeof window === 'undefined' ? 'comfortable' : read()));

  useEffect(() => {
    document.documentElement.dataset.density = density;
    try {
      localStorage.setItem(KEY, density);
    } catch {
      // ignore
    }
  }, [density]);

  function toggle() {
    setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'));
  }

  return { density, setDensity, toggle };
}
