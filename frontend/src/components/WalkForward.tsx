import { useEffect, useState } from 'react';
import { getWalkForward } from '../services/api';
import type { WalkForwardReport } from '../types';

const VERDICT: Record<WalkForwardReport['verdict'], string> = {
  stable: 'Stable',
  uneven: 'Uneven',
  fails: 'Does not travel',
  thin: 'Too thin',
};

function pct(value: number | null): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function sharpe(value: number | null): string {
  if (value == null) return '—';
  return value.toFixed(2);
}

export function WalkForward({ backtestId }: { backtestId: number }) {
  const [report, setReport] = useState<WalkForwardReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getWalkForward(backtestId)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Walk-forward failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [backtestId]);

  if (loading) {
    return (
      <p className="note">
        Refitting the entry parameter on each past window, then scoring only the next unseen slice…
      </p>
    );
  }
  if (error || !report) {
    return <div className="banner warn">{error || 'Walk-forward failed.'}</div>;
  }

  const tone =
    report.verdict === 'stable' ? 'holds' : report.verdict === 'fails' ? 'overfit' : report.verdict === 'thin' ? 'thin' : 'fragile';

  return (
    <div className="stress-audit">
      <section className={`stress-verdict verdict-${tone}`}>
        <p className="eyebrow">Walk-forward</p>
        <h2>{VERDICT[report.verdict]}</h2>
        <p>{report.headline}</p>
        <p className="mono stress-split">
          {report.refit
            ? `Refit ${report.parameter ?? 'entry'} on past bars only`
            : 'Rules stay fixed — this spec has no single entry parameter to refit'}
          {report.hit_rate == null ? '' : ` · ${Math.round(report.hit_rate * 100)}% of scored slices stayed positive`}
        </p>
      </section>
      <div className="walk-folds">
        {report.folds.map((fold) => (
          <article key={fold.fold} className="panel walk-fold">
            <header>
              <h3>Slice {fold.fold}</h3>
              <span className="mono">
                {fold.start_date || '—'} → {fold.end_date || '—'}
              </span>
            </header>
            <p className="mono walk-param">{fold.parameter ?? 'original rules'}</p>
            <dl>
              <div>
                <dt>Test return</dt>
                <dd>{pct(fold.test_return)}</dd>
              </div>
              <div>
                <dt>Test Sharpe</dt>
                <dd>{sharpe(fold.test_sharpe)}</dd>
              </div>
              <div>
                <dt>Trades</dt>
                <dd>{fold.test_trades}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
