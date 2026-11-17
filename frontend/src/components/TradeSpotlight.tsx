import { useMemo } from 'react';
import type { Trade } from '../types';
import { tradeSpotlight } from '../utils/tradeSpotlight';

function money(n: number) {
  const sign = n < 0 ? '−' : n > 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function Card({
  title,
  tone,
  trades,
}: {
  title: string;
  tone: 'pos' | 'neg';
  trades: (Trade & { index: number })[];
}) {
  if (!trades.length) return null;
  return (
    <div className={`trade-spot__col trade-spot__col--${tone}`}>
      <h3>{title}</h3>
      <ul>
        {trades.map((t) => (
          <li key={`${tone}-${t.index}`}>
            <div className="trade-spot__top">
              <span className={`mono ${tone}`}>{money(t.pnl)}</span>
              <span className="hint mono">{(t.return_pct * 100).toFixed(1)}%</span>
            </div>
            <div className="trade-spot__meta hint">
              {t.entry_date.slice(0, 10)} → {t.exit_date.slice(0, 10)} · {t.bars_held}b · {t.exit_reason || 'exit'}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TradeSpotlight({ trades }: { trades: Trade[] }) {
  const { best, worst } = useMemo(() => tradeSpotlight(trades, 3), [trades]);
  if (!trades.length) return null;

  return (
    <section className="panel trade-spot">
      <h2>Trade spotlight</h2>
      <p className="hint">The three that made the book — and the three that hurt.</p>
      <div className="trade-spot__grid">
        <Card title="Best" tone="pos" trades={best} />
        <Card title="Worst" tone="neg" trades={worst} />
      </div>
    </section>
  );
}
