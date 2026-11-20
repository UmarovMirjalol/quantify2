import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BacktestResult } from '../types';
import { getCompareA } from '../utils/compareQueue';
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
  const [queued, setQueued] = useState<number | null>(() => getCompareA());

  useEffect(() => {
    const sync = () => setQueued(getCompareA());
    window.addEventListener('quantify-compare-queue', sync);
    return () => window.removeEventListener('quantify-compare-queue', sync);
  }, []);

  return (
    <div
      className={`results-dock no-print${up ? ' results-dock--up' : ' results-dock--down'}`}
      role="complementary"
      aria-label="Result summary"
      data-positive={up ? 'true' : 'false'}
    >
      <EquitySparkline values={equity} width={140} height={32} positive={up} />
      <div className="results-dock__metrics">
        <span className="results-dock__flash">
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
            {queued && queued !== result.id
              ? `Compare vs #${queued}`
              : queued === result.id
                ? `#${result.id} queued`
                : 'Compare'}
          </button>
        ) : null}
        {queued ? (
          <Link className="btn ghost small" to="/compare">
            Launcher
          </Link>
        ) : null}
        <Link className="btn ghost small" to="/desk">
          Ops
        </Link>
        <Link className="btn ghost small" to="/book">
          Book
        </Link>
        <Link className="btn ghost small" to="/matrix">
          Matrix
        </Link>
        <a className="btn ghost small" href="#results-tabs">
          Tabs
        </a>
      </div>
    </div>
  );
}
