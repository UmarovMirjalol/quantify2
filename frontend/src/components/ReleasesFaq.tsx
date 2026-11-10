import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const CAPABILITIES = [
  {
    title: 'Research core',
    body: 'Plain-English strategies, look-ahead-safe engine, risk sizing, full metrics and saved history.',
  },
  {
    title: 'Indicators & data',
    body: 'SMA, EMA, RSI, MACD, Bollinger, Stochastic, ADX/DMI, Donchian breakouts, VWAP, OBV, candlestick patterns, on up to 30+ years of daily bars.',
  },
  {
    title: 'Signal today',
    body: 'Every run ends with what the rules say now: flat or in a position, entry, open P&L, and the order for the next open.',
  },
  {
    title: 'Overfitting checks',
    body: 'Holdout, walk-forward, synthetic markets, Deflated Sharpe, cost break-even and Monte Carlo graded into one verdict.',
  },
  {
    title: 'Position management',
    body: 'Trailing stop, partial take-profits, stop to breakeven, pyramiding, long or short.',
  },
  {
    title: 'Python strategies',
    body: 'Any logic and dynamic sizing in code, sandboxed, with a look-ahead guard on every run.',
  },
  {
    title: 'Portfolio & optimizer',
    body: 'One rule on a basket of assets, and a parameter search judged only on data it never saw.',
  },
  {
    title: 'Exports',
    body: 'TradingView Pine Script v5, a standalone Python file that reproduces every trade, CSV and JSON.',
  },
  {
    title: 'Accounts & sharing',
    body: 'Optional sign-in so history follows you, public report links, PDF and side-by-side comparison.',
  },
  {
    title: 'Open and self-hostable',
    body: 'MIT-licensed. Run the whole stack yourself with one Docker Compose command.',
  },
];

const FAQ = [
  {
    q: 'Do I need an API key?',
    a: 'No. The built-in parser runs offline. Add an OpenAI-compatible key only if you want broader natural-language coverage.',
  },
  {
    q: 'Where does the market data come from?',
    a: 'One-click tickers load daily bars from Yahoo Finance (1, 5 or 10 years, or the full listing history; 10 years by default), with Binance as a fallback for crypto. Prices are split-adjusted; dividends are not added, so the strategy and the buy-and-hold benchmark are compared on the same price series. For longer or institutional-grade history, upload your own CSV.',
  },
  {
    q: 'How do you make sure the data is clean?',
    a: 'Every dataset is validated before a backtest: unparseable dates, duplicate bars, missing or non-numeric values, zero or negative prices and negative volume are rejected with the exact rows named. Bars where high/low contradict open/close are flagged, unsorted data is sorted, and duplicates are never silently averaged.',
  },
  {
    q: 'What should my CSV look like?',
    a: 'Columns date, open, high, low, close, volume — one row per bar, oldest to newest, in one timezone. Use split-adjusted prices, keep halted or missing days out rather than filling them with copies of the previous bar, and include delisted symbols if you test a universe, otherwise survivorship bias inflates results.',
  },
  {
    q: 'Is the sample data real market data?',
    a: 'No — sample_data.csv is synthetic, for demos and tests. Use a live ticker or your own CSV for research.',
  },
  {
    q: 'How do you avoid look-ahead bias?',
    a: 'Signals form on the close; fills execute on the next open. Indicators only use past bars, Python code is rerun on cut-off history to catch peeking, and commission and slippage hit every trade before equity updates.',
  },
  {
    q: 'Who can see my runs?',
    a: 'Only you. History is tied to your browser, or to your account if you sign in. Public report links are created only when you share a run, and the public pulse shows anonymized strategy snippets.',
  },
] as const;

export function ReleasesFaq() {
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(0);
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
      { threshold: 0.12 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <section
      ref={ref}
      id="releases"
      className={`landing-section releases-faq-section ${inView ? 'in-view' : ''}`}
    >
      <div className="releases-faq-grid">
        <div>
          <div className="section-head">
            <p className="eyebrow">Platform</p>
            <h2>What's inside.</h2>
            <p className="section-lede">Everything below is free, in the browser, with no API key.</p>
          </div>
          <ol className="release-list">
            {CAPABILITIES.map((r, i) => (
              <li key={r.title} style={{ ['--i' as string]: i }}>
                <span className="release-ver mono">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{r.title}</h3>
                  <p>{r.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <div className="section-head">
            <p className="eyebrow">FAQ</p>
            <h2>Common questions.</h2>
          </div>
          <div className="faq-list">
            {FAQ.map((item, i) => {
              const isOpen = open === i;
              return (
                <div key={item.q} className={`faq-item ${isOpen ? 'open' : ''}`} style={{ ['--i' as string]: i }}>
                  <button
                    type="button"
                    className="faq-q"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                  >
                    <span>{item.q}</span>
                    <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen ? <p className="faq-a">{item.a}</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
