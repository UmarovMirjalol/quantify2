import type { BacktestResult, EquityPoint } from '../types';

export type BookMember = {
  id: number;
  weight: number;
  label: string;
};

export type BookReport = {
  equity: EquityPoint[];
  total_return: number | null;
  max_drawdown: number | null;
  correlations: number[][];
  labels: string[];
};

function dailyReturns(curve: EquityPoint[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].equity;
    const cur = curve[i].equity;
    if (prev > 0) out.set(curve[i].date.slice(0, 10), cur / prev - 1);
  }
  return out;
}

/** Equal or custom-weight blend of saved run equity curves (return space). */
export function blendBook(runs: BacktestResult[], weights?: Record<number, number>): BookReport {
  if (!runs.length) {
    return { equity: [], total_return: null, max_drawdown: null, correlations: [], labels: [] };
  }
  const labels = runs.map((r) => `#${r.id}`);
  const retMaps = runs.map((r) => dailyReturns(r.equity_curve));
  const dates = [...new Set(retMaps.flatMap((m) => [...m.keys()]))].sort();
  const wRaw = runs.map((r) => weights?.[r.id] ?? 1);
  const wSum = wRaw.reduce((s, v) => s + v, 0) || 1;
  const w = wRaw.map((v) => v / wSum);

  let eq = 10_000;
  let peak = eq;
  let maxDd = 0;
  const equity: EquityPoint[] = [];
  for (const d of dates) {
    let mixed = 0;
    let covered = 0;
    runs.forEach((_, i) => {
      const r = retMaps[i].get(d);
      if (r == null) return;
      mixed += w[i] * r;
      covered += w[i];
    });
    if (covered < 0.5) continue;
    mixed /= covered;
    eq *= 1 + mixed;
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? eq / peak - 1 : 0;
    if (dd < maxDd) maxDd = dd;
    equity.push({ date: d, equity: eq, cash: 0, drawdown: dd });
  }

  const n = runs.length;
  const correlations: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    correlations[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const d of dates) {
        const a = retMaps[i].get(d);
        const b = retMaps[j].get(d);
        if (a == null || b == null) continue;
        xs.push(a);
        ys.push(b);
      }
      const rho = pearson(xs, ys);
      correlations[i][j] = rho;
      correlations[j][i] = rho;
    }
  }

  const total_return = equity.length ? equity[equity.length - 1].equity / 10_000 - 1 : null;
  return { equity, total_return, max_drawdown: equity.length ? maxDd : null, correlations, labels };
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 5) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}
