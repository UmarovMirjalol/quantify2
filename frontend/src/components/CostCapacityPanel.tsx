import { useEffect, useMemo, useState } from 'react';
import { getRobustness } from '../services/api';
import type { BacktestResult, RobustnessReport } from '../types';
import { capacityReport } from '../utils/capacity';
import { KpiCard } from './KpiCard';

function pct(v: number | null | undefined, digits = 2): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

function money(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

/** Pull cost breakeven from robustness + local ADV capacity estimate. */
export function CostCapacityPanel({ result }: { result: BacktestResult }) {
  const [costs, setCosts] = useState<RobustnessReport['costs'] | null>(null);
  const [err, setErr] = useState('');
  const cap = useMemo(
    () => capacityReport(result.trades, result.price_series),
    [result.trades, result.price_series],
  );

  useEffect(() => {
    let cancelled = false;
    getRobustness(result.id)
      .then((r) => {
        if (!cancelled) setCosts(r.costs);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Cost sweep failed');
      });
    return () => {
      cancelled = true;
    };
  }, [result.id]);

  return (
    <section className="panel cost-capacity">
      <h2>Cost &amp; capacity</h2>
      <p className="hint">
        Where the edge dies under fees, and whether fills look realistic vs recent dollar volume.
      </p>
      <div className="kpi-grid">
        <KpiCard
          label="Cost breakeven"
          value={costs?.breakeven == null ? (costs ? 'survives 2%' : '…') : pct(costs.breakeven)}
          hint={costs?.headline}
          tone={
            costs?.verdict === 'gone' || costs?.verdict === 'no_edge'
              ? 'negative'
              : costs?.verdict === 'thin'
                ? 'neutral'
                : 'positive'
          }
        />
        <KpiCard
          label="Your costs"
          value={costs ? pct(costs.current_cost) : '…'}
          hint="Commission + slippage entered"
        />
        <KpiCard
          label="Median participation"
          value={cap.median_participation == null ? '—' : pct(cap.median_participation)}
          hint={cap.headline}
          tone={cap.verdict === 'crowded' ? 'negative' : cap.verdict === 'tight' ? 'neutral' : 'positive'}
        />
        <KpiCard
          label="Max vs ADV"
          value={cap.max_participation == null ? '—' : pct(cap.max_participation)}
          hint={`Median ADV ${money(cap.median_adv)} · ${cap.trades_scored} trades`}
        />
      </div>
      {err ? <p className="hint">{err}</p> : null}
    </section>
  );
}
