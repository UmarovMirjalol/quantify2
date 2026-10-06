import { Link } from 'react-router-dom';

const ACCENT = '#4fd6a0';

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

const EQUITY_PATH =
  'M0 118 L38 110 L76 114 L114 92 L152 98 L190 74 L228 82 L266 58 L304 64 L342 40 L380 46 L418 26 L460 16';

export function LandingPage() {
  return (
    <div className="landing">
      <div className="landing-motion" aria-hidden="true">
        <span className="motion-grid" />
        <span className="beam beam-a" />
        <span className="beam beam-b" />
        <span className="orbit orbit-a" />
        <span className="orbit orbit-b" />
        <span className="scanline" />
        <span className="mote mote-a" />
        <span className="mote mote-b" />
        <span className="mote mote-c" />
        <span className="mote mote-d" />
        <span className="mote mote-e" />
        <span className="mote mote-f" />
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
          <h1 className="reveal" style={{ ['--d' as string]: '80ms' }}>
            Turn trading ideas into backtests.
          </h1>
          <p className="lede reveal" style={{ ['--d' as string]: '140ms' }}>
            Describe a strategy in plain English. Quantify interprets it, runs a look-ahead-safe
            simulation, and returns institutional results.
          </p>
          <div className="hero-actions reveal" style={{ ['--d' as string]: '200ms' }}>
            <Link className="btn primary" to="/app">
              Start a backtest
            </Link>
            <Link className="btn secondary" to="/history">
              View results
            </Link>
          </div>
          <p className="hero-note mono reveal" style={{ ['--d' as string]: '260ms' }}>
            Signal at close → execute next open
          </p>
        </div>

        <div className="hero-stage reveal" style={{ ['--d' as string]: '120ms' }}>
          <div className="product-frame">
            <div className="product-top">
              <span className="product-brand">
                <LogoMark size={12} />
                quantify · workspace
              </span>
              <span className="product-live">
                <i />
                live
              </span>
            </div>

            <div className="product-grid">
              <div className="product-main">
                <div className="product-prompt">
                  <span>Strategy</span>
                  <p className="prompt-type">
                    Buy SPY when the 20-day moving average crosses above the 50-day. Risk 1% per
                    trade; exit when RSI exceeds 70.
                    <i className="caret" />
                  </p>
                </div>

                <div className="product-flow">
                  <span className="flow-step" style={{ ['--i' as string]: 0 }}>
                    NL
                  </span>
                  <span className="flow-arrow" style={{ ['--i' as string]: 0 }}>
                    →
                  </span>
                  <span className="flow-step" style={{ ['--i' as string]: 1 }}>
                    Spec
                  </span>
                  <span className="flow-arrow" style={{ ['--i' as string]: 1 }}>
                    →
                  </span>
                  <span className="flow-step" style={{ ['--i' as string]: 2 }}>
                    Sim
                  </span>
                  <span className="flow-arrow" style={{ ['--i' as string]: 2 }}>
                    →
                  </span>
                  <span className="flow-step" style={{ ['--i' as string]: 3 }}>
                    Results
                  </span>
                </div>

                <div className="product-chart">
                  <header>
                    <div>
                      <small>Equity curve</small>
                      <strong className="count-up">+12.40%</strong>
                    </div>
                    <div className="product-meta mono">
                      <span className="meta-tick">Sharpe 1.38</span>
                      <span className="meta-tick">DD −8.2%</span>
                    </div>
                  </header>
                  <svg viewBox="0 0 460 150" preserveAspectRatio="none">
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
                    <path className="fill" d={`${EQUITY_PATH} L460 150 L0 150 Z`} />
                    <path
                      className="line line-glow"
                      d={EQUITY_PATH}
                      filter="url(#eqGlow)"
                    />
                    <path className="line" id="equityLine" d={EQUITY_PATH} />
                    <circle className="chart-dot" r="4.5" fill={ACCENT}>
                      <animateMotion dur="5.5s" repeatCount="indefinite" rotate="auto">
                        <mpath href="#equityLine" />
                      </animateMotion>
                    </circle>
                    <circle className="chart-pulse" r="4" fill="none" stroke={ACCENT} strokeWidth="1.5">
                      <animateMotion dur="5.5s" repeatCount="indefinite">
                        <mpath href="#equityLine" />
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
                  </svg>
                </div>
              </div>

              <aside className="product-side">
                <div className="side-block">
                  <small>Interpretation</small>
                  <div className="side-row" style={{ ['--i' as string]: 0 }}>
                    <span>Entry</span>
                    <span>SMA(20) × SMA(50)</span>
                  </div>
                  <div className="side-row" style={{ ['--i' as string]: 1 }}>
                    <span>Exit</span>
                    <span>RSI &gt; 70</span>
                  </div>
                  <div className="side-row" style={{ ['--i' as string]: 2 }}>
                    <span>Universe</span>
                    <span>SPY</span>
                  </div>
                  <div className="side-row" style={{ ['--i' as string]: 3 }}>
                    <span>Risk</span>
                    <span>1.00% / trade</span>
                  </div>
                </div>
                <div className="side-kpis">
                  <div style={{ ['--i' as string]: 0 }}>
                    <small>Return</small>
                    <strong className="pos">+12.4%</strong>
                  </div>
                  <div style={{ ['--i' as string]: 1 }}>
                    <small>Trades</small>
                    <strong>48</strong>
                  </div>
                  <div style={{ ['--i' as string]: 2 }}>
                    <small>Win rate</small>
                    <strong>56%</strong>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
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
          </article>
          <article className="feature" style={{ ['--i' as string]: 1 }}>
            <div className="feature-index">
              <span className="feature-num">02</span> — Simulate
            </div>
            <h3>Look-ahead safe engine</h3>
            <p>
              Signal at close, execute next open. Risk, costs, and slippage applied on every fill.
            </p>
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
