import type { EquityPoint } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type HeatCell = { year: number; month: number; label: string; ret: number | null };

export type MonthlyHeatmapData = {
  years: number[];
  months: string[];
  cells: HeatCell[];
  byKey: Map<string, number>;
};

/** Year × month return grid from equity curve. */
export function buildMonthlyHeatmap(curve: EquityPoint[]): MonthlyHeatmapData {
  const byMonth = new Map<string, { first: number; last: number }>();
  for (const p of curve) {
    const key = p.date.slice(0, 7);
    const cur = byMonth.get(key);
    if (!cur) byMonth.set(key, { first: p.equity, last: p.equity });
    else cur.last = p.equity;
  }
  const byKey = new Map<string, number>();
  const years = new Set<number>();
  for (const [key, v] of byMonth) {
    if (v.first <= 0) continue;
    const ret = (v.last - v.first) / v.first;
    byKey.set(key, ret);
    years.add(Number(key.slice(0, 4)));
  }
  const yearList = [...years].sort((a, b) => a - b);
  const cells: HeatCell[] = [];
  for (const y of yearList) {
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      cells.push({
        year: y,
        month: m,
        label: key,
        ret: byKey.has(key) ? (byKey.get(key) as number) : null,
      });
    }
  }
  return { years: yearList, months: MONTHS, cells, byKey };
}

export function heatTone(ret: number | null): string {
  if (ret == null) return 'transparent';
  const s = Math.min(1, Math.abs(ret) / 0.08);
  return ret >= 0
    ? `rgba(79, 214, 160, ${0.12 + s * 0.72})`
    : `rgba(229, 122, 132, ${0.12 + s * 0.72})`;
}
