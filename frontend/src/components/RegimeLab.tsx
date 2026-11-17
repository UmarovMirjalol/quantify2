import { useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import type { BacktestResult, Trade } from '../types';
import { buildRegimeLab, type RegimeKind, type RegimeLabel } from '../utils/regimeLab';
import { KpiCard } from './KpiCard';

const KINDS: { id: RegimeKind; label: string; hint: string }[] = [
  { id: 'trend_ma', label: 'Trend MA', hint: 'Close vs finished SMA' },
  { id: 'vol', label: 'Vol terciles', hint: 'Realized vol buckets' },
  { id: 'underwater', label: 'Underwater', hint: 'Equity vs peak' },
];

const COLORS: Record<RegimeLabel, string> = {
  A: 'rgba(79,214,160,0.55)',
  B: 'rgba(229,122,132,0.45)',
  C: 'rgba(240,193,74,0.45)',
};

function money(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pct(value: number | null): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(0)}%`;
}

export function RegimeLab({ result }: { result: BacktestResult }) {
  const [kind, setKind] = useState<RegimeKind>('trend_ma');
  const [window, setWindow] = useState(50);
  const [filter, setFilter] = useState<RegimeLabel | 'all'>('all');

  const report = useMemo(
    () => buildRegimeLab(result.price_series, result.trades, result.equity_curve, kind, window),
    [result.price_series, result.trades, result.equity_curve, kind, window],
  );

  const filteredTrades: Trade[] = useMemo(() => {
    if (filter === 'all') return report.buckets.flatMap((b) => b.trades);
    return report.buckets.find((b) => b.key === filter)?.trades ?? [];
  }, [report, filter]);

  const shapes = useMemo(() => {
    if (!report.bars.length) return [];
    const out: Record<string, unknown>[] = [];
    let i = 0;
    while (i < report.bars.length) {
      const lab = report.bars[i].label;
      let j = i + 1;
      while (j < report.bars.length && report.bars[j].label === lab) j += 1;
      out.push({
        type: 'rect',
        xref: 'x',
        yref: 'paper',
        x0: report.bars[i].date,
        x1: report.bars[j - 1].date,
        y0: 0,
        y1: 1,
        fillcolor: COLORS[lab],
        line: { width: 0 },
        layer: 'below',
      });
      i = j;
    }
    return out;
  }, [report.bars]);

  const peak = Math.max(1, ...report.buckets.map((b) => Math.abs(b.pnl)));

  return (
    <div className="regime-lab">
      <section className={`stress-verdict verdict-${report.buckets.every((b) => b.pnl > 0) ? 'holds' : 'fragile'}`}>
        <p className="eyebrow">Regime lab</p>
        <h2>{KINDS.find((k) => k.id === kind)?.label}</h2>
        <p>{report.headline}</p>
        <p className="mono stress-split">
          {kind === 'underwater'
            ? 'Trades tagged by equity peak-to-trough state on the signal bar.'
            : `Window ${report.window || window} · ${report.bars.length} classified bars`}
        </p>
      </section>

      <div className="leaderboard-controls">
        <div className="whatif-picks" role="group" aria-label="Definition">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`chip${kind === k.id ? ' active' : ''}`}
              onClick={() => {
                setKind(k.id);
                setFilter('all');
              }}
              title={k.hint}
            >
              {k.label}
            </button>
          ))}
        </div>
        {kind !== 'underwater' ? (
          <label className="field" style={{ maxWidth: '10rem', margin: 0 }}>
            <span>Window</span>
            <select value={window} onChange={(e) => setWindow(Number(e.target.value))}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
        ) : null}
      </div>

      <section className="kpi-grid">
        {report.buckets.map((b) => (
          <KpiCard
            key={b.key}
            label={b.name}
            value={money(b.pnl)}
            tone={b.pnl > 0 ? 'positive' : b.pnl < 0 ? 'negative' : 'neutral'}
            hint={`${b.trades.length} trades · win ${pct(b.win_rate)}`}
          />
        ))}
      </section>

      <section className="panel">
        <h2>Price painted by regime</h2>
        <Plot
          data={[
            {
              x: result.price_series.map((p) => p.date.slice(0, 10)),
              y: result.price_series.map((p) => p.close),
              type: 'scatter',
              mode: 'lines',
              line: { color: '#e8ecf1', width: 1.4 },
              name: 'Close',
              hovertemplate: '%{x}<br>%{y:.2f}<extra></extra>',
            },
          ]}
          layout={{
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { family: 'IBM Plex Sans, system-ui, sans-serif', color: '#9098a3', size: 11 },
            margin: { t: 10, r: 12, b: 34, l: 50 },
            height: 300,
            xaxis: { gridcolor: 'rgba(255,255,255,0.035)', zeroline: false },
            yaxis: { gridcolor: 'rgba(255,255,255,0.035)', zeroline: false },
            shapes,
            showlegend: false,
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
          useResizeHandler
        />
        <div className="whatif-picks" style={{ marginTop: '0.6rem' }}>
          {report.buckets.map((b) => (
            <span key={b.key} className="chip" style={{ pointerEvents: 'none' }}>
              <i
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: COLORS[b.key],
                  marginRight: 6,
                }}
              />
              {b.name}
            </span>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Profit by regime</h2>
        <ul className="regime-rows">
          {report.buckets.map((b) => (
            <li key={b.key}>
              <button type="button" className="lb-podium-btn" onClick={() => setFilter(b.key)}>
                {b.name}
              </button>
              <span className="stress-bar" aria-hidden="true">
                <i className={b.pnl < 0 ? 'neg' : ''} style={{ width: `${Math.max(8, (Math.abs(b.pnl) / peak) * 100)}%` }} />
              </span>
              <strong className="mono">{money(b.pnl)}</strong>
              <span className="mono regime-meta">
                {b.trades.length} trades · win {pct(b.win_rate)} · avg {pct(b.avg_return)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel table-wrap">
        <div className="page-header" style={{ marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>
            Blotter · {filter === 'all' ? 'all regimes' : report.buckets.find((b) => b.key === filter)?.name}
          </h2>
          <div className="whatif-picks">
            <button type="button" className={`chip${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
              All
            </button>
            {report.buckets.map((b) => (
              <button
                key={b.key}
                type="button"
                className={`chip${filter === b.key ? ' active' : ''}`}
                onClick={() => setFilter(b.key)}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Entry</th>
              <th>Exit</th>
              <th>PnL</th>
              <th>Return</th>
              <th>Bars</th>
              <th>Exit reason</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrades.slice(0, 80).map((t, i) => (
              <tr key={`${t.entry_date}-${t.exit_date}-${i}`}>
                <td className="mono">{t.entry_date.slice(0, 10)}</td>
                <td className="mono">{t.exit_date.slice(0, 10)}</td>
                <td className={t.pnl >= 0 ? 'pos' : 'neg'}>{money(t.pnl)}</td>
                <td className={t.return_pct >= 0 ? 'pos' : 'neg'}>{pct(t.return_pct)}</td>
                <td className="mono">{t.bars_held}</td>
                <td className="hint">{t.exit_reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filteredTrades.length ? <p className="hint">No trades in this bucket.</p> : null}
        {filteredTrades.length > 80 ? (
          <p className="hint">Showing first 80 of {filteredTrades.length} trades.</p>
        ) : null}
      </section>
    </div>
  );
}
