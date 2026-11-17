import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOptimizer, getRobustness, runBacktest } from '../services/api';
import type { BacktestResult, OptimizerReport, RobustnessReport } from '../types';
import { applyOptimizerParams, detectCrossover, remapStrategyPeriods } from '../utils/remapStrategyPeriods';
import { logActivity } from '../utils/activityLog';
import { ParamSurfaceGrid, type HeatCell, type HeatmapAvailable } from './ParamSurfaceGrid';
import { toast } from './ToastHost';

const OPT_LABEL: Record<OptimizerReport['verdict'], string> = {
  improves: 'Tuning helps',
  no_gain: 'No real gain',
  overfit: 'Search found noise',
  already_best: 'Yours is the best',
  thin: 'Too thin to judge',
};

const HEAT_LABEL: Record<HeatmapAvailable['verdict'], string> = {
  plateau: 'Plateau',
  peak: 'Isolated peak',
  no_edge: 'No edge',
};

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
}

function fixed(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(2);
}

type Selection =
  | { kind: 'cell'; cell: HeatCell }
  | { kind: 'opt'; label: string; params: Record<string, number | null>; strategy?: BacktestResult['strategy'] }
  | null;

export function ParamSurfaceLab({ result }: { result: BacktestResult }) {
  const navigate = useNavigate();
  const [robust, setRobust] = useState<RobustnessReport | null>(null);
  const [opt, setOpt] = useState<OptimizerReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection>(null);
  const [running, setRunning] = useState(false);
  const [metric, setMetric] = useState<'sharpe' | 'return'>('sharpe');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setSelection(null);
    Promise.all([getRobustness(result.id), getOptimizer(result.id)])
      .then(([r, o]) => {
        if (cancelled) return;
        setRobust(r);
        setOpt(o);
        if (r.heatmap.available) {
          const chosen = r.heatmap.cells.find((c) => c.chosen);
          if (chosen) setSelection({ kind: 'cell', cell: chosen });
        } else if (o.best) {
          setSelection({
            kind: 'opt',
            label: o.best.label,
            params: o.best.params,
            strategy: o.best_strategy ?? undefined,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Lab failed to load.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [result.id]);

  const heatmap = robust?.heatmap.available ? robust.heatmap : null;
  const crossover = useMemo(() => detectCrossover(result.strategy), [result.strategy]);

  const rankedCells = useMemo(() => {
    if (!heatmap) return [];
    return [...heatmap.cells]
      .filter((c) => (metric === 'sharpe' ? c.sharpe != null : c.total_return != null))
      .sort((a, b) =>
        metric === 'sharpe'
          ? (b.sharpe ?? -99) - (a.sharpe ?? -99)
          : (b.total_return ?? -99) - (a.total_return ?? -99),
      );
  }, [heatmap, metric]);

  const deltaVsChosen = useMemo(() => {
    if (!heatmap || selection?.kind !== 'cell') return null;
    const base = heatmap.cells.find((c) => c.chosen);
    if (!base || base.sharpe == null || selection.cell.sharpe == null) return null;
    return selection.cell.sharpe - base.sharpe;
  }, [heatmap, selection]);

  async function runSelection() {
    if (!selection) return;
    setRunning(true);
    setError('');
    try {
      let strategy = result.strategy;
      let label = '';
      if (selection.kind === 'cell') {
        strategy = remapStrategyPeriods(result.strategy, selection.cell.fast, selection.cell.slow);
        label = `${heatmap?.indicator ?? 'MA'} ${selection.cell.fast}×${selection.cell.slow}`;
      } else if (selection.strategy) {
        strategy = selection.strategy;
        label = selection.label;
      } else {
        strategy = applyOptimizerParams(result.strategy, selection.params);
        label = selection.label;
      }
      const next = await runBacktest({
        strategy_text: `${result.strategy_description} [lab: ${label}]`,
        dataset_id: result.dataset_name,
        strategy,
        config: {
          initial_capital: result.strategy.initial_capital,
          commission: result.strategy.commission ?? 0.001,
          slippage: result.strategy.slippage ?? 0.0005,
          risk_per_trade: result.strategy.risk.risk_per_trade,
        },
      });
      toast('Lab run saved', { tone: 'ok', body: label });
      logActivity(`Lab · ${label}`, `/results/${next.id}`);
      navigate(`/results/${next.id}`, { state: { result: next } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run this setting.');
      setRunning(false);
    }
  }

  function queueCompare() {
    if (!selection) return;
    // Run then open compare against current — store intent in session
    void (async () => {
      setRunning(true);
      try {
        let strategy = result.strategy;
        let label = '';
        if (selection.kind === 'cell') {
          strategy = remapStrategyPeriods(result.strategy, selection.cell.fast, selection.cell.slow);
          label = `${heatmap?.indicator ?? 'MA'} ${selection.cell.fast}×${selection.cell.slow}`;
        } else if (selection.strategy) {
          strategy = selection.strategy;
          label = selection.label;
        } else {
          strategy = applyOptimizerParams(result.strategy, selection.params);
          label = selection.label;
        }
        const next = await runBacktest({
          strategy_text: `${result.strategy_description} [lab: ${label}]`,
          dataset_id: result.dataset_name,
          strategy,
          config: {
            initial_capital: result.strategy.initial_capital,
            commission: result.strategy.commission ?? 0.001,
            slippage: result.strategy.slippage ?? 0.0005,
            risk_per_trade: result.strategy.risk.risk_per_trade,
          },
        });
        toast('Opening compare', { tone: 'ok', body: `#${result.id} vs #${next.id}` });
        navigate(`/compare?a=${result.id}&b=${next.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Compare run failed.');
        setRunning(false);
      }
    })();
  }

  if (loading) {
    return (
      <p className="note">
        Building the parameter surface and scoring the holdout optimizer — this can take a few seconds…
      </p>
    );
  }
  if (error && !robust && !opt) {
    return <div className="banner warn">{error}</div>;
  }

  return (
    <div className="param-lab">
      <header className="param-lab__hero">
        <div>
          <p className="eyebrow">Parameter Surface Lab</p>
          <h2>Click a cell. Run it. Compare it.</h2>
          <p className="lede">
            Full-sample Sharpe grid on the left · no-peek train/test optimizer on the right. Selection becomes a
            real saved backtest — not a screenshot.
          </p>
        </div>
        {heatmap ? (
          <div className={`param-lab__badge verdict-${heatmap.verdict}`}>
            <strong>{HEAT_LABEL[heatmap.verdict]}</strong>
            <span className="hint">{heatmap.headline}</span>
          </div>
        ) : null}
      </header>

      {error ? <div className="banner warn">{error}</div> : null}

      <div className="param-lab__layout">
        <section className="panel param-lab__surface">
          <div className="page-header" style={{ marginBottom: '0.5rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>
                {heatmap
                  ? `${heatmap.indicator} surface`
                  : crossover
                    ? 'Surface unavailable'
                    : 'No crossover surface'}
              </h3>
              <p className="hint" style={{ margin: '0.25rem 0 0' }}>
                {heatmap
                  ? `Outlined = your run · filled outline = selection · ${heatmap.cells.length} cells`
                  : robust?.heatmap.headline ||
                    'Lab still works via the optimizer board when there is no fast×slow grid.'}
              </p>
            </div>
            {heatmap ? (
              <div className="btn-row">
                <button
                  type="button"
                  className={`chip${metric === 'sharpe' ? ' active' : ''}`}
                  onClick={() => setMetric('sharpe')}
                >
                  Color by Sharpe
                </button>
                <button
                  type="button"
                  className={`chip${metric === 'return' ? ' active' : ''}`}
                  onClick={() => setMetric('return')}
                >
                  Rank by return
                </button>
              </div>
            ) : null}
          </div>

          {heatmap ? (
            <>
              <ParamSurfaceGrid
                map={heatmap}
                interactive
                selected={selection?.kind === 'cell' ? selection.cell : null}
                onSelect={(cell) => setSelection({ kind: 'cell', cell })}
              />
              <div className="param-lab__rank">
                <h4>Top by {metric === 'sharpe' ? 'Sharpe' : 'return'}</h4>
                <ol>
                  {rankedCells.slice(0, 8).map((c, i) => (
                    <li key={`${c.fast}-${c.slow}`}>
                      <button
                        type="button"
                        className={`param-lab__rank-btn${
                          selection?.kind === 'cell' &&
                          selection.cell.fast === c.fast &&
                          selection.cell.slow === c.slow
                            ? ' active'
                            : ''
                        }`}
                        onClick={() => setSelection({ kind: 'cell', cell: c })}
                      >
                        <span className="mono">
                          #{i + 1} · {c.fast}×{c.slow}
                        </span>
                        <span className="mono">
                          {metric === 'sharpe' ? fixed(c.sharpe) : pct(c.total_return)}
                          {c.chosen ? ' · yours' : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ padding: '1.5rem 0' }}>
              <p>No interactive grid for this rule type. Use the optimizer board →</p>
            </div>
          )}
        </section>

        <aside className="param-lab__side">
          <section className="panel param-lab__drawer">
            <h3>Selection</h3>
            {!selection ? (
              <p className="hint">Pick a surface cell or a leaderboard row.</p>
            ) : selection.kind === 'cell' ? (
              <>
                <p className="param-lab__pick mono">
                  {heatmap?.indicator} {selection.cell.fast} × {selection.cell.slow}
                </p>
                <dl className="kv">
                  <div>
                    <dt>Sharpe</dt>
                    <dd className="mono">{fixed(selection.cell.sharpe)}</dd>
                  </div>
                  <div>
                    <dt>Return</dt>
                    <dd className="mono">{pct(selection.cell.total_return)}</dd>
                  </div>
                  <div>
                    <dt>Δ Sharpe vs yours</dt>
                    <dd className={`mono ${deltaVsChosen != null && deltaVsChosen >= 0 ? 'pos' : 'neg'}`}>
                      {deltaVsChosen == null ? '—' : `${deltaVsChosen >= 0 ? '+' : ''}${deltaVsChosen.toFixed(2)}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Your cell</dt>
                    <dd className="mono">
                      {heatmap?.chosen.fast}×{heatmap?.chosen.slow}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                <p className="param-lab__pick">{selection.label}</p>
                <dl className="kv">
                  {Object.entries(selection.params).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd className="mono">{v ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            <div className="btn-row" style={{ marginTop: '0.85rem' }}>
              <button
                type="button"
                className="btn primary"
                disabled={!selection || running}
                onClick={() => void runSelection()}
              >
                {running ? 'Running…' : 'Run as new backtest'}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={!selection || running}
                onClick={queueCompare}
              >
                Run & compare
              </button>
            </div>
          </section>

          {opt ? (
            <section className="panel param-lab__opt">
              <p className="eyebrow">No-peek optimizer</p>
              <h3>{OPT_LABEL[opt.verdict]}</h3>
              <p className="hint">{opt.headline}</p>
              <p className="mono hint" style={{ marginTop: '0.35rem' }}>
                Train → {opt.split.train_end} · test from {opt.split.test_start} · {opt.trials} trials
              </p>
              {opt.best ? (
                <button
                  type="button"
                  className="btn secondary small"
                  style={{ marginTop: '0.65rem' }}
                  onClick={() =>
                    setSelection({
                      kind: 'opt',
                      label: opt.best!.label,
                      params: opt.best!.params,
                      strategy: opt.best_strategy ?? undefined,
                    })
                  }
                >
                  Select winner · {opt.best.label}
                </button>
              ) : null}
              {opt.top.length ? (
                <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Setting</th>
                        <th>Train Sh</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opt.top.slice(0, 8).map((row, i) => (
                        <tr
                          key={row.label}
                          className={row.original ? 'picked' : ''}
                          style={{ cursor: 'pointer' }}
                          onClick={() =>
                            setSelection({
                              kind: 'opt',
                              label: row.label,
                              params: row.params,
                              strategy:
                                opt.best?.label === row.label ? opt.best_strategy ?? undefined : undefined,
                            })
                          }
                        >
                          <td className="mono">{i + 1}</td>
                          <td>
                            {row.label}
                            {row.original ? ' · yours' : ''}
                          </td>
                          <td className="mono">{fixed(row.train_sharpe)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
