import { useEffect, useRef, useState } from 'react';
import { useCountUp } from '../hooks/useCountUp';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { getPublicStats, pingStats } from '../services/api';
import type { PublicStats } from '../types';

const FALLBACK: PublicStats = {
  users: 112,
  backtests: 525,
  releases: 3,
  users_live: 0,
  backtests_live: 0,
  updated_at: '',
};

const POLL_MS = 4000;

function formatStat(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function StatCell({
  value,
  label,
  suffix = '+',
  active,
  flash,
  reduced,
  delay,
}: {
  value: number;
  label: string;
  suffix?: string;
  active: boolean;
  flash: boolean;
  reduced: boolean;
  delay: number;
}) {
  const display = useCountUp(value, {
    active,
    duration: 900,
    reduced,
    fromCurrent: true,
  });

  return (
    <div
      className={`live-stat ${flash ? 'flash' : ''}`}
      style={{ ['--i' as string]: delay }}
    >
      <strong className="live-stat-value mono">
        <span className="count-up">{formatStat(display)}</span>
        <span className="live-stat-suffix">{suffix}</span>
      </strong>
      <span className="live-stat-label">{label}</span>
    </div>
  );
}

export function LiveStats() {
  const reduced = usePrefersReducedMotion();
  const [stats, setStats] = useState<PublicStats>(FALLBACK);
  const [ready, setReady] = useState(false);
  const [inView, setInView] = useState(reduced);
  const [flash, setFlash] = useState({ users: false, backtests: false, releases: false });
  const sectionRef = useRef<HTMLElement | null>(null);
  const prev = useRef<PublicStats | null>(null);

  useEffect(() => {
    if (reduced) {
      setInView(true);
      return;
    }
    const node = sectionRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { threshold: 0.25 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [reduced]);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const apply = (next: PublicStats) => {
      if (cancelled) return;
      const before = prev.current;
      if (before) {
        setFlash({
          users: next.users !== before.users,
          backtests: next.backtests !== before.backtests,
          releases: next.releases !== before.releases,
        });
        window.setTimeout(() => {
          if (!cancelled) setFlash({ users: false, backtests: false, releases: false });
        }, 900);
      }
      prev.current = next;
      setStats(next);
      setReady(true);
    };

    async function tick(first = false) {
      try {
        if (first) {
          await pingStats().catch(() => undefined);
        }
        const data = await getPublicStats();
        apply(data);
      } catch {
        if (first && !cancelled) {
          setReady(true);
        }
      }
    }

    tick(true);
    timer = window.setInterval(() => tick(false), POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') tick(false);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`landing-section live-stats-section ${inView ? 'in-view' : ''}`}
      aria-label="Live platform stats"
    >
      <div className="section-head">
        <p className="eyebrow">
          <span className="live-pulse" aria-hidden="true" />
          Live activity
        </p>
        <h2>Numbers that move when people test.</h2>
        <p className="section-lede">
          Baselines plus real visitors and backtests — counters refresh as the platform gets used.
        </p>
      </div>

      <div className="live-stats-board" aria-live="polite">
        <StatCell
          value={stats.users}
          label="пользователей"
          active={ready && inView}
          flash={flash.users}
          reduced={reduced}
          delay={0}
        />
        <StatCell
          value={stats.backtests}
          label="backtests"
          active={ready && inView}
          flash={flash.backtests}
          reduced={reduced}
          delay={1}
        />
        <StatCell
          value={stats.releases}
          label="releases"
          suffix=""
          active={ready && inView}
          flash={flash.releases}
          reduced={reduced}
          delay={2}
        />
      </div>
    </section>
  );
}
