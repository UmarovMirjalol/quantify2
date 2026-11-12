import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { getLeaderboard, type Leaderboard, type LeaderboardRow } from '../services/api';
import { signedPct } from '../utils/shareCard';
import { quickRun } from '../utils/quickRun';

type SortKey = 'year' | 'week' | '10y';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'year', label: 'Last 12 months' },
  { id: 'week', label: 'This week' },
  { id: '10y', label: '10 years' },
];

const NAMES: Record<string, string> = { SPY: 'S&P 500', QQQ: 'Nasdaq 100', NVDA: 'Nvidia', 'BTC-USD': 'Bitcoin' };

const pick = (r: LeaderboardRow, k: SortKey) =>
  k === 'year' ? [r.return_year, r.hold_year] : k === 'week' ? [r.return_week, r.hold_week] : [r.return_10y, r.hold_10y];

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
  const rows = useMemo(() => {
    if (!ready) return [];
    const list = ready.rows.filter((r) => ticker === 'all' || r.ticker === ticker);
    return [...list].sort((a, b) => (pick(b, sort)[0] ?? -1e9) - (pick(a, sort)[0] ?? -1e9));
  }, [ready, ticker, sort]);

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

  return (
    <div className="results leaderboard">
      <div className="page-header">
        <div>
          <p className="eyebrow">Leaderboard</p>
          <h1>Which famous strategies actually work?</h1>
          <p className="lede">
            Every strategy from the playbook, tested on real prices of the S&amp;P 500, Nasdaq, Nvidia and Bitcoin,
            and compared with simply buying and holding. Updated twice a day.
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
          <section className="hold-verdict lost">
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
          </div>

          <div className="leaderboard-podium">
            <div className="panel">
              <h2>Best</h2>
              <ol>
                {best.map((r) => (
                  <li key={`b-${r.id}-${r.ticker}`}>
                    <span>
                      {r.title} <small className="hint">on {NAMES[r.ticker] ?? r.ticker}</small>
                    </span>
                    <Pct value={pick(r, sort)[0]} />
                  </li>
                ))}
              </ol>
            </div>
            <div className="panel">
              <h2>Worst</h2>
              <ol>
                {worst.map((r) => (
                  <li key={`w-${r.id}-${r.ticker}`}>
                    <span>
                      {r.title} <small className="hint">on {NAMES[r.ticker] ?? r.ticker}</small>
                    </span>
                    <Pct value={pick(r, sort)[0]} />
                  </li>
                ))}
              </ol>
            </div>
          </div>

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
                  <th className={sort === '10y' ? 'sorted' : ''}>10 years</th>
                  <th className="hold-cell">Holding</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.id}-${r.ticker}`}>
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
                      <button
                        type="button"
                        className="btn secondary small"
                        disabled={running !== null}
                        onClick={() => void test(r)}
                      >
                        {running === `${r.id}-${r.ticker}` ? 'Running…' : 'Open'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Green ▲ means the strategy beat holding over the same period, red ▼ means it lost. Costs of 0.1% per trade are included. Past
            results do not predict future ones. <Link to="/check">Test your own idea →</Link>
          </p>
        </>
      ) : null}
    </div>
  );
}
