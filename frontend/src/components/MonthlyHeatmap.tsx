import { useMemo } from 'react';
import type { EquityPoint } from '../types';
import { buildMonthlyHeatmap, heatTone } from '../utils/monthlyHeatmap';

export function MonthlyHeatmap({ data }: { data: EquityPoint[] }) {
  const grid = useMemo(() => buildMonthlyHeatmap(data), [data]);
  if (grid.years.length < 1) {
    return <div className="empty-state">Not enough history for a monthly heatmap.</div>;
  }

  return (
    <div className="month-heat">
      <div className="month-heat__row month-heat__head">
        <span />
        {grid.months.map((m) => (
          <span key={m} className="month-heat__lab">
            {m}
          </span>
        ))}
      </div>
      {grid.years.map((y) => (
        <div key={y} className="month-heat__row">
          <span className="month-heat__year mono">{y}</span>
          {grid.months.map((_, mi) => {
            const cell = grid.cells.find((c) => c.year === y && c.month === mi + 1);
            const ret = cell?.ret ?? null;
            return (
              <span
                key={`${y}-${mi}`}
                className="month-heat__cell mono"
                style={{ background: heatTone(ret) }}
                title={ret == null ? `${y}-${mi + 1}: —` : `${cell?.label}: ${(ret * 100).toFixed(1)}%`}
              >
                {ret == null ? '' : `${(ret * 100).toFixed(0)}`}
              </span>
            );
          })}
        </div>
      ))}
      <p className="hint">Numbers are monthly % returns. Green months made money; red months gave it back.</p>
    </div>
  );
}
