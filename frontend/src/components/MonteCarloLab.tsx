import { useCallback, useEffect, useState } from 'react';
import { getMonteCarlo } from '../services/api';
import type { MonteCarloResult } from '../types';
import { MonteCarloChart } from './Charts';
import { KpiCard } from './KpiCard';
import { toast } from './ToastHost';

function pct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

function money(v: number | null | undefined): string {
  if (v == null) return '—';
  return `$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function toneFor(v: number | null | undefined): 'positive' | 'negative' | 'neutral' {
  if (v == null) return 'neutral';
  if (v > 0) return 'positive';
  if (v < 0) return 'negative';
  return 'neutral';
}

type Props = {
  backtestId: number;
  initial?: MonteCarloResult | null;
};

export function MonteCarloLab({ backtestId, initial }: Props) {
  const [report, setReport] = useState<MonteCarloResult | null>(initial ?? null);
  const [sims, setSims] = useState(1000);
  const [ruin, setRuin] = useState(0.4);
  const [seed, setSeed] = useState(42);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(
    async (opts?: { sims?: number; ruin?: number; seed?: number; quiet?: boolean }) => {
      setBusy(true);
      setError('');
      try {
        const next = await getMonteCarlo(backtestId, {
          sims: opts?.sims ?? sims,
          ruin: opts?.ruin ?? ruin,
          seed: opts?.seed ?? seed,
        });
        setReport(next);
        if (!opts?.quiet) {
          toast('Monte Carlo refreshed', {
            tone: 'ok',
            body: `${next.num_simulations || 0} paths · ruin @ ${((opts?.ruin ?? ruin) * 100).toFixed(0)}% DD`,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Monte Carlo failed.');
      } finally {
        setBusy(false);
      }
    },
    [backtestId, sims, ruin, seed],
  );

  useEffect(() => {
    if (initial && initial.num_simulations > 0) {
      setReport(initial);
      return;
    }
    void run({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backtestId]);

  if (error && !report) {
    return <div className="banner warn">{error}</div>;
  }

  if (!report || report.num_simulations <= 0) {
    return (
      <div className="banner warn">
        {report?.error || error || 'At least 3 closed trades are required to run Monte Carlo stress simulations.'}
      </div>
    );
  }

  return (
    <div className="mc-lab">
      <header className="mc-lab__hero">
        <div>
          <p className="eyebrow">Monte Carlo lab</p>
          <h2>Resample the trade book. Stress the path.</h2>
          <p className="lede">
            Bootstrap the closed-trade returns {report.num_simulations.toLocaleString()} times. Knobs below re-run on
            the server — defaults stay cached on the backtest.
          </p>
        </div>
      </header>

      <section className="panel mc-lab__controls">
        <div className="param-grid">
          <label className="field">
            <span>Simulations</span>
            <select value={sims} onChange={(e) => setSims(Number(e.target.value))} disabled={busy}>
              <option value={250}>250 · quick</option>
              <option value={500}>500</option>
              <option value={1000}>1,000 · default</option>
              <option value={2500}>2,500</option>
              <option value={5000}>5,000 · heavy</option>
            </select>
          </label>
          <label className="field">
            <span>Ruin DD threshold</span>
            <select value={ruin} onChange={(e) => setRuin(Number(e.target.value))} disabled={busy}>
              <option value={0.2}>20%</option>
              <option value={0.3}>30%</option>
              <option value={0.4}>40% · default</option>
              <option value={0.5}>50%</option>
              <option value={0.6}>60%</option>
            </select>
          </label>
          <label className="field">
            <span>Seed</span>
            <input
              type="number"
              value={seed}
              min={0}
              max={1000000}
              onChange={(e) => setSeed(Number(e.target.value) || 0)}
              disabled={busy}
            />
          </label>
        </div>
        <div className="btn-row">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void run()}>
            {busy ? 'Resampling…' : 'Re-run Monte Carlo'}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => {
              setSims(1000);
              setRuin(0.4);
              setSeed(42);
              void run({ sims: 1000, ruin: 0.4, seed: 42 });
            }}
          >
            Reset defaults
          </button>
        </div>
        {error ? <div className="banner warn">{error}</div> : null}
      </section>

      <section className="kpi-grid">
        <KpiCard
          label={`Risk of Ruin (>${(ruin * 100).toFixed(0)}% DD)`}
          value={pct(report.risk_of_ruin)}
          tone={
            report.risk_of_ruin === 0 ? 'positive' : report.risk_of_ruin > 0.1 ? 'negative' : 'neutral'
          }
          hint={`${report.num_simulations.toLocaleString()} paths · ${report.num_trades} trades`}
        />
        <KpiCard
          label="95% Worst Drawdown"
          value={pct(report.worst_drawdown_p95)}
          tone="negative"
          hint="Pessimistic stress outcome"
        />
        <KpiCard
          label="Median Return"
          value={pct(report.median_return)}
          tone={toneFor(report.median_return)}
          hint="50th percentile expectation"
        />
        <KpiCard
          label="Median final equity"
          value={money(report.median_final_equity)}
          hint="Absolute book size at median path"
        />
        <KpiCard
          label="95% Confidence Band"
          value={`${pct(report.confidence_95_lower)} … ${pct(report.confidence_95_upper)}`}
          hint="Expected return range"
        />
      </section>

      <section className="panel">
        <div className="page-header" style={{ marginBottom: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>
              Fan chart · {report.num_simulations.toLocaleString()} resamplings
            </h2>
            <p className="hint">
              Percentile bands of equity if trade outcomes are reshuffled — not a price forecast.
            </p>
          </div>
        </div>
        <MonteCarloChart fanChart={report.fan_chart} />
      </section>
    </div>
  );
}
