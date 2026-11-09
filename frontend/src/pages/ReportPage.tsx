import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getReport } from '../services/api';
import type { BacktestResult } from '../types';

const ResultsView = lazy(() =>
  import('./ResultsPage').then((m) => ({ default: m.ResultsView })),
);

export function ReportPage() {
  const { token } = useParams();
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    getReport(token)
      .then(setResult)
      .catch((err: Error) => setError(err.message));
  }, [token]);

  if (error) {
    return (
      <div className="empty-state">
        <p>This report link is not valid anymore. The owner may have revoked it.</p>
        <Link className="btn primary" to="/app">
          Run your own backtest
        </Link>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="empty-state">
        <div className="skeleton-line" style={{ width: '50%', margin: '0 auto 0.85rem' }} />
        Loading shared report…
      </div>
    );
  }
  return (
    <Suspense fallback={<div className="empty-state">Loading charts…</div>}>
      <ResultsView result={result} readOnly />
    </Suspense>
  );
}
