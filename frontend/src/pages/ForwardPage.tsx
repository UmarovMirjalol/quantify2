import { useCallback, useEffect, useMemo, useState } from 'react';
import { EquityChart } from '../components/Charts';
import { KpiCard } from '../components/KpiCard';
import { toast } from '../components/ToastHost';
import { WatchlistBar } from '../components/WatchlistBar';
import { usePageMeta } from '../hooks/usePageMeta';
import {
  createForwardTest,
  deleteForwardTest,
  getForwardTest,
  listForwardTests,
  refreshForwardTest,
} from '../services/api';
import type { EquityPoint, ForwardDetail, ForwardSummary } from '../types';
import { downloadText, toCsv } from '../utils/download';
import { strategyFingerprint } from '../utils/strategyFingerprint';
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
  const [text, setText] = useState(
    'Buy when the 20-day SMA crosses above the 50-day SMA and sell when it crosses below.',
  );
  const [ticker, setTicker] = useState('SPY');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [onlyActionable, setOnlyActionable] = useState(false);
  const [onlyBeating, setOnlyBeating] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await listForwardTests());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load forward tests.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((f) => {
      if (onlyActionable && !(f.action === 'enter' || f.action === 'exit' || f.action === 'add')) {
        return false;
      }
      if (onlyBeating && !(f.forward_return > f.hold_return)) return false;
      if (!needle) return true;
      return (
        f.name.toLowerCase().includes(needle) ||
        f.ticker.toLowerCase().includes(needle) ||
        f.strategy_text.toLowerCase().includes(needle) ||
        String(f.id).includes(needle)
      );
    });
  }, [items, q, onlyActionable, onlyBeating]);

  const inbox = useMemo(
    () => items.filter((f) => f.action === 'enter' || f.action === 'exit' || f.action === 'add'),
    [items],
  );

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

  async function refreshOne(id: number) {
    setBusy(`ref-${id}`);
    setError('');
    try {
      const fresh = await refreshForwardTest(id);
      if (selected?.id === id) setSelected(fresh);
      await load();
      toast('Forward refreshed', { tone: 'ok', body: fresh.ticker });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed.');
      toast('Refresh failed', { tone: 'error' });
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
      toast('Forward test started', { tone: 'ok', body: made.ticker });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the forward test.');
      toast('Start failed', { tone: 'error' });
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
    if (failed.length) {
      setError(`Could not refresh: ${failed.join(', ')}`);
      toast('Some refreshes failed', { tone: 'warn' });
    } else {
      toast('All forward tests refreshed', { tone: 'ok' });
    }
    setBusy('');
  }

  async function remove(id: number) {
    setBusy(`del-${id}`);
    try {
      await deleteForwardTest(id);
      if (selected?.id === id) setSelected(null);
      await load();
      toast('Forward test deleted', { tone: 'info' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete.');
    } finally {
      setBusy('');
    }
  }

  function exportCsv() {
    const csv = toCsv([
      [
        'id',
        'ticker',
        'name',
        'start',
        'days',
        'forward',
        'hold',
        'vs_hold',
        'max_dd',
        'trades',
        'action',
        'in_position',
      ],
      ...filtered.map((f) => [
        f.id,
        f.ticker,
        f.name,
        f.start_date,
        f.days_live,
        f.forward_return,
        f.hold_return,
        f.forward_return - f.hold_return,
        f.max_drawdown,
        f.closed_trades,
        f.action ?? '',
        f.in_position ? 1 : 0,
      ]),
    ]);
    downloadText(`quantify-forward-${Date.now()}.csv`, csv, 'text/csv;charset=utf-8');
    toast('Forward CSV ready', { tone: 'ok', body: `${filtered.length} rows` });
  }

  const side = (selected?.strategy.side ?? 'long') as 'long' | 'short';
  const beating = items.filter((f) => f.forward_return > f.hold_return).length;

  return (
    <div className="results forward">
      <div className="page-header">
        <div>
          <p className="eyebrow">Out-of-sample, for real</p>
          <h1>Forward desk</h1>
          <p className="lede">
            Freeze rules today. Score only bars that arrive after. Inbox, filters, per-row refresh, CSV — same desk
            energy as paper.
          </p>
        </div>
      </div>

      <section className="kpi-grid">
        <KpiCard label="Tracking" value={String(items.length)} />
        <KpiCard label="Actionable now" value={String(inbox.length)} hint="enter / exit / add" />
        <KpiCard label="Beating hold" value={`${beating}/${items.length || 0}`} />
        <KpiCard
          label="Avg days live"
          value={
            items.length
              ? String(Math.round(items.reduce((s, f) => s + f.days_live, 0) / items.length))
              : '—'
          }
        />
      </section>

      <WatchlistBar
        onApply={(list) => {
          if (list[0]) setTicker(list[0]);
          toast('Watchlist ticker set', { tone: 'ok', body: list[0] || '—' });
        }}
      />

      <div className="forward-desk__layout">
        <section className="panel portfolio-form">
          <h2>Freeze</h2>
          <label className="field">
            <span>Strategy to freeze</span>
            <textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  (e.metaKey || e.ctrlKey) &&
                  e.key === 'Enter' &&
                  !busy &&
                  ticker.trim().length >= 1 &&
                  text.trim().length >= 5
                ) {
                  e.preventDefault();
                  void create();
                }
              }}
            />
          </label>
          <div className="btn-row">
            <input
              className="ticker-input"
              placeholder="Ticker: SPY, AAPL, BTC-USD"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              onKeyDown={(e) => {
                if (
                  (e.metaKey || e.ctrlKey) &&
                  e.key === 'Enter' &&
                  !busy &&
                  ticker.trim().length >= 1 &&
                  text.trim().length >= 5
                ) {
                  e.preventDefault();
                  void create();
                }
              }}
            />
            <button
              type="button"
              className="btn primary"
              onClick={() => void create()}
              disabled={Boolean(busy) || ticker.trim().length < 1 || text.trim().length < 5}
            >
              {busy === 'create' ? 'Starting…' : 'Start forward test'}
            </button>
            {items.length ? (
              <button
                type="button"
                className="btn secondary"
                onClick={() => void refreshAll()}
                disabled={Boolean(busy)}
              >
                {busy === 'all' ? 'Refreshing…' : 'Refresh all'}
              </button>
            ) : null}
          </div>
          <p className="hint">Ctrl/⌘+Enter starts a forward test.</p>
          <p className="hint">
            Or start from any live-market backtest on Results. Up to 25 forward tests. If already in a position on the
            start day, the book joins at the next open.
          </p>
          {error ? <div className="banner warn">{error}</div> : null}
        </section>

        <section className="panel forward-inbox">
          <h2>Actionable inbox</h2>
          {!inbox.length ? (
            <p className="hint">No enter/exit/add signals across tracked books.</p>
          ) : (
            <ul className="paper-inbox__list">
              {inbox.map((f) => (
                <li key={f.id}>
                  <div>
                    <strong className="mono">{f.ticker}</strong>
                    <span className={`sig-badge ${actionTone(f.action)}`}>{actionLabel(f.action)}</span>
                  </div>
                  <div className="btn-row">
                    <span className={`mono ${f.forward_return >= 0 ? 'pos' : 'neg'}`}>
                      {pct(f.forward_return)}
                    </span>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => void open(f.id)}
                      disabled={Boolean(busy)}
                    >
                      Open
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {items.length ? (
        <section className="panel table-wrap">
          <div className="page-header" style={{ marginBottom: '0.65rem' }}>
            <div>
              <h2 style={{ margin: 0 }}>
                Tracking {filtered.length}
                {filtered.length !== items.length ? ` / ${items.length}` : ''}
              </h2>
            </div>
            <div className="btn-row">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter ticker / name…"
                aria-label="Filter forward tests"
              />
              <button
                type="button"
                className={`chip${onlyActionable ? ' active' : ''}`}
                onClick={() => setOnlyActionable((v) => !v)}
              >
                Actionable
              </button>
              <button
                type="button"
                className={`chip${onlyBeating ? ' active' : ''}`}
                onClick={() => setOnlyBeating((v) => !v)}
              >
                Beat hold
              </button>
              <button type="button" className="btn ghost small" onClick={exportCsv}>
                Export CSV
              </button>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Ticker</th>
                <th>Since</th>
                <th>Days</th>
                <th>Forward</th>
                <th>Hold</th>
                <th>vs hold</th>
                <th>Trades</th>
                <th>Signal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} className={selected?.id === f.id ? 'row-active' : ''}>
                  <td className="forward-name" title={f.strategy_text}>
                    {f.name}
                  </td>
                  <td className="mono">{f.ticker}</td>
                  <td className="mono">{f.start_date}</td>
                  <td className="mono">{f.days_live}</td>
                  <td className={f.forward_return >= 0 ? 'pos' : 'neg'}>{pct(f.forward_return)}</td>
                  <td className="mono">{pct(f.hold_return)}</td>
                  <td className={f.forward_return - f.hold_return >= 0 ? 'pos' : 'neg'}>
                    {pct(f.forward_return - f.hold_return)}
                  </td>
                  <td className="mono">{f.closed_trades}</td>
                  <td>
                    <span className={`sig-badge ${actionTone(f.action)}`}>{actionLabel(f.action)}</span>
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => void open(f.id)}
                      disabled={Boolean(busy)}
                    >
                      {busy === `open-${f.id}` ? '…' : 'Open'}
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => void refreshOne(f.id)}
                      disabled={Boolean(busy)}
                    >
                      {busy === `ref-${f.id}` ? '…' : '↻'}
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => void remove(f.id)}
                      disabled={Boolean(busy)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="panel">
          <p className="note">No forward tests yet. Freeze a strategy above.</p>
        </section>
      )}

      {selected ? (
        <>
          <section className="panel">
            <div className="page-header">
              <div>
                <p className="eyebrow">
                  {selected.ticker} · since {selected.start_date} · as of {selected.as_of ?? '—'}
                </p>
                <h2>{selected.name}</h2>
                <p className="note">
                  Today:{' '}
                  <span className={`sig-badge ${actionTone(selected.live_signal.action)}`}>
                    {actionLabel(selected.live_signal.action, side)}
                  </span>{' '}
                  {selected.live_signal.in_position
                    ? `in a position from ${price(selected.live_signal.entry_price)} (${pct(selected.live_signal.unrealized_pct)} open).`
                    : 'flat.'}{' '}
                  Last close {price(selected.live_signal.last_close)}.
                </p>
                <p className="mono hint">DNA {strategyFingerprint(selected.strategy)}</p>
              </div>
              <button
                type="button"
                className="btn secondary small"
                disabled={Boolean(busy)}
                onClick={() => void refreshOne(selected.id)}
              >
                Refresh bars
              </button>
            </div>
          </section>
          <section className="kpi-grid">
            <KpiCard
              label="Forward return"
              value={pct(selected.forward_return)}
              tone={tone(selected.forward_return)}
            />
            <KpiCard
              label="Buy & hold since start"
              value={pct(selected.hold_return)}
              tone={tone(selected.hold_return)}
            />
            <KpiCard
              label="vs hold"
              value={pct(selected.forward_return - selected.hold_return)}
              tone={tone(selected.forward_return - selected.hold_return)}
            />
            <KpiCard
              label="Max drawdown"
              value={pct(selected.max_drawdown)}
              tone={selected.max_drawdown < 0 ? 'negative' : undefined}
            />
            <KpiCard label="Days live" value={String(selected.days_live)} hint={`${selected.bars_live} new bars`} />
            <KpiCard
              label="Closed trades"
              value={String(selected.closed_trades)}
              hint={selected.win_rate == null ? undefined : `${pct(selected.win_rate, 0)} won`}
            />
            <KpiCard label="Backtest CAGR" value={pct(selected.backtest_cagr, 1)} hint="5 years before start" />
            <KpiCard
              label="Backtest Sharpe"
              value={selected.backtest_sharpe == null ? '—' : selected.backtest_sharpe.toFixed(2)}
            />
          </section>
          {selected.equity.length > 1 ? (
            <section className="panel">
              <h2>Live equity vs buy &amp; hold</h2>
              <EquityChart
                data={toPoints(selected.equity)}
                benchmark={toPoints(selected.hold)}
                name="Forward"
                benchmarkName="Buy & hold"
              />
            </section>
          ) : (
            <section className="panel">
              <p className="note">The curve appears once a new daily bar arrives after {selected.start_date}.</p>
            </section>
          )}
          <section className="panel">
            <h2>Frozen rules</h2>
            <p className="hint">{selected.strategy_text}</p>
            <dl className="kv">
              <div>
                <dt>Asset</dt>
                <dd>{selected.strategy.asset}</dd>
              </div>
              <div>
                <dt>Side</dt>
                <dd>{selected.strategy.side ?? 'long'}</dd>
              </div>
              <div>
                <dt>Stop</dt>
                <dd>{selected.strategy.stop_loss == null ? '—' : pct(selected.strategy.stop_loss)}</dd>
              </div>
              <div>
                <dt>Take profit</dt>
                <dd>{selected.strategy.take_profit == null ? '—' : pct(selected.strategy.take_profit)}</dd>
              </div>
            </dl>
          </section>
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
