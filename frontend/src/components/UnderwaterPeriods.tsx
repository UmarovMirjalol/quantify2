import { useMemo } from 'react';
import type { EquityPoint } from '../types';

type Spell = { start: string; end: string; bars: number; depth: number };

function spellsFrom(curve: EquityPoint[]): Spell[] {
  if (curve.length < 2) return [];
  let peak = curve[0].equity;
  let inDd = false;
  let start = 0;
  let trough = 0;
  const out: Spell[] = [];

  for (let i = 0; i < curve.length; i++) {
    const eq = curve[i].equity;
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? eq / peak - 1 : 0;
    if (dd < -1e-9) {
      if (!inDd) {
        inDd = true;
        start = i;
        trough = dd;
      } else {
        trough = Math.min(trough, dd);
      }
    } else if (inDd) {
      out.push({
        start: curve[start].date.slice(0, 10),
        end: curve[i].date.slice(0, 10),
        bars: i - start,
        depth: trough,
      });
      inDd = false;
    }
  }
  if (inDd) {
    out.push({
      start: curve[start].date.slice(0, 10),
      end: curve[curve.length - 1].date.slice(0, 10),
      bars: curve.length - 1 - start,
      depth: trough,
    });
  }
  return out.sort((a, b) => a.depth - b.depth).slice(0, 8);
}

export function UnderwaterPeriods({ curve }: { curve: EquityPoint[] }) {
  const spells = useMemo(() => spellsFrom(curve), [curve]);
  if (!spells.length) {
    return <p className="hint">No drawdown spells long enough to list.</p>;
  }
  return (
    <div className="table-wrap underwater-periods">
      <table>
        <thead>
          <tr>
            <th>Start</th>
            <th>End</th>
            <th>Bars</th>
            <th>Depth</th>
          </tr>
        </thead>
        <tbody>
          {spells.map((s) => (
            <tr key={`${s.start}-${s.end}`}>
              <td className="mono">{s.start}</td>
              <td className="mono">{s.end}</td>
              <td className="mono">{s.bars}</td>
              <td className="neg mono">{(s.depth * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
