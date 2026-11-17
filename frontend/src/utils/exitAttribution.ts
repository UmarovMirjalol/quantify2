import type { Trade } from '../types';

export type ExitBucket = {
  reason: string;
  count: number;
  pnl: number;
  win_rate: number | null;
};

/** Aggregate closed-trade PnL by exit_reason. */
export function exitAttribution(trades: Trade[]): ExitBucket[] {
  const map = new Map<string, { count: number; pnl: number; wins: number }>();
  for (const t of trades) {
    const reason = (t.exit_reason || 'unknown').replace(/_/g, ' ');
    const cur = map.get(reason) || { count: 0, pnl: 0, wins: 0 };
    cur.count += 1;
    cur.pnl += t.pnl;
    if (t.pnl > 0) cur.wins += 1;
    map.set(reason, cur);
  }
  return [...map.entries()]
    .map(([reason, v]) => ({
      reason,
      count: v.count,
      pnl: v.pnl,
      win_rate: v.count ? v.wins / v.count : null,
    }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
}
