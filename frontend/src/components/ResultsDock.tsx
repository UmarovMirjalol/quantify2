import { Link } from 'react-router-dom';
import type { BacktestResult } from '../types';
import { EquitySparkline } from './EquitySparkline';

function pct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

/** Sticky research dock under the fold — glanceable KPIs while you scroll charts. */
export function ResultsDock({
  result,
  vsHold,
  onCompare,
  readOnly,
}: {
  result: BacktestResult;
  vsHold: number | null;
  onCompare?: () => void;
  readOnly?: boolean;
}) {
  const m = result.metrics;
  const equity = result.equity_curve.map((p) => p.equity);
  const up = (m.total_return ?? 0) >= 0;
  const grade = result.verdict?.grade?.replace(/_/g, ' ');

  return (
    <div className="results-dock no-print" role="complementary" aria-label="Result summary">
      <EquitySparkline values={equity} width={140} height={32} positive={up} />
      <div className="results-dock__metrics">
        <span>
          <small>Return</small>
          <strong className={up ? 'pos' : 'neg'}>{pct(m.total_return)}</strong>
        </span>
        <span>
          <small>vs hold</small>
          <strong className={(vsHold ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(vsHold)}</strong>
        </span>
        <span>
          <small>Sharpe</small>
          <strong className="mono">{m.sharpe_ratio == null ? '—' : m.sharpe_ratio.toFixed(2)}</strong>
        </span>
        <span>
          <small>DD</small>
          <strong className="neg mono">{pct(m.max_drawdown)}</strong>
        </span>
        {grade ? (
          <span className="results-dock__grade">
            <small>Verdict</small>
            <strong>{grade}</strong>
          </span>
        ) : null}
      </div>
      <div className="results-dock__actions">
        {!readOnly && onCompare ? (
          <button type="button" className="btn ghost small" onClick={onCompare}>
            Compare
          </button>
        ) : null}
        <Link className="btn ghost small" to="/farm">
          Farm
        </Link>
        <a className="btn ghost small" href="#results-tabs">
          Tabs
        </a>
      </div>
    </div>
  );
}
