import type { Trade } from '../types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type WeekdayBucket = {
  day: string;
  dow: number;
  count: number;
  pnl: number;
};

/** Aggregate trade PnL by exit weekday (local parse of exit_date). */
export function weekdayPnl(trades: Trade[]): WeekdayBucket[] {
  const buckets = DAYS.map((day, dow) => ({ day, dow, count: 0, pnl: 0 }));
  for (const t of trades) {
    const d = new Date(t.exit_date);
    if (Number.isNaN(d.getTime())) continue;
    const dow = d.getUTCDay();
    buckets[dow].count += 1;
    buckets[dow].pnl += t.pnl;
  }
  return buckets;
}
