import { useEffect, useState } from 'react';
import { getStress } from '../services/api';
import type { StressReport, StressSlice } from '../types';

const VERDICT_LABEL: Record<StressReport['verdict'], string> = {
  holds: 'Holds',
  fragile: 'Fragile',
  overfit: 'Overfit',
  thin: 'Too thin',
};

function pct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function sharpe(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(2);
}

function Spark({ points }: { points: { equity: number }[] | undefined }) {
  if (!points || points.length < 2) return null;
  const values = points.map((point) => point.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 30 - ((value - min) / span) * 24;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg className={`stress-spark ${up ? 'up' : 'down'}`} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function SliceCard({ title, slice }: { title: string; slice: StressSlice }) {
  return (
    <article className="stress-slice panel">
      <header>
        <h3>{title}</h3>
        <span className="mono">
          {slice.start_date || '—'} → {slice.end_date || '—'}
        </span>
      </header>
      <Spark points={slice.equity} />
      <dl>
        <div>
          <dt>Return</dt>
          <dd>{pct(slice.total_return)}</dd>
        </div>
        <div>
          <dt>Sharpe</dt>
          <dd>{sharpe(slice.sharpe_ratio)}</dd>
        </div>
        <div>
          <dt>Drawdown</dt>
          <dd>{pct(slice.max_drawdown)}</dd>
        </div>
        <div>
          <dt>Trades</dt>
          <dd>{slice.number_of_trades}</dd>
        </div>
      </dl>
    </article>
  );
}

export function StressAudit({ backtestId }: { backtestId: number }) {
  const [report, setReport] = useState<StressReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getStress(backtestId)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Stress test failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [backtestId]);

  if (loading) {
    return <p className="note">Rerunning the rules on the unseen tail and on nearby parameters…</p>;
  }
  if (error || !report) {
    return <div className="banner warn">{error || 'Stress test failed.'}</div>;
  }

  const sharpes = report.neighbors
    .map((row) => row.sharpe_ratio)
    .filter((value): value is number => value != null);
  const peak = Math.max(1, ...sharpes.map((value) => Math.abs(value)));

  return (
    <div className="stress-audit">
      <section className={`stress-verdict verdict-${report.verdict}`}>
        <p className="eyebrow">Holdout audit</p>
        <h2>{VERDICT_LABEL[report.verdict]}</h2>
        <p>{report.headline}</p>
        <p className="mono stress-split">
          Fit {report.split.in_sample_bars} bars · holdout {report.split.holdout_bars} bars, never used to choose the rules
        </p>
      </section>

      <div className="stress-slices">
        <SliceCard title="Fit window" slice={report.in_sample} />
        <SliceCard title="Unseen holdout" slice={report.holdout} />
      </div>

      {report.neighbors.length > 0 ? (
        <section className="panel">
          <h2>Nearby {report.parameter?.label ?? 'parameter'}</h2>
          <p className="note">
            Same data, same rules, one entry setting moved. The marked row is the backtest you just ran.
          </p>
          <ul className="stress-neighbors">
            {report.neighbors.map((row) => {
              const value = row.sharpe_ratio ?? 0;
              const width = `${Math.max(6, (Math.abs(value) / peak) * 100)}%`;
              return (
                <li key={row.label} className={row.chosen ? 'chosen' : ''}>
                  <span className="mono">{row.label}</span>
                  <span className="stress-bar" aria-hidden="true">
                    <i className={value < 0 ? 'neg' : ''} style={{ width }} />
                  </span>
                  <strong className="mono">{sharpe(row.sharpe_ratio)}</strong>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
