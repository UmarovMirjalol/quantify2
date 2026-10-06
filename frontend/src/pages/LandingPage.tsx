import { Link } from 'react-router-dom';

const ACCENT = '#00f5a0';

const LogoMark = ({ size = 17 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 12 L5.5 5 L9 9.5 L14 3"
      stroke={ACCENT}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function LandingPage() {
  return (
    <div className="landing">
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

      <section className="hero-theater">
        <div className="hero-plane" aria-hidden="true">
          <div className="plane-wash" />
          <svg className="plane-equity" viewBox="0 0 1600 620" preserveAspectRatio="none">
            <defs>
              <linearGradient id="planeFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
                <stop offset="45%" stopColor={ACCENT} stopOpacity="0.05" />
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
              </linearGradient>
              <linearGradient id="planeStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0.15" />
                <stop offset="40%" stopColor={ACCENT} stopOpacity="0.85" />
                <stop offset="100%" stopColor="#7dffc8" stopOpacity="1" />
              </linearGradient>
            </defs>
            <g className="plane-grid">
              <line x1="0" y1="120" x2="1600" y2="120" />
              <line x1="0" y1="240" x2="1600" y2="240" />
              <line x1="0" y1="360" x2="1600" y2="360" />
              <line x1="0" y1="480" x2="1600" y2="480" />
            </g>
            <path
              className="plane-fill"
              d="M0 480 L80 465 L160 470 L240 410 L320 425 L400 340 L480 360 L560 280 L640 300 L720 210 L800 235 L880 155 L960 180 L1040 110 L1120 130 L1200 70 L1280 90 L1360 40 L1440 55 L1520 22 L1600 10 L1600 620 L0 620 Z"
            />
            <path
              className="plane-line"
              d="M0 480 L80 465 L160 470 L240 410 L320 425 L400 340 L480 360 L560 280 L640 300 L720 210 L800 235 L880 155 L960 180 L1040 110 L1120 130 L1200 70 L1280 90 L1360 40 L1440 55 L1520 22 L1600 10"
            />
          </svg>
        </div>

        <div className="hero-content">
          <p className="wordmark">Quantify</p>
          <h1>Turn trading ideas into backtests.</h1>
          <p className="lede">
            Describe a strategy in plain English. Quantify interprets it, runs a look-ahead-safe
            simulation, and returns institutional results.
          </p>
          <div className="hero-actions">
            <Link className="btn primary" to="/app">
              Start a backtest
              <span className="btn-arrow" aria-hidden="true">
                →
              </span>
            </Link>
            <Link className="btn secondary" to="/history">
              View results
            </Link>
          </div>
        </div>

        <div className="hero-dock" aria-hidden="true">
          <div className="dock-strategy">
            <span className="dock-kicker">Live strategy</span>
            <p>
              Buy SPY when SMA(20) crosses above SMA(50). Risk 1% per trade · exit RSI &gt; 70.
            </p>
          </div>
          <div className="dock-return">
            <small>Equity</small>
            <strong>+12.40%</strong>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-head">
          <p className="eyebrow">Research workflow</p>
          <h2>Built for serious research, not chat demos.</h2>
        </div>
        <div className="feature-rail">
          <article className="feature">
            <div className="feature-index">01 — PARSE</div>
            <h3>Natural language → logic</h3>
            <p>
              Strategies become validated specs. No arbitrary code execution — deterministic engine
              interpretation only.
            </p>
          </article>
          <article className="feature">
            <div className="feature-index">02 — SIMULATE</div>
            <h3>Look-ahead safe engine</h3>
            <p>
              Signal at close, execute next open. Risk, costs, and slippage applied on every fill.
            </p>
          </article>
          <article className="feature">
            <div className="feature-index">03 — MEASURE</div>
            <h3>Institutional metrics</h3>
            <p>
              Sharpe, Sortino, drawdown, profit factor, trade ledger, and equity curves from real
              simulation output.
            </p>
          </article>
        </div>
      </section>

      <footer className="landing-footer">
        <span>Quantify · AI-powered quantitative research</span>
        <span className="mono">Signal at close → execute next open</span>
      </footer>
    </div>
  );
}
