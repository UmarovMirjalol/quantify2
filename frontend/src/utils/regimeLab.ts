import type { EquityPoint, PriceBar, Trade } from '../types';

export type RegimeKind = 'trend_ma' | 'vol' | 'underwater';

export type RegimeLabel = 'A' | 'B' | 'C';

export type RegimeBar = {
  date: string;
  label: RegimeLabel;
  name: string;
};

export type RegimeBucket = {
  key: RegimeLabel;
  name: string;
  trades: Trade[];
  pnl: number;
  win_rate: number | null;
  avg_return: number | null;
};

export type RegimeLabReport = {
  kind: RegimeKind;
  window: number;
  bars: RegimeBar[];
  buckets: RegimeBucket[];
  headline: string;
};

const NAMES: Record<RegimeKind, [string, string, string?]> = {
  trend_ma: ['Above MA', 'Below MA'],
  vol: ['Low vol', 'Mid vol', 'High vol'],
  underwater: ['At highs', 'Drawdown'],
};

function sma(closes: number[], window: number): Array<number | null> {
  const out: Array<number | null> = Array(closes.length).fill(null);
  let total = 0;
  closes.forEach((close, i) => {
    total += close;
    if (i >= window) total -= closes[i - window];
    if (i >= window - 1) out[i] = total / window;
  });
  return out;
}

function signalIndex(entry: string, dates: string[], index: Map<string, number>): number | null {
  if (!entry) return null;
  let found = index.get(entry);
  if (found == null) found = dates.findIndex((day) => day >= entry);
  if (found == null || found < 1) return null;
  return found - 1;
}

function bucketTrades(trades: Trade[], name: string, key: RegimeLabel): RegimeBucket {
  const pnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter((t) => t.pnl > 0).length;
  const avg =
    trades.length === 0 ? null : trades.reduce((s, t) => s + t.return_pct, 0) / trades.length;
  return {
    key,
    name,
    trades,
    pnl,
    win_rate: trades.length ? wins / trades.length : null,
    avg_return: avg,
  };
}

function headlineFor(kind: RegimeKind, buckets: RegimeBucket[]): string {
  const live = buckets.filter((b) => b.trades.length > 0);
  if (live.reduce((s, b) => s + b.trades.length, 0) < 3) {
    return 'Too few trades land in classified regimes for a firm read.';
  }
  const best = [...live].sort((a, b) => b.pnl - a.pnl)[0];
  const worst = [...live].sort((a, b) => a.pnl - b.pnl)[0];
  if (kind === 'trend_ma') {
    if (best.pnl > 0 && worst.pnl > 0) return 'Edge shows up on both sides of the moving average.';
    return `Profit concentrates in “${best.name}” (${best.trades.length} trades).`;
  }
  if (kind === 'vol') {
    return `Best bucket: ${best.name} · worst: ${worst.name}.`;
  }
  return best.key === 'A'
    ? 'Most profit arrives while equity is near highs.'
    : 'Most profit arrives while the book is underwater.';
}

export function buildRegimeLab(
  prices: PriceBar[],
  trades: Trade[],
  equity: EquityPoint[],
  kind: RegimeKind,
  window = 50,
): RegimeLabReport {
  const dates = prices.map((b) => b.date.slice(0, 10));
  const closes = prices.map((b) => b.close);
  const index = new Map(dates.map((d, i) => [d, i]));
  const names = NAMES[kind];
  const bars: RegimeBar[] = [];

  if (kind === 'trend_ma') {
    const used = closes.length >= window + 2 ? window : Math.min(20, Math.max(5, window));
    const avg = sma(closes, used);
    for (let i = 0; i < closes.length; i++) {
      if (avg[i] == null) continue;
      const above = closes[i] > (avg[i] as number);
      bars.push({
        date: dates[i],
        label: above ? 'A' : 'B',
        name: above ? names[0] : names[1],
      });
    }
    const grouped: Record<RegimeLabel, Trade[]> = { A: [], B: [], C: [] };
    for (const trade of trades) {
      const si = signalIndex(trade.entry_date.slice(0, 10), dates, index);
      if (si == null || avg[si] == null) continue;
      const above = closes[si] > (avg[si] as number);
      grouped[above ? 'A' : 'B'].push(trade);
    }
    const buckets = [
      bucketTrades(grouped.A, names[0], 'A'),
      bucketTrades(grouped.B, names[1], 'B'),
    ];
    return {
      kind,
      window: used,
      bars,
      buckets,
      headline: headlineFor(kind, buckets),
    };
  }

  if (kind === 'vol') {
    const used = Math.max(10, window);
    const rets: Array<number | null> = closes.map((c, i) =>
      i === 0 || closes[i - 1] <= 0 ? null : c / closes[i - 1] - 1,
    );
    const vol: Array<number | null> = Array(closes.length).fill(null);
    for (let i = used; i < closes.length; i++) {
      const slice = rets.slice(i - used + 1, i + 1).filter((v): v is number => v != null);
      if (slice.length < used * 0.8) continue;
      const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
      const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
      vol[i] = Math.sqrt(variance);
    }
    const finished = vol.filter((v): v is number => v != null).sort((a, b) => a - b);
    const t1 = finished[Math.floor(finished.length / 3)] ?? 0;
    const t2 = finished[Math.floor((2 * finished.length) / 3)] ?? 0;
    const labelAt = (v: number): RegimeLabel => (v <= t1 ? 'A' : v <= t2 ? 'B' : 'C');
    for (let i = 0; i < closes.length; i++) {
      if (vol[i] == null) continue;
      const lab = labelAt(vol[i] as number);
      bars.push({
        date: dates[i],
        label: lab,
        name: names[lab === 'A' ? 0 : lab === 'B' ? 1 : 2] as string,
      });
    }
    const barMap = new Map(bars.map((b) => [b.date, b]));
    const grouped: Record<RegimeLabel, Trade[]> = { A: [], B: [], C: [] };
    for (const trade of trades) {
      const si = signalIndex(trade.entry_date.slice(0, 10), dates, index);
      if (si == null) continue;
      const bar = barMap.get(dates[si]);
      if (!bar) continue;
      grouped[bar.label].push(trade);
    }
    const buckets = (['A', 'B', 'C'] as RegimeLabel[]).map((k, i) =>
      bucketTrades(grouped[k], names[i] as string, k),
    );
    return { kind, window: used, bars, buckets, headline: headlineFor(kind, buckets) };
  }

  // underwater from equity curve
  let peak = equity[0]?.equity ?? 0;
  const eqIndex = new Map(equity.map((p, i) => [p.date.slice(0, 10), i]));
  for (const p of equity) {
    if (p.equity > peak) peak = p.equity;
    const under = peak > 0 && p.equity < peak * 0.999;
    bars.push({
      date: p.date.slice(0, 10),
      label: under ? 'B' : 'A',
      name: under ? names[1] : names[0],
    });
  }
  const barMap = new Map(bars.map((b) => [b.date, b]));
  const grouped: Record<RegimeLabel, Trade[]> = { A: [], B: [], C: [] };
  for (const trade of trades) {
    const day = trade.entry_date.slice(0, 10);
    let bar = barMap.get(day);
    if (!bar) {
      const i = eqIndex.get(day);
      if (i != null) bar = bars[i];
    }
    if (!bar) continue;
    grouped[bar.label].push(trade);
  }
  const buckets = [
    bucketTrades(grouped.A, names[0], 'A'),
    bucketTrades(grouped.B, names[1], 'B'),
  ];
  return { kind, window: 0, bars, buckets, headline: headlineFor(kind, buckets) };
}
