import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { ActivityPulse } from '../components/ActivityPulse';
import { FarmScatter } from '../components/FarmScatter';
import { KpiCard } from '../components/KpiCard';
import {
  listScreenerUniverses,
  runPaperBridge,
  startFarmJob,
  getFarmJob,
  cancelFarmJob,
  runDataHealth,
  getBenchmarkSuite,
  type FarmResult,
  type FarmRow,
  type FarmJob,
  type PaperResult,
  type BenchmarkSuite,
  type DataHealthReport,
} from '../services/api';
import type { ScreenerUniverse } from '../types';
import { toast } from '../components/ToastHost';
import { WatchlistBar } from '../components/WatchlistBar';
import { FarmSweepLibrary } from '../components/FarmSweepLibrary';
import { logActivity } from '../utils/activityLog';
import { downloadText, toCsv } from '../utils/download';
import { saveFarmArchive } from '../utils/farmArchive';
import { pct } from '../utils/signal';
import { toggleWatch } from '../utils/watchlist';

const DEFAULT =
  'Buy when the 20-day SMA crosses above the 50-day SMA and sell when it crosses below.';

export function FarmPage() {
  usePageMeta(
    'Research farm — Quantify',
    'Run one strategy across dozens of markets, or the whole playbook across a universe. Paper signals and the published benchmark suite live here too.',
  );
  const [universes, setUniverses] = useState<ScreenerUniverse[]>([]);
  const [universe, setUniverse] = useState('etfs');
  const [mode, setMode] = useState<'strategy' | 'playbook'>('strategy');
  const [text, setText] = useState(DEFAULT);
  const [tickers, setTickers] = useState('');
  const [history, setHistory] = useState('5y');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [farm, setFarm] = useState<FarmResult | null>(null);
  const [job, setJob] = useState<FarmJob | null>(null);
  const [suite, setSuite] = useState<BenchmarkSuite | null>(null);
  const [paper, setPaper] = useState<PaperResult | null>(null);
  const [webhook, setWebhook] = useState('');
  const [paperTickers, setPaperTickers] = useState('SPY, QQQ, IWM, GLD, BTC-USD');
  const [pinned, setPinned] = useState<FarmRow | null>(null);
  const [health, setHealth] = useState<DataHealthReport | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    listScreenerUniverses().then(setUniverses).catch(() => setUniverses([]));
    getBenchmarkSuite()
      .then(setSuite)
      .catch(() => undefined);
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
  }, []);

  const custom = useMemo(
    () =>
      tickers
        .split(/[\s,;]+/)
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean),
    [tickers],
  );

  function stopPoll() {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function runFarm() {
    setRunning(true);
    setError('');
    setFarm(null);
    stopPoll();
    try {
      const started = await startFarmJob({
        mode,
        strategy_text: mode === 'strategy' ? text : undefined,
        universe,
        tickers: custom,
        history,
        max_rules: 15,
      });
      setJob(started);
      pollRef.current = window.setInterval(() => {
        void getFarmJob(started.id)
          .then((j) => {
            setJob(j);
            if (j.status === 'done' && j.result) {
              setFarm(j.result);
              setRunning(false);
              stopPoll();
              saveFarmArchive(j, j.result);
              toast('Farm finished', {
                tone: 'ok',
                body: `${j.result.ok ?? j.ok_count ?? 0} ok · ${j.result.scanned ?? j.done} scanned`,
              });
              logActivity(
                `Farm done · ${j.result.ok ?? j.ok_count ?? 0}/${j.result.scanned ?? j.done}`,
                '/farm',
              );
            } else if (j.status === 'cancelled' || j.status === 'error') {
              setError(j.error || (j.status === 'cancelled' ? 'Farm cancelled.' : 'Farm failed.'));
              setRunning(false);
              stopPoll();
              toast(j.status === 'cancelled' ? 'Farm cancelled' : 'Farm failed', {
                tone: j.status === 'cancelled' ? 'warn' : 'error',
              });
            }
          })
          .catch((err: Error) => {
            setError(err.message);
            setRunning(false);
            stopPoll();
          });
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Farm failed.');
      setRunning(false);
    }
  }

  async function cancelRunning() {
    if (!job?.id) return;
    try {
      const j = await cancelFarmJob(job.id);
      setJob(j);
      setError('Cancel requested…');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed.');
    }
  }

  async function checkHealth() {
    setHealthBusy(true);
    setError('');
    try {
      setHealth(await runDataHealth({ universe, tickers: custom, history: '1y' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed.');
    } finally {
      setHealthBusy(false);
    }
  }

  async function runPaper() {
    setError('');
    try {
      const list = paperTickers
        .split(/[\s,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      setPaper(
        await runPaperBridge({
          strategy_text: text,
          tickers: list,
          webhook_url: webhook.trim() || undefined,
          history: '1y',
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paper bridge failed.');
    }
  }

  const liveRows = job?.partial_rows?.length ? job.partial_rows : null;
  const rows = farm?.top ?? farm?.rows?.slice(0, 40) ?? liveRows?.slice(0, 40) ?? [];
  const scatterRows = farm?.rows?.length ? farm.rows : liveRows ?? [];

  return (
    <div className="results">
      <div className="page-header">
        <div>
          <p className="eyebrow">Research farm</p>
          <h1>Mass tests. Not one lucky SPY chart.</h1>
          <p className="lede">
            Sweep a strategy across a universe, or grid the playbook × markets. Then push next-open paper signals to a
            webhook.
          </p>
        </div>
      </div>

      <ActivityPulse />
      <WatchlistBar
        onApply={(list) => {
          setTickers(list.join(', '));
          setPaperTickers(list.join(', '));
          toast('Watchlist applied', { tone: 'ok', body: `${list.length} tickers` });
        }}
      />

      <FarmSweepLibrary
        activeJobId={job?.id}
        onOpenResult={(result) => {
          setFarm(result);
          setError('');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onResumeJob={(j) => {
          setJob(j);
          setRunning(j.status === 'running' || j.status === 'queued');
          stopPoll();
          if (j.status === 'running' || j.status === 'queued') {
            pollRef.current = window.setInterval(() => {
              void getFarmJob(j.id)
                .then((next) => {
                  setJob(next);
                  if (next.status === 'done' && next.result) {
                    setFarm(next.result);
                    setRunning(false);
                    stopPoll();
                    saveFarmArchive(next, next.result);
                    toast('Farm finished', { tone: 'ok' });
                  } else if (next.status === 'cancelled' || next.status === 'error') {
                    setError(next.error || next.status);
                    setRunning(false);
                    stopPoll();
                  }
                })
                .catch((err: Error) => {
                  setError(err.message);
                  setRunning(false);
                  stopPoll();
                });
            }, 700);
          } else if (j.result) {
            setFarm(j.result);
            setRunning(false);
          }
          toast('Attached to job', { tone: 'info', body: j.id.slice(0, 8) });
        }}
      />

      {!farm && !running ? (
        <section className="farm-empty">
          <h2>Sweep first. Trust later.</h2>
          <p>
            One lucky SPY chart is not evidence. Run a strategy across a universe — the scatter fills live as jobs finish.
            Press <kbd className="cmdk__kbd">Ctrl</kbd>+<kbd className="cmdk__kbd">K</kbd> anytime to jump here again.
          </p>
        </section>
      ) : null}

      <section className="panel">
        <div className="btn-row" style={{ marginBottom: '0.8rem' }}>
          <button type="button" className={`chip${mode === 'strategy' ? ' active' : ''}`} onClick={() => setMode('strategy')}>
            Strategy × tickers
          </button>
          <button type="button" className={`chip${mode === 'playbook' ? ' active' : ''}`} onClick={() => setMode('playbook')}>
            Playbook × universe
          </button>
        </div>
        {mode === 'strategy' ? (
          <label className="field">
            <span>Strategy</span>
            <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        ) : null}
        <div className="param-grid">
          <label className="field">
            <span>Universe</span>
            <select value={universe} onChange={(e) => setUniverse(e.target.value)}>
              {universes.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label} ({u.count})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Extra tickers</span>
            <input value={tickers} onChange={(e) => setTickers(e.target.value)} placeholder="NVDA, TSM, EURUSD=X" />
          </label>
          <label className="field">
            <span>History</span>
            <select value={history} onChange={(e) => setHistory(e.target.value)}>
              <option value="1y">1y</option>
              <option value="5y">5y</option>
              <option value="10y">10y</option>
            </select>
          </label>
        </div>
        <div className="btn-row">
          <button type="button" className="btn primary" disabled={running} onClick={() => void runFarm()}>
            {running ? 'Running farm…' : 'Run farm'}
          </button>
          <button type="button" className="btn secondary" disabled={healthBusy} onClick={() => void checkHealth()}>
            {healthBusy ? 'Probing…' : 'Data health'}
          </button>
          {running ? (
            <button type="button" className="btn ghost" onClick={() => void cancelRunning()}>
              Cancel
            </button>
          ) : null}
        </div>
        {error ? <div className="banner error">{error}</div> : null}
      </section>

      {running || (job && job.status !== 'done') ? (
        <div className="farm-progress farm-progress--meter" role="status">
          <div className="farm-progress__track">
            <div className="farm-progress__fill" style={{ width: `${Math.round((job?.progress ?? 0) * 100)}%` }} />
          </div>
          <p className="hint">
            {job
              ? `${job.done}/${job.total} · ok ${job.ok_count ?? 0} · fail ${job.fail_count ?? 0} · ${job.status}`
              : 'Starting farm job…'}
          </p>
        </div>
      ) : null}

      {health ? (
        <section className="panel">
          <h2>Universe health</h2>
          <section className="kpi-grid">
            <KpiCard label="OK" value={String(health.ok)} />
            <KpiCard label="Warn" value={String(health.warn)} />
            <KpiCard label="Thin" value={String(health.thin)} />
            <KpiCard label="Fail" value={String(health.fail)} />
          </section>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Grade</th>
                  <th>Bars</th>
                  <th>Gaps</th>
                  <th>Max gap</th>
                  <th>Adj</th>
                  <th>Range</th>
                </tr>
              </thead>
              <tbody>
                {health.rows.slice(0, 40).map((r) => (
                  <tr key={r.ticker}>
                    <td className="mono">{r.ticker}</td>
                    <td className={`mono health-${r.grade}`}>{r.grade}</td>
                    <td className="mono">{r.bars}</td>
                    <td className="mono">{r.gaps ?? '—'}</td>
                    <td className="mono">{r.max_gap_days ?? '—'}</td>
                    <td className="mono">{r.has_adj_close ? 'yes' : 'no'}</td>
                    <td className="mono">
                      {r.date_start && r.date_end ? `${r.date_start} → ${r.date_end}` : r.error ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {farm ? (
        <>
          <section className="kpi-grid">
            <KpiCard label="Scanned" value={String(farm.scanned)} />
            <KpiCard label="OK" value={String(farm.ok)} />
            <KpiCard
              label="Beat buy & hold"
              value={farm.beat_hold_share == null ? '—' : pct(farm.beat_hold_share)}
              hint={farm.beat_hold != null ? `${farm.beat_hold} names` : undefined}
            />
            <KpiCard label="Mode" value={farm.mode} />
          </section>
          <section className="farm-next panel">
            <h2>What next</h2>
            <div className="btn-row">
              <Link className="btn primary" to="/paper">
                Paper the top names
              </Link>
              <Link className="btn secondary" to="/portfolio">
                Build a portfolio sleeve
              </Link>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  const top = (farm.top ?? farm.rows ?? []).slice(0, 8).map((r) => r.ticker);
                  if (top.length) {
                    setPaperTickers(top.join(', '));
                    toast('Loaded top tickers into paper bridge', { tone: 'ok' });
                  }
                }}
              >
                Load top into paper
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  const list = farm.rows ?? farm.top ?? [];
                  if (!list.length) return;
                  const csv = toCsv([
                    ['ticker', 'title', 'sharpe', 'return', 'alpha_vs_hold', 'max_dd', 'trades', 'action'],
                    ...list.map((r) => [
                      r.ticker,
                      r.title ?? '',
                      r.sharpe_ratio,
                      r.total_return,
                      r.alpha_vs_hold,
                      r.max_drawdown,
                      r.trades,
                      r.action ?? '',
                    ]),
                  ]);
                  downloadText(`quantify-farm-${Date.now()}.csv`, csv, 'text/csv;charset=utf-8');
                  toast('Farm CSV downloaded', { tone: 'ok', body: `${list.length} rows` });
                }}
              >
                Export CSV
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  const list = (farm.top ?? farm.rows ?? []).slice(0, 25);
                  if (!list.length) return;
                  const lines = [
                    `# Quantify farm summary`,
                    ``,
                    `Mode: ${farm.mode} · scanned ${farm.scanned} · ok ${farm.ok}`,
                    `Beat hold: ${farm.beat_hold_share == null ? '—' : pct(farm.beat_hold_share)}`,
                    ``,
                    `| Ticker | Sharpe | Return | vs hold |`,
                    `| --- | --- | --- | --- |`,
                    ...list.map(
                      (r) =>
                        `| ${r.ticker} | ${r.sharpe_ratio?.toFixed(2) ?? '—'} | ${
                          r.total_return == null ? '—' : pct(r.total_return)
                        } | ${r.alpha_vs_hold == null ? '—' : pct(r.alpha_vs_hold)} |`,
                    ),
                    ``,
                  ];
                  downloadText(`quantify-farm-${Date.now()}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
                  toast('Farm markdown ready', { tone: 'ok' });
                }}
              >
                Export MD
              </button>
            </div>
          </section>
        </>
      ) : null}

      {scatterRows.length >= 2 ? (
        <section className="panel farm-scatter-panel">
          <h2>
            Sharpe vs return
            {running && liveRows ? <span className="farm-live-badge">live</span> : null}
          </h2>
          <FarmScatter
            rows={scatterRows}
            onPick={(row) => {
              setPinned(row);
              setTickers((t) => (t.includes(row.ticker) ? t : `${t}${t.trim() ? ', ' : ''}${row.ticker}`));
              toggleWatch(row.ticker);
              toast(`Watching ${row.ticker}`, { tone: 'ok', body: row.title });
            }}
          />
          {pinned ? (
            <p className="hint">
              Pinned <span className="mono">{pinned.ticker}</span>
              {pinned.title ? ` · ${pinned.title}` : ''} — added to watchlist ·{' '}
              <Link to="/app">open workspace →</Link>
            </p>
          ) : null}
        </section>
      ) : null}

      {rows.length ? (
        <section className="panel">
          <h2>Top results</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Ticker</th>
                  <th>Sharpe</th>
                  <th>Return</th>
                  <th>vs hold</th>
                  <th>DD</th>
                  <th>Trades</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.ticker}-${r.id ?? i}`}>
                    <td>{r.title ?? '—'}</td>
                    <td className="mono">{r.ticker}</td>
                    <td className="mono">{r.sharpe_ratio == null ? '—' : r.sharpe_ratio.toFixed(2)}</td>
                    <td className="mono">{r.total_return == null ? '—' : pct(r.total_return)}</td>
                    <td className="mono">{r.alpha_vs_hold == null ? '—' : pct(r.alpha_vs_hold)}</td>
                    <td className="mono">{r.max_drawdown == null ? '—' : pct(r.max_drawdown)}</td>
                    <td className="mono">{r.trades ?? '—'}</td>
                    <td>{r.action ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h2>Paper bridge</h2>
        <p className="hint">
          Fresh live_signal for the next open. Optional webhook gets only actionable enter/exit/add.{' '}
          <Link to="/paper">Open paper desk →</Link>
        </p>
        <label className="field">
          <span>Tickers</span>
          <input value={paperTickers} onChange={(e) => setPaperTickers(e.target.value)} />
        </label>
        <label className="field">
          <span>Webhook URL (optional)</span>
          <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://…" />
        </label>
        <button type="button" className="btn secondary" onClick={() => void runPaper()}>
          Pull paper signals
        </button>
        {paper ? (
          <div className="table-wrap" style={{ marginTop: '0.8rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Action</th>
                  <th>In pos</th>
                  <th>Close</th>
                  <th>As of</th>
                </tr>
              </thead>
              <tbody>
                {paper.signals.map((s) => (
                  <tr key={s.ticker}>
                    <td className="mono">{s.ticker}</td>
                    <td>{s.action}</td>
                    <td>{s.in_position ? 'yes' : 'no'}</td>
                    <td className="mono">{s.last_close}</td>
                    <td className="mono">{String(s.as_of).slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {paper.webhook ? (
              <p className="hint">Webhook: {paper.webhook.ok ? `ok ${paper.webhook.status}` : paper.webhook.error}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>Published benchmark suite</h2>
        {!suite || suite.status === 'building' ? (
          <p className="hint">Building in the background — refresh in a minute.</p>
        ) : (
          <>
            <p className="hint">
              {suite.count} runs · beat hold {suite.beat_hold_share == null ? '—' : pct(suite.beat_hold_share)} · as of{' '}
              {suite.as_of?.slice(0, 16) ?? '—'}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>Ticker</th>
                    <th>Sharpe</th>
                    <th>Return</th>
                    <th>Hold</th>
                    <th>VaR 95%</th>
                  </tr>
                </thead>
                <tbody>
                  {(suite.rows ?? []).slice(0, 30).map((r) => (
                    <tr key={`${r.id}-${r.ticker}`}>
                      <td>{r.title}</td>
                      <td className="mono">{r.ticker}</td>
                      <td className="mono">{r.sharpe == null ? '—' : r.sharpe.toFixed(2)}</td>
                      <td className="mono">{r.total_return == null ? '—' : pct(r.total_return)}</td>
                      <td className="mono">{r.buy_hold == null ? '—' : pct(r.buy_hold)}</td>
                      <td className="mono">{r.var_95 == null ? '—' : `${r.var_95}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
