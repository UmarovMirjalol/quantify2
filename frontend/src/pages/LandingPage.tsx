import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCountUp } from '../hooks/useCountUp';
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

export function LandingPage() {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduced ? 'hold' : 'boot');
  const [typed, setTyped] = useState(reduced ? STRATEGY : '');
  const [cycle, setCycle] = useState(0);
  const [showChart, setShowChart] = useState(reduced);
  const [interpVisible, setInterpVisible] = useState(reduced ? 4 : 0);
  const [featuresIn, setFeaturesIn] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

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

  // Demo choreography loop
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
        await wait(420);

        setPhase('type');
        for (let i = 1; i <= STRATEGY.length; i++) {
          if (cancelled) return;
          setTyped(STRATEGY.slice(0, i));
          await wait(i < 12 ? 28 : i > STRATEGY.length - 18 ? 18 : 14);
        }
        await wait(380);

        setPhase('parse');
        await wait(700);

        setPhase('spec');
        for (let i = 1; i <= INTERP.length; i++) {
          if (cancelled) return;
          setInterpVisible(i);
          await wait(160);
        }
        await wait(480);

        setPhase('sim');
        setShowChart(true);
        await wait(2200);

        setPhase('results');
        await wait(1600);

        setPhase('hold');
        await wait(3200);
      }
    }

    run();
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [reduced]);

  // Parallax tilt on product stage
  useEffect(() => {
    if (reduced) return;
    const el = stageRef.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      setTilt({ x: py * -6, y: px * 8 });
    };
    const onLeave = () => setTilt({ x: 0, y: 0 });

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [reduced]);

  // Feature rail scroll reveal
  useEffect(() => {
    if (reduced) {
      setFeaturesIn(true);
      return;
    }
    const node = featuresRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setFeaturesIn(true);
      },
      { threshold: 0.28 },
    );
    io.observe(node);
    return () => io.disconnect();
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
          <Link className="btn ghost" to="/history">
            Results
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
            Describe a strategy in plain English. Quantify interprets it, runs a look-ahead-safe
            simulation, and returns institutional results.
          </p>
          <div className="hero-actions reveal" style={{ ['--d' as string]: '230ms' }}>
            <Link className="btn primary" to="/app">
              Start a backtest
            </Link>
            <Link className="btn secondary" to="/history">
              View results
            </Link>
          </div>
          <p className="hero-note mono reveal" style={{ ['--d' as string]: '300ms' }}>
            Signal at close → execute next open
          </p>
        </div>

        <div
          className="hero-stage reveal"
          style={{ ['--d' as string]: '140ms' }}
          ref={stageRef}
        >
          <div className="hero-stage-float">
            <div
              className={`product-frame phase-${phase}`}
              style={
                reduced
                  ? undefined
                  : {
                      transform: `perspective(1200px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                    }
              }
            >
            <div className="product-top">
              <span className="product-brand">
                <LogoMark size={12} />
                quantify · workspace
              </span>
              <span className="product-live">
                <i />
                {phase === 'sim' ? 'simulating' : phase === 'parse' || phase === 'spec' ? 'parsing' : 'live'}
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
                        style={{ ['--i' as string]: i }}
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
                        <path
                          className="line line-glow"
                          d={EQUITY_PATH}
                          filter="url(#eqGlow)"
                        />
                        <path className="line" id={`equityLine-${cycle}`} d={EQUITY_PATH} />
                        <circle className="chart-dot" r="4.5" fill={ACCENT}>
                          <animateMotion dur="5.5s" repeatCount="indefinite" rotate="auto">
                            <mpath href={`#equityLine-${cycle}`} />
                          </animateMotion>
                        </circle>
                        <circle
                          className="chart-pulse"
                          r="4"
                          fill="none"
                          stroke={ACCENT}
                          strokeWidth="1.5"
                        >
                          <animateMotion dur="5.5s" repeatCount="indefinite">
                            <mpath href={`#equityLine-${cycle}`} />
                          </animateMotion>
                          <animate
                            attributeName="r"
                            values="4;14"
                            dur="1.6s"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0.55;0"
                            dur="1.6s"
                            repeatCount="indefinite"
                          />
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

      <section
        className={`landing-section ${featuresIn ? 'in-view' : ''}`}
        ref={featuresRef}
      >
        <div className="section-head">
          <p className="eyebrow">Research workflow</p>
          <h2>Built for serious research, not chat demos.</h2>
        </div>
        <div className="feature-rail">
          <article className="feature" style={{ ['--i' as string]: 0 }}>
            <div className="feature-index">
              <span className="feature-num">01</span> — Parse
            </div>
            <h3>Natural language → logic</h3>
            <p>
              Strategies become validated specs. No arbitrary code execution — deterministic engine
              interpretation only.
            </p>
            <div className="feature-bar" />
          </article>
          <article className="feature" style={{ ['--i' as string]: 1 }}>
            <div className="feature-index">
              <span className="feature-num">02</span> — Simulate
            </div>
            <h3>Look-ahead safe engine</h3>
            <p>
              Signal at close, execute next open. Risk, costs, and slippage applied on every fill.
            </p>
            <div className="feature-bar" />
          </article>
          <article className="feature" style={{ ['--i' as string]: 2 }}>
            <div className="feature-index">
              <span className="feature-num">03</span> — Measure
            </div>
            <h3>Institutional metrics</h3>
            <p>
              Sharpe, Sortino, drawdown, profit factor, trade ledger, and equity curves from real
              simulation output.
            </p>
            <div className="feature-bar" />
          </article>
        </div>
      </section>

      <footer className="landing-footer">
        <span>Quantify · Quantitative research</span>
        <span className="mono">Signal at close → execute next open</span>
      </footer>
    </div>
  );
}
