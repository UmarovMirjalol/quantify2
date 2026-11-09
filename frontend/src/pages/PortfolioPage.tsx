import { useEffect, useMemo, useState } from 'react';
import { EquityChart } from '../components/Charts';
import { KpiCard } from '../components/KpiCard';
import { fetchMarketData, listDatasets, runPortfolio } from '../services/api';
import type { DatasetInfo, EquityPoint, PortfolioResult } from '../types';

const DEFAULT_TEXT =
  'Buy when the 20-day SMA crosses above the 50-day SMA and sell when it crosses below. Risk 1% per trade.';

function pct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
}

function money(v: number): string {
  return `${v >= 0 ? '+' : '−'}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function tone(v: number | null | undefined): 'positive' | 'negative' | 'neutral' {
  if (v == null || v === 0) return 'neutral';
  return v > 0 ? 'positive' : 'negative';
}

function corrColor(v: number): string {
  const s = Math.min(1, Math.abs(v));
  return v >= 0 ? `rgba(229, 122, 132, ${0.08 + s * 0.6})` : `rgba(79, 214, 160, ${0.08 + s * 0.6})`;
}

function toPoints(rows: { date: string; equity: number }[]): EquityPoint[] {
  return rows.map((r) => ({ date: r.date, equity: r.equity, cash: r.equity, drawdown: null }));
}

export function PortfolioPage() {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [tickers, setTickers] = useState('');
  const [fetching, setFetching] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PortfolioResult | null>(null);

  useEffect(() => {
    listDatasets()
      .then((items) => {
        setDatasets(items);
        const daily = items.filter((d) => !d.id.includes('15m')).map((d) => d.id);
        setPicked(daily.slice(0, 3));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-12)));
  }

  async function addTickers() {
    const list = tickers
      .split(/[\s,;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 8);
    if (!list.length) return;
    setFetching(true);
    setError('');
    const added: string[] = [];
    const failed: string[] = [];
    for (const ticker of list) {
      try {
        const res = await fetchMarketData(ticker, '1d');
        added.push(res.dataset_id);
      } catch {
        failed.push(ticker);
      }
    }
    try {
      setDatasets(await listDatasets());
    } catch {
      // keep the old list
    }
    setPicked((prev) => [...new Set([...prev, ...added])].slice(-12));
    setTickers('');
    if (failed.length) setError(`Could not fetch: ${failed.join(', ')}`);
    setFetching(false);
  }

  async function run() {
    setRunning(true);
    setError('');
    try {
      setResult(
        await runPortfolio({
          strategy_text: text,
          datasets: picked,
          initial_capital: 100000,
          commission: 0.001,
          slippage: 0.0005,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Portfolio run failed.');
    } finally {
      setRunning(false);
    }
  }

  const assets = useMemo(() => (result ? Object.entries(result.asset_results) : []), [result]);
  const benchReturn = result?.benchmark_equity_curve.length
    ? result.benchmark_equity_curve[result.benchmark_equity_curve.length - 1].equity /
        result.benchmark_equity_curve[0].equity -
      1
    : null;
  const m = result?.portfolio_metrics;

  return (
    <div className="results portfolio">
      <div className="page-header">
        <div>
          <p className="eyebrow">Multi-asset</p>
          <h1>Portfolio</h1>
          <p className="lede">
            One rule set on a basket of assets, with equal capital in each sleeve. See whether the edge spreads across
            markets or lives in just one, and how much the assets move together.
          </p>
        </div>
      </div>

      <section className="panel portfolio-form">
        <label className="field">
          <span>Strategy</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="field">
          <span>Assets ({picked.length} picked, up to 12)</span>
          <div className="chip-row">
            {datasets.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`chip ${picked.includes(d.id) ? 'active' : ''}`}
                onClick={() => toggle(d.id)}
              >
                {d.name.replace(/\.csv$/, '')}
              </button>
            ))}
          </div>
        </div>
        <div className="btn-row">
          <input
            className="ticker-input"
            placeholder="Add tickers: BTCUSDT, ETHUSDT, AAPL, MSFT"
            value={tickers}
            onChange={(e) => setTickers(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTickers();
            }}
          />
          <button type="button" className="btn secondary" onClick={addTickers} disabled={fetching}>
            {fetching ? 'Fetching…' : 'Fetch daily data'}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={run}
            disabled={running || picked.length < 1 || text.trim().length < 5}
          >
            {running ? 'Running…' : `Run on ${picked.length} asset${picked.length === 1 ? '' : 's'}`}
          </button>
        </div>
        {error ? <div className="banner warn">{error}</div> : null}
      </section>

      {result && m ? (
        <>
          <section className="kpi-grid">
            <KpiCard label="Portfolio return" value={pct(m.total_return)} tone={tone(m.total_return)} />
            <KpiCard label="Equal-weight hold" value={pct(benchReturn)} tone={tone(benchReturn)} />
            <KpiCard label="Sharpe" value={m.sharpe_ratio == null ? '—' : m.sharpe_ratio.toFixed(2)} />
            <KpiCard label="Max drawdown" value={pct(m.max_drawdown)} tone="negative" />
            <KpiCard label="Trades" value={String(result.trades.length)} />
            <KpiCard
              label="Avg correlation"
              value={result.correlation.average == null ? '—' : result.correlation.average.toFixed(2)}
              hint="Between sleeve returns; lower spreads risk"
            />
            <KpiCard
              label="Diversification ratio"
              value={result.diversification_ratio == null ? '—' : `${result.diversification_ratio.toFixed(2)}×`}
              hint="Sleeve volatility ÷ portfolio volatility"
            />
            <KpiCard
              label="Winning sleeves"
              value={`${assets.filter(([, a]) => a.pnl > 0).length}/${assets.length}`}
            />
          </section>

          <section className="panel">
            <h2>Portfolio equity vs equal-weight buy & hold</h2>
            <EquityChart
              data={toPoints(result.portfolio_equity_curve)}
              benchmark={toPoints(result.benchmark_equity_curve)}
              name="Portfolio"
              benchmarkName="Equal-weight hold"
            />
          </section>

          <div className="split">
            <section className="panel table-wrap">
              <h2>Sleeves</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Return</th>
                    <th>Hold</th>
                    <th>Sharpe</th>
                    <th>Max DD</th>
                    <th>Trades</th>
                    <th>P&amp;L</th>
                    <th>Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map(([name, a]) => (
                    <tr key={name}>
                      <td className="mono">{name}</td>
                      <td className={(a.total_return ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(a.total_return)}</td>
                      <td className="mono">{pct(a.buy_hold_return)}</td>
                      <td className="mono">{a.sharpe_ratio == null ? '—' : a.sharpe_ratio.toFixed(2)}</td>
                      <td className="neg">{pct(a.max_drawdown)}</td>
                      <td className="mono">{a.trades_count}</td>
                      <td className={a.pnl >= 0 ? 'pos' : 'neg'}>{money(a.pnl)}</td>
                      <td className={a.contribution >= 0 ? 'pos' : 'neg'}>{pct(a.contribution)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="note">
                Contribution is each sleeve's P&amp;L as a share of starting capital; the column adds up to the
                portfolio return. One sleeve carrying nearly all of it means the portfolio is really a single-asset bet.
              </p>
            </section>

            {result.correlation.assets.length > 1 ? (
              <section className="panel">
                <h2>Sleeve correlation</h2>
                <div className="heat-wrap">
                  <table className="heat-grid">
                    <thead>
                      <tr>
                        <th />
                        {result.correlation.assets.map((a) => (
                          <th key={a} className="mono">
                            {a}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.correlation.matrix.map((row, i) => (
                        <tr key={result.correlation.assets[i]}>
                          <th className="mono">{result.correlation.assets[i]}</th>
                          {row.map((v, j) => (
                            <td key={j} style={{ background: i === j ? 'transparent' : corrColor(v) }}>
                              <span className="mono">{v.toFixed(2)}</span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="note">
                  Daily return correlation between sleeves. Red cells move together and add little diversification;
                  green cells offset each other.
                </p>
              </section>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
