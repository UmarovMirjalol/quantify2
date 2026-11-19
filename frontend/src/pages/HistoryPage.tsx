import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EquityChart } from '../components/Charts';
import { EquitySparkline } from '../components/EquitySparkline';
import { KpiCard } from '../components/KpiCard';
import { ResearchScatter } from '../components/ResearchScatter';
import { toast } from '../components/ToastHost';
import { exportAllBacktests, listBacktests } from '../services/api';
import type { BacktestResult, BacktestSummary, EquityPoint } from '../types';
import { downloadText } from '../utils/download';
import { isFavorite, listFavorites, toggleFavorite } from '../utils/favorites';
import { getNote } from '../utils/researchNotes';
import { allTags, getTags, idsWithTag } from '../utils/runTags';
import { tearsheetMarkdown } from '../utils/tearsheetMarkdown';

function pct(v: number | null): string {
  if (v === null || v === undefined) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(2)}%`;
}

type SortKey = 'created_at' | 'total_return' | 'sharpe_ratio' | 'max_drawdown' | 'number_of_trades';

export function HistoryPage() {
  const [items, setItems] = useState<BacktestSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [picked, setPicked] = useState<number[]>([]);
  const [cohort, setCohort] = useState<number[]>([]);
  const [archiving, setArchiving] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [library, setLibrary] = useState<BacktestResult[] | null>(null);
  const [scatterMode, setScatterMode] = useState<'sharpe_dd' | 'return_trades'>('sharpe_dd');
  const [favTick, setFavTick] = useState(0);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const navigate = useNavigate();
  const tagOptions = useMemo(() => allTags(), [favTick, items]);

  function togglePick(id: number) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2),
    );
  }

  function toggleCohort(id: number) {
    setCohort((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-8)));
  }

  async function downloadArchive() {
    setArchiving(true);
    try {
      const archive = await exportAllBacktests();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadText(`quantify-archive-${stamp}.json`, JSON.stringify(archive, null, 2), 'application/json;charset=utf-8');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setArchiving(false);
    }
  }

  async function loadLibrary() {
    setLibraryBusy(true);
    setError(null);
    try {
      const archive = await exportAllBacktests();
      setLibrary(archive.backtests || []);
      toast(`Library loaded · ${archive.count} runs`, { tone: 'ok' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load library');
    } finally {
      setLibraryBusy(false);
    }
  }

  function exportCohortPack() {
    if (!library?.length || !cohort.length) return;
    const pack = library.filter((r) => cohort.includes(r.id));
    const md = pack.map((r) => tearsheetMarkdown(r)).join('\n\n---\n\n');
    downloadText(`quantify-cohort-${cohort.join('-')}.md`, md, 'text/markdown;charset=utf-8');
    toast('Cohort tearsheet pack downloaded', { tone: 'ok' });
  }

  useEffect(() => {
    listBacktests()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pinnedIds = new Set(listFavorites().map((f) => f.id));
    let base = q
      ? items.filter(
          (item) =>
            item.strategy_description.toLowerCase().includes(q) ||
            item.dataset_name.toLowerCase().includes(q) ||
            String(item.id).includes(q),
        )
      : items.slice();
    if (pinnedOnly) base = base.filter((item) => pinnedIds.has(item.id));
    if (tagFilter) {
      const tagged = new Set(idsWithTag(tagFilter));
      base = base.filter((item) => tagged.has(item.id));
    }

    base.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp = 0;
      if (sortKey === 'created_at') {
        cmp = String(a.created_at).localeCompare(String(b.created_at));
      } else {
        const an = typeof av === 'number' ? av : Number.NEGATIVE_INFINITY;
        const bn = typeof bv === 'number' ? bv : Number.NEGATIVE_INFINITY;
        cmp = an === bn ? 0 : an < bn ? -1 : 1;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return base;
  }, [items, query, sortKey, sortDir, pinnedOnly, favTick, tagFilter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'created_at' ? 'desc' : 'desc');
    }
  }

  return (
    <div className="history">
      <div className="page-header">
        <div>
          <p className="eyebrow">Saved runs</p>
          <h1>Results</h1>
          <p className="lede">
            Runs saved for this browser. Search and sort, then open a row for charts and trades.
          </p>
        </div>
        <div className="btn-row">
          {items.length > 0 ? (
            <button
              type="button"
              className="btn secondary"
              onClick={downloadArchive}
              disabled={archiving}
              title="Every saved run with trades, equity curves and strategy specs as one JSON file"
            >
              {archiving ? 'Preparing…' : 'Export all (JSON)'}
            </button>
          ) : null}
          <Link className="btn primary" to="/app">
            New Backtest
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="skeleton-line" style={{ width: '40%', margin: '0 auto 0.75rem' }} />
          Loading history…
        </div>
      ) : null}
      {error ? (
        <div className="banner error">
          {error}
          <div style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {!loading && !items.length ? (
        <div className="empty-state">
          <p style={{ margin: '0 0 0.75rem' }}>
            No saved runs for this browser yet. Pick a playbook strategy or open a blank workspace.
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link className="btn primary" to="/playbook">
              Open playbook
            </Link>
            <Link className="btn secondary" to="/app">
              Blank workspace
            </Link>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <>
          <div className="history-filmstrip" aria-label="Recent equity curves">
            {filtered.slice(0, 12).map((item) => (
              <div key={item.id} className={`history-film${picked.includes(item.id) ? ' picked' : ''}`}>
                <div className="history-film__meta">
                  <Link to={`/results/${item.id}`} className="mono">
                    #{item.id}
                  </Link>
                  <span className={(item.total_return ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(item.total_return)}</span>
                  <button
                    type="button"
                    className="history-film__pin"
                    title={isFavorite(item.id) ? 'Unpin' : 'Pin'}
                    onClick={() => {
                      const next = toggleFavorite({
                        id: item.id,
                        title: item.strategy_description,
                        dataset: item.dataset_name,
                        return_pct: item.total_return,
                        sharpe: item.sharpe_ratio,
                      });
                      setFavTick((n) => n + 1);
                      toast(next.some((f) => f.id === item.id) ? 'Pinned' : 'Unpinned', { tone: 'ok' });
                    }}
                  >
                    {favTick >= 0 && isFavorite(item.id) ? '★' : '☆'}
                  </button>
                </div>
                <Link to={`/results/${item.id}`}>
                  <EquitySparkline
                    values={item.equity_spark ?? []}
                    width={148}
                    height={36}
                    positive={(item.total_return ?? 0) >= 0}
                  />
                  <p className="history-film__title">{item.strategy_description}</p>
                  <span className="hint mono">{item.dataset_name}</span>
                </Link>
              </div>
            ))}
          </div>
          <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
            <label className="field" style={{ flex: '1 1 220px', margin: 0 }}>
              <span className="sr-only">Search</span>
              <input
                type="search"
                placeholder="Search strategy, dataset, or id…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <span className="hint mono">
              {filtered.length}/{items.length} runs
            </span>
            <button
              type="button"
              className={`chip${pinnedOnly ? ' active' : ''}`}
              onClick={() => setPinnedOnly((v) => !v)}
            >
              ★ Pinned only
            </button>
            {tagOptions.length ? (
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Filter by tag">
                <option value="">All tags</option>
                {tagOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="btn primary small"
              disabled={picked.length !== 2}
              onClick={() => navigate(`/compare?a=${picked[0]}&b=${picked[1]}`)}
              title="Tick two runs to compare them side by side"
            >
              Compare {picked.length}/2
            </button>
            <button
              type="button"
              className="btn secondary small"
              disabled={libraryBusy}
              onClick={() => void loadLibrary()}
              title="Load full runs for library scatter and cohort overlay"
            >
              {libraryBusy ? 'Loading library…' : library ? 'Reload library' : 'Open library desk'}
            </button>
          </div>

          <section className="panel history-library">
            <div className="page-header" style={{ marginBottom: '0.5rem' }}>
              <div>
                <p className="eyebrow">Library desk</p>
                <h2 style={{ margin: 0 }}>Sharpe × drawdown map</h2>
                <p className="hint">Click a point to open. Shift-click rows below to build a cohort of up to 8 for equity overlay.</p>
              </div>
              <div className="whatif-picks">
                <button
                  type="button"
                  className={`chip${scatterMode === 'sharpe_dd' ? ' active' : ''}`}
                  onClick={() => setScatterMode('sharpe_dd')}
                >
                  Sharpe × DD
                </button>
                <button
                  type="button"
                  className={`chip${scatterMode === 'return_trades' ? ' active' : ''}`}
                  onClick={() => setScatterMode('return_trades')}
                >
                  Return × trades
                </button>
              </div>
            </div>
            <div className="kpi-grid">
              <KpiCard label="Shown" value={String(filtered.length)} />
              <KpiCard
                label="Median Sharpe"
                value={
                  (() => {
                    const s = filtered
                      .map((i) => i.sharpe_ratio)
                      .filter((v): v is number => v != null)
                      .sort((a, b) => a - b);
                    if (!s.length) return '—';
                    return s[Math.floor(s.length / 2)].toFixed(2);
                  })()
                }
              />
              <KpiCard
                label="With notes"
                value={String(filtered.filter((i) => getNote(i.id).trim()).length)}
              />
              <KpiCard label="Cohort" value={`${cohort.length}/8`} hint="Shift-click table rows" />
            </div>
            <ResearchScatter
              points={filtered
                .filter((i) =>
                  scatterMode === 'sharpe_dd'
                    ? i.sharpe_ratio != null && i.max_drawdown != null
                    : i.total_return != null && i.number_of_trades != null,
                )
                .map((i) => ({
                  id: String(i.id),
                  x:
                    scatterMode === 'sharpe_dd'
                      ? Math.abs(i.max_drawdown ?? 0) * 100
                      : i.number_of_trades ?? 0,
                  y: scatterMode === 'sharpe_dd' ? i.sharpe_ratio ?? 0 : (i.total_return ?? 0) * 100,
                  label: `#${i.id} ${i.strategy_description.slice(0, 40)}`,
                  tone: (i.total_return ?? 0) >= 0 ? 'pos' : 'neg',
                  r: cohort.includes(i.id) ? 2.6 : 1.8,
                }))}
              xLabel={scatterMode === 'sharpe_dd' ? '|Max DD| %' : 'Trades'}
              yLabel={scatterMode === 'sharpe_dd' ? 'Sharpe' : 'Return %'}
              onSelect={(id) => navigate(`/results/${id}`)}
            />
            {library && cohort.length ? (
              <div style={{ marginTop: '1rem' }}>
                <div className="btn-row" style={{ marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, flex: 1 }}>Cohort equity overlay</h3>
                  {cohort.length >= 2 ? (
                    <Link
                      className="btn primary small"
                      to={`/book?ids=${cohort.join(',')}`}
                      title="Blend this cohort in the research book desk"
                    >
                      Build research book ({cohort.length})
                    </Link>
                  ) : null}
                  <button type="button" className="btn secondary small" onClick={exportCohortPack}>
                    Download tearsheet pack
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => setCohort([])}>
                    Clear cohort
                  </button>
                </div>
                <CohortOverlay library={library} cohort={cohort} />
              </div>
            ) : null}
            {library == null ? (
              <p className="hint" style={{ marginTop: '0.75rem' }}>
                Open the library desk to unlock cohort equity overlays from full saved runs.
              </p>
            ) : null}
          </section>
          <div className="table-wrap panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <span className="sr-only">Compare</span>
                  </th>
                  <th>ID</th>
                  <th>
                    <button type="button" className="chip" onClick={() => toggleSort('created_at')}>
                      When {sortKey === 'created_at' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                  <th>Strategy</th>
                  <th>Dataset</th>
                  <th>
                    <button type="button" className="chip" onClick={() => toggleSort('total_return')}>
                      Return {sortKey === 'total_return' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="chip" onClick={() => toggleSort('sharpe_ratio')}>
                      Sharpe {sortKey === 'sharpe_ratio' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="chip" onClick={() => toggleSort('max_drawdown')}>
                      Max DD {sortKey === 'max_drawdown' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => toggleSort('number_of_trades')}
                    >
                      Trades {sortKey === 'number_of_trades' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={`${picked.includes(item.id) ? 'picked' : ''}${cohort.includes(item.id) ? ' cohort' : ''}`}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        e.preventDefault();
                        toggleCohort(item.id);
                      }
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Compare run ${item.id}`}
                        checked={picked.includes(item.id)}
                        onChange={() => togglePick(item.id)}
                      />
                    </td>
                    <td className="mono">#{item.id}</td>
                    <td className="mono">{item.created_at.slice(0, 19).replace('T', ' ')}</td>
                    <td className="truncate">
                      {item.strategy_description}
                      {getTags(item.id).length ? (
                        <div className="history-tags">
                          {getTags(item.id).map((t) => (
                            <span key={t} className="chip tiny">
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {getNote(item.id).trim() ? (
                        <div className="hint" title={getNote(item.id)}>
                          Note · {getNote(item.id).slice(0, 60)}
                          {getNote(item.id).length > 60 ? '…' : ''}
                        </div>
                      ) : null}
                    </td>
                    <td className="mono">{item.dataset_name}</td>
                    <td className={(item.total_return ?? 0) >= 0 ? 'pos' : 'neg'}>
                      {pct(item.total_return)}
                    </td>
                    <td className="mono">{item.sharpe_ratio?.toFixed(2) ?? '—'}</td>
                    <td className="neg">{pct(item.max_drawdown)}</td>
                    <td className="mono">{item.number_of_trades ?? '—'}</td>
                    <td>
                      <Link className="btn secondary small" to={`/results/${item.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length ? (
              <p className="hint" style={{ padding: '1rem' }}>
                No runs match “{query}”.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

const COHORT_COLORS = ['#4fd6a0', '#6ea8fe', '#f0c14a', '#e57a84', '#c4b5fd', '#94a3b8', '#2dd4bf', '#fb923c'];

function CohortOverlay({ library, cohort }: { library: BacktestResult[]; cohort: number[] }) {
  const runs = library.filter((r) => cohort.includes(r.id));
  if (runs.length < 1) return null;
  const primary = runs[0];
  const rest = runs.slice(1);
  // Normalize each curve to start at 10_000 for visual compare
  const norm = (curve: EquityPoint[]): EquityPoint[] => {
    const start = curve[0]?.equity || 1;
    return curve.map((p) => ({
      ...p,
      equity: start > 0 ? (p.equity / start) * 10_000 : p.equity,
    }));
  };
  return (
    <div className="history-cohort">
      <EquityChart
        data={norm(primary.equity_curve)}
        name={`#${primary.id}`}
        benchmark={rest[0] ? norm(rest[0].equity_curve) : undefined}
        benchmarkName={rest[0] ? `#${rest[0].id}` : undefined}
      />
      {rest.length > 1 ? (
        <ul className="hint" style={{ marginTop: '0.5rem' }}>
          {runs.map((r, i) => (
            <li key={r.id} style={{ color: COHORT_COLORS[i % COHORT_COLORS.length] }}>
              #{r.id} · {r.strategy_description.slice(0, 48)} ·{' '}
              {r.metrics.total_return == null ? '—' : pct(r.metrics.total_return)}
            </li>
          ))}
          <li className="hint">First two curves plotted; pack download includes all {runs.length} tearsheets.</li>
        </ul>
      ) : null}
    </div>
  );
}
