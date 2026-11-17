import { useMemo } from 'react';
import type { PriceBar, Trade } from '../types';
import { excursionSummary, tradeExcursions } from '../utils/excursion';

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

export function ExcursionPanel({ trades, prices }: { trades: Trade[]; prices: PriceBar[] }) {
  const rows = useMemo(() => tradeExcursions(trades, prices), [trades, prices]);
  const summary = useMemo(() => excursionSummary(rows), [rows]);
  if (!summary) return null;

  const top = [...rows].sort((a, b) => b.mfe - a.mfe).slice(0, 6);

  return (
    <section className="panel excursion">
      <h2>MAE / MFE</h2>
      <p className="hint">How far price ran against you vs for you before the exit.</p>
      <div className="kpi-grid" style={{ marginBottom: '0.85rem' }}>
        <div className="kpi-lite">
          <span className="hint">Avg MAE</span>
          <strong className="mono neg">{pct(summary.avgMae)}</strong>
        </div>
        <div className="kpi-lite">
          <span className="hint">Avg MFE</span>
          <strong className="mono pos">{pct(summary.avgMfe)}</strong>
        </div>
        <div className="kpi-lite">
          <span className="hint">Avg capture</span>
          <strong className="mono">
            {summary.avgCap == null ? '—' : `${(summary.avgCap * 100).toFixed(0)}%`}
          </strong>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Window</th>
              <th>MAE</th>
              <th>MFE</th>
              <th>Capture</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.index}>
                <td className="mono">{r.index + 1}</td>
                <td className="mono hint">
                  {r.entry_date} → {r.exit_date}
                </td>
                <td className="mono neg">{pct(r.mae)}</td>
                <td className="mono pos">{pct(r.mfe)}</td>
                <td className="mono">{r.capture == null ? '—' : `${(r.capture * 100).toFixed(0)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
