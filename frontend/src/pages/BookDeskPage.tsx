import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CorrelationHeatmap } from '../components/CorrelationHeatmap';
import { EquityChart } from '../components/Charts';
import { KpiCard } from '../components/KpiCard';
import { toast } from '../components/ToastHost';
import { usePageMeta } from '../hooks/usePageMeta';
import { exportAllBacktests } from '../services/api';
import type { BacktestResult } from '../types';
import { blendBook } from '../utils/bookBlend';
import { listFavorites } from '../utils/favorites';

export function BookDeskPage() {
  usePageMeta(
    'Research book — Quantify',
    'Blend pinned or chosen saved runs into a multi-strategy book: equity, drawdown and correlation — not another single-chart backtest.',
  );
  const [library, setLibrary] = useState<BacktestResult[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [weights, setWeights] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const archive = await exportAllBacktests();
      setLibrary(archive.backtests || []);
      const favIds = listFavorites().map((f) => f.id);
      const available = (archive.backtests || []).filter((r) => favIds.includes(r.id)).map((r) => r.id);
      if (available.length) setPicked(available.slice(0, 8));
      toast(`Loaded ${archive.count} runs`, { tone: 'ok' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load library');
    } finally {
      setBusy(false);
    }
  }

  const members = useMemo(() => {
    if (!library) return [];
    return library.filter((r) => picked.includes(r.id));
  }, [library, picked]);

  const report = useMemo(() => blendBook(members, weights), [members, weights]);

  function toggle(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-10)));
  }

  return (
    <div className="results book-desk">
      <div className="page-header">
        <div>
          <p className="eyebrow">Multi-strategy book</p>
          <h1>Research book desk</h1>
          <p className="lede">
            Turn saved runs into a weighted book: blended equity, max drawdown and pairwise return correlation. This is
            what you open after dozens of variants — not another lone backtest.
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void load()}>
            {busy ? 'Loading…' : library ? 'Reload library' : 'Load saved runs'}
          </button>
          <Link className="btn secondary" to="/history">
            History library
          </Link>
          <Link className="btn ghost" to="/desk">
            Ops desk
          </Link>
        </div>
      </div>

      {error ? <div className="banner error">{error}</div> : null}

      {library ? (
        <>
          <section className="panel table-wrap">
            <h2>Members (up to 10)</h2>
            <p className="hint">Pinned favorites are pre-selected when present. Adjust weights, then read the book below.</p>
            <table className="data-table">
              <thead>
                <tr>
                  <th />
                  <th>ID</th>
                  <th>Strategy</th>
                  <th>Return</th>
                  <th>Sharpe</th>
                  <th>Weight</th>
                </tr>
              </thead>
              <tbody>
                {library.slice(0, 80).map((r) => (
                  <tr key={r.id} className={picked.includes(r.id) ? 'is-selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={picked.includes(r.id)}
                        onChange={() => toggle(r.id)}
                        aria-label={`Include #${r.id}`}
                      />
                    </td>
                    <td className="mono">
                      <Link to={`/results/${r.id}`}>#{r.id}</Link>
                    </td>
                    <td className="truncate">{r.strategy_description}</td>
                    <td className={(r.metrics.total_return ?? 0) >= 0 ? 'pos' : 'neg'}>
                      {r.metrics.total_return == null ? '—' : `${(r.metrics.total_return * 100).toFixed(1)}%`}
                    </td>
                    <td className="mono">{r.metrics.sharpe_ratio?.toFixed(2) ?? '—'}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        disabled={!picked.includes(r.id)}
                        value={weights[r.id] ?? 1}
                        onChange={(e) => setWeights((w) => ({ ...w, [r.id]: Number(e.target.value) }))}
                        style={{ width: '4.5rem' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {members.length >= 2 ? (
            <>
              <section className="kpi-grid">
                <KpiCard label="Members" value={String(members.length)} />
                <KpiCard
                  label="Book return"
                  value={report.total_return == null ? '—' : `${(report.total_return * 100).toFixed(1)}%`}
                  tone={(report.total_return ?? 0) >= 0 ? 'positive' : 'negative'}
                />
                <KpiCard
                  label="Max DD"
                  value={report.max_drawdown == null ? '—' : `${(report.max_drawdown * 100).toFixed(1)}%`}
                  tone="negative"
                />
                <KpiCard label="Bars" value={String(report.equity.length)} />
              </section>
              <section className="panel">
                <h2>Blended equity (normalized)</h2>
                <EquityChart data={report.equity} name="Book" />
              </section>
              <section className="panel">
                <h2>Return correlation</h2>
                <CorrelationHeatmap assets={report.labels} matrix={report.correlations} />
              </section>
            </>
          ) : (
            <p className="hint">Pick at least two runs to build a book.</p>
          )}
        </>
      ) : (
        <div className="panel">
          <p>Load your saved backtests to assemble a research book.</p>
        </div>
      )}
    </div>
  );
}
