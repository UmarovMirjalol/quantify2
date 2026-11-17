import { useEffect, useMemo, useState } from 'react';
import type { EquityPoint } from '../types';

/** Scrubbed race: strategy equity vs buy & hold, both rebased to 100. */
export function EquityRace({
  strategy,
  hold,
}: {
  strategy: EquityPoint[];
  hold: EquityPoint[];
}) {
  const series = useMemo(() => {
    const n = Math.min(strategy.length, hold.length);
    if (n < 2) return [] as { date: string; s: number; h: number }[];
    const s0 = strategy[0].equity || 1;
    const h0 = hold[0].equity || 1;
    const out: { date: string; s: number; h: number }[] = [];
    for (let i = 0; i < n; i++) {
      out.push({
        date: strategy[i].date,
        s: (strategy[i].equity / s0) * 100,
        h: (hold[i].equity / h0) * 100,
      });
    }
    return out;
  }, [strategy, hold]);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setIdx(Math.max(0, series.length - 1));
  }, [series.length]);

  useEffect(() => {
    if (!playing || series.length < 2) return;
    const id = window.setInterval(() => {
      setIdx((i) => {
        if (i >= series.length - 1) {
          setPlaying(false);
          return i;
        }
        return Math.min(series.length - 1, i + Math.max(1, Math.floor(series.length / 80)));
      });
    }, 60);
    return () => window.clearInterval(id);
  }, [playing, series.length]);

  if (series.length < 2) return null;

  const slice = series.slice(0, idx + 1);
  const w = 560;
  const h = 160;
  const pad = 8;
  const vals = slice.flatMap((p) => [p.s, p.h]);
  const min = Math.min(...vals, 100) * 0.98;
  const max = Math.max(...vals, 100) * 1.02;
  const span = max - min || 1;
  const x = (i: number) => pad + (i / Math.max(1, series.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const path = (key: 's' | 'h') =>
    slice.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');

  const last = slice[slice.length - 1];
  const ahead = last.s >= last.h;

  return (
    <section className="equity-race panel">
      <div className="equity-race__head">
        <div>
          <p className="eyebrow">Equity race</p>
          <h2>{ahead ? 'Strategy leading' : 'Buy & hold leading'}</h2>
        </div>
        <div className="btn-row">
          <button type="button" className="btn ghost small" onClick={() => { setPlaying(false); setIdx(0); }}>
            Reset
          </button>
          <button type="button" className={`btn ${playing ? 'secondary' : 'primary'} small`} onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pause' : 'Race'}
          </button>
        </div>
      </div>
      <svg className="equity-race__svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Strategy vs buy and hold">
        <path d={path('h')} fill="none" stroke="#8b93a1" strokeWidth="1.6" strokeDasharray="4 3" />
        <path d={path('s')} fill="none" stroke="#4fd6a0" strokeWidth="2" />
        <circle cx={x(slice.length - 1)} cy={y(last.s)} r="3.5" fill="#4fd6a0" />
        <circle cx={x(slice.length - 1)} cy={y(last.h)} r="3" fill="#8b93a1" />
      </svg>
      <input
        className="equity-race__scrub"
        type="range"
        min={1}
        max={series.length - 1}
        value={idx}
        onChange={(e) => {
          setPlaying(false);
          setIdx(Number(e.target.value));
        }}
      />
      <div className="equity-race__score mono">
        <span className="pos">Strategy {last.s.toFixed(1)}</span>
        <span className="hint">{last.date.slice(0, 10)}</span>
        <span>Hold {last.h.toFixed(1)}</span>
      </div>
    </section>
  );
}
