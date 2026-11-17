import { useMemo } from 'react';
import type { Trade } from '../types';
import { weekdayPnl } from '../utils/weekdayPnl';

function money(n: number) {
  const sign = n < 0 ? '−' : n > 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function WeekdayPnl({ trades }: { trades: Trade[] }) {
  const rows = useMemo(() => weekdayPnl(trades), [trades]);
  const peak = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  if (!trades.length) return null;

  return (
    <section className="panel weekday-pnl">
      <h2>PnL by weekday</h2>
      <p className="hint">Exit-day totals — useful for calendar / weekend effects.</p>
      <div className="weekday-pnl__grid">
        {rows.map((r) => (
          <div key={r.day} className="weekday-pnl__cell">
            <span className="weekday-pnl__day mono">{r.day}</span>
            <div className="weekday-pnl__bar">
              <span
                style={{
                  height: `${Math.max(6, (Math.abs(r.pnl) / peak) * 100)}%`,
                  background: r.pnl >= 0 ? 'rgba(79,214,160,0.8)' : 'rgba(229,122,132,0.8)',
                }}
              />
            </div>
            <span className={`mono ${r.pnl >= 0 ? 'pos' : 'neg'}`}>{r.count ? money(r.pnl) : '—'}</span>
            <small className="hint">{r.count || 0}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
