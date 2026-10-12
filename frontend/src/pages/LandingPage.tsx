import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActivityPulse } from '../components/ActivityPulse';
import { DailyFact } from '../components/DailyFact';
import { InstantTry } from '../components/InstantTry';
import { LandingDemo } from '../components/LandingDemo';
import { LiveStats } from '../components/LiveStats';
import { ReleasesFaq } from '../components/ReleasesFaq';
import { StrategyGallery } from '../components/StrategyGallery';
import { StrategyOfTheDay } from '../components/StrategyOfTheDay';
import { useCountUp } from '../hooks/useCountUp';
import { usePageMeta } from '../hooks/usePageMeta';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const ACCENT = '#4fd6a0';

const STRATEGY =
  'Buy SPY when the 20-day moving average crosses above the 50-day. Risk 1% per trade; exit when RSI exceeds 70.';

const EQUITY_PATH =
  'M0 118 L38 110 L76 114 L114 92 L152 98 L190 74 L228 82 L266 58 L304 64 L342 40 L380 46 L418 26 L460 16';

const FLOW = ['NL', 'Spec', 'Sim', 'Results'] as const;
const INTERP = [
  { label: 'Entry', value: 'SMA(20) × SMA(50)' },
  { label: 'Exit', value: 'RSI > 70' },
  { label: 'Universe', value: 'SPY' },
  { label: 'Risk', value: '1.00% / trade' },
] as const;

type Phase = 'boot' | 'type' | 'parse' | 'spec' | 'sim' | 'results' | 'hold';

const LogoMark = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 12 L5.5 5 L9 9.5 L14 3"
      stroke={ACCENT}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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
    'Quantify — Free Trading Strategy Backtester (No API Key)',
    'Free online backtesting for SMA, EMA, RSI, MACD and Bollinger strategies. No signup, no API key, look-ahead-safe fills.',
  );
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduced ? 'hold' : 'boot');
  const [typed, setTyped] = useState(reduced ? STRATEGY : '');
  const [cycle, setCycle] = useState(0);
  const [showChart, setShowChart] = useState(reduced);
  const [interpVisible, setInterpVisible] = useState(reduced ? 4 : 0);
  const stageRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const exec = useInView<HTMLElement>(reduced);
  const invariants = useInView<HTMLElement>(reduced);
  const metrics = useInView<HTMLElement>(reduced);

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
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      setTilt({ x: py * -5, y: px * 7 });
    };
    const onLeave = () => setTilt({ x: 0, y: 0 });
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
        <span className="motion-grid" />
        <span className="beam beam-a" />
        <span className="beam beam-b" />
        <span className="orbit orbit-a" />
        <span className="orbit orbit-b" />
        <span className="orbit-dot" />
        <span className="scanline" />
        <span className="mote mote-a" />
        <span className="mote mote-b" />
        <span className="mote mote-c" />
        <span className="mote mote-d" />
        <span className="mote mote-e" />
        <span className="mote mote-f" />
        <span className="mote mote-g" />
        <span className="spark spark-a" />
        <span className="spark spark-b" />
        <span className="spark spark-c" />
      </div>

      <header className="landing-nav">
        <Link to="/" className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">
            <LogoMark />
          </span>
          <span className="brand-text">
            <span className="brand-name">Quantify</span>
            <span className="brand-tag">Quant research</span>
          </span>
        </Link>
        <div className="nav-links">
          <a className="btn ghost" href="#demo">
            Demo
          </a>
          <a className="btn ghost" href="#playbook">
            Playbook
          </a>
          <a className="btn ghost" href="#try">
            Try free
          </a>
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
          <p className="wordmark reveal" style={{ ['--d' as string]: '0ms' }}>
            Quantify
          </p>
          <h1 className="reveal" style={{ ['--d' as string]: '90ms' }}>
            Turn trading ideas into backtests.
          </h1>
          <p className="lede reveal" style={{ ['--d' as string]: '160ms' }}>
            Free to test — no signup, no API key. Plain-English strategies become look-ahead-safe
            simulations with institutional metrics.
          </p>
          <div className="hero-actions reveal" style={{ ['--d' as string]: '230ms' }}>
            <Link className="btn primary" to="/app">
              Start a backtest
            </Link>
            <a className="btn secondary" href="#demo">
              Watch the demo
            </a>
          </div>
          <p className="hero-note mono reveal" style={{ ['--d' as string]: '300ms' }}>
            Free public testing · Signal at close → execute next open
          </p>
        </div>

        <div className="hero-stage reveal" style={{ ['--d' as string]: '140ms' }} ref={stageRef}>
          <div className="hero-stage-float">
            <div
              className={`product-frame phase-${phase}`}
              style={
                reduced
                  ? undefined
                  : { transform: `perspective(1200px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }
              }
            >
              <div className="product-top">
                <span className="product-brand">
                  <LogoMark size={12} />
                  quantify · workspace
                </span>
                <span className="product-live">
                  <i />
                  {phase === 'sim'
                    ? 'simulating'
                    : phase === 'parse' || phase === 'spec'
                      ? 'parsing'
                      : 'live'}
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

      <LandingDemo />

      <DailyFact />

      <StrategyOfTheDay />

      <InstantTry />

      <LiveStats />

      <StrategyGallery />

      <ActivityPulse />

      <section
        className={`landing-section exec-section ${exec.inView ? 'in-view' : ''}`}
        ref={exec.ref}
      >
        <div className="section-head">
          <p className="eyebrow">Execution model</p>
          <h2>Look-ahead bias dies here.</h2>
          <p className="section-lede">
            Every fill follows the same convention researchers actually trust: decide on the close,
            trade on the next open, then charge costs on the fill.
          </p>
        </div>

        <ol className="exec-timeline">
          {[
            {
              t: 'T · Close',
              title: 'Signal forms',
              body: 'Indicators settle on the closing bar. No future candles leak into the decision.',
            },
            {
              t: 'T+1 · Open',
              title: 'Order executes',
              body: 'Position opens or closes at the next session open — the earliest realistic fill.',
            },
            {
              t: 'Fill',
              title: 'Costs applied',
              body: 'Commission and slippage hit every trade before equity updates. No free lunch.',
            },
            {
              t: 'Ledger',
              title: 'Metrics locked',
              body: 'Sharpe, drawdown, win rate, and the trade blotter come from that simulation — not a sketch.',
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
          <p className="eyebrow">Engine invariants</p>
          <h2>What Quantify refuses to do.</h2>
        </div>
        <div className="invariant-grid">
          {[
            {
              bad: 'Arbitrary code execution',
              good: 'Validated strategy specs only — SMA, EMA, RSI, Bollinger, risk rules.',
            },
            {
              bad: 'Same-bar fantasy fills',
              good: 'Signal at close, execute next open. Hard-wired.',
            },
            {
              bad: 'Zero-cost backtests',
              good: 'Commission + slippage deducted on every fill before PnL.',
            },
            {
              bad: 'Chat-shaped research',
              good: 'Workspace → interpretation → simulation → institutional results.',
            },
          ].map((item, i) => (
            <article key={item.bad} style={{ ['--i' as string]: i }}>
              <p className="invariant-bad mono">✕ {item.bad}</p>
              <p className="invariant-good">→ {item.good}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className={`landing-section metrics-section ${metrics.inView ? 'in-view' : ''}`}
        ref={metrics.ref}
      >
        <div className="section-head">
          <p className="eyebrow">Output surface</p>
          <h2>Institutional readout, not vanity charts.</h2>
          <p className="section-lede">
            After a run you get the same family of numbers a desk expects — equity, risk, trades,
            and the parsed specification you can audit.
          </p>
        </div>
        <div className="metric-board">
          {[
            { k: 'Total return / CAGR', d: 'Compounded path from simulated capital' },
            { k: 'Sharpe / Sortino', d: 'Risk-adjusted return with downside focus' },
            { k: 'Max drawdown', d: 'Peak-to-trough pain on the equity curve' },
            { k: 'Win rate / profit factor', d: 'Trade quality, not just direction' },
            { k: 'Trade ledger', d: 'Every fill with side, price, and PnL' },
            { k: 'Parsed JSON spec', d: 'Audit what the engine actually ran' },
          ].map((m, i) => (
            <div key={m.k} style={{ ['--i' as string]: i }}>
              <strong>{m.k}</strong>
              <span>{m.d}</span>
            </div>
          ))}
        </div>
        <div className="landing-cta-row">
          <Link className="btn primary" to="/app">
            Open research workspace
          </Link>
          <Link className="btn secondary" to="/playbook">
            Open strategy playbook
          </Link>
          <a className="btn ghost" href="#demo">
            Replay live demo
          </a>
        </div>
      </section>

      <ReleasesFaq />

      <section className="landing-section deploy-strip in-view">
        <div className="deploy-strip-inner">
          <div>
            <p className="eyebrow">Ship it</p>
            <h2>Built for one-command production deploy.</h2>
            <p className="section-lede">
              Docker Compose edge · SPA · API · SQLite volumes · access token gate · optional HTTPS.
              Same UI you see here — production-ready.
            </p>
          </div>
          <pre className="deploy-code mono">{`cp .env.production.example .env
./deploy/scripts/deploy.sh`}</pre>
        </div>
      </section>

      <section className="landing-section seo-copy in-view">
        <div className="section-head">
          <p className="eyebrow">Free backtesting software</p>
          <h2>Built for Google-found researchers.</h2>
          <p className="section-lede">
            Searching for a free trading strategy backtester? Quantify lets you test SMA crossovers,
            RSI mean reversion, MACD momentum, and Bollinger band ideas without paying for an API
            key. Index the playbook, read the guide, then run a simulation in the workspace.
          </p>
        </div>
        <div className="seo-links">
          <Link to="/guide">How to backtest free →</Link>
          <Link to="/playbook">Strategy playbook →</Link>
          <a href="/robots.txt">robots.txt</a>
          <a href="/sitemap.xml">sitemap.xml</a>
        </div>
      </section>

      <footer className="landing-footer">
        <span>Quantify · Free quant research terminal</span>
        <span className="mono">No API key · Signal at close → execute next open</span>
      </footer>
    </div>
  );
}
