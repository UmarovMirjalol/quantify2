import { useMemo } from 'react';
import type { Trade } from '../types';

export function StreakStrip({ trades }: { trades: Trade[] }) {
  const cells = useMemo(
    () =>
      trades.map((t, i) => ({
        i,
        kind: t.pnl > 0 ? 'w' : t.pnl < 0 ? 'l' : 'f',
        pnl: t.pnl,
      })),
    [trades],
  );
  if (!cells.length) return null;

  return (
    <section className="panel streak-strip">
      <h2>Outcome strip</h2>
      <p className="hint">Every closed trade in order — green win, red loss.</p>
      <div className="streak-strip__rail" role="img" aria-label="Trade outcome strip">
        {cells.map((c) => (
          <i
            key={c.i}
            className={`streak-strip__tick streak-strip__tick--${c.kind}`}
            title={`#${c.i + 1} · ${c.pnl >= 0 ? '+' : ''}${c.pnl.toFixed(0)}`}
          />
        ))}
      </div>
    </section>
  );
}
