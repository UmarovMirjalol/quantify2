import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listBacktests } from '../services/api';
import type { BacktestSummary } from '../types';

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

  useEffect(() => {
    listBacktests()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? items.filter(
          (item) =>
            item.strategy_description.toLowerCase().includes(q) ||
            item.dataset_name.toLowerCase().includes(q) ||
            String(item.id).includes(q),
        )
      : items.slice();

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
  }, [items, query, sortKey, sortDir]);

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
        <Link className="btn primary" to="/app">
          New Backtest
        </Link>
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
          </div>
          <div className="table-wrap panel">
            <table className="data-table">
              <thead>
                <tr>
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
                  <tr key={item.id}>
                    <td className="mono">#{item.id}</td>
                    <td className="mono">{item.created_at.slice(0, 19).replace('T', ' ')}</td>
                    <td className="truncate">{item.strategy_description}</td>
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
