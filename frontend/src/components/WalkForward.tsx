import { useEffect, useMemo, useState } from 'react';
import { getWalkForward } from '../services/api';
import type { WalkForwardFold, WalkForwardReport } from '../types';

const VERDICT: Record<WalkForwardReport['verdict'], string> = {
  stable: 'Stable',
  uneven: 'Uneven',
  fails: 'Does not travel',
  thin: 'Too thin',
};

function pct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function sharpe(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toFixed(2);
}

function Spark({ points }: { points: { equity: number }[] | undefined }) {
  if (!points || points.length < 2) return null;
  const values = points.map((p) => p.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 30 - ((value - min) / span) * 24;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg className={`stress-spark ${up ? 'up' : 'down'}`} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function stitchOos(folds: WalkForwardFold[]): { date: string; equity: number }[] {
  const out: { date: string; equity: number }[] = [];
  let scale = 1;
  for (const fold of folds) {
    const eq = fold.equity || [];
    if (eq.length < 2) continue;
    const base = eq[0].equity || 1;
    for (let i = 0; i < eq.length; i++) {
      const rebased = scale * (eq[i].equity / base);
      if (i === 0 && out.length) continue; // avoid double knot
      out.push({ date: eq[i].date, equity: rebased });
    }
    const last = eq[eq.length - 1].equity || base;
    scale *= last / base;
  }
  return out;
}

function ParamPath({ folds }: { folds: WalkForwardFold[] }) {
  const vals = folds.map((f) => f.value).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 320;
  const h = 72;
  const pts = folds
    .map((f, i) => {
      if (f.value == null) return null;
      const x = (i / Math.max(1, folds.length - 1)) * (w - 16) + 8;
      const y = h - 10 - ((f.value - min) / span) * (h - 20);
      return `${x},${y}`;
    })
    .filter(Boolean);
  return (
    <section className="panel walk-param-path">
      <h3>Parameter path</h3>
      <p className="hint">Chosen entry knob on each train window (test slice never votes).</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="walk-param-path__svg" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="rgba(110,168,255,0.9)"
          strokeWidth="2"
          points={pts.join(' ')}
        />
        {folds.map((f, i) => {
          if (f.value == null) return null;
          const x = (i / Math.max(1, folds.length - 1)) * (w - 16) + 8;
          const y = h - 10 - ((f.value - min) / span) * (h - 20);
          return <circle key={f.fold} cx={x} cy={y} r="3.5" fill="rgba(79,214,160,0.95)" />;
        })}
      </svg>
      <div className="walk-param-path__labels mono hint">
        {folds.map((f) => (
          <span key={f.fold}>
            F{f.fold}:{f.value ?? '—'}
          </span>
        ))}
      </div>
    </section>
  );
}

function HitMeter({ rate }: { rate: number | null }) {
  if (rate == null) return null;
  const pctHit = Math.round(rate * 100);
  return (
    <div className="walk-hit">
      <div className="walk-hit__track">
        <div className="walk-hit__fill" style={{ width: `${pctHit}%` }} />
      </div>
      <span className="mono hint">{pctHit}% slices Sharpe &gt; 0</span>
    </div>
  );
}

export function WalkForward({ backtestId }: { backtestId: number }) {
  const [report, setReport] = useState<WalkForwardReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setFocus(null);
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

  const oos = useMemo(() => (report ? stitchOos(report.folds) : []), [report]);
  const focused = report?.folds.find((f) => f.fold === focus) ?? null;

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
    report.verdict === 'stable'
      ? 'holds'
      : report.verdict === 'fails'
        ? 'overfit'
        : report.verdict === 'thin'
          ? 'thin'
          : 'fragile';

  return (
    <div className="walk-studio stress-audit">
      <header className="walk-studio__hero">
        <section className={`stress-verdict verdict-${tone}`}>
          <p className="eyebrow">Walk-forward studio</p>
          <h2>{VERDICT[report.verdict]}</h2>
          <p>{report.headline}</p>
          <p className="mono stress-split">
            {report.refit
              ? `Refit ${report.parameter ?? 'entry'} on past bars only`
              : 'Rules stay fixed — no single entry knob to refit'}
          </p>
          <HitMeter rate={report.hit_rate} />
        </section>
        <ParamPath folds={report.folds} />
      </header>

      {oos.length > 2 ? (
        <section className="panel">
          <h3>Stitched out-of-sample equity</h3>
          <p className="hint">Each fold rebased and chained — only test windows, never train.</p>
          <Spark points={oos} />
          <svg
            className="walk-oos-svg"
            viewBox="0 0 100 36"
            preserveAspectRatio="none"
            aria-label="Stitched OOS equity"
          >
            {(() => {
              const values = oos.map((p) => p.equity);
              const min = Math.min(...values);
              const max = Math.max(...values);
              const span = max - min || 1;
              const d = values
                .map((v, i) => {
                  const x = (i / (values.length - 1)) * 100;
                  const y = 34 - ((v - min) / span) * 30;
                  return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
                })
                .join(' ');
              const up = values[values.length - 1] >= values[0];
              return <path d={d} className={up ? 'up' : 'down'} />;
            })()}
          </svg>
        </section>
      ) : null}

      <div className="walk-folds walk-folds--studio">
        {report.folds.map((fold) => (
          <article
            key={fold.fold}
            className={`panel walk-fold${focus === fold.fold ? ' walk-fold--focus' : ''}`}
            onClick={() => setFocus(fold.fold === focus ? null : fold.fold)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setFocus(fold.fold === focus ? null : fold.fold);
              }
            }}
          >
            <header>
              <h3>Slice {fold.fold}</h3>
              <span className="mono">
                {fold.start_date || '—'} → {fold.end_date || '—'}
              </span>
            </header>
            <Spark points={fold.equity} />
            <p className="mono walk-param">{fold.parameter ?? 'original rules'}</p>
            <dl>
              <div>
                <dt>Test return</dt>
                <dd className={fold.test_return != null && fold.test_return >= 0 ? 'pos' : 'neg'}>
                  {pct(fold.test_return)}
                </dd>
              </div>
              <div>
                <dt>Test Sharpe</dt>
                <dd>{sharpe(fold.test_sharpe)}</dd>
              </div>
              <div>
                <dt>Max DD</dt>
                <dd className="neg">{pct(fold.max_drawdown)}</dd>
              </div>
              <div>
                <dt>Trades</dt>
                <dd>{fold.test_trades}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      {focused?.equity && focused.equity.length > 2 ? (
        <section className="panel">
          <h3>
            Fold {focused.fold} detail · {focused.parameter ?? 'rules'}
          </h3>
          <p className="hint mono">
            {focused.start_date} → {focused.end_date} · return {pct(focused.test_return)} · Sharpe{' '}
            {sharpe(focused.test_sharpe)}
          </p>
          <svg className="walk-oos-svg walk-oos-svg--tall" viewBox="0 0 100 48" preserveAspectRatio="none">
            {(() => {
              const values = focused.equity!.map((p) => p.equity);
              const min = Math.min(...values);
              const max = Math.max(...values);
              const span = max - min || 1;
              const d = values
                .map((v, i) => {
                  const x = (i / (values.length - 1)) * 100;
                  const y = 44 - ((v - min) / span) * 38;
                  return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
                })
                .join(' ');
              return <path d={d} className="up" />;
            })()}
          </svg>
        </section>
      ) : null}
    </div>
  );
}
