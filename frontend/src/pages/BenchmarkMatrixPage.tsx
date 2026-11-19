import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Plot from 'react-plotly.js';
import { KpiCard } from '../components/KpiCard';
import { ProGate } from '../components/ProGate';
import { toast } from '../components/ToastHost';
import { usePageMeta } from '../hooks/usePageMeta';
import { getBenchmarkSuite, getPlaybook, type BenchmarkSuite } from '../services/api';
import type { PlaybookItem } from '../types';
import { quickRun } from '../utils/quickRun';

type Metric = 'sharpe' | 'edge' | 'return' | 'var';

type Cell = NonNullable<BenchmarkSuite['rows']>[number];

function edge(r: Cell): number | null {
  if (r.total_return == null || r.buy_hold == null) return null;
  return r.total_return - r.buy_hold;
}

export function BenchmarkMatrixPage() {
  usePageMeta(
    'Playbook matrix — Quantify',
    'Published rule × market control tower: Sharpe, edge vs hold and VaR across the playbook universe. Research desk staple since 2025.',
  );
  const navigate = useNavigate();
  const [suite, setSuite] = useState<BenchmarkSuite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('sharpe');
  const [beatOnly, setBeatOnly] = useState(false);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [running, setRunning] = useState(false);
  const [playbook, setPlaybook] = useState<PlaybookItem[]>([]);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const load = async (force = false) => {
      try {
        const s = await getBenchmarkSuite(force);
        if (!alive) return;
        setSuite(s);
        if (s.status === 'building') timer = window.setTimeout(() => void load(false), 4000);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Could not load the matrix.');
      }
    };
    void load();
    void getPlaybook()
      .then((p) => {
        if (alive) setPlaybook(p.items || []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  const textFor = (cell: Cell) => playbook.find((p) => p.id === cell.id)?.text || cell.title;

  const rows = useMemo(() => {
    const list = suite?.rows || [];
    return beatOnly ? list.filter((r) => r.beat_hold) : list;
  }, [suite, beatOnly]);

  const titles = useMemo(() => [...new Set(rows.map((r) => r.title))], [rows]);
  const tickers = useMemo(() => {
    const fromRows = [...new Set(rows.map((r) => r.ticker))];
    return fromRows.length ? fromRows : suite?.tickers || [];
  }, [rows, suite]);

  const lookup = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const r of rows) m.set(`${r.title}::${r.ticker}`, r);
    return m;
  }, [rows]);

  const z = useMemo(() => {
    return titles.map((title) =>
      tickers.map((ticker) => {
        const cell = lookup.get(`${title}::${ticker}`);
        if (!cell) return null;
        if (metric === 'sharpe') return cell.sharpe;
        if (metric === 'return') return cell.total_return == null ? null : cell.total_return * 100;
        if (metric === 'var') return cell.var_95 == null ? null : cell.var_95 * 100;
        const e = edge(cell);
        return e == null ? null : e * 100;
      }),
    );
  }, [titles, tickers, lookup, metric]);

  const metricLabel =
    metric === 'sharpe' ? 'Sharpe' : metric === 'edge' ? 'Edge vs hold %' : metric === 'return' ? 'Return %' : 'VaR 95%';

  async function openCell(cell: Cell) {
    setSelected(cell);
  }

  async function runCell(cell: Cell) {
    const text = textFor(cell);
    navigate(`/check?q=${encodeURIComponent(text)}&t=${encodeURIComponent(cell.ticker)}`);
    toast('Opening guru check with this cell', { tone: 'ok' });
  }

  async function fullRun(cell: Cell) {
    setRunning(true);
    const text = textFor(cell);
    try {
      const id = await quickRun(text, cell.ticker, () => undefined);
      navigate(`/results/${id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Run failed', { tone: 'error' });
      navigate(`/check?q=${encodeURIComponent(text)}&t=${encodeURIComponent(cell.ticker)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="results matrix-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Control tower</p>
          <h1>Playbook × market matrix</h1>
          <p className="lede">
            Cached research grid: classic rules across liquid markets with costs and VaR. Click a cell to inspect or
            promote into a full run — the board serious desks check before trusting a single chart.
          </p>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setSuite({ status: 'building' });
              void getBenchmarkSuite(true)
                .then(setSuite)
                .catch((e) => setError(e instanceof Error ? e.message : 'Refresh failed'));
            }}
          >
            Refresh suite
          </button>
          <Link className="btn ghost" to="/farm">
            Research farm
          </Link>
        </div>
      </div>

      <ProGate feature="matrix_refresh" label="Matrix force-refresh is Pro" />

      {error ? <div className="banner error">{error}</div> : null}
      {!suite || suite.status === 'building' ? (
        <div className="panel">Building the published suite… first load can take about a minute.</div>
      ) : null}

      {suite?.status === 'ready' ? (
        <>
          <section className="kpi-grid">
            <KpiCard label="Cells" value={String(suite.count ?? rows.length)} />
            <KpiCard
              label="Beat hold"
              value={`${suite.beat_hold ?? 0}/${suite.count ?? 0}`}
              tone={(suite.beat_hold_share ?? 0) >= 0.5 ? 'positive' : 'negative'}
            />
            <KpiCard
              label="Beat share"
              value={suite.beat_hold_share == null ? '—' : `${Math.round(suite.beat_hold_share * 100)}%`}
            />
            <KpiCard
              label="As of"
              value={suite.as_of ? new Date(suite.as_of).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
            />
          </section>

          <div className="leaderboard-controls">
            <div className="whatif-picks" role="group" aria-label="Metric">
              {(
                [
                  ['sharpe', 'Sharpe'],
                  ['edge', 'Edge vs hold'],
                  ['return', 'Return'],
                  ['var', 'VaR 95%'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" className={`chip${metric === id ? ' active' : ''}`} onClick={() => setMetric(id)}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className={`chip${beatOnly ? ' active' : ''}`} onClick={() => setBeatOnly((v) => !v)}>
              Beat hold only
            </button>
          </div>

          <div className="matrix-layout">
            <section className="panel">
              <h2>{metricLabel}</h2>
              {titles.length && tickers.length ? (
                <Plot
                  data={[
                    {
                      z,
                      x: tickers,
                      y: titles,
                      type: 'heatmap',
                      colorscale:
                        metric === 'var'
                          ? [
                              [0, 'rgb(79,214,160)'],
                              [0.5, 'rgb(24,28,34)'],
                              [1, 'rgb(229,122,132)'],
                            ]
                          : [
                              [0, 'rgb(229,122,132)'],
                              [0.5, 'rgb(24,28,34)'],
                              [1, 'rgb(79,214,160)'],
                            ],
                      hovertemplate: `%{y} · %{x}<br>${metricLabel} %{z:.2f}<extra></extra>`,
                      colorbar: { thickness: 10, outlinewidth: 0 },
                    },
                  ]}
                  layout={{
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { family: 'IBM Plex Sans, system-ui, sans-serif', color: '#9098a3', size: 10 },
                    margin: { t: 8, r: 40, b: 48, l: 160 },
                    height: Math.max(360, 48 + titles.length * 28),
                    xaxis: { side: 'bottom' },
                    yaxis: { autorange: 'reversed' },
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%' }}
                  useResizeHandler
                  onClick={(ev) => {
                    const pt = ev.points?.[0];
                    if (!pt) return;
                    const title = String(pt.y);
                    const ticker = String(pt.x);
                    const cell = lookup.get(`${title}::${ticker}`);
                    if (cell) void openCell(cell);
                  }}
                />
              ) : (
                <p className="hint">No cells match the filter.</p>
              )}
            </section>

            {selected ? (
              <aside className="panel lb-drawer">
                <p className="eyebrow">{selected.ticker}</p>
                <h2>{selected.title}</h2>
                <dl className="kv">
                  <div>
                    <dt>Sharpe</dt>
                    <dd className="mono">{selected.sharpe?.toFixed(2) ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Return</dt>
                    <dd className="mono">
                      {selected.total_return == null ? '—' : `${(selected.total_return * 100).toFixed(1)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt>Buy &amp; hold</dt>
                    <dd className="mono">{selected.buy_hold == null ? '—' : `${(selected.buy_hold * 100).toFixed(1)}%`}</dd>
                  </div>
                  <div>
                    <dt>Edge</dt>
                    <dd className="mono">
                      {edge(selected) == null ? '—' : `${(edge(selected)! * 100).toFixed(1)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt>Max DD</dt>
                    <dd className="mono">
                      {selected.max_drawdown == null ? '—' : `${(selected.max_drawdown * 100).toFixed(1)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt>VaR 95%</dt>
                    <dd className="mono">{selected.var_95 == null ? '—' : `${(selected.var_95 * 100).toFixed(2)}%`}</dd>
                  </div>
                  <div>
                    <dt>Trades</dt>
                    <dd className="mono">{selected.trades ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Beat hold</dt>
                    <dd>{selected.beat_hold ? 'Yes' : 'No'}</dd>
                  </div>
                </dl>
                <div className="btn-row">
                  <button type="button" className="btn primary" disabled={running} onClick={() => void fullRun(selected)}>
                    {running ? 'Running…' : 'Full backtest'}
                  </button>
                  <button type="button" className="btn secondary" onClick={() => void runCell(selected)}>
                    Guru check
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setSelected(null)}>
                    Close
                  </button>
                </div>
              </aside>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
