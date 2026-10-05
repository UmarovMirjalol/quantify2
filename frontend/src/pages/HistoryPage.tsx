import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listBacktests } from '../services/api';
import type { BacktestSummary } from '../types';

function pct(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

export function HistoryPage() {
  const [items, setItems] = useState<BacktestSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listBacktests()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="history">
      <div className="results-header">
        <div>
          <p className="eyebrow">Saved runs</p>
          <h1>Backtest History</h1>
          <p className="lede">Open a previous backtest to inspect metrics, charts, and trades.</p>
        </div>
      </div>

      {loading ? <div className="empty-state">Loading history…</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      {!loading && !items.length ? (
        <div className="empty-state">
          No saved backtests yet. <Link to="/">Run your first backtest</Link>.
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="table-wrap panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>When</th>
                <th>Strategy</th>
                <th>Dataset</th>
                <th>Return</th>
                <th>Sharpe</th>
                <th>Max DD</th>
                <th>Trades</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>#{item.id}</td>
                  <td>{item.created_at.slice(0, 19).replace('T', ' ')}</td>
                  <td className="truncate">{item.strategy_description}</td>
                  <td>{item.dataset_name}</td>
                  <td className={(item.total_return ?? 0) >= 0 ? 'pos' : 'neg'}>
                    {pct(item.total_return)}
                  </td>
                  <td>{item.sharpe_ratio?.toFixed(2) ?? '—'}</td>
                  <td className="neg">{pct(item.max_drawdown)}</td>
                  <td>{item.number_of_trades ?? '—'}</td>
                  <td>
                    <Link className="btn secondary small" to={`/results/${item.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
