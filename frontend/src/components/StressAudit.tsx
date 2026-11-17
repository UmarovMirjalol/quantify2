import { useEffect, useMemo, useState } from 'react';
import { getStress } from '../services/api';
import type { StressReport, StressSlice } from '../types';
import { downloadText } from '../utils/download';
import { toast } from './ToastHost';
import { KpiCard } from './KpiCard';

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

function Spark({ points, className }: { points: { equity: number }[] | undefined; className?: string }) {
  if (!points || points.length < 2) return null;
  const values = points.map((point) => point.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 36 - ((value - min) / span) * 30;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg
      className={`stress-spark ${up ? 'up' : 'down'} ${className ?? ''}`}
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

function rebase(points: { date: string; equity: number }[] | undefined) {
  if (!points?.length) return [];
  const base = points[0].equity || 1;
  return points.map((p) => ({ date: p.date, equity: (p.equity / base) * 100 }));
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
          <dd className={(slice.total_return ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(slice.total_return)}</dd>
        </div>
        <div>
          <dt>Sharpe</dt>
          <dd>{sharpe(slice.sharpe_ratio)}</dd>
        </div>
        <div>
          <dt>Drawdown</dt>
          <dd className="neg">{pct(slice.max_drawdown)}</dd>
        </div>
        <div>
          <dt>Trades</dt>
          <dd>{slice.number_of_trades}</dd>
        </div>
      </dl>
    </article>
  );
}

function Overlay({
  a,
  b,
}: {
  a: { date: string; equity: number }[];
  b: { date: string; equity: number }[];
}) {
  if (a.length < 2 || b.length < 2) return null;
  const all = [...a, ...b].map((p) => p.equity);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const path = (pts: { equity: number }[]) =>
    pts
      .map((p, i) => {
        const x = (i / (pts.length - 1)) * 100;
        const y = 48 - ((p.equity - min) / span) * 42;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  return (
    <svg className="stress-overlay" viewBox="0 0 100 52" preserveAspectRatio="none" aria-label="IS vs OOS equity">
      <path d={path(a)} className="is" />
      <path d={path(b)} className="oos" />
    </svg>
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

  const isEq = useMemo(() => rebase(report?.in_sample.equity), [report]);
  const oosEq = useMemo(() => rebase(report?.holdout.equity), [report]);

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
  const dRet = (report.holdout.total_return ?? 0) - (report.in_sample.total_return ?? 0);
  const dSh =
    report.holdout.sharpe_ratio != null && report.in_sample.sharpe_ratio != null
      ? report.holdout.sharpe_ratio - report.in_sample.sharpe_ratio
      : null;

  function exportMd() {
    const lines = [
      `# Holdout stress · backtest #${backtestId}`,
      '',
      `**Verdict:** ${VERDICT_LABEL[report!.verdict]}`,
      report!.headline,
      '',
      `| Window | Return | Sharpe | Max DD | Trades |`,
      `| --- | --- | --- | --- | --- |`,
      `| Fit | ${pct(report!.in_sample.total_return)} | ${sharpe(report!.in_sample.sharpe_ratio)} | ${pct(report!.in_sample.max_drawdown)} | ${report!.in_sample.number_of_trades} |`,
      `| Holdout | ${pct(report!.holdout.total_return)} | ${sharpe(report!.holdout.sharpe_ratio)} | ${pct(report!.holdout.max_drawdown)} | ${report!.holdout.number_of_trades} |`,
      '',
      report!.neighbors.length
        ? [
            `## Neighbors · ${report!.parameter?.label ?? 'parameter'}`,
            '',
            ...report!.neighbors.map(
              (n) =>
                `- ${n.chosen ? '**' : ''}${n.label}${n.chosen ? '**' : ''}: Sharpe ${sharpe(n.sharpe_ratio)} · ret ${pct(n.total_return)}`,
            ),
            '',
          ].join('\n')
        : '',
    ];
    downloadText(`quantify-stress-${backtestId}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
    toast('Stress markdown ready', { tone: 'ok' });
  }

  return (
    <div className="stress-studio stress-audit">
      <header className="stress-studio__hero">
        <section className={`stress-verdict verdict-${report.verdict}`}>
          <p className="eyebrow">Holdout studio</p>
          <h2>{VERDICT_LABEL[report.verdict]}</h2>
          <p>{report.headline}</p>
          <p className="mono stress-split">
            Fit {report.split.in_sample_bars} bars · holdout {report.split.holdout_bars} bars (
            {Math.round(report.split.holdout_fraction * 100)}%), never used to choose the rules
          </p>
        </section>
        <section className="panel">
          <h3>Export</h3>
          <p className="hint">Snapshot the fit/holdout gap and neighbor board.</p>
          <button type="button" className="btn secondary" onClick={exportMd}>
            Download markdown
          </button>
        </section>
      </header>

      <section className="kpi-grid">
        <KpiCard
          label="Δ Return (OOS − IS)"
          value={pct(dRet)}
          tone={dRet >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard
          label="Δ Sharpe (OOS − IS)"
          value={dSh == null ? '—' : `${dSh >= 0 ? '+' : ''}${dSh.toFixed(2)}`}
          tone={dSh == null ? 'neutral' : dSh >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard label="Holdout trades" value={String(report.holdout.number_of_trades)} />
        <KpiCard
          label="Neighbor count"
          value={String(report.neighbors.length)}
          hint={report.parameter?.label ?? 'no entry knob'}
        />
      </section>

      {(isEq.length > 2 || oosEq.length > 2) && (
        <section className="panel">
          <h2>Equity overlay · rebased to 100</h2>
          <p className="hint">
            <span className="stress-legend is">Fit</span>
            {' · '}
            <span className="stress-legend oos">Holdout</span>
            {' — separate windows, same scale.'}
          </p>
          <div className="split">
            <div>
              <p className="mono hint">Fit</p>
              <Spark points={isEq} className="tall" />
            </div>
            <div>
              <p className="mono hint">Holdout</p>
              <Spark points={oosEq} className="tall" />
            </div>
          </div>
          {isEq.length > 2 && oosEq.length > 2 ? (
            <div style={{ marginTop: '0.75rem' }}>
              <Overlay a={isEq} b={oosEq} />
            </div>
          ) : null}
        </section>
      )}

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
                  <span className={`mono hint ${(row.total_return ?? 0) >= 0 ? 'pos' : 'neg'}`}>
                    {pct(row.total_return)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
