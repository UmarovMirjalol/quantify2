import type { Trade } from '../types';

export type HoldBucket = { label: string; count: number; pnl: number };

const EDGES = [1, 2, 3, 5, 8, 13, 21, 34, 55, Infinity];
const LABELS = ['1', '2', '3', '4–5', '6–8', '9–13', '14–21', '22–34', '35–55', '56+'];

export function holdDuration(trades: Trade[]): HoldBucket[] {
  const buckets = LABELS.map((label) => ({ label, count: 0, pnl: 0 }));
  for (const t of trades) {
    const bars = Math.max(0, t.bars_held ?? 0);
    let i = 0;
    while (i < EDGES.length - 1 && bars > EDGES[i]) i += 1;
    buckets[i].count += 1;
    buckets[i].pnl += t.pnl;
  }
  return buckets;
}
