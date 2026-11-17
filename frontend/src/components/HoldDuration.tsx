import { useMemo } from 'react';
import type { Trade } from '../types';
import { holdDuration } from '../utils/holdDuration';

function money(n: number) {
  const sign = n < 0 ? '−' : n > 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function HoldDuration({ trades }: { trades: Trade[] }) {
  const rows = useMemo(() => holdDuration(trades), [trades]);
  const peak = Math.max(...rows.map((r) => r.count), 1);
  if (!trades.length) return null;

  return (
    <section className="panel hold-dur">
      <h2>Hold duration</h2>
      <p className="hint">Bars held · Fibonacci buckets with PnL tint.</p>
      <div className="hold-dur__grid">
        {rows.map((r) => (
          <div key={r.label} className="hold-dur__cell" title={money(r.pnl)}>
            <span className="hold-dur__label mono">{r.label}</span>
            <div className="hold-dur__bar">
              <span
                style={{
                  height: `${Math.max(r.count ? 8 : 0, (r.count / peak) * 100)}%`,
                  background:
                    r.count === 0
                      ? 'transparent'
                      : r.pnl >= 0
                        ? 'rgba(79,214,160,0.8)'
                        : 'rgba(229,122,132,0.8)',
                }}
              />
            </div>
            <span className="mono hint">{r.count || '—'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
