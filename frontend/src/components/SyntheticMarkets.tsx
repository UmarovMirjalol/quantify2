import { useEffect, useState } from 'react';
import { getSynthetic } from '../services/api';
import type { SyntheticReport } from '../types';
import { KpiCard } from './KpiCard';

const VERDICT_LABEL: Record<SyntheticReport['verdict'], string> = {
  robust: 'Pays across histories',
  fragile: 'Coin flip',
  history_only: 'Only this history',
  no_edge: 'No edge',
  thin: 'Too thin',
};

const VERDICT_TONE: Record<SyntheticReport['verdict'], string> = {
  robust: 'holds',
  fragile: 'fragile',
  history_only: 'overfit',
  no_edge: 'overfit',
  thin: 'thin',
};

function pct(v: number): string {
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
}

function Histogram({ report }: { report: SyntheticReport }) {
  const { edges, counts } = report.histogram;
  if (!counts.length) return null;
  const lo = edges[0];
  const hi = edges[edges.length - 1];
  const span = hi - lo || 1;
  const peak = Math.max(...counts, 1);
  const x = (v: number) => ((v - lo) / span) * 100;
  const width = 100 / counts.length;
  const real = Math.min(hi, Math.max(lo, report.real.total_return));
  return (
    <svg className="synth-hist" viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">
      {counts.map((count, i) => {
        const h = (count / peak) * 38;
        const mid = (edges[i] + edges[i + 1]) / 2;
        return (
          <rect
            key={i}
            x={i * width + 0.3}
            y={40 - h}
            width={width - 0.6}
            height={h}
            className={mid >= 0 ? 'pos' : 'neg'}
          />
        );
      })}
      {lo < 0 && hi > 0 ? <line className="zero" x1={x(0)} x2={x(0)} y1="0" y2="40" /> : null}
      <line className="real" x1={x(real)} x2={x(real)} y1="0" y2="40" />
    </svg>
  );
}

export function SyntheticMarkets({ backtestId }: { backtestId: number }) {
  const [report, setReport] = useState<SyntheticReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setError('');
    getSynthetic(backtestId)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Synthetic markets failed.');
      });
    return () => {
      cancelled = true;
    };
  }, [backtestId]);

  if (error) return <div className="banner warn">{error}</div>;
  if (!report) {
    return <p className="note">Building 100 alternate histories of this asset and rerunning the rules on each…</p>;
  }

  return (
    <div className="stress-audit">
      <section className={`stress-verdict verdict-${VERDICT_TONE[report.verdict]}`}>
        <p className="eyebrow">Synthetic markets</p>
        <h2>{VERDICT_LABEL[report.verdict]}</h2>
        <p>{report.headline}</p>
        <p className="mono stress-split">
          {report.paths} block-bootstrapped paths · {report.block}-bar blocks keep short-term behaviour, shuffle the
          sequence of years
        </p>
      </section>

      <section className="kpi-grid">
        <KpiCard
          label="Profitable paths"
          value={`${Math.round(report.profitable_share * 100)}%`}
          tone={report.profitable_share >= 0.7 ? 'positive' : report.profitable_share < 0.4 ? 'negative' : 'neutral'}
        />
        <KpiCard label="Median return" value={pct(report.returns.p50)} tone={report.returns.p50 > 0 ? 'positive' : 'negative'} />
        <KpiCard label="5th – 95th pct" value={`${pct(report.returns.p5)} … ${pct(report.returns.p95)}`} />
        <KpiCard
          label="Real history rank"
          value={`${Math.round(report.real_rank * 100)}th pct`}
          hint={`Real return ${pct(report.real.total_return)}`}
        />
        <KpiCard label="Median Sharpe" value={report.sharpes.p50.toFixed(2)} />
        <KpiCard label="Asset median" value={pct(report.hold_median)} hint="Buy & hold on the same paths" />
      </section>

      <section className="panel">
        <h2>Return across alternate histories</h2>
        <Histogram report={report} />
        <p className="mono stress-split">
          Bars: how many paths ended at each return · white line: the real history
        </p>
      </section>
    </div>
  );
}
