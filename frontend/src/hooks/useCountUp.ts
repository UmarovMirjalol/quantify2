import { useEffect, useRef, useState } from 'react';

export function useCountUp(
  target: number,
  {
    active = true,
    duration = 900,
    decimals = 0,
    reduced = false,
    /** When true, subsequent target changes animate from the current value. */
    fromCurrent = false,
  }: {
    active?: boolean;
    duration?: number;
    decimals?: number;
    reduced?: boolean;
    fromCurrent?: boolean;
  } = {},
): number {
  const [value, setValue] = useState(reduced || !active ? target : 0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const primed = useRef(false);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      primed.current = true;
      return;
    }
    if (!active) {
      setValue(0);
      primed.current = false;
      return;
    }

    let raf = 0;
    const start = performance.now();
    const from = fromCurrent && primed.current ? valueRef.current : 0;
    primed.current = true;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(Number(next.toFixed(decimals)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, decimals, duration, fromCurrent, reduced, target]);

  return value;
}
