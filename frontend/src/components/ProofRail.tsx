import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCountUp } from '../hooks/useCountUp';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

type Stats = {
  matched: number;
  trades: number;
  assets: number;
  pairs: number;
  beatHold: number;
  rankCorr: number;
};

const FALLBACK: Stats = {
  matched: 1065,
  trades: 1065,
  assets: 106,
  pairs: 2897,
  beatHold: 0.2547,
  rankCorr: 0.029,
};

export function ProofRail() {
  const reduced = usePrefersReducedMotion();
  const [stats, setStats] = useState<Stats>(FALLBACK);
  const [ready, setReady] = useState(reduced);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch('/research/verification.json').then((r) => r.json()),
      fetch('/research/survival.json').then((r) => r.json()),
    ])
      .then(([v, s]) => {
        if (!alive) return;
        setStats({
          matched: v.summary.matched_trades,
          trades: v.summary.trades,
          assets: s.summary.assets,
          pairs: s.summary.pairs,
          beatHold: s.summary.best_pick.beat_hold_return,
          rankCorr: s.summary.rank_correlation.median,
        });
        setReady(true);
      })
      .catch(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const matched = useCountUp(stats.matched, { active: ready, duration: 1100, reduced });
  const assets = useCountUp(stats.assets, { active: ready, duration: 900, reduced });
  const pairs = useCountUp(stats.pairs, { active: ready, duration: 1200, reduced });
  const beat = useCountUp(stats.beatHold * 100, { active: ready, duration: 1000, reduced, decimals: 0 });
  const corr = useCountUp(stats.rankCorr, { active: ready, duration: 1000, reduced, decimals: 2 });

  return (
    <section className="proof-rail" aria-label="Independent research and verification">
      <div className="proof-rail__head">
        <p className="eyebrow">Not a demo curve. Published evidence.</p>
        <h2>
          Built to survive an admissions officer’s first question:
          <em> “How do I know this is real?”</em>
        </h2>
      </div>

      <div className="proof-rail__grid">
        <article>
          <strong className="mono">
            {Math.round(matched).toLocaleString()} / {stats.trades.toLocaleString()}
          </strong>
          <span>trades identical to backtrader, to the cent</span>
          <small>Independent open-source engine · 36 / 36 cases matched</small>
        </article>
        <article>
          <strong className="mono">
            {Math.round(assets)} assets · {Math.round(pairs).toLocaleString()} tests
          </strong>
          <span>original study: do backtest winners keep winning?</span>
          <small>30 classic rules · stocks, ETFs, crypto, FX, futures</small>
        </article>
        <article>
          <strong className="mono">{Math.round(beat)}%</strong>
          <span>of “best” backtests beat buy &amp; hold afterwards</span>
          <small>Most look brilliant in-sample. Out of sample, almost none do.</small>
        </article>
        <article>
          <strong className="mono">{corr.toFixed(2)}</strong>
          <span>median rank correlation, past → future</span>
          <small>≈ 0 means the backtest ranking barely predicts what comes next</small>
        </article>
      </div>

      <div className="proof-rail__cta">
        <Link className="btn primary" to="/research">
          Read the study
        </Link>
        <Link className="btn ghost" to="/about">
          Engine principles
        </Link>
        <a className="btn ghost" href="https://github.com/UmarovMirjalol/quantify2" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </div>
    </section>
  );
}
