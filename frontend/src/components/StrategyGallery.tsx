import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { getPlaybook } from '../services/api';
import type { PlaybookItem } from '../types';

const FALLBACK: PlaybookItem[] = [
  {
    id: 'sma-cross',
    title: 'SMA crossover',
    tag: 'Trend',
    blurb: 'Classic 20/50 moving-average cross with RSI take-profit.',
    text: 'Buy SPY when the 20-day moving average crosses above the 50-day.',
    indicators: ['SMA', 'RSI'],
  },
  {
    id: 'rsi-reversion',
    title: 'RSI mean reversion',
    tag: 'Mean reversion',
    blurb: 'Buy oversold, sell overbought — simple threshold rules.',
    text: 'Buy when RSI falls below 30 and sell when RSI rises above 70.',
    indicators: ['RSI'],
  },
  {
    id: 'ema-stops',
    title: 'EMA trend + stops',
    tag: 'Trend',
    blurb: '12/26 EMA cross with hard stop-loss and take-profit.',
    text: 'Buy when the 12-day EMA crosses above the 26-day EMA.',
    indicators: ['EMA', 'Stop'],
  },
];

export function StrategyGallery() {
  const reduced = usePrefersReducedMotion();
  const [items, setItems] = useState<PlaybookItem[]>(FALLBACK);
  const [inView, setInView] = useState(reduced);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    getPlaybook()
      .then((data) => {
        if (data.items?.length) setItems(data.items);
      })
      .catch(() => undefined);
  }, []);

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

  return (
    <section
      ref={ref}
      id="playbook"
      className={`landing-section gallery-section ${inView ? 'in-view' : ''}`}
    >
      <div className="section-head">
        <p className="eyebrow">Strategy playbook</p>
        <h2>Ready-made strategy presets.</h2>
        <p className="section-lede">
          Open one in the workspace and run it against sample or uploaded data.
        </p>
      </div>

      <div className="gallery-grid">
        {items.map((item, i) => (
          <article key={item.id} style={{ ['--i' as string]: i }}>
            <div className="gallery-meta">
              <span className="gallery-tag mono">{item.tag}</span>
              <span className="gallery-inds mono">{item.indicators.join(' · ')}</span>
            </div>
            <h3>{item.title}</h3>
            <p>{item.blurb}</p>
            <Link className="btn secondary small" to={`/app?strategy=${encodeURIComponent(item.id)}`}>
              Run in workspace
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
