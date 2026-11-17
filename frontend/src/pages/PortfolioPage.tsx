import { useEffect, useMemo, useState } from 'react';
import { DrawdownChart, EquityChart } from '../components/Charts';
import { KpiCard } from '../components/KpiCard';
import { HistoryPicker } from '../components/HistoryPicker';
import { TradeTable } from '../components/TradeTable';
import { WatchlistBar } from '../components/WatchlistBar';
import { toast } from '../components/ToastHost';
import { fetchMarketData, listDatasets, runDataHealth, runPortfolio, type DataHealthReport } from '../services/api';
import { CorrelationHeatmap } from '../components/CorrelationHeatmap';
import type { DatasetInfo, EquityPoint, PortfolioResult } from '../types';
import { downloadText, toCsv } from '../utils/download';

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

function toPoints(
  rows: { date: string; equity: number; cash?: number; drawdown?: number | null }[],
): EquityPoint[] {
  return rows.map((r) => ({
    date: r.date,
    equity: r.equity,
    cash: r.cash ?? r.equity,
    drawdown: r.drawdown ?? null,
  }));
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
  const [health, setHealth] = useState<DataHealthReport | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [capitalMode, setCapitalMode] = useState<'shared' | 'sleeves'>('shared');
  const [maxPositions, setMaxPositions] = useState(0);
  const [capital, setCapital] = useState(100000);
  const [commission, setCommission] = useState(0.001);
  const [slippage, setSlippage] = useState(0.0005);
  const [blotterAsset, setBlotterAsset] = useState('all');

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
      const out = await runPortfolio({
        strategy_text: text,
        datasets: picked,
        initial_capital: capital,
        commission,
        slippage,
        capital_mode: capitalMode,
        max_positions: maxPositions > 0 ? maxPositions : undefined,
      });
      setResult(out);
      setBlotterAsset('all');
      toast('Portfolio finished', {
        tone: 'ok',
        body: `${out.capital_mode ?? capitalMode} · ${out.trades.length} fills · ${Object.keys(out.asset_results).length} sleeves`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Portfolio run failed.');
    } finally {
      setRunning(false);
    }
  }

  async function probeTickers() {
    const list = tickers
      .split(/[\s,;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 20);
    if (!list.length) {
      setError('Add tickers to probe first.');
      return;
    }
    setHealthBusy(true);
    setError('');
    try {
      setHealth(await runDataHealth({ universe: null, tickers: list, history: '1y' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed.');
    } finally {
      setHealthBusy(false);
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
            Shared cash book or equal sleeves — same rules on a basket, with a real trade blotter and risk margins.
            Compare against equal-weight buy &amp; hold and see how much the names move together.
          </p>
        </div>
      </div>

      <WatchlistBar
        onApply={(list) => {
          setTickers(list.join(', '));
          toast('Watchlist applied', { tone: 'ok', body: `${list.length} tickers` });
        }}
      />

      <section className="panel portfolio-form">
        <label className="field">
          <span>Strategy</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
          <button
            type="button"
            className={`chip${capitalMode === 'shared' ? ' active' : ''}`}
            onClick={() => setCapitalMode('shared')}
          >
            Shared cash
          </button>
          <button
            type="button"
            className={`chip${capitalMode === 'sleeves' ? ' active' : ''}`}
            onClick={() => setCapitalMode('sleeves')}
          >
            Equal sleeves
          </button>
        </div>
        <div className="param-grid">
          <label className="field">
            <span>Initial capital</span>
            <input
              type="number"
              value={capital}
              min={1000}
              step={1000}
              onChange={(e) => setCapital(Number(e.target.value) || 100000)}
            />
          </label>
          <label className="field">
            <span>Max open positions</span>
            <input
              type="number"
              value={maxPositions}
              min={0}
              max={12}
              onChange={(e) => setMaxPositions(Math.max(0, Number(e.target.value) || 0))}
            />
            <span className="hint">0 = unlimited</span>
          </label>
          <label className="field">
            <span>Commission / side</span>
            <input
              type="number"
              value={commission}
              step={0.0001}
              min={0}
              onChange={(e) => setCommission(Number(e.target.value) || 0)}
            />
          </label>
          <label className="field">
            <span>Slippage / side</span>
            <input
              type="number"
              value={slippage}
              step={0.0001}
              min={0}
              onChange={(e) => setSlippage(Number(e.target.value) || 0)}
            />
          </label>
        </div>
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
          <HistoryPicker disabled={fetching} />
          <button type="button" className="btn secondary" onClick={addTickers} disabled={fetching}>
            {fetching ? 'Fetching…' : 'Fetch daily data'}
          </button>
          <button type="button" className="btn ghost" onClick={() => void probeTickers()} disabled={healthBusy}>
            {healthBusy ? 'Probing…' : 'Data health'}
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
        {health ? (
          <div className="table-wrap" style={{ marginTop: '0.85rem' }}>
            <p className="hint">
              Health: {health.ok} ok · {health.warn} warn · {health.thin} thin · {health.fail} fail
            </p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Grade</th>
                  <th>Bars</th>
                  <th>Gaps</th>
                  <th>Max gap</th>
                  <th>Range</th>
                </tr>
              </thead>
              <tbody>
                {health.rows.slice(0, 24).map((r) => (
                  <tr key={r.ticker}>
                    <td className="mono">{r.ticker}</td>
                    <td className={`mono health-${r.grade}`}>{r.grade}</td>
                    <td className="mono">{r.bars}</td>
                    <td className="mono">{r.gaps ?? '—'}</td>
                    <td className="mono">{r.max_gap_days ?? '—'}</td>
                    <td className="mono">
                      {r.date_start && r.date_end ? `${r.date_start} → ${r.date_end}` : r.error ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
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
              label="Capital mode"
              value={result.capital_mode === 'sleeves' ? 'Sleeves' : 'Shared'}
              hint={maxPositions > 0 ? `Max ${maxPositions} open` : 'No position cap'}
            />
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
            <KpiCard
              label="Vol (ann.)"
              value={
                result.risk?.vol_annual == null ? '—' : `${(result.risk.vol_annual * 100).toFixed(1)}%`
              }
            />
            <KpiCard
              label="VaR 95% (daily)"
              value={
                result.risk?.tails?.['0.95']?.var_pct == null
                  ? '—'
                  : `${result.risk.tails['0.95'].var_pct}%`
              }
              hint="Historical left-tail loss"
              tone="negative"
            />
            <KpiCard
              label="ES 99% (daily)"
              value={
                result.risk?.tails?.['0.99']?.es_pct == null
                  ? result.risk?.tails?.['0.95']?.es_pct == null
                    ? '—'
                    : `${result.risk.tails['0.95'].es_pct}%`
                  : `${result.risk.tails['0.99'].es_pct}%`
              }
              hint="Expected shortfall"
              tone="negative"
            />
            <KpiCard
              label="Avg invested"
              value={
                result.risk?.margin?.avg_invested == null
                  ? '—'
                  : `${(result.risk.margin.avg_invested * 100).toFixed(0)}%`
              }
              hint={
                result.risk?.margin?.max_invested == null
                  ? undefined
                  : `Peak ${(result.risk.margin.max_invested * 100).toFixed(0)}%`
              }
            />
            <KpiCard
              label="Avg cash"
              value={
                result.risk?.margin?.avg_cash_share == null
                  ? '—'
                  : `${(result.risk.margin.avg_cash_share * 100).toFixed(0)}%`
              }
            />
          </section>

          <div className="split">
            <section className="panel">
              <h2>Portfolio equity vs equal-weight buy & hold</h2>
              <EquityChart
                data={toPoints(result.portfolio_equity_curve)}
                benchmark={toPoints(result.benchmark_equity_curve)}
                name="Portfolio"
                benchmarkName="Equal-weight hold"
              />
            </section>
            <section className="panel">
              <h2>Drawdown</h2>
              <DrawdownChart data={toPoints(result.portfolio_equity_curve)} />
            </section>
          </div>

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
                <CorrelationHeatmap assets={result.correlation.assets} matrix={result.correlation.matrix} />
                <div className="heat-wrap" style={{ marginTop: '0.75rem' }}>
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

          <section className="panel">
            <div className="page-header" style={{ marginBottom: '0.65rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>Trade blotter</h2>
                <p className="hint" style={{ margin: '0.2rem 0 0' }}>
                  Every fill across the book — filter by sleeve.
                </p>
              </div>
              <div className="btn-row">
                <select
                  value={blotterAsset}
                  onChange={(e) => setBlotterAsset(e.target.value)}
                  aria-label="Filter blotter by asset"
                >
                  <option value="all">All assets</option>
                  {assets.map(([name]) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={!result.trades.length}
                  onClick={() => {
                    const rows =
                      blotterAsset === 'all'
                        ? result.trades
                        : result.trades.filter((t) => t.asset === blotterAsset);
                    const csv = toCsv([
                      ['asset', 'entry', 'exit', 'side', 'pnl', 'return_pct', 'bars'],
                      ...rows.map((t) => [
                        t.asset,
                        t.entry_date,
                        t.exit_date,
                        t.side,
                        t.pnl,
                        t.return_pct,
                        t.bars_held,
                      ]),
                    ]);
                    downloadText(`quantify-portfolio-blotter-${Date.now()}.csv`, csv, 'text/csv;charset=utf-8');
                    toast('Blotter CSV ready', { tone: 'ok' });
                  }}
                >
                  Export CSV
                </button>
              </div>
            </div>
            <TradeTable
              trades={
                blotterAsset === 'all'
                  ? result.trades
                  : result.trades.filter((t) => t.asset === blotterAsset)
              }
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
