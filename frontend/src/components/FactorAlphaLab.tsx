import { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  getFactorReport,
  getMultiFactorReport,
  type FactorReport,
  type MultiFactorReport,
} from '../services/api';
import type { BacktestResult, EquityPoint } from '../types';
import { listFactorArchive, removeFactorArchive, saveFactorArchive } from '../utils/factorArchive';
import { EquityChart } from './Charts';
import { KpiCard } from './KpiCard';
import { MarketExposure } from './MarketExposure';
import { toast } from './ToastHost';

const BENCHES = [
  { id: 'SPY', label: 'SPY · S&P 500' },
  { id: 'QQQ', label: 'QQQ · Nasdaq 100' },
  { id: 'IWM', label: 'IWM · Russell 2000' },
  { id: 'TLT', label: 'TLT · long Treasuries' },
  { id: 'GLD', label: 'GLD · gold' },
  { id: 'BTC-USD', label: 'BTC-USD' },
];

function pct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

function num(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(2);
}

function toneFor(v: number | null | undefined): 'positive' | 'negative' | 'neutral' {
  if (v == null || v === 0) return 'neutral';
  return v > 0 ? 'positive' : 'negative';
}

function toEquity(points: { date: string; equity: number }[] | undefined): EquityPoint[] {
  return (points || []).map((p) => ({ date: p.date, equity: p.equity, cash: 0, drawdown: null }));
}

export function FactorAlphaLab({
  result,
  factors: factorsProp,
  multiFactors: multiProp,
  factorsErr: errProp,
  factorBench,
  onBenchChange,
}: {
  result: BacktestResult;
  factors: FactorReport | null;
  multiFactors: MultiFactorReport | null;
  factorsErr: string;
  factorBench: string;
  onBenchChange: (b: string) => void;
}) {
  const [local, setLocal] = useState<FactorReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [windowDays, setWindowDays] = useState(63);
  const [archiveTick, setArchiveTick] = useState(0);
  const archive = useMemo(() => listFactorArchive(), [archiveTick]);

  const factors = local ?? factorsProp;
  const multi = multiProp;
  const error = err || errProp;

  useEffect(() => {
    if (result.equity_curve.length < 30) return;
    let cancelled = false;
    setBusy(true);
    setErr('');
    getFactorReport({
      equity_curve: result.equity_curve,
      benchmark: factorBench,
      history: '10y',
      detail: true,
      rolling_window: windowDays,
    })
      .then((rep) => {
        if (!cancelled) setLocal(rep);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Factor fit failed');
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [result.equity_curve, factorBench, windowDays]);

  const residual = useMemo(() => toEquity(factors?.residual_equity), [factors]);
  const alignedStrat = useMemo(
    () =>
      (factors?.aligned_equity || []).map((p) => ({
        date: p.date,
        equity: p.equity,
        cash: 0,
        drawdown: null as number | null,
      })),
    [factors],
  );
  const alignedBench = useMemo(
    () =>
      (factors?.aligned_equity || []).map((p) => ({
        date: p.date,
        equity: p.benchmark,
        cash: 0,
        drawdown: null as number | null,
      })),
    [factors],
  );

  const heatMax = useMemo(() => {
    const vals = (multi?.rows || []).map((r) => Math.abs(r.alpha_annual ?? 0));
    return Math.max(0.01, ...vals);
  }, [multi]);

  function saveSnap() {
    if (!factors) return;
    saveFactorArchive({
      backtest_id: result.id,
      label: result.strategy_description,
      dataset: result.dataset_name,
      report: factors,
    });
    setArchiveTick((n) => n + 1);
    toast('Factor snapshot saved', { tone: 'ok' });
  }

  return (
    <div className="factor-lab">
      <section className="panel factor-lab__controls">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div>
            <p className="eyebrow">Alpha lab</p>
            <h2 style={{ margin: 0 }}>Factor exposure vs liquid benchmarks</h2>
            <p className="hint">
              OLS on daily equity returns. Residual path strips α + β·bench. Rolling window refits every bar.
            </p>
          </div>
          <div className="btn-row">
            <button type="button" className="btn secondary small" disabled={!factors || busy} onClick={saveSnap}>
              Save snapshot
            </button>
          </div>
        </div>
        <div className="whatif-picks" role="group" aria-label="Benchmark">
          {BENCHES.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`chip${factorBench === b.id ? ' active' : ''}`}
              onClick={() => onBenchChange(b.id)}
              disabled={busy}
            >
              {b.id}
            </button>
          ))}
        </div>
        <label className="field" style={{ maxWidth: '12rem' }}>
          <span>Rolling window (bars)</span>
          <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} disabled={busy}>
            <option value={42}>42 (~2m)</option>
            <option value={63}>63 (~1q)</option>
            <option value={126}>126 (~6m)</option>
            <option value={252}>252 (~1y)</option>
          </select>
        </label>
        {busy ? <p className="hint">Fitting {factorBench}…</p> : null}
        {error ? <div className="banner error">{error}</div> : null}
      </section>

      <section className="kpi-grid">
        <KpiCard
          label={`Beta vs ${factors?.benchmark ?? factorBench}`}
          value={num(factors?.beta)}
          hint="OLS on daily equity vs benchmark returns"
        />
        <KpiCard
          label="Alpha (ann.)"
          value={pct(factors?.alpha_annual)}
          tone={toneFor(factors?.alpha_annual)}
          hint="Intercept × 252"
        />
        <KpiCard label="R²" value={num(factors?.r2)} />
        <KpiCard label="Obs" value={factors?.n == null ? '—' : String(factors.n)} />
      </section>

      {alignedStrat.length > 30 ? (
        <section className="panel">
          <h2>Aligned equity · strategy vs {factorBench}</h2>
          <EquityChart
            data={alignedStrat}
            benchmark={alignedBench}
            name="Strategy"
            benchmarkName={factorBench}
          />
        </section>
      ) : null}

      {residual.length > 30 ? (
        <section className="panel">
          <h2>Residual equity (α + β stripped)</h2>
          <EquityChart data={residual} name="Residual" />
          <p className="hint">
            Compounds daily residual returns after removing the fitted intercept and beta × benchmark. Flat ≈ no
            leftover edge.
          </p>
        </section>
      ) : null}

      {factors?.rolling?.length ? (
        <section className="panel">
          <h2>Rolling β / α / R²</h2>
          <Plot
            data={[
              {
                x: factors.rolling.map((p) => p.date),
                y: factors.rolling.map((p) => p.beta),
                type: 'scatter',
                mode: 'lines',
                name: 'Beta',
                line: { color: '#6ea8fe', width: 1.6 },
                yaxis: 'y',
              },
              {
                x: factors.rolling.map((p) => p.date),
                y: factors.rolling.map((p) => (p.alpha_annual == null ? null : p.alpha_annual * 100)),
                type: 'scatter',
                mode: 'lines',
                name: 'Alpha % ann.',
                line: { color: '#4fd6a0', width: 1.5 },
                yaxis: 'y2',
              },
              {
                x: factors.rolling.map((p) => p.date),
                y: factors.rolling.map((p) => p.r2),
                type: 'scatter',
                mode: 'lines',
                name: 'R²',
                line: { color: '#f0c14a', width: 1.2, dash: 'dot' },
                yaxis: 'y3',
              },
            ]}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
              font: { family: 'IBM Plex Sans, system-ui, sans-serif', color: '#9098a3', size: 11 },
              margin: { t: 24, r: 48, b: 34, l: 48 },
              height: 300,
              showlegend: true,
              legend: { orientation: 'h', y: 1.15, x: 0, font: { size: 11 } },
              xaxis: { gridcolor: 'rgba(255,255,255,0.035)', zeroline: false },
              yaxis: { title: 'β', gridcolor: 'rgba(255,255,255,0.035)', zeroline: true },
              yaxis2: {
                title: 'α%',
                overlaying: 'y',
                side: 'right',
                showgrid: false,
                zeroline: false,
              },
              yaxis3: {
                overlaying: 'y',
                side: 'right',
                position: 1,
                showgrid: false,
                visible: false,
                range: [0, 1.05],
              },
              hovermode: 'x unified',
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            useResizeHandler
          />
        </section>
      ) : null}

      {multi?.rows?.length ? (
        <section className="panel">
          <h2>Multi-benchmark heatmap</h2>
          <p className="hint">
            Best fit by R²: <span className="mono">{multi.best_fit ?? '—'}</span>
          </p>
          <div className="factor-heat">
            {multi.rows.map((r) => {
              const a = r.alpha_annual ?? 0;
              const intensity = Math.min(1, Math.abs(a) / heatMax);
              const bg =
                a >= 0
                  ? `color-mix(in srgb, #4fd6a0 ${Math.round(intensity * 55)}%, transparent)`
                  : `color-mix(in srgb, #e57a84 ${Math.round(intensity * 55)}%, transparent)`;
              return (
                <button
                  key={r.benchmark}
                  type="button"
                  className={`factor-heat__cell${factorBench === r.benchmark ? ' active' : ''}`}
                  style={{ background: bg }}
                  onClick={() => onBenchChange(r.benchmark)}
                >
                  <strong className="mono">{r.benchmark}</strong>
                  <span>β {num(r.beta)}</span>
                  <span className={a >= 0 ? 'pos' : 'neg'}>α {pct(r.alpha_annual)}</span>
                  <span className="hint">R² {num(r.r2)}</span>
                </button>
              );
            })}
          </div>
          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Benchmark</th>
                  <th>Beta</th>
                  <th>Alpha (ann.)</th>
                  <th>R²</th>
                  <th>n</th>
                </tr>
              </thead>
              <tbody>
                {multi.rows.map((r) => (
                  <tr key={r.benchmark}>
                    <td className="mono">{r.benchmark}</td>
                    <td className="mono">{num(r.beta)}</td>
                    <td className={(r.alpha_annual ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(r.alpha_annual)}</td>
                    <td className="mono">{num(r.r2)}</td>
                    <td className="mono">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <MarketExposure report={result.market} />

      {archive.length ? (
        <section className="panel table-wrap">
          <h2>Saved factor snapshots</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Run</th>
                <th>Bench</th>
                <th>β</th>
                <th>α</th>
                <th>R²</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {archive.slice(0, 12).map((e) => (
                <tr key={e.id}>
                  <td className="mono hint">{e.saved_at.slice(0, 16).replace('T', ' ')}</td>
                  <td>
                    #{e.backtest_id} <span className="hint">{e.label.slice(0, 40)}</span>
                  </td>
                  <td className="mono">{e.report.benchmark}</td>
                  <td className="mono">{num(e.report.beta)}</td>
                  <td className={(e.report.alpha_annual ?? 0) >= 0 ? 'pos' : 'neg'}>
                    {pct(e.report.alpha_annual)}
                  </td>
                  <td className="mono">{num(e.report.r2)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => {
                        removeFactorArchive(e.id);
                        setArchiveTick((n) => n + 1);
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

/** Prefetch multi-factor for parent (kept for tearsheet). */
export function prefetchMultiFactors(
  equity: { date: string; equity: number }[],
): Promise<MultiFactorReport> {
  return getMultiFactorReport({
    equity_curve: equity,
    benchmarks: ['SPY', 'QQQ', 'IWM', 'TLT', 'GLD'],
    history: '10y',
  });
}
