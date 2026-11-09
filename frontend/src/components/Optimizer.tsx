import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOptimizer, runBacktest } from '../services/api';
import type { BacktestResult, OptimizerReport, OptimizerScore } from '../types';

const VERDICT_LABEL: Record<OptimizerReport['verdict'], string> = {
  improves: 'Tuning helps',
  no_gain: 'No real gain',
  overfit: 'Search found noise',
  already_best: 'Yours is the best',
  thin: 'Too thin to judge',
};

const VERDICT_TONE: Record<OptimizerReport['verdict'], string> = {
  improves: 'holds',
  already_best: 'holds',
  no_gain: 'fragile',
  overfit: 'overfit',
  thin: 'thin',
};

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
}

function fixed(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(2);
}

function ScoreCells({ score }: { score: OptimizerScore | null | undefined }) {
  return (
    <>
      <td className="mono">{fixed(score?.sharpe_ratio)}</td>
      <td className="mono">{pct(score?.total_return)}</td>
      <td className="mono">{score?.number_of_trades ?? '—'}</td>
    </>
  );
}

export function Optimizer({ result }: { result: BacktestResult }) {
  const navigate = useNavigate();
  const [report, setReport] = useState<OptimizerReport | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setError('');
    getOptimizer(result.id)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Optimizer failed.');
      });
    return () => {
      cancelled = true;
    };
  }, [result.id]);

  async function runBest() {
    if (!report?.best_strategy || !report.best) return;
    setRunning(true);
    try {
      const next = await runBacktest({
        strategy_text: `${result.strategy_description} [tuned: ${report.best.label}]`,
        dataset_id: result.dataset_name,
        strategy: report.best_strategy,
        config: {
          initial_capital: result.strategy.initial_capital,
          commission: result.strategy.commission ?? 0.001,
          slippage: result.strategy.slippage ?? 0.0005,
          risk_per_trade: result.strategy.risk.risk_per_trade,
        },
      });
      navigate(`/results/${next.id}`, { state: { result: next } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run the tuned setting.');
      setRunning(false);
    }
  }

  if (error) return <div className="banner warn">{error}</div>;
  if (!report) {
    return <p className="note">Scoring every setting on the first 70% of bars, then testing the winner once on the rest…</p>;
  }

  return (
    <div className="stress-audit">
      <section className={`stress-verdict verdict-${VERDICT_TONE[report.verdict]}`}>
        <p className="eyebrow">No-peek optimizer</p>
        <h2>{VERDICT_LABEL[report.verdict]}</h2>
        <p>{report.headline}</p>
        <div className="robust-stats mono">
          <span>{report.trials} settings tried</span>
          <span>{report.eligible} traded enough</span>
          <span>Tuned: {report.parameters.join(' + ')}</span>
          {report.deflated?.probability != null ? (
            <span>P(winner is real) {Math.round(report.deflated.probability * 100)}%</span>
          ) : null}
        </div>
        <p className="mono stress-split">
          Chosen on {report.split.train_bars} bars up to {report.split.train_end} · judged once on{' '}
          {report.split.test_bars} bars from {report.split.test_start} that no candidate saw
        </p>
      </section>

      {report.best ? (
        <section className="panel table-wrap">
          <h2>Your setting vs the training winner</h2>
          <table className="data-table compare-table">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Train Sharpe</th>
                <th>Train return</th>
                <th>Train trades</th>
                <th>Unseen Sharpe</th>
                <th>Unseen return</th>
                <th>Unseen trades</th>
              </tr>
            </thead>
            <tbody>
              {report.original ? (
                <tr>
                  <td>Yours · {report.original.label}</td>
                  <ScoreCells score={report.original.train} />
                  <ScoreCells score={report.original.test} />
                </tr>
              ) : null}
              {!report.best.is_original ? (
                <tr>
                  <td>Winner · {report.best.label}</td>
                  <ScoreCells score={report.best.train} />
                  <ScoreCells score={report.best.test} />
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="note">
            The unseen columns are the only fair comparison. Training numbers always favour the winner, because that is
            how it was picked.
          </p>
          {!report.best.is_original && report.best_strategy ? (
            <button type="button" className="btn primary" onClick={runBest} disabled={running}>
              {running ? 'Running…' : `Run ${report.best.label} as a new backtest`}
            </button>
          ) : null}
        </section>
      ) : null}

      {report.top.length ? (
        <section className="panel table-wrap">
          <h2>Training leaderboard</h2>
          <p className="note">
            Ranked on the training window only. Unseen results are deliberately hidden for everything except the winner,
            so you cannot pick a setting by looking at the test data.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Setting</th>
                <th>Train Sharpe</th>
                <th>Train return</th>
                <th>Trades</th>
              </tr>
            </thead>
            <tbody>
              {report.top.map((row, i) => (
                <tr key={row.label} className={row.original ? 'picked' : ''}>
                  <td className="mono">{i + 1}</td>
                  <td>
                    {row.label}
                    {row.original ? ' · yours' : ''}
                  </td>
                  <td className="mono">{fixed(row.train_sharpe)}</td>
                  <td className="mono">{pct(row.train_return)}</td>
                  <td className="mono">{row.trades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
