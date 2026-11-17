import type { WhatIfPoint } from '../services/api';

export type YearBucket = {
  year: string;
  start: number;
  end: number;
  return_pct: number;
  invested_end: number;
};

/** Calendar-year returns from a what-if value series. */
export function whatIfYearly(series: WhatIfPoint[]): YearBucket[] {
  if (series.length < 2) return [];
  const byYear = new Map<string, WhatIfPoint[]>();
  for (const p of series) {
    const y = p.date.slice(0, 4);
    const list = byYear.get(y) || [];
    list.push(p);
    byYear.set(y, list);
  }
  const out: YearBucket[] = [];
  for (const [year, pts] of [...byYear.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (pts.length < 2) continue;
    const start = pts[0].value;
    const end = pts[pts.length - 1].value;
    out.push({
      year,
      start,
      end,
      return_pct: start > 0 ? end / start - 1 : 0,
      invested_end: pts[pts.length - 1].invested,
    });
  }
  return out;
}

/** Peak-to-trough underwater path from value series (fraction). */
export function whatIfUnderwater(series: WhatIfPoint[]): { date: string; dd: number }[] {
  let peak = series[0]?.value ?? 0;
  return series.map((p) => {
    if (p.value > peak) peak = p.value;
    return { date: p.date, dd: peak > 0 ? p.value / peak - 1 : 0 };
  });
}
