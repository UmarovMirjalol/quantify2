import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
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

  if (loading) return <div className="empty-state">Loading results…</div>;
  if (error) return <div className="banner error">{error}</div>;
  if (!result) return <div className="empty-state">Backtest not found.</div>;
  return <ResultsView result={result} />;
}
