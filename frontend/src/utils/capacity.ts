import type { PriceBar, Trade } from '../types';

export type CapacityReport = {
  available: boolean;
  headline: string;
  median_adv: number | null;
  median_participation: number | null;
  max_participation: number | null;
  trades_scored: number;
  high_participation: number;
  verdict: 'ok' | 'tight' | 'crowded' | 'unknown';
};

/** Rough capacity: trade notional vs ~20-day dollar ADV around entry. */
export function capacityReport(trades: Trade[], prices: PriceBar[]): CapacityReport {
  const withVol = prices.filter((p) => (p.volume ?? 0) > 0 && p.close > 0);
  if (!trades.length || withVol.length < 20) {
    return {
      available: false,
      headline: 'Need volume on the price series to estimate capacity.',
      median_adv: null,
      median_participation: null,
      max_participation: null,
      trades_scored: 0,
      high_participation: 0,
      verdict: 'unknown',
    };
  }

  const byDate = new Map(withVol.map((p) => [p.date.slice(0, 10), p]));
  const dollarVol = withVol.map((p) => p.close * (p.volume as number));
  const dates = withVol.map((p) => p.date.slice(0, 10));

  function advAt(date: string): number | null {
    const i = dates.findIndex((d) => d >= date.slice(0, 10));
    if (i < 0) return null;
    const start = Math.max(0, i - 19);
    const window = dollarVol.slice(start, i + 1);
    if (!window.length) return null;
    return window.reduce((a, b) => a + b, 0) / window.length;
  }

  const parts: number[] = [];
  const advs: number[] = [];
  for (const t of trades) {
    const bar = byDate.get(t.entry_date.slice(0, 10));
    const adv = advAt(t.entry_date);
    if (!bar || !adv || adv <= 0) continue;
    const notional = Math.abs(t.quantity * t.entry_price);
    parts.push(notional / adv);
    advs.push(adv);
  }

  if (!parts.length) {
    return {
      available: false,
      headline: 'Could not align trades with volume bars.',
      median_adv: null,
      median_participation: null,
      max_participation: null,
      trades_scored: 0,
      high_participation: 0,
      verdict: 'unknown',
    };
  }

  const sorted = [...parts].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  const maxP = Math.max(...parts);
  const high = parts.filter((p) => p > 0.01).length;
  let verdict: CapacityReport['verdict'] = 'ok';
  let headline = 'Participation stays modest vs recent dollar ADV.';
  if (mid > 0.05 || maxP > 0.15) {
    verdict = 'crowded';
    headline = 'Some fills take a large share of ADV — live capacity may be thinner than the backtest.';
  } else if (mid > 0.01 || maxP > 0.05) {
    verdict = 'tight';
    headline = 'Participation is material vs ADV. Size carefully before scaling capital.';
  }

  const medAdv = [...advs].sort((a, b) => a - b)[Math.floor(advs.length / 2)];
  return {
    available: true,
    headline,
    median_adv: medAdv,
    median_participation: mid,
    max_participation: maxP,
    trades_scored: parts.length,
    high_participation: high,
    verdict,
  };
}
