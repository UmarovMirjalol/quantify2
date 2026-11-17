import type { EquityPoint } from '../types';

export type RollingPoint = { date: string; sharpe: number | null; vol: number | null };

/** Trailing window Sharpe (ann. √252) and vol from equity curve. */
export function rollingSharpeVol(curve: EquityPoint[], window = 63): RollingPoint[] {
  if (curve.length < window + 1) return [];
  const out: RollingPoint[] = [];
  for (let i = window; i < curve.length; i++) {
    const rets: number[] = [];
    for (let j = i - window + 1; j <= i; j++) {
      const prev = curve[j - 1].equity;
      const cur = curve[j].equity;
      if (prev > 0) rets.push((cur - prev) / prev);
    }
    if (rets.length < Math.floor(window * 0.7)) {
      out.push({ date: curve[i].date, sharpe: null, vol: null });
      continue;
    }
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const varSum = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1);
    const std = Math.sqrt(varSum);
    out.push({
      date: curve[i].date,
      sharpe: std > 1e-12 ? (mean / std) * Math.sqrt(252) : null,
      vol: std * Math.sqrt(252),
    });
  }
  return out;
}
