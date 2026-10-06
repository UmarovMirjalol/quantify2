import { useEffect, useState } from 'react';

export function useCountUp(
  target: number,
  {
    active = true,
    duration = 900,
    decimals = 0,
    reduced = false,
  }: { active?: boolean; duration?: number; decimals?: number; reduced?: boolean } = {},
): number {
  const [value, setValue] = useState(reduced || !active ? target : 0);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    if (!active) {
      setValue(0);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const from = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(Number(next.toFixed(decimals)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, decimals, duration, reduced, target]);

  return value;
}
