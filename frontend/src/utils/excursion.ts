import type { PriceBar, Trade } from '../types';

export type ExcursionRow = {
  index: number;
  mae: number;
  mfe: number;
  capture: number | null;
  pnl: number;
  entry_date: string;
  exit_date: string;
};

function barIndex(bars: PriceBar[], iso: string): number {
  const d = iso.slice(0, 10);
  let lo = 0;
  let hi = bars.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const bd = bars[mid].date.slice(0, 10);
    if (bd === d) return mid;
    if (bd < d) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

/** Max adverse / favorable excursion vs entry, using bar highs/lows when available. */
export function tradeExcursions(trades: Trade[], prices: PriceBar[]): ExcursionRow[] {
  if (!trades.length || prices.length < 2) return [];
  return trades.map((t, index) => {
    const i0 = barIndex(prices, t.entry_date);
    const i1 = Math.max(i0, barIndex(prices, t.exit_date));
    const entry = t.entry_price;
    const short = (t.side || 'long').toLowerCase() === 'short';
    let mae = 0;
    let mfe = 0;
    for (let i = i0; i <= i1; i++) {
      const hi = prices[i].high ?? prices[i].close;
      const lo = prices[i].low ?? prices[i].close;
      if (short) {
        const adverse = entry > 0 ? (hi - entry) / entry : 0;
        const favor = entry > 0 ? (entry - lo) / entry : 0;
        mae = Math.max(mae, adverse);
        mfe = Math.max(mfe, favor);
      } else {
        const adverse = entry > 0 ? (entry - lo) / entry : 0;
        const favor = entry > 0 ? (hi - entry) / entry : 0;
        mae = Math.max(mae, adverse);
        mfe = Math.max(mfe, favor);
      }
    }
    const realized = t.return_pct;
    const capture = mfe > 1e-9 ? realized / mfe : null;
    return {
      index,
      mae,
      mfe,
      capture,
      pnl: t.pnl,
      entry_date: t.entry_date.slice(0, 10),
      exit_date: t.exit_date.slice(0, 10),
    };
  });
}

export function excursionSummary(rows: ExcursionRow[]) {
  if (!rows.length) return null;
  const avgMae = rows.reduce((s, r) => s + r.mae, 0) / rows.length;
  const avgMfe = rows.reduce((s, r) => s + r.mfe, 0) / rows.length;
  const caps = rows.map((r) => r.capture).filter((c): c is number => c != null);
  const avgCap = caps.length ? caps.reduce((s, c) => s + c, 0) / caps.length : null;
  return { avgMae, avgMfe, avgCap, n: rows.length };
}
