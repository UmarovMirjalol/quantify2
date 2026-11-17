import type { Trade } from '../types';

export type SpotlightTrade = Trade & { rank: 'best' | 'worst'; index: number };

export function tradeSpotlight(trades: Trade[], n = 3): { best: SpotlightTrade[]; worst: SpotlightTrade[] } {
  if (!trades.length) return { best: [], worst: [] };
  const indexed = trades.map((t, index) => ({ ...t, index }));
  const byPnl = [...indexed].sort((a, b) => b.pnl - a.pnl);
  const best = byPnl.slice(0, Math.min(n, byPnl.length)).map((t) => ({ ...t, rank: 'best' as const }));
  const worst = [...byPnl]
    .reverse()
    .slice(0, Math.min(n, byPnl.length))
    .map((t) => ({ ...t, rank: 'worst' as const }));
  return { best, worst };
}
