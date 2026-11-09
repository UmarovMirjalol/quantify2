import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EquityChart } from '../components/Charts';
import { getBacktest, getVerdict } from '../services/api';
import type { BacktestResult, EquityPoint, VerdictReport } from '../types';

type Better = 'higher' | 'lower';

interface Row {
  label: string;
  a: number | null | undefined;
  b: number | null | undefined;
  format: (v: number) => string;
  better: Better;
}

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const fixed = (v: number) => v.toFixed(2);
const count = (v: number) => String(Math.round(v));

function winner(row: Row): 'a' | 'b' | null {
  if (row.a == null || row.b == null || row.a === row.b) return null;
  const aWins = row.better === 'higher' ? row.a > row.b : row.a < row.b;
  return aWins ? 'a' : 'b';
}

function rebase(points: EquityPoint[], start: number): EquityPoint[] {
  const first = points[0]?.equity || 1;
  return points.map((pt) => ({ ...pt, equity: (pt.equity / first) * start }));
}

export function ComparePage() {
  const [params] = useSearchParams();
  const ids = [Number(params.get('a')), Number(params.get('b'))];
  const [runs, setRuns] = useState<BacktestResult[] | null>(null);
  const [verdicts, setVerdicts] = useState<(VerdictReport | null)[]>([null, null]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ids.every((id) => Number.isFinite(id) && id > 0)) {
      setError('Pick two runs on the Results page to compare.');
      return;
    }
    Promise.all(ids.map((id) => getBacktest(id)))
      .then((loaded) => {
        setRuns(loaded);
        ids.forEach((id, i) => {
          const cached = loaded[i].verdict;
          (cached ? Promise.resolve(cached) : getVerdict(id))
            .then((v) => setVerdicts((prev) => prev.map((old, j) => (j === i ? v : old))))
            .catch(() => undefined);
        });
      })
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const rows = useMemo<Row[]>(() => {
    if (!runs) return [];
    const [a, b] = runs;
    return [
      { label: 'Total return', a: a.metrics.total_return, b: b.metrics.total_return, format: pct, better: 'higher' },
      { label: 'CAGR', a: a.metrics.cagr, b: b.metrics.cagr, format: pct, better: 'higher' },
      { label: 'Sharpe', a: a.metrics.sharpe_ratio, b: b.metrics.sharpe_ratio, format: fixed, better: 'higher' },
      { label: 'Sortino', a: a.metrics.sortino_ratio, b: b.metrics.sortino_ratio, format: fixed, better: 'higher' },
      { label: 'Max drawdown', a: a.metrics.max_drawdown, b: b.metrics.max_drawdown, format: pct, better: 'higher' },
      { label: 'Win rate', a: a.metrics.win_rate, b: b.metrics.win_rate, format: pct, better: 'higher' },
      { label: 'Profit factor', a: a.metrics.profit_factor, b: b.metrics.profit_factor, format: fixed, better: 'higher' },
      { label: 'Trades', a: a.metrics.number_of_trades, b: b.metrics.number_of_trades, format: count, better: 'higher' },
      { label: 'Alpha (ann.)', a: a.market?.alpha_annual, b: b.market?.alpha_annual, format: pct, better: 'higher' },
      { label: 'Beta', a: a.market?.beta, b: b.market?.beta, format: fixed, better: 'lower' },
      { label: 'Monte Carlo 5th pct', a: a.monte_carlo?.confidence_95_lower, b: b.monte_carlo?.confidence_95_lower, format: pct, better: 'higher' },
      { label: 'Verdict score', a: verdicts[0]?.score, b: verdicts[1]?.score, format: count, better: 'higher' },
    ];
  }, [runs, verdicts]);

  if (error) {
    return (
      <div className="banner error">
        {error}{' '}
        <Link className="btn secondary small" to="/history">
          Back to results
        </Link>
      </div>
    );
  }
  if (!runs) {
    return <div className="empty-state">Loading both runs…</div>;
  }

  const [a, b] = runs;
  const start = a.metrics.initial_capital ?? a.strategy.initial_capital;
  const wins = rows.map(winner);
  const aWins = wins.filter((w) => w === 'a').length;
  const bWins = wins.filter((w) => w === 'b').length;

  return (
    <div className="results compare">
      <div className="page-header">
        <div>
          <p className="eyebrow">Side by side</p>
          <h1>
            #{a.id} vs #{b.id}
          </h1>
          <p className="lede">
            {aWins === bWins
              ? `Split decision: each run wins ${aWins} of ${rows.length} measures.`
              : `#${aWins > bWins ? a.id : b.id} wins ${Math.max(aWins, bWins)} of ${rows.length} measures.`}{' '}
            {a.dataset_name !== b.dataset_name ? 'They ran on different datasets, so read the gap with care.' : ''}
          </p>
        </div>
        <div className="results-actions no-print">
          <button type="button" className="btn secondary small" onClick={() => window.print()}>
            Save PDF
          </button>
          <Link className="btn secondary" to="/history">
            Pick other runs
          </Link>
        </div>
      </div>

      <div className="compare-heads">
        {runs.map((run, i) => (
          <Link key={run.id} to={`/results/${run.id}`} className={`panel compare-head side-${i ? 'b' : 'a'}`}>
            <span className="eyebrow">
              Run {i ? 'B' : 'A'} · #{run.id} · {run.strategy.side === 'short' ? 'Short' : 'Long'}
            </span>
            <strong>{run.strategy_description}</strong>
            <span className="mono hint">{run.dataset_name}</span>
            <span className="compare-grade">
              {verdicts[i] ? `${verdicts[i]!.grade.replace('_', ' ')} · ${verdicts[i]!.score}/100` : 'Grading…'}
            </span>
          </Link>
        ))}
      </div>

      <section className="panel">
        <h2>Equity, both rebased to the same start</h2>
        <EquityChart
          data={rebase(a.equity_curve, start)}
          benchmark={rebase(b.equity_curve, start)}
          name={`A · #${a.id}`}
          benchmarkName={`B · #${b.id}`}
        />
      </section>

      <section className="panel table-wrap">
        <table className="data-table compare-table">
          <thead>
            <tr>
              <th>Measure</th>
              <th>A · #{a.id}</th>
              <th>B · #{b.id}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className={`mono ${wins[i] === 'a' ? 'compare-win' : ''}`}>
                  {row.a == null ? '—' : row.format(row.a)}
                </td>
                <td className={`mono ${wins[i] === 'b' ? 'compare-win' : ''}`}>
                  {row.b == null ? '—' : row.format(row.b)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {verdicts[0] && verdicts[1] ? (
        <section className="panel table-wrap">
          <h2>Check by check</h2>
          <table className="data-table compare-table">
            <thead>
              <tr>
                <th>Check</th>
                <th>A · #{a.id}</th>
                <th>B · #{b.id}</th>
              </tr>
            </thead>
            <tbody>
              {verdicts[0].checks.map((check, i) => (
                <tr key={check.key}>
                  <td>{check.label}</td>
                  <td className={`check-cell check-${check.status}`}>{check.status}</td>
                  <td className={`check-cell check-${verdicts[1]!.checks[i]?.status}`}>
                    {verdicts[1]!.checks[i]?.status ?? '—'}
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
