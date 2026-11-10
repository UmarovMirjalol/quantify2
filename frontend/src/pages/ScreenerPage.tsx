import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createForwardTest,
  fetchMarketData,
  listScreenerUniverses,
  runBacktest,
  runScreener,
} from '../services/api';
import type { ScreenerResult, ScreenerRow, ScreenerUniverse } from '../types';
import { actionLabel, actionTone, pct, price } from '../utils/signal';
import { usePageMeta } from '../hooks/usePageMeta';
import { KpiCard } from '../components/KpiCard';
import type { HistoryRange } from '../components/HistoryPicker';

const DEFAULT_TEXT = 'Buy when the 20-day SMA crosses above the 50-day SMA and sell when it crosses below.';

const PRESETS = [
  { label: 'SMA 20 × 50', text: DEFAULT_TEXT },
  { label: 'Turtle 20/10', text: 'Buy when price breaks above the 20-day high and sell when it breaks below the 10-day low.' },
  { label: 'RSI dip', text: 'Buy when RSI(14) drops below 30 and sell when it rises above 60.' },
  { label: 'Stochastic swing', text: 'Buy when Stochastic %K crosses above %D below 20 and sell when %K crosses below %D above 80.' },
];

export function ScreenerPage() {
  usePageMeta(
    'Signal screener — Quantify',
    'Run one trading rule across dozens of stocks, ETFs or crypto and see which ones signal a buy or sell today.',
  );
  const navigate = useNavigate();
  const [universes, setUniverses] = useState<ScreenerUniverse[]>([]);
  const [universe, setUniverse] = useState<string | null>('us_megacaps');
  const [tickers, setTickers] = useState('');
  const [text, setText] = useState(DEFAULT_TEXT);
  const [history, setHistory] = useState<HistoryRange>('5y');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ScreenerResult | null>(null);
  const [actionableOnly, setActionableOnly] = useState(false);
  const [busyRow, setBusyRow] = useState('');
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    listScreenerUniverses()
      .then(setUniverses)
      .catch(() => setUniverses([]));
  }, []);

  const custom = useMemo(
    () =>
      tickers
        .split(/[\s,;]+/)
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean),
    [tickers],
  );
  const total = (universes.find((u) => u.id === universe)?.count ?? 0) + custom.length;

  async function scan() {
    setRunning(true);
    setError('');
    try {
      setResult(await runScreener({ strategy_text: text, universe, tickers: custom, history }));
      window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed.');
    } finally {
      setRunning(false);
    }
  }

  async function backtest(row: ScreenerRow) {
    if (!result) return;
    setBusyRow(`bt-${row.ticker}`);
    setError('');
    try {
      const data = await fetchMarketData(row.symbol, '1d', history);
      const run = await runBacktest({
        strategy_text: text,
        dataset_id: data.dataset_id,
        strategy: result.strategy,
        config: { initial_capital: 100000, commission: 0.001, slippage: 0.0005 },
      });
      navigate(`/results/${run.id}`, { state: { result: run } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backtest failed.');
      setBusyRow('');
    }
  }

  async function track(row: ScreenerRow) {
    if (!result) return;
    setBusyRow(`fw-${row.ticker}`);
    setError('');
    try {
      await createForwardTest({ strategy: result.strategy, strategy_text: text, ticker: row.symbol, name: `${row.ticker} · ${text}` });
      navigate('/forward');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the forward test.');
      setBusyRow('');
    }
  }

  const rows = (result?.rows ?? []).filter(
    (r) => !actionableOnly || r.action === 'enter' || r.action === 'exit' || r.action === 'add',
  );
  const side = result?.side ?? 'long';

  return (
    <div className="results screener">
      <div className="page-header">
        <div>
          <p className="eyebrow">Live signals</p>
          <h1>Screener</h1>
          <p className="lede">
            One rule set across a whole market. See which tickers signal a {side === 'short' ? 'short' : 'buy'} or an exit
            on the latest close, which are already in a position, and how the rules did on each over the chosen history.
          </p>
        </div>
      </div>

      <section className="panel portfolio-form">
        <label className="field">
          <span>Strategy</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="chip-row">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className={`chip ${text === p.text ? 'active' : ''}`} onClick={() => setText(p.text)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="field">
          <span>Universe</span>
          <div className="chip-row">
            {universes.map((u) => (
              <button
                key={u.id}
                type="button"
                className={`chip ${universe === u.id ? 'active' : ''}`}
                onClick={() => setUniverse(universe === u.id ? null : u.id)}
              >
                {u.label} · {u.count}
              </button>
            ))}
          </div>
        </div>
        <div className="btn-row">
          <input
            className="ticker-input"
            placeholder="Add tickers: TSLA, PLTR, BTC-USD, EURUSD=X"
            value={tickers}
            onChange={(e) => setTickers(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && total > 0) scan();
            }}
          />
          <select className="history-select" aria-label="History" value={history} onChange={(e) => setHistory(e.target.value as HistoryRange)}>
            <option value="1y">1 year</option>
            <option value="5y">5 years</option>
            <option value="10y">10 years</option>
          </select>
          <button type="button" className="btn primary" onClick={scan} disabled={running || total < 1 || text.trim().length < 5}>
            {running ? `Scanning ${total}…` : `Scan ${total} ticker${total === 1 ? '' : 's'}`}
          </button>
        </div>
        <p className="hint">
          Daily bars from Yahoo Finance. Without a stop-loss each trade uses the full allocation, so returns compare
          directly with buy &amp; hold. Up to 40 tickers per scan.
        </p>
        {error ? <div className="banner warn">{error}</div> : null}
      </section>

      {result ? (
        <>
          <section className="kpi-grid" ref={resultsRef}>
            <KpiCard
              label={`${actionLabel('enter', side)} at next open`}
              value={String(result.counts.enter + result.counts.add)}
              tone="positive"
            />
            <KpiCard label={`${actionLabel('exit', side)} at next open`} value={String(result.counts.exit)} tone="negative" />
            <KpiCard label="In a position" value={String(result.counts.hold)} />
            <KpiCard label="Waiting" value={String(result.counts.wait)} hint={`${result.scanned} scanned`} />
          </section>

          <section className="panel table-wrap">
            <div className="screener-head">
              <h2>
                {rows.length} of {result.rows.length} tickers
              </h2>
              <label className="inline-check">
                <input type="checkbox" checked={actionableOnly} onChange={(e) => setActionableOnly(e.target.checked)} />
                Only tickers with an order for the next open
              </label>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Signal</th>
                  <th>Close</th>
                  <th>1 day</th>
                  <th>Position</th>
                  <th>Rules</th>
                  <th>Hold</th>
                  <th>Sharpe</th>
                  <th>Max DD</th>
                  <th>Trades</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ticker}>
                    <td className="mono">{r.ticker}</td>
                    <td>
                      <span className={`sig-badge ${actionTone(r.action)}`}>{actionLabel(r.action, side)}</span>
                    </td>
                    <td className="mono">{price(r.last_close)}</td>
                    <td className={(r.change_1d ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(r.change_1d)}</td>
                    <td className="mono">
                      {r.in_position ? (
                        <>
                          {price(r.entry_price)} <span className={r.unrealized_pct >= 0 ? 'pos' : 'neg'}>{pct(r.unrealized_pct, 1)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={(r.total_return ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(r.total_return, 1)}</td>
                    <td className="mono">{pct(r.buy_hold_return, 1)}</td>
                    <td className="mono">{r.sharpe_ratio == null ? '—' : r.sharpe_ratio.toFixed(2)}</td>
                    <td className="neg">{pct(r.max_drawdown, 1)}</td>
                    <td className="mono">{r.trades}</td>
                    <td className="row-actions">
                      <button type="button" className="btn ghost small" disabled={Boolean(busyRow)} onClick={() => backtest(r)}>
                        {busyRow === `bt-${r.ticker}` ? '…' : 'Backtest'}
                      </button>
                      <button type="button" className="btn ghost small" disabled={Boolean(busyRow)} onClick={() => track(r)}>
                        {busyRow === `fw-${r.ticker}` ? '…' : 'Track'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.failed.length ? (
              <p className="note">Skipped (no data): {result.failed.map((f) => f.ticker).join(', ')}</p>
            ) : null}
            <p className="note">
              Signal is what the rules say after the latest daily close; orders would fill at the next open. "Track" starts
              a forward test that scores the rules only on bars that arrive from today. Research output, not investment advice.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
