import { useMemo } from 'react';
import type { Trade } from '../types';

export function TradeEquityPath({ trades, initial = 0 }: { trades: Trade[]; initial?: number }) {
  const path = useMemo(() => {
    let eq = initial;
    const pts: { x: number; y: number }[] = [{ x: 0, y: eq }];
    trades.forEach((t, i) => {
      eq += t.pnl;
      pts.push({ x: i + 1, y: eq });
    });
    return pts;
  }, [trades, initial]);

  if (path.length < 2) return null;

  const ys = path.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(1e-9, maxY - minY);
  const w = 320;
  const h = 88;
  const pad = 4;
  const d = path
    .map((p, i) => {
      const x = pad + (p.x / (path.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (p.y - minY) / span) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = path[path.length - 1].y;
  const up = last >= initial;

  return (
    <section className="panel trade-equity-path">
      <h2>Trade-by-trade equity</h2>
      <p className="hint">Cumulative PnL after each close — ignores mark-to-market between fills.</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="trade-equity-path__svg" preserveAspectRatio="none">
        <path d={d} fill="none" stroke={up ? 'rgba(79,214,160,0.9)' : 'rgba(229,122,132,0.9)'} strokeWidth="2" />
      </svg>
      <div className="btn-row" style={{ marginTop: '0.5rem' }}>
        <span className={`mono ${up ? 'pos' : 'neg'}`}>
          {last >= 0 ? '+' : '−'}${Math.abs(last).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
        <span className="hint mono">{trades.length} closes</span>
      </div>
    </section>
  );
}
