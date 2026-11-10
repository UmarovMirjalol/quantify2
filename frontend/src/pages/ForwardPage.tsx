import { useCallback, useEffect, useState } from 'react';
import { EquityChart } from '../components/Charts';
import { KpiCard } from '../components/KpiCard';
import { usePageMeta } from '../hooks/usePageMeta';
import {
  createForwardTest,
  deleteForwardTest,
  getForwardTest,
  listForwardTests,
  refreshForwardTest,
} from '../services/api';
import type { EquityPoint, ForwardDetail, ForwardSummary } from '../types';
import { actionLabel, actionTone, pct, price } from '../utils/signal';

function toPoints(rows: { date: string; equity: number }[]): EquityPoint[] {
  return rows.map((r) => ({ date: r.date, equity: r.equity, cash: r.equity, drawdown: null }));
}

function tone(v: number | null | undefined): 'positive' | 'negative' | 'neutral' {
  if (v == null || v === 0) return 'neutral';
  return v > 0 ? 'positive' : 'negative';
}

export function ForwardPage() {
  usePageMeta(
    'Forward tests — Quantify',
    'Track a trading strategy on live market data from the day you save it: the only test a backtest cannot overfit.',
  );
  const [items, setItems] = useState<ForwardSummary[]>([]);
  const [selected, setSelected] = useState<ForwardDetail | null>(null);
  const [text, setText] = useState('Buy when the 20-day SMA crosses above the 50-day SMA and sell when it crosses below.');
  const [ticker, setTicker] = useState('SPY');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await listForwardTests());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load forward tests.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function open(id: number) {
    setBusy(`open-${id}`);
    setError('');
    try {
      setSelected(await getForwardTest(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the forward test.');
    } finally {
      setBusy('');
    }
  }

  async function create() {
    setBusy('create');
    setError('');
    try {
      const made = await createForwardTest({ strategy_text: text, ticker: ticker.trim().toUpperCase() });
      setSelected(made);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the forward test.');
    } finally {
      setBusy('');
    }
  }

  async function refreshAll() {
    setBusy('all');
    setError('');
    const failed: string[] = [];
    for (const item of items) {
      try {
        const fresh = await refreshForwardTest(item.id);
        if (selected?.id === item.id) setSelected(fresh);
      } catch {
        failed.push(item.ticker);
      }
    }
    await load();
    if (failed.length) setError(`Could not refresh: ${failed.join(', ')}`);
    setBusy('');
  }

  async function remove(id: number) {
    setBusy(`del-${id}`);
    try {
      await deleteForwardTest(id);
      if (selected?.id === id) setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete.');
    } finally {
      setBusy('');
    }
  }

  const side = (selected?.strategy.side ?? 'long') as 'long' | 'short';

  return (
    <div className="results forward">
      <div className="page-header">
        <div>
          <p className="eyebrow">Out-of-sample, for real</p>
          <h1>Forward tests</h1>
          <p className="lede">
            A backtest can always be tuned to the past. A forward test cannot: the rules are frozen today and scored only on
            bars that arrive after you save them. Check back in a few weeks and compare live results with the backtest.
          </p>
        </div>
      </div>

      <section className="panel portfolio-form">
        <label className="field">
          <span>Strategy to freeze</span>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="btn-row">
          <input
            className="ticker-input"
            placeholder="Ticker: SPY, AAPL, BTC-USD"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
          />
          <button
            type="button"
            className="btn primary"
            onClick={create}
            disabled={Boolean(busy) || ticker.trim().length < 1 || text.trim().length < 5}
          >
            {busy === 'create' ? 'Starting…' : 'Start forward test'}
          </button>
          {items.length ? (
            <button type="button" className="btn secondary" onClick={refreshAll} disabled={Boolean(busy)}>
              {busy === 'all' ? 'Refreshing…' : 'Refresh all with latest bars'}
            </button>
          ) : null}
        </div>
        <p className="hint">
          You can also start one from any backtest on live market data, or from a screener row. If the rules are already in a
          position on the start day, the forward test buys at the next open, like a trader joining today. Up to 25 forward
          tests.
        </p>
        {error ? <div className="banner warn">{error}</div> : null}
      </section>

      {items.length ? (
        <section className="panel table-wrap">
          <h2>Tracking {items.length}</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Ticker</th>
                <th>Since</th>
                <th>Days</th>
                <th>Forward</th>
                <th>Hold</th>
                <th>Backtest CAGR</th>
                <th>Trades</th>
                <th>Signal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id} className={selected?.id === f.id ? 'row-active' : ''}>
                  <td className="forward-name" title={f.strategy_text}>
                    {f.name}
                  </td>
                  <td className="mono">{f.ticker}</td>
                  <td className="mono">{f.start_date}</td>
                  <td className="mono">{f.days_live}</td>
                  <td className={f.forward_return >= 0 ? 'pos' : 'neg'}>{pct(f.forward_return)}</td>
                  <td className="mono">{pct(f.hold_return)}</td>
                  <td className="mono">{pct(f.backtest_cagr, 1)}</td>
                  <td className="mono">{f.closed_trades}</td>
                  <td>
                    <span className={`sig-badge ${actionTone(f.action)}`}>{actionLabel(f.action)}</span>
                  </td>
                  <td className="row-actions">
                    <button type="button" className="btn ghost small" onClick={() => open(f.id)} disabled={Boolean(busy)}>
                      {busy === `open-${f.id}` ? '…' : 'Open'}
                    </button>
                    <button type="button" className="btn ghost small" onClick={() => remove(f.id)} disabled={Boolean(busy)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">Backtest CAGR is the yearly return the same rules made over the five years before tracking began.</p>
        </section>
      ) : (
        <section className="panel">
          <p className="note">No forward tests yet. Freeze a strategy above and it will be scored on every new daily bar.</p>
        </section>
      )}

      {selected ? (
        <>
          <section className="panel">
            <p className="eyebrow">
              {selected.ticker} · since {selected.start_date} · as of {selected.as_of ?? '—'}
            </p>
            <h2>{selected.name}</h2>
            <p className="note">
              Today: <span className={`sig-badge ${actionTone(selected.live_signal.action)}`}>{actionLabel(selected.live_signal.action, side)}</span>{' '}
              {selected.live_signal.in_position
                ? `in a position from ${price(selected.live_signal.entry_price)} (${pct(selected.live_signal.unrealized_pct)} open).`
                : 'flat.'}{' '}
              Last close {price(selected.live_signal.last_close)}.
            </p>
          </section>
          <section className="kpi-grid">
            <KpiCard label="Forward return" value={pct(selected.forward_return)} tone={tone(selected.forward_return)} />
            <KpiCard label="Buy & hold since start" value={pct(selected.hold_return)} tone={tone(selected.hold_return)} />
            <KpiCard
              label="vs hold"
              value={pct(selected.forward_return - selected.hold_return)}
              tone={tone(selected.forward_return - selected.hold_return)}
            />
            <KpiCard label="Max drawdown" value={pct(selected.max_drawdown)} tone={selected.max_drawdown < 0 ? 'negative' : undefined} />
            <KpiCard label="Days live" value={String(selected.days_live)} hint={`${selected.bars_live} new bars`} />
            <KpiCard label="Closed trades" value={String(selected.closed_trades)} hint={selected.win_rate == null ? undefined : `${pct(selected.win_rate, 0)} won`} />
            <KpiCard label="Backtest CAGR" value={pct(selected.backtest_cagr, 1)} hint="5 years before start" />
            <KpiCard label="Backtest Sharpe" value={selected.backtest_sharpe == null ? '—' : selected.backtest_sharpe.toFixed(2)} />
          </section>
          {selected.equity.length > 1 ? (
            <section className="panel">
              <h2>Live equity vs buy &amp; hold</h2>
              <EquityChart data={toPoints(selected.equity)} benchmark={toPoints(selected.hold)} name="Forward" benchmarkName="Buy & hold" />
            </section>
          ) : (
            <section className="panel">
              <p className="note">The curve appears once a new daily bar arrives after {selected.start_date}.</p>
            </section>
          )}
          {selected.trades.length ? (
            <section className="panel table-wrap">
              <h2>Live trades</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Entry price</th>
                    <th>Exit price</th>
                    <th>Return</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.trades.map((t, i) => (
                    <tr key={i}>
                      <td className="mono">{t.entry_date.slice(0, 10)}</td>
                      <td className="mono">{t.exit_date.slice(0, 10)}</td>
                      <td className="mono">{price(t.entry_price)}</td>
                      <td className="mono">{price(t.exit_price)}</td>
                      <td className={t.return_pct >= 0 ? 'pos' : 'neg'}>{pct(t.return_pct)}</td>
                      <td className="mono">{t.exit_reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
