import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getBacktest } from '../services/api';
import type { BacktestResult } from '../types';
import { ResultsView } from './ResultsPage';

export function ResultsLoader() {
  const { id } = useParams();
  const location = useLocation();
  const stateResult = (location.state as { result?: BacktestResult } | null)?.result;
  const [result, setResult] = useState<BacktestResult | null>(
    stateResult && String(stateResult.id) === id ? stateResult : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!result);

  useEffect(() => {
    if (result) return;
    if (!id) {
      setError('Missing backtest id');
      setLoading(false);
      return;
    }
    getBacktest(Number(id))
      .then(setResult)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, result]);

  if (loading) {
    return (
      <div className="empty-state">
        <div className="skeleton-line" style={{ width: '55%', margin: '0 auto 0.85rem' }} />
        Calculating risk metrics…
      </div>
    );
  }
  if (error) {
    return (
      <div className="banner error">
        {error}
        <div style={{ marginTop: '0.65rem' }}>
          <Link className="btn secondary small" to="/history">
            Back to results
          </Link>
        </div>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="empty-state">
        Backtest not found.{' '}
        <Link to="/app">Run a new backtest</Link>
      </div>
    );
  }
  return <ResultsView result={result} />;
}
