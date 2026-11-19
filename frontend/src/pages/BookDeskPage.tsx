import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CorrelationHeatmap } from '../components/CorrelationHeatmap';
import { DrawdownChart, EquityChart } from '../components/Charts';
import { KpiCard } from '../components/KpiCard';
import { toast } from '../components/ToastHost';
import { usePageMeta } from '../hooks/usePageMeta';
import { exportAllBacktests } from '../services/api';
import type { BacktestResult } from '../types';
import { blendBook, leaveOneOutLift } from '../utils/bookBlend';
import { downloadText, toCsv } from '../utils/download';
import { listFavorites } from '../utils/favorites';

export function BookDeskPage() {
  usePageMeta(
    'Research book — Quantify',
    'Blend pinned or chosen saved runs into a multi-strategy book: equity, drawdown and correlation — not another single-chart backtest.',
  );
  const [params] = useSearchParams();
  const [library, setLibrary] = useState<BacktestResult[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [weights, setWeights] = useState<Record<number, number>>({});
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idsApplied = useRef(false);

  async function load(opts?: { quiet?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const archive = await exportAllBacktests();
      const rows = archive.backtests || [];
      setLibrary(rows);

      const raw = params.get('ids');
      if (raw) {
        const ids = raw
          .split(/[\s,]+/)
          .map(Number)
          .filter((n) => n > 0);
        const valid = ids.filter((id) => rows.some((r) => r.id === id)).slice(0, 10);
        if (valid.length) {
          setPicked(valid);
          idsApplied.current = true;
        }
      } else if (!idsApplied.current) {
        const favIds = listFavorites().map((f) => f.id);
        const available = rows.filter((r) => favIds.includes(r.id)).map((r) => r.id);
        if (available.length) setPicked(available.slice(0, 8));
      }

      if (!opts?.quiet) toast(`Loaded ${archive.count} runs`, { tone: 'ok' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load library');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  useEffect(() => {
    if (!library?.length) return;
    const raw = params.get('ids');
    if (!raw) return;
    const ids = raw
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => n > 0);
    const valid = ids.filter((id) => library.some((r) => r.id === id)).slice(0, 10);
    if (valid.length) {
      setPicked(valid);
      idsApplied.current = true;
    }
  }, [library, params]);

  const members = useMemo(() => {
    if (!library) return [];
    return library.filter((r) => picked.includes(r.id));
  }, [library, picked]);

  const visibleLibrary = useMemo(() => {
    if (!library) return [];
    const q = query.trim().toLowerCase();
    let rows = library;
    if (q) {
      rows = rows.filter(
        (r) =>
          r.strategy_description.toLowerCase().includes(q) ||
          r.dataset_name.toLowerCase().includes(q) ||
          String(r.id).includes(q),
      );
    }
    return rows.slice(0, 80);
  }, [library, query]);

  const report = useMemo(() => blendBook(members, weights), [members, weights]);
  const lifts = useMemo(() => leaveOneOutLift(members, weights), [members, weights]);
  const liftMap = useMemo(() => Object.fromEntries(lifts.map((l) => [l.id, l.lift])), [lifts]);
  const weightSum = useMemo(
    () => picked.reduce((s, id) => s + Math.max(0, weights[id] ?? 1), 0) || 1,
    [picked, weights],
  );

  function toggle(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-10)));
  }

  function equalWeights() {
    if (!picked.length) return;
    setWeights(Object.fromEntries(picked.map((id) => [id, 1])));
    toast('Equal weights applied', { tone: 'ok' });
  }

  function normalizeWeights() {
    if (!picked.length) return;
    const sum = picked.reduce((s, id) => s + Math.max(0, weights[id] ?? 1), 0) || 1;
    setWeights(Object.fromEntries(picked.map((id) => [id, Math.round(((weights[id] ?? 1) / sum) * 1000) / 10])));
    toast('Weights normalized to 100', { tone: 'ok' });
  }

  function exportBookCsv() {
    if (!members.length) return;
    const rows: (string | number | null)[][] = [
      ['id', 'weight', 'lift', 'strategy', 'dataset', 'return', 'sharpe', 'max_dd'],
      ...members.map((r) => [
        r.id,
        weights[r.id] ?? 1,
        liftMap[r.id] ?? '',
        r.strategy_description,
        r.dataset_name,
        r.metrics.total_return ?? '',
        r.metrics.sharpe_ratio ?? '',
        r.metrics.max_drawdown ?? '',
      ]),
    ];
    downloadText(`quantify-book-${picked.join('-')}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
    toast('Book CSV exported', { tone: 'ok' });
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

      {error ? (
        <div className="banner error">
          {error}{' '}
          <button type="button" className="btn ghost small" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {library ? (
        <>
          <section className="panel table-wrap table-wrap--tall">
            <div className="panel-toolbar">
              <h2 style={{ margin: 0, flex: 1 }}>Members ({picked.length}/10)</h2>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search strategy, dataset, or id…"
                aria-label="Filter book members"
                style={{ minWidth: '14rem', flex: '1 1 12rem' }}
              />
              <button type="button" className="btn secondary small" disabled={!picked.length} onClick={equalWeights}>
                Equal weights
              </button>
              <button
                type="button"
                className="btn secondary small"
                disabled={!picked.length}
                onClick={normalizeWeights}
              >
                Normalize 100%
              </button>
              <button
                type="button"
                className="btn secondary small"
                disabled={!members.length}
                onClick={exportBookCsv}
              >
                Export book CSV
              </button>
            </div>
            <p className="hint">
              Weight bars + leave-one-out lift (book return with vs without the member). History cohort →{' '}
              <span className="mono">?ids=</span>.
            </p>
            <table className="data-table">
              <thead>
                <tr>
                  <th />
                  <th>ID</th>
                  <th>Strategy</th>
                  <th>Return</th>
                  <th>Sharpe</th>
                  <th>Weight</th>
                  <th>Lift</th>
                </tr>
              </thead>
              <tbody>
                {visibleLibrary.map((r) => {
                  const on = picked.includes(r.id);
                  const w = Math.max(0, weights[r.id] ?? 1);
                  const pctW = on ? (w / weightSum) * 100 : 0;
                  const lift = on ? liftMap[r.id] : null;
                  return (
                    <tr key={r.id} className={on ? 'is-selected' : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={on}
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
                        <div className="book-weight-cell">
                          <span className="book-weight-bar" aria-hidden>
                            <span style={{ width: `${Math.min(100, pctW)}%` }} />
                          </span>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            disabled={!on}
                            value={weights[r.id] ?? 1}
                            onChange={(e) => setWeights((prev) => ({ ...prev, [r.id]: Number(e.target.value) }))}
                            style={{ width: '4.5rem' }}
                          />
                          <span className="hint mono">{on ? `${pctW.toFixed(0)}%` : ''}</span>
                        </div>
                      </td>
                      <td>
                        {lift == null ? (
                          <span className="hint">—</span>
                        ) : (
                          <span className={`desk-pill ${lift >= 0 ? 'desk-pill--pass' : 'desk-pill--block'}`}>
                            {lift >= 0 ? '+' : ''}
                            {(lift * 100).toFixed(1)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visibleLibrary.length ? <p className="hint">No runs match this filter.</p> : null}
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
                <h2>Book drawdown</h2>
                <DrawdownChart data={report.equity} />
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
          <p>{busy ? 'Loading saved runs…' : 'Load your saved backtests to assemble a research book.'}</p>
        </div>
      )}
    </div>
  );
}
