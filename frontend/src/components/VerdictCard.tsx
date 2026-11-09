import { useEffect, useState } from 'react';
import { getVerdict } from '../services/api';
import type { VerdictCheck, VerdictReport } from '../types';

const GRADE_LABEL: Record<VerdictReport['grade'], string> = {
  robust: 'Robust',
  promising: 'Promising',
  overfit: 'Overfit',
  no_edge: 'No edge',
  insufficient: 'Not enough data',
};

const GRADE_TONE: Record<VerdictReport['grade'], string> = {
  robust: 'holds',
  promising: 'fragile',
  overfit: 'overfit',
  no_edge: 'overfit',
  insufficient: 'thin',
};

const STATUS_MARK: Record<VerdictCheck['status'], string> = {
  pass: '✓',
  warn: '!',
  fail: '✕',
  skip: '–',
};

export function VerdictCard({
  backtestId,
  initial,
}: {
  backtestId: number;
  initial?: VerdictReport;
}) {
  const [report, setReport] = useState<VerdictReport | null>(initial ?? null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initial) {
      setReport(initial);
      return;
    }
    let cancelled = false;
    setReport(null);
    setError('');
    getVerdict(backtestId)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Verdict failed.');
      });
    return () => {
      cancelled = true;
    };
  }, [backtestId, initial]);

  if (error) return <div className="banner warn">{error}</div>;
  if (!report) {
    return (
      <section className="stress-verdict verdict-card verdict-thin">
        <p className="eyebrow">Quantify verdict</p>
        <p className="note">Running holdout, walk-forward, luck, cost, heatmap, regime, alpha, and Monte Carlo checks…</p>
      </section>
    );
  }

  return (
    <section className={`stress-verdict verdict-card verdict-${GRADE_TONE[report.grade]}`}>
      <div className="verdict-head">
        <div>
          <p className="eyebrow">Quantify verdict</p>
          <h2>{GRADE_LABEL[report.grade]}</h2>
          <p>{report.headline}</p>
        </div>
        <div className="verdict-score" aria-label={`Score ${report.score} out of 100`}>
          <strong>{report.score}</strong>
          <span>/100</span>
          <small className="mono">
            {report.passed}/{report.scored} passed
          </small>
        </div>
      </div>
      <ul className="verdict-checks">
        {report.checks.map((check) => (
          <li key={check.key} className={`check-${check.status}`} title={check.detail}>
            <span className="verdict-mark" aria-hidden="true">
              {STATUS_MARK[check.status]}
            </span>
            <span>
              <strong>{check.label}</strong>
              <small>{check.detail || 'Not enough data.'}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
