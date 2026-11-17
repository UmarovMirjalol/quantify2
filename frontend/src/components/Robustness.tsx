import { useEffect, useState } from 'react';
import { getRobustness } from '../services/api';
import type { RobustnessReport } from '../types';
import { ParamSurfaceGrid } from './ParamSurfaceGrid';

type Costs = RobustnessReport['costs'];
type Heatmap = Extract<RobustnessReport['heatmap'], { available: true }>;

const DEFLATED_LABEL: Record<RobustnessReport['deflated']['verdict'], string> = {
  survives: 'Beats luck',
  weak: 'Marginal',
  luck: 'Explained by luck',
  thin: 'Too thin',
};

const COST_LABEL: Record<Costs['verdict'], string> = {
  room: 'Cost headroom',
  thin: 'Thin margin',
  gone: 'Eaten by costs',
  no_edge: 'No edge to protect',
};

const HEAT_LABEL: Record<Heatmap['verdict'], string> = {
  plateau: 'Plateau',
  peak: 'Isolated peak',
  no_edge: 'No edge',
};

function tone(verdict: string): string {
  if (['survives', 'room', 'plateau'].includes(verdict)) return 'holds';
  if (['luck', 'gone', 'no_edge'].includes(verdict)) return 'overfit';
  if (verdict === 'thin' || verdict === 'weak' || verdict === 'peak') return 'fragile';
  return 'thin';
}

function fixed(value: number | null | undefined, digits = 2): string {
  if (value == null) return '—';
  return value.toFixed(digits);
}

function CostCurve({ costs }: { costs: Costs }) {
  const points = costs.points.filter((p) => p.total_return != null) as {
    cost: number;
    total_return: number;
  }[];
  if (points.length < 2) return null;
  const maxCost = points[points.length - 1].cost || 1;
  const values = points.map((p) => p.total_return);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const x = (cost: number) => (cost / maxCost) * 100;
  const y = (ret: number) => 36 - ((ret - lo) / span) * 32;
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.cost).toFixed(2)} ${y(p.total_return).toFixed(2)}`)
    .join(' ');
  return (
    <svg className="cost-curve" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <line className="zero" x1="0" x2="100" y1={y(0)} y2={y(0)} />
      {costs.current_cost <= maxCost ? (
        <line className="current" x1={x(costs.current_cost)} x2={x(costs.current_cost)} y1="2" y2="38" />
      ) : null}
      {costs.breakeven != null ? (
        <line className="breakeven" x1={x(costs.breakeven)} x2={x(costs.breakeven)} y1="2" y2="38" />
      ) : null}
      <path d={path} />
    </svg>
  );
}

export function Robustness({ backtestId }: { backtestId: number }) {
  const [report, setReport] = useState<RobustnessReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getRobustness(backtestId)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Robustness check failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [backtestId]);

  if (loading) {
    return <p className="note">Counting your tries, sweeping costs, and rerunning the parameter grid…</p>;
  }
  if (error || !report) {
    return <div className="banner warn">{error || 'Robustness check failed.'}</div>;
  }

  const { deflated, costs, heatmap } = report;

  return (
    <div className="stress-audit">
      <section className={`stress-verdict verdict-${tone(deflated.verdict)}`}>
        <p className="eyebrow">Deflated Sharpe</p>
        <h2>{DEFLATED_LABEL[deflated.verdict]}</h2>
        <p>{deflated.headline}</p>
        <div className="robust-stats mono">
          <span>Sharpe {fixed(deflated.sharpe)}</span>
          <span>Luck bar {fixed(deflated.expected_max_sharpe)}</span>
          <span>Tries {deflated.trials}</span>
          <span>
            P(real) {deflated.probability == null ? '—' : `${Math.round(deflated.probability * 100)}%`}
          </span>
        </div>
        <p className="mono stress-split">
          Luck bar is the Sharpe the best of {deflated.trials} random tries would reach (Bailey &amp; López de Prado).
        </p>
      </section>

      <section className={`stress-verdict verdict-${tone(costs.verdict)} robust-block`}>
        <p className="eyebrow">Cost break-even</p>
        <h2>{COST_LABEL[costs.verdict]}</h2>
        <p>{costs.headline}</p>
        <CostCurve costs={costs} />
        <p className="mono stress-split">
          Total return as costs per side rise from 0% to 2% · your costs{' '}
          {(costs.current_cost * 100).toFixed(2)}%
          {costs.breakeven != null ? ` · break-even ${(costs.breakeven * 100).toFixed(2)}%` : ''}
        </p>
      </section>

      <section
        className={`stress-verdict verdict-${heatmap.available ? tone(heatmap.verdict) : 'thin'} robust-block`}
      >
        <p className="eyebrow">Parameter heatmap</p>
        <h2>{heatmap.available ? HEAT_LABEL[heatmap.verdict] : 'Not a crossover'}</h2>
        <p>{heatmap.headline}</p>
        {heatmap.available ? (
          <>
            <ParamSurfaceGrid map={heatmap} />
            <p className="mono stress-split">
              Sharpe for every {heatmap.indicator} fast × slow pair · outlined = your run · open{' '}
              <strong>Lab</strong> to click a cell and re-run it
            </p>
          </>
        ) : null}
      </section>
    </div>
  );
}
