import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActivityPulse } from '../components/ActivityPulse';
import { DailyFact } from '../components/DailyFact';
import { HeroDepthCanvas } from '../components/HeroDepthCanvas';
import { InstantTry } from '../components/InstantTry';
import { LandingDemo } from '../components/LandingDemo';
import { LiveStats } from '../components/LiveStats';
import { MarketTicker } from '../components/MarketTicker';
import { ReleasesFaq } from '../components/ReleasesFaq';
import { StrategyGallery } from '../components/StrategyGallery';
import { LogoMark } from '../components/LogoMark';
import { StrategyOfTheDay } from '../components/StrategyOfTheDay';
import { useCountUp } from '../hooks/useCountUp';
import { usePageMeta } from '../hooks/usePageMeta';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const HeroScene3D = lazy(() =>
  import('../components/HeroScene3D').then((m) => ({ default: m.HeroScene3D })),
);

const ACCENT = '#4fd6a0';

const STRATEGY =
  'Buy SPY when the 20-day moving average crosses above the 50-day. Exit when RSI exceeds 70.';

const EQUITY_PATH =
  'M0 118 L38 110 L76 114 L114 92 L152 98 L190 74 L228 82 L266 58 L304 64 L342 40 L380 46 L418 26 L460 16';

const TOOLS = [
  {
    to: '/check',
    title: 'Guru check',
    body: 'Saw a “90% win rate” strategy on TikTok? Paste it and see if it really made money.',
    cta: 'Check a strategy',
    icon: 'M9 12l2 2 4-4M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  },
  {
    to: '/leaderboard',
    title: 'Leaderboard',
    body: 'Famous strategies ranked on real prices of the S&P 500, Nasdaq, Nvidia and Bitcoin.',
    cta: 'See who wins',
    icon: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3',
  },
  {
    to: '/whatif',
    title: 'What if I had bought…',
    body: 'What $1,000 in Apple, Tesla or Bitcoin ten years ago would be worth today.',
    cta: 'Run the numbers',
    icon: 'M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.8c0 4.9 10 2.6 10 7.6 0 2.3-2.2 3.6-5 3.6s-5-1.2-5-3.2',
  },
] as const;

const CHECKS = [
  { k: 'Holdout', d: 'Rerun on the last 30% of history the rules never saw.' },
  { k: 'Walk-forward', d: 'Re-tune on the past only, then score the next slice. Repeat.' },
  { k: 'Monte Carlo', d: 'Shuffle the trade order 1,000 times. How bad can the path get?' },
  { k: 'Synthetic markets', d: '100 alternate price histories. Does the edge survive them?' },
  { k: 'Deflated Sharpe', d: 'Discounts the score for every variant you already tried.' },
  { k: 'Cost break-even', d: 'The fee level at which the profit disappears.' },
  { k: 'Parameter heatmap', d: 'Stable plateau or one lucky setting?' },
  { k: 'Market regimes', d: 'Did it earn in rising and falling markets, or only one?' },
  { k: 'Alpha vs holding', d: 'What is left after paying for plain market exposure.' },
] as const;

const CAPABILITIES = [
  {
    title: 'Complex rules in plain words',
    body: '“RSI below 30 and (MACD crosses up or price drops 4% in a day)”. Every rule is shown back to you before the run.',
  },
  {
    title: '5-minute to weekly bars',
    body: 'Intraday and daily data, plus higher-timeframe filters like “15m entries, 4h trend”.',
  },
  {
    title: 'Portfolios and screeners',
    body: 'One rule on a basket of up to 12 assets, or scan 40 tickers at once.',
  },
  {
    title: 'Python when words are not enough',
    body: 'Any logic and dynamic sizing in code, with a guard against peeking at future bars.',
  },
  {
    title: 'Shorts, exits and funding',
    body: 'Real shorts, trailing stops, partial exits, scaling in, and a yearly holding cost for perpetuals or margin.',
  },
  {
    title: 'Every trade explained',
    body: 'Each trade says which rule fired and the indicator values at that moment.',
  },
] as const;

const COMPARE = {
  cols: ['Quantify', 'TradingView (Pine)', 'QuantConnect / vectorbt'],
  rows: [
    ['How you describe a strategy', 'Plain English or Python', 'Pine Script code', 'Python or C# code'],
    ['Price', 'Free, no signup', 'Free tier, paid plans for more', 'Free tier or open source, paid compute and Pro'],
    ['Data', 'Bars from 5 minutes to weekly', 'Bars, tick-level replay on paid plans', 'Tick, quote and order-book data'],
    ['Overfitting tests built in', '9, run on every result', 'None', 'You write them yourself'],
    ['Compared with buy & hold', 'First thing you see', 'One number in the report', 'Benchmark chart'],
    ['Many assets at once', 'Up to 12 per portfolio', 'One symbol per strategy', 'Hundreds'],
    ['Live trading', 'No: signals and forward tests', 'Alerts to brokers', 'Yes, many brokers'],
    ['Best for', 'Checking an idea before risking money', 'Charting and most retail traders', 'Professional algo developers'],
  ],
} as const;

const FLOW = ['NL', 'Spec', 'Sim', 'Results'] as const;
const INTERP = [
  { label: 'Entry', value: 'SMA(20) × SMA(50)' },
  { label: 'Exit', value: 'RSI > 70' },
  { label: 'Universe', value: 'SPY' },
  { label: 'Size', value: '100% of capital' },
] as const;

type Phase = 'boot' | 'type' | 'parse' | 'spec' | 'sim' | 'results' | 'hold';

function phaseIndex(phase: Phase): number {
  switch (phase) {
    case 'boot':
    case 'type':
      return -1;
    case 'parse':
      return 0;
    case 'spec':
      return 1;
    case 'sim':
      return 2;
    case 'results':
    case 'hold':
      return 3;
  }
}

function useInView<T extends HTMLElement>(reduced: boolean) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(reduced);
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
      { threshold: 0.2 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [reduced]);
  return { ref, inView };
}

export function LandingPage() {
  usePageMeta(
    'Quantify — Free Strategy Backtester',
    'Type a trading idea in plain English. Get a look-ahead-safe backtest with next-open fills, costs, Sharpe, and a full trade blotter. Free. No signup.',
  );
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduced ? 'hold' : 'boot');
  const [typed, setTyped] = useState(reduced ? STRATEGY : '');
  const [cycle, setCycle] = useState(0);
  const [showChart, setShowChart] = useState(reduced);
  const [interpVisible, setInterpVisible] = useState(reduced ? 4 : 0);
  const stageRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, gx: 50, gy: 40 });
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);
  const exec = useInView<HTMLElement>(reduced);
  const invariants = useInView<HTMLElement>(reduced);

  const flowActive = phaseIndex(phase);
  const kpiActive = phase === 'results' || phase === 'hold';
  const ret = useCountUp(12.4, { active: kpiActive, decimals: 1, duration: 1100, reduced });
  const trades = useCountUp(48, { active: kpiActive, duration: 1000, reduced });
  const win = useCountUp(56, { active: kpiActive, duration: 1050, reduced });
  const headerRet = useCountUp(12.4, {
    active: showChart,
    decimals: 2,
    duration: 1400,
    reduced,
  });

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    async function run() {
      while (!cancelled) {
        setCycle((c) => c + 1);
        setPhase('boot');
        setTyped('');
        setShowChart(false);
        setInterpVisible(0);
        await wait(380);
        setPhase('type');
        for (let i = 1; i <= STRATEGY.length; i++) {
          if (cancelled) return;
          setTyped(STRATEGY.slice(0, i));
          await wait(i < 12 ? 26 : 13);
        }
        await wait(320);
        setPhase('parse');
        await wait(620);
        setPhase('spec');
        for (let i = 1; i <= INTERP.length; i++) {
          if (cancelled) return;
          setInterpVisible(i);
          await wait(150);
        }
        await wait(420);
        setPhase('sim');
        setShowChart(true);
        await wait(2100);
        setPhase('results');
        await wait(1400);
        setPhase('hold');
        await wait(2800);
      }
    }

    run();
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const el = stageRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const px = nx - 0.5;
      const py = ny - 0.5;
      setTilt({
        x: py * -5,
        y: px * 7,
        gx: nx * 100,
        gy: ny * 100,
      });
    };
    const onLeave = () => setTilt({ x: 0, y: 0, gx: 50, gy: 40 });
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [reduced]);

  return (
    <div className="landing">
      <div className="landing-motion" aria-hidden="true">
        <HeroDepthCanvas />
        <span className="motion-grid" />
      </div>

      <header className="landing-nav">
        <Link to="/" className="brand" style={{ padding: 0 }}>
          <span className="brand-mark brand-mark-lg" aria-hidden="true">
            <img src="/logo.svg" width={28} height={28} alt="" />
          </span>
          <span className="brand-text">
            <span className="brand-name">Quantify</span>
            <span className="brand-tag">Quant research</span>
          </span>
        </Link>
        <button
          type="button"
          className="btn ghost landing-menu-btn"
          aria-expanded={navOpen}
          aria-controls="landing-links"
          onClick={() => setNavOpen((v) => !v)}
        >
          {navOpen ? 'Close' : 'Menu'}
        </button>
        <div id="landing-links" className={`nav-links${navOpen ? ' open' : ''}`} onClick={() => setNavOpen(false)}>
          <a className="btn ghost" href="#try">
            Try it
          </a>
          <Link className="btn ghost" to="/check">
            Guru check
          </Link>
          <Link className="btn ghost" to="/leaderboard">
            Leaderboard
          </Link>
          <Link className="btn ghost" to="/whatif">
            What if…
          </Link>
          <Link className="btn ghost" to="/playbook">
            Playbook
          </Link>
          <Link className="btn ghost" to="/guide">
            Guide
          </Link>
          <Link className="btn primary" to="/app">
            Open workspace
          </Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <Link to="/leaderboard" className="hero-pill reveal" style={{ ['--d' as string]: '0ms' }}>
            <b>New</b>
            Most famous strategies lose to buy &amp; hold. See the leaderboard
            <span aria-hidden="true">→</span>
          </Link>
          <h1 className="reveal" style={{ ['--d' as string]: '90ms' }}>
            Does your trading strategy <em>actually work?</em>
          </h1>
          <p className="lede reveal" style={{ ['--d' as string]: '160ms' }}>
            Describe it in plain English. We test it on 10 years of real prices, with real fees, and show
            whether it beats simply buying and holding.
          </p>
          <div className="hero-actions reveal" style={{ ['--d' as string]: '230ms' }}>
            <a className="btn primary" href="#try">
              Test a strategy free
            </a>
            <Link className="btn secondary" to="/check">
              Check a guru’s claim
            </Link>
          </div>
          <ul className="hero-trust reveal" style={{ ['--d' as string]: '300ms' }}>
            <li>Stocks, crypto, forex</li>
            <li>Fees included</li>
            <li>No signup</li>
          </ul>
        </div>

        <div className="hero-stage reveal" style={{ ['--d' as string]: '140ms' }} ref={stageRef}>
          <Suspense fallback={null}>
            <HeroScene3D />
          </Suspense>
          <div className="hero-stage-scene" aria-hidden="true">
            <span className="hero-floor" />
            <span className="hero-floor-glow" />
            <span className="hero-pillar hero-pillar-a" />
            <span className="hero-pillar hero-pillar-b" />
          </div>
          <div className="hero-stage-float">
            <div
              className="product-ghost-shell"
              aria-hidden="true"
              style={
                reduced
                  ? undefined
                  : {
                      transform: `perspective(1400px) rotateX(${tilt.x * 0.5}deg) rotateY(${tilt.y * 0.5 - 6}deg) translateZ(-36px) translateX(20px) scale(0.96)`,
                    }
              }
            />
            <div
              className={`product-frame glass-3d phase-${phase}`}
              style={
                reduced
                  ? undefined
                  : {
                      transform: `perspective(1400px) rotateX(${tilt.x * 0.7}deg) rotateY(${tilt.y * 0.7}deg) translateZ(24px)`,
                      ['--glare-x' as string]: `${tilt.gx}%`,
                      ['--glare-y' as string]: `${tilt.gy}%`,
                    }
              }
            >
              <span className="glass-specular" aria-hidden="true" />
              <span className="glass-edge" aria-hidden="true" />
              <div className="product-top">
                <span className="product-brand">
                  <LogoMark size={14} />
                  quantify · workspace
                </span>
                <span className="product-live">
                  <i />
                  {phase === 'sim'
                    ? 'simulating'
                    : phase === 'parse' || phase === 'spec'
                      ? 'parsing'
                      : phase === 'results' || phase === 'hold'
                        ? 'complete'
                        : 'idle'}
                </span>
              </div>

              <div className="product-grid">
                <div className="product-main">
                  <div className={`product-prompt ${phase === 'type' ? 'typing' : ''}`}>
                    <span>Strategy</span>
                    <p className="prompt-type">
                      {typed}
                      {(phase === 'type' || phase === 'boot') && <i className="caret" />}
                    </p>
                  </div>

                  <div className="product-flow" aria-hidden="true">
                    {FLOW.map((step, i) => (
                      <span key={step} className="flow-cluster">
                        {i > 0 ? (
                          <span
                            className={`flow-arrow ${flowActive >= i ? 'on' : ''} ${flowActive === i ? 'passing' : ''}`}
                          >
                            →
                          </span>
                        ) : null}
                        <span
                          className={`flow-step ${flowActive >= i ? 'on' : ''} ${flowActive === i ? 'current' : ''}`}
                        >
                          {step}
                        </span>
                      </span>
                    ))}
                  </div>

                  <div className={`product-chart ${showChart ? 'drawn' : 'idle'}`}>
                    <header>
                      <div>
                        <small>Equity curve</small>
                        <strong className="count-up">
                          {showChart ? `+${headerRet.toFixed(2)}%` : '—'}
                        </strong>
                      </div>
                      <div className="product-meta mono">
                        <span className={`meta-tick ${showChart ? 'on' : ''}`}>Sharpe 1.38</span>
                        <span className={`meta-tick ${showChart ? 'on' : ''}`}>DD −8.2%</span>
                      </div>
                    </header>
                    <svg key={cycle} viewBox="0 0 460 150" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
                          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
                        </linearGradient>
                        <filter id="eqGlow" x="-20%" y="-40%" width="140%" height="180%">
                          <feGaussianBlur stdDeviation="2.2" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      <g className="chart-grid">
                        <line x1="0" y1="37" x2="460" y2="37" />
                        <line x1="0" y1="75" x2="460" y2="75" />
                        <line x1="0" y1="112" x2="460" y2="112" />
                      </g>
                      {showChart ? (
                        <>
                          <path className="fill" d={`${EQUITY_PATH} L460 150 L0 150 Z`} />
                          <path className="line line-glow" d={EQUITY_PATH} filter="url(#eqGlow)" />
                          <path className="line" id={`equityLine-${cycle}`} d={EQUITY_PATH} />
                          <circle className="chart-dot" r="4.5" fill={ACCENT}>
                            <animateMotion dur="5.5s" repeatCount="indefinite" rotate="auto">
                              <mpath href={`#equityLine-${cycle}`} />
                            </animateMotion>
                          </circle>
                        </>
                      ) : (
                        <g className="chart-waiting">
                          <line x1="20" y1="120" x2="440" y2="120" />
                          <text x="230" y="78" textAnchor="middle">
                            waiting for simulation…
                          </text>
                        </g>
                      )}
                    </svg>
                  </div>
                </div>

                <aside className="product-side">
                  <div className="side-block">
                    <small>Interpretation</small>
                    {INTERP.map((row, i) => (
                      <div
                        key={row.label}
                        className={`side-row ${interpVisible > i ? 'in' : ''}`}
                        style={{ ['--i' as string]: i }}
                      >
                        <span>{row.label}</span>
                        <span>{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="side-kpis">
                    <div className={kpiActive ? 'in' : ''} style={{ ['--i' as string]: 0 }}>
                      <small>Return</small>
                      <strong className="pos">+{ret.toFixed(1)}%</strong>
                    </div>
                    <div className={kpiActive ? 'in' : ''} style={{ ['--i' as string]: 1 }}>
                      <small>Trades</small>
                      <strong>{Math.round(trades)}</strong>
                    </div>
                    <div className={kpiActive ? 'in' : ''} style={{ ['--i' as string]: 2 }}>
                      <small>Win rate</small>
                      <strong>{Math.round(win)}%</strong>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketTicker />

      <InstantTry />

      <section className="landing-section tools-trio in-view">
        <div className="section-head">
          <p className="eyebrow">Free tools</p>
          <h2>Three ways to stop guessing.</h2>
        </div>
        <div className="tools-trio-grid">
          {TOOLS.map((t, i) => (
            <Link key={t.to} to={t.to} className="tool-card" style={{ ['--i' as string]: i }}>
              <span className="tool-card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={t.icon} />
                </svg>
              </span>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
              <span className="tool-card-cta">
                {t.cta} <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="landing-section lab-section in-view" id="lab">
        <div className="section-head">
          <p className="eyebrow">Overfitting lab</p>
          <h2>9 tests every result has to survive.</h2>
          <p className="section-lede">
            A pretty equity curve proves nothing: with enough tries, any rule fits the past. After every backtest
            Quantify attacks the result and grades it from 0 to 100. Most tools leave this part to you.
          </p>
        </div>
        <ol className="lab-grid">
          {CHECKS.map((c, i) => (
            <li key={c.k} style={{ ['--i' as string]: i }}>
              <span className="lab-num mono">{String(i + 1).padStart(2, '0')}</span>
              <strong>{c.k}</strong>
              <span>{c.d}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section caps-section in-view">
        <div className="section-head">
          <p className="eyebrow">Not just simple rules</p>
          <h2>Starts in plain English. Goes further when you need it.</h2>
        </div>
        <div className="caps-grid">
          {CAPABILITIES.map((c) => (
            <article key={c.title}>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section compare-section in-view" id="compare">
        <div className="section-head">
          <p className="eyebrow">Honest comparison</p>
          <h2>Where Quantify fits.</h2>
          <p className="section-lede">
            Quantify is not a replacement for a professional quant platform. It is the fastest way to find out whether
            an idea is worth more of your time and money.
          </p>
        </div>
        <div className="table-wrap compare-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th />
                {COMPARE.cols.map((c, i) => (
                  <th key={c} className={i === 0 ? 'ours' : ''}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE.rows.map(([label, ...cells]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {cells.map((cell, i) => (
                    <td key={i} className={i === 0 ? 'ours' : ''}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint compare-note">
          Missing on purpose: tick and order-book data, live order routing. If you need those, use QuantConnect. Use
          Quantify first to decide which ideas deserve it.
        </p>
      </section>

      <LandingDemo />

      <StrategyGallery />

      <LiveStats />

      <DailyFact />

      <StrategyOfTheDay />

      <ActivityPulse />

      <section
        className={`landing-section exec-section ${exec.inView ? 'in-view' : ''}`}
        ref={exec.ref}
      >
        <div className="section-head">
          <p className="eyebrow">Execution model</p>
          <h2>How fills are timed.</h2>
          <p className="section-lede">
            Signals form on the close. Orders fill on the next open. Commission and slippage are
            deducted before equity updates.
          </p>
        </div>

        <ol className="exec-timeline">
          {[
            {
              t: 'T · Close',
              title: 'Signal forms',
              body: 'Indicators settle on the closing bar. No future candles enter the decision.',
            },
            {
              t: 'T+1 · Open',
              title: 'Order executes',
              body: 'The position opens or closes at the next session open.',
            },
            {
              t: 'Fill',
              title: 'Costs applied',
              body: 'Commission and slippage are applied on every trade before PnL.',
            },
            {
              t: 'Ledger',
              title: 'Metrics recorded',
              body: 'Sharpe, drawdown, win rate, and the blotter come from that same simulation.',
            },
          ].map((step, i) => (
            <li key={step.t} style={{ ['--i' as string]: i }}>
              <span className="exec-time mono">{step.t}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className={`landing-section invariants-section ${invariants.inView ? 'in-view' : ''}`}
        ref={invariants.ref}
      >
        <div className="section-head">
          <p className="eyebrow">Engine rules</p>
          <h2>What the simulator will not do.</h2>
        </div>
        <div className="invariant-grid">
          {[
            {
              bad: 'Peeking at the future',
              good: 'Every rule and Python strategy only sees bars up to the signal.',
            },
            {
              bad: 'Same-bar fills',
              good: 'Signal at close, execute next open.',
            },
            {
              bad: 'Zero-cost backtests',
              good: 'Commission and slippage deducted on every fill.',
            },
            {
              bad: 'Opaque results',
              good: 'Parsed JSON spec + full trade blotter for every run.',
            },
          ].map((item, i) => (
            <article key={item.bad} style={{ ['--i' as string]: i }}>
              <p className="invariant-bad mono">✕ {item.bad}</p>
              <p className="invariant-good">→ {item.good}</p>
            </article>
          ))}
        </div>
      </section>

      <ReleasesFaq />

      <section className="landing-section seo-copy in-view">
        <div className="section-head">
          <p className="eyebrow">Free backtesting</p>
          <h2>SMA, RSI, MACD, Bollinger — no API key.</h2>
          <p className="section-lede">
            Quantify is a free trading strategy backtester. Start from the playbook or the guide,
            then run a simulation in the workspace.
          </p>
        </div>
        <div className="seo-links">
          <Link to="/guide">How to backtest →</Link>
          <Link to="/playbook">Strategy playbook →</Link>
          <Link to="/research">Study: do backtest winners keep winning? →</Link>
          <Link to="/about">About →</Link>
        </div>
      </section>

      <section className="landing-section final-cta in-view">
        <h2>Got a strategy in your head? Find out in 30 seconds.</h2>
        <div className="landing-cta-row">
          <a className="btn primary" href="#try">
            Test it free
          </a>
          <Link className="btn secondary" to="/leaderboard">
            See the leaderboard
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-brand">
          <span className="brand-mark" aria-hidden="true">
            <img src="/logo.svg" width={22} height={22} alt="" />
          </span>
          <div>
            <strong>Quantify</strong>
            <p>Free strategy backtester. Research output, not investment advice.</p>
          </div>
        </div>
        <nav className="footer-cols" aria-label="Footer">
          <div>
            <h4>Tools</h4>
            <Link to="/app">Workspace</Link>
            <Link to="/check">Guru check</Link>
            <Link to="/leaderboard">Leaderboard</Link>
            <Link to="/whatif">What if…</Link>
          </div>
          <div>
            <h4>Learn</h4>
            <Link to="/guide">Guide</Link>
            <Link to="/playbook">Playbook</Link>
            <Link to="/research">Research</Link>
            <Link to="/about">About</Link>
          </div>
        </nav>
        <p className="footer-fine mono">Signal at close → fill at next open · fees on every trade · Est. 2025</p>
      </footer>
    </div>
  );
}
