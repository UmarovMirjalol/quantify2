import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KpiCard } from '../components/KpiCard';
import { usePageMeta } from '../hooks/usePageMeta';
import { getLeaderboard, type Leaderboard, type LeaderboardRow } from '../services/api';
import { signedPct } from '../utils/shareCard';
import { quickRun } from '../utils/quickRun';

type SortKey = 'year' | 'week' | '10y' | 'dd' | 'edge';
type BeatFilter = 'all' | 'beat' | 'lose';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'year', label: 'Last 12 months' },
  { id: 'week', label: 'This week' },
  { id: '10y', label: '10 years' },
  { id: 'dd', label: 'Smallest DD' },
  { id: 'edge', label: 'Edge vs hold' },
];

const NAMES: Record<string, string> = {
  SPY: 'S&P 500',
  QQQ: 'Nasdaq 100',
  IWM: 'Russell 2000',
  EEM: 'Emerging mkts',
  GLD: 'Gold',
  TLT: 'Long Treasuries',
  XLE: 'Energy',
  NVDA: 'Nvidia',
  'BTC-USD': 'Bitcoin',
  'ETH-USD': 'Ethereum',
};

const pick = (r: LeaderboardRow, k: SortKey): number | null => {
  if (k === 'year') return r.return_year;
  if (k === 'week') return r.return_week;
  if (k === '10y') return r.return_10y;
  if (k === 'dd') return r.max_drawdown_10y == null ? null : -Math.abs(r.max_drawdown_10y);
  if (k === 'edge') {
    if (r.return_10y == null) return null;
    return r.return_10y - r.hold_10y;
  }
  return null;
};

function Pct({ value, hold }: { value: number | null; hold?: number }) {
  if (value == null) return <span className="hint">—</span>;
  if (hold == null) return <span className="mono hold-cell">{signedPct(value)}</span>;
  const won = value >= hold;
  return (
    <span className={`mono lb-pct ${won ? 'pos' : 'neg'}`}>
      {signedPct(value)}
      <span className="lb-mark" aria-label={won ? 'beat holding' : 'lost to holding'}>
        {won ? '▲' : '▼'}
      </span>
    </span>
  );
}

function edge10y(r: LeaderboardRow): number | null {
  if (r.return_10y == null) return null;
  return r.return_10y - r.hold_10y;
}

export function LeaderboardPage() {
  usePageMeta(
    'Strategy leaderboard — Quantify',
    'Famous trading strategies tested on real prices every day: which ones beat simply buying and holding this year, this week and over 10 years.',
  );
  const navigate = useNavigate();
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticker, setTicker] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('year');
  const [beat, setBeat] = useState<BeatFilter>('all');
  const [tag, setTag] = useState<string>('all');
  const [selected, setSelected] = useState<LeaderboardRow | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const load = async () => {
      try {
        const b = await getLeaderboard();
        if (!alive) return;
        setBoard(b);
        if (b.status === 'building') timer = window.setTimeout(load, 4000);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Could not load the leaderboard.');
      }
    };
    void load();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  const ready = board?.status === 'ready' ? board : null;

  const tags = useMemo(() => {
    if (!ready) return [] as string[];
    return [...new Set(ready.rows.map((r) => r.tag).filter(Boolean))].sort();
  }, [ready]);

  const rows = useMemo(() => {
    if (!ready) return [];
    let list = ready.rows.filter((r) => ticker === 'all' || r.ticker === ticker);
    if (tag !== 'all') list = list.filter((r) => r.tag === tag);
    if (beat === 'beat') list = list.filter((r) => (r.return_10y ?? -1e9) > r.hold_10y);
    if (beat === 'lose') list = list.filter((r) => (r.return_10y ?? 1e9) <= r.hold_10y);
    const asc = sort === 'dd';
    return [...list].sort((a, b) => {
      const av = pick(a, sort) ?? (asc ? 1e9 : -1e9);
      const bv = pick(b, sort) ?? (asc ? 1e9 : -1e9);
      return asc ? av - bv : bv - av;
    });
  }, [ready, ticker, sort, beat, tag]);

  async function test(r: LeaderboardRow) {
    const key = `${r.id}-${r.ticker}`;
    setRunning(key);
    setError(null);
    try {
      const id = await quickRun(r.text, r.ticker, () => undefined);
      navigate(`/results/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run the backtest.');
      setRunning(null);
    }
  }

  const best = rows.slice(0, 3);
  const worst = rows.slice(-3).reverse();
  const beatYear = rows.filter((r) => (r.return_year ?? -1e9) > r.hold_year).length;
  const beatShown = rows.filter((r) => (r.return_10y ?? -1e9) > r.hold_10y).length;
  const avgEdge = (() => {
    const edges = rows.map(edge10y).filter((v): v is number => v != null);
    if (!edges.length) return null;
    return edges.reduce((s, v) => s + v, 0) / edges.length;
  })();
  const medianDd = useMemo(() => {
    const vals = rows.map((r) => r.max_drawdown_10y).filter((v): v is number => v != null).sort((a, b) => a - b);
    if (!vals.length) return null;
    return vals[Math.floor(vals.length / 2)];
  }, [rows]);

  return (
    <div className="results leaderboard">
      <div className="page-header">
        <div>
          <p className="eyebrow">Leaderboard</p>
          <h1>Which famous strategies actually work?</h1>
          <p className="lede">
            Every strategy from the playbook, tested on real prices of the S&amp;P 500, Nasdaq, Nvidia and Bitcoin,
            and compared with simply buying and holding. Filter by edge, drawdown and style.
          </p>
        </div>
      </div>

      {error ? <div className="banner error">{error}</div> : null}

      {!board || board.status === 'building' ? (
        <div className="panel leaderboard-loading">
          <p>Testing every strategy on fresh prices. This takes about 20 seconds the first time…</p>
        </div>
      ) : null}

      {ready ? (
        <>
          <section className={`hold-verdict ${ready.beat_hold_10y * 2 < ready.rows.length ? 'lost' : 'won'}`}>
            <p>
              Over 10 years, <strong>{ready.beat_hold_10y}</strong> of <strong>{ready.rows.length}</strong> strategy
              runs ended with more money than simply buying and holding.
            </p>
            <p className="hold-verdict-line">
              {ready.beat_hold_10y === 0
                ? 'Holding won every single time.'
                : ready.beat_hold_10y * 2 < ready.rows.length
                  ? 'Most of them lost to holding.'
                  : 'Most of them beat holding.'}
            </p>
            <p className="hint">
              In the last 12 months {beatYear} of {rows.length} shown beat holding. Data as of{' '}
              {new Date(ready.as_of).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.
            </p>
          </section>

          <section className="kpi-grid">
            <KpiCard label="Shown" value={String(rows.length)} hint={`${beatShown} beat hold (10y)`} />
            <KpiCard
              label="Beat hold (10y)"
              value={`${ready.beat_hold_10y}/${ready.rows.length}`}
              tone={ready.beat_hold_10y * 2 >= ready.rows.length ? 'positive' : 'negative'}
            />
            <KpiCard
              label="Avg 10y edge"
              value={avgEdge == null || Number.isNaN(avgEdge) ? '—' : signedPct(avgEdge)}
              tone={avgEdge == null || avgEdge < 0 ? 'negative' : 'positive'}
            />
            <KpiCard
              label="Median 10y DD"
              value={medianDd == null ? '—' : signedPct(medianDd)}
              tone="negative"
            />
          </section>

          <div className="leaderboard-controls">
            <div className="whatif-picks" role="group" aria-label="Market">
              {['all', ...ready.tickers].map((t) => (
                <button key={t} type="button" className={`chip${ticker === t ? ' active' : ''}`} onClick={() => setTicker(t)}>
                  {t === 'all' ? 'All markets' : NAMES[t] ?? t}
                </button>
              ))}
            </div>
            <div className="whatif-picks" role="group" aria-label="Period">
              {SORTS.map((s) => (
                <button key={s.id} type="button" className={`chip${sort === s.id ? ' active' : ''}`} onClick={() => setSort(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="whatif-picks" role="group" aria-label="Edge filter">
              {(
                [
                  ['all', 'All results'],
                  ['beat', 'Beat hold (10y)'],
                  ['lose', 'Lost to hold'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" className={`chip${beat === id ? ' active' : ''}`} onClick={() => setBeat(id)}>
                  {label}
                </button>
              ))}
            </div>
            {tags.length ? (
              <div className="whatif-picks" role="group" aria-label="Style">
                <button type="button" className={`chip${tag === 'all' ? ' active' : ''}`} onClick={() => setTag('all')}>
                  All styles
                </button>
                {tags.map((t) => (
                  <button key={t} type="button" className={`chip${tag === t ? ' active' : ''}`} onClick={() => setTag(t)}>
                    {t}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="leaderboard-podium">
            <div className="panel">
              <h2>Best</h2>
              <ol>
                {best.map((r) => (
                  <li key={`b-${r.id}-${r.ticker}`}>
                    <button type="button" className="lb-podium-btn" onClick={() => setSelected(r)}>
                      {r.title} <small className="hint">on {NAMES[r.ticker] ?? r.ticker}</small>
                    </button>
                    <Pct value={pick(r, sort === 'dd' || sort === 'edge' ? '10y' : sort)} />
                  </li>
                ))}
              </ol>
            </div>
            <div className="panel">
              <h2>Worst</h2>
              <ol>
                {worst.map((r) => (
                  <li key={`w-${r.id}-${r.ticker}`}>
                    <button type="button" className="lb-podium-btn" onClick={() => setSelected(r)}>
                      {r.title} <small className="hint">on {NAMES[r.ticker] ?? r.ticker}</small>
                    </button>
                    <Pct value={pick(r, sort === 'dd' || sort === 'edge' ? '10y' : sort)} />
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="leaderboard-layout">
            <div className="panel table-wrap">
              <table className="data-table leaderboard-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Strategy</th>
                    <th>Market</th>
                    <th className={sort === 'year' ? 'sorted' : ''}>12 months</th>
                    <th className="hold-cell">Holding</th>
                    <th className={sort === 'week' ? 'sorted' : ''}>This week</th>
                    <th className={sort === '10y' || sort === 'edge' ? 'sorted' : ''}>10 years</th>
                    <th className="hold-cell">Holding</th>
                    <th className={sort === 'edge' ? 'sorted' : ''}>Edge</th>
                    <th className={sort === 'dd' ? 'sorted' : ''}>Max DD</th>
                    <th>Trades/yr</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const key = `${r.id}-${r.ticker}`;
                    const active = selected?.id === r.id && selected.ticker === r.ticker;
                    return (
                      <tr
                        key={key}
                        className={active ? 'is-selected' : undefined}
                        onClick={() => setSelected(r)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="mono">{i + 1}</td>
                        <td>
                          <strong>{r.title}</strong>
                          <div className="hint">{r.tag}</div>
                        </td>
                        <td>{NAMES[r.ticker] ?? r.ticker}</td>
                        <td>
                          <Pct value={r.return_year} hold={r.hold_year} />
                        </td>
                        <td>
                          <Pct value={r.hold_year} />
                        </td>
                        <td>
                          <Pct value={r.return_week} hold={r.hold_week} />
                        </td>
                        <td>
                          <Pct value={r.return_10y} hold={r.hold_10y} />
                        </td>
                        <td>
                          <Pct value={r.hold_10y} />
                        </td>
                        <td>
                          <Pct value={edge10y(r)} />
                        </td>
                        <td>
                          <Pct value={r.max_drawdown_10y} />
                        </td>
                        <td className="mono">{r.trades_year || '—'}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn secondary small"
                            disabled={running !== null}
                            onClick={() => void test(r)}
                          >
                            {running === key ? 'Running…' : 'Open'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selected ? (
              <aside className="panel lb-drawer">
                <p className="eyebrow">{selected.tag}</p>
                <h2>{selected.title}</h2>
                <p className="hint">
                  {NAMES[selected.ticker] ?? selected.ticker} · capital ${ready.capital.toLocaleString()}
                </p>
                <dl className="kv">
                  <div>
                    <dt>12 months</dt>
                    <dd>
                      <Pct value={selected.return_year} hold={selected.hold_year} />
                    </dd>
                  </div>
                  <div>
                    <dt>This week</dt>
                    <dd>
                      <Pct value={selected.return_week} hold={selected.hold_week} />
                    </dd>
                  </div>
                  <div>
                    <dt>10 years</dt>
                    <dd>
                      <Pct value={selected.return_10y} hold={selected.hold_10y} />
                    </dd>
                  </div>
                  <div>
                    <dt>10y edge</dt>
                    <dd>
                      <Pct value={edge10y(selected)} />
                    </dd>
                  </div>
                  <div>
                    <dt>Max DD (10y)</dt>
                    <dd>
                      <Pct value={selected.max_drawdown_10y} />
                    </dd>
                  </div>
                  <div>
                    <dt>Trades / year</dt>
                    <dd className="mono">{selected.trades_year || '—'}</dd>
                  </div>
                </dl>
                <p className="lb-drawer-text">{selected.text}</p>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={running !== null}
                    onClick={() => void test(selected)}
                  >
                    {running === `${selected.id}-${selected.ticker}` ? 'Running…' : 'Run full backtest'}
                  </button>
                  <Link
                    className="btn ghost"
                    to={`/check?q=${encodeURIComponent(selected.text)}&t=${encodeURIComponent(selected.ticker)}`}
                  >
                    Guru check
                  </Link>
                  <button type="button" className="btn secondary" onClick={() => setSelected(null)}>
                    Close
                  </button>
                </div>
              </aside>
            ) : null}
          </div>

          <p className="hint">
            Green ▲ means the strategy beat holding over the same period, red ▼ means it lost. Costs of 0.1% per trade are
            included. Past results do not predict future ones. <Link to="/check">Test your own idea →</Link>
          </p>
        </>
      ) : null}
    </div>
  );
}
