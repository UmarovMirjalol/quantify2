import { useMemo } from 'react';
import type { Trade } from '../types';
import { exitAttribution } from '../utils/exitAttribution';

function money(n: number) {
  const sign = n < 0 ? '−' : n > 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function ExitAttribution({ trades }: { trades: Trade[] }) {
  const rows = useMemo(() => exitAttribution(trades), [trades]);
  if (!rows.length) return null;
  const peak = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);

  return (
    <section className="panel exit-attr">
      <h2>PnL by exit reason</h2>
      <p className="hint">Where the edge (or the bleed) actually comes from.</p>
      <ul className="exit-attr__list">
        {rows.map((r) => (
          <li key={r.reason}>
            <div className="exit-attr__row">
              <span className="exit-attr__name">{r.reason}</span>
              <span className="mono hint">{r.count} trades</span>
              <span className={`mono ${r.pnl >= 0 ? 'pos' : 'neg'}`}>{money(r.pnl)}</span>
            </div>
            <div className="exit-attr__bar">
              <span
                style={{
                  width: `${Math.max(4, (Math.abs(r.pnl) / peak) * 100)}%`,
                  background: r.pnl >= 0 ? 'rgba(79,214,160,0.75)' : 'rgba(229,122,132,0.75)',
                }}
              />
            </div>
            <span className="hint">
              Win rate {r.win_rate == null ? '—' : `${(r.win_rate * 100).toFixed(0)}%`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
