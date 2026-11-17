import { useMemo } from 'react';
import type { RobustnessReport } from '../types';

export type HeatmapAvailable = Extract<RobustnessReport['heatmap'], { available: true }>;
export type HeatCell = HeatmapAvailable['cells'][number];

function heatColor(value: number | null, peak: number): string {
  if (value == null) return 'transparent';
  const strength = Math.min(1, Math.abs(value) / peak);
  return value >= 0
    ? `rgba(79, 214, 160, ${0.08 + strength * 0.62})`
    : `rgba(229, 122, 132, ${0.08 + strength * 0.62})`;
}

function fixed(value: number | null | undefined, digits = 2): string {
  if (value == null) return '—';
  return value.toFixed(digits);
}

type Props = {
  map: HeatmapAvailable;
  selected?: { fast: number; slow: number } | null;
  interactive?: boolean;
  onSelect?: (cell: HeatCell) => void;
};

export function ParamSurfaceGrid({ map, selected, interactive = false, onSelect }: Props) {
  const lookup = useMemo(
    () => new Map(map.cells.map((cell) => [`${cell.fast}:${cell.slow}`, cell])),
    [map.cells],
  );
  const peak = useMemo(
    () => Math.max(0.25, ...map.cells.map((cell) => Math.abs(cell.sharpe ?? 0))),
    [map.cells],
  );

  return (
    <div className="heat-wrap param-surface-grid">
      <table className={`heat-grid${interactive ? ' heat-grid--interactive' : ''}`}>
        <thead>
          <tr>
            <th className="mono">fast ↓ / slow →</th>
            {map.slow_values.map((slow) => (
              <th key={slow} className="mono">
                {slow}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {map.fast_values.map((fast) => (
            <tr key={fast}>
              <th className="mono">{fast}</th>
              {map.slow_values.map((slow) => {
                const cell = lookup.get(`${fast}:${slow}`);
                if (!cell) return <td key={slow} className="heat-empty" />;
                const isSel = selected?.fast === fast && selected?.slow === slow;
                const cls = [
                  cell.chosen ? 'chosen' : '',
                  isSel ? 'heat-selected' : '',
                  interactive ? 'heat-clickable' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <td
                    key={slow}
                    className={cls}
                    style={{ background: heatColor(cell.sharpe, peak) }}
                    title={`${map.indicator} ${fast} × ${slow}: Sharpe ${fixed(cell.sharpe)} · ret ${
                      cell.total_return == null ? '—' : `${(cell.total_return * 100).toFixed(1)}%`
                    }`}
                    tabIndex={interactive ? 0 : undefined}
                    role={interactive ? 'button' : undefined}
                    onClick={
                      interactive && onSelect
                        ? () => onSelect(cell)
                        : undefined
                    }
                    onKeyDown={
                      interactive && onSelect
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelect(cell);
                            }
                          }
                        : undefined
                    }
                  >
                    <span className="mono">{fixed(cell.sharpe, 1)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
