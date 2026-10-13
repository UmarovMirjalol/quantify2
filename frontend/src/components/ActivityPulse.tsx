import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { getPulse } from '../services/api';
import type { PulseItem } from '../types';

function pct(v: number | null): string {
  if (v === null || v === undefined) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function relativeTime(iso: string): string {
  if (!iso) return 'just now';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'recently';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function ActivityPulse() {
  const reduced = usePrefersReducedMotion();
  const [items, setItems] = useState<PulseItem[]>([]);
  const [error, setError] = useState(false);
  const [inView, setInView] = useState(reduced);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (reduced) {
      setInView(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { threshold: 0.15 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [reduced]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getPulse()
        .then((data) => {
          if (!cancelled) {
            setItems(data.items);
            setError(false);
          }
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
    };
    load();
    const id = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <section
      ref={ref}
      id="pulse"
      className={`landing-section pulse-section ${inView ? 'in-view' : ''}`}
    >
      <div className="section-head pulse-head">
        <div>
          <p className="eyebrow">
            <span className="live-pulse" aria-hidden="true" />
            Research pulse
          </p>
          <h2>Recent runs.</h2>
          <p className="section-lede">
            Anonymized recent backtests. Sample rows show until real traffic arrives.
          </p>
        </div>
        <Link className="btn secondary" to="/playbook">
          Browse playbook
        </Link>
      </div>

      {error ? (
        <div className="banner error" style={{ marginTop: '1.25rem' }}>
          Couldn’t load the pulse. Retry in a moment.
        </div>
      ) : null}

      <div className="pulse-table" aria-live="polite">
        <div className="pulse-row pulse-head-row mono">
          <span>Strategy</span>
          <span>Return</span>
          <span>Sharpe</span>
          <span>Max DD</span>
          <span>When</span>
        </div>
        {(items.length ? items : Array.from({ length: 4 })).map((item, i) => {
          if (!items.length) {
            return (
              <div key={`sk-${i}`} className="pulse-row skeleton" style={{ ['--i' as string]: i }}>
                <span className="skeleton-line" style={{ width: '70%' }} />
                <span className="skeleton-line" style={{ width: '40%' }} />
                <span className="skeleton-line" style={{ width: '30%' }} />
                <span className="skeleton-line" style={{ width: '35%' }} />
                <span className="skeleton-line" style={{ width: '40%' }} />
              </div>
            );
          }
          const row = item as PulseItem;
          return (
            <div key={`${row.created_at}-${i}`} className="pulse-row" style={{ ['--i' as string]: i }}>
              <span className="pulse-strategy">
                <strong>{row.strategy}</strong>
                <small className="mono">
                  {row.sample ? 'sample · ' : ''}
                  {row.parser} · {row.dataset}
                </small>
              </span>
              <span className={(row.total_return ?? 0) >= 0 ? 'pos' : 'neg'}>
                {pct(row.total_return)}
              </span>
              <span className="mono">{row.sharpe_ratio?.toFixed(2) ?? '—'}</span>
              <span className="neg">{pct(row.max_drawdown)}</span>
              <span className="mono pulse-when">{relativeTime(row.created_at)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
