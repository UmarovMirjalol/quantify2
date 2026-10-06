import { Link } from 'react-router-dom';

const ACCENT = '#68d9a4';

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
          <svg className="plane-equity" viewBox="0 0 1600 640" preserveAspectRatio="none">
            <defs>
              <linearGradient id="planeFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
                <stop offset="50%" stopColor={ACCENT} stopOpacity="0.05" />
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
              </linearGradient>
            </defs>
            <g className="plane-grid">
              <line x1="0" y1="100" x2="1600" y2="100" />
              <line x1="0" y1="200" x2="1600" y2="200" />
              <line x1="0" y1="300" x2="1600" y2="300" />
              <line x1="0" y1="400" x2="1600" y2="400" />
              <line x1="0" y1="500" x2="1600" y2="500" />
              <line x1="200" y1="0" x2="200" y2="640" />
              <line x1="400" y1="0" x2="400" y2="640" />
              <line x1="600" y1="0" x2="600" y2="640" />
              <line x1="800" y1="0" x2="800" y2="640" />
              <line x1="1000" y1="0" x2="1000" y2="640" />
              <line x1="1200" y1="0" x2="1200" y2="640" />
              <line x1="1400" y1="0" x2="1400" y2="640" />
            </g>
            <path
              className="plane-fill"
              d="M0 500 L70 488 L140 495 L210 430 L280 448 L350 360 L420 385 L490 300 L560 325 L630 230 L700 255 L770 175 L840 200 L910 125 L980 148 L1050 85 L1120 108 L1190 55 L1260 72 L1330 30 L1400 48 L1470 18 L1540 28 L1600 8 L1600 640 L0 640 Z"
            />
            <path
              className="plane-line"
              d="M0 500 L70 488 L140 495 L210 430 L280 448 L350 360 L420 385 L490 300 L560 325 L630 230 L700 255 L770 175 L840 200 L910 125 L980 148 L1050 85 L1120 108 L1190 55 L1260 72 L1330 30 L1400 48 L1470 18 L1540 28 L1600 8"
            />
          </svg>
        </div>

        <div className="hero-content">
          <p className="wordmark">Quantify</p>
          <h1>Turn trading ideas into backtests.</h1>
          <p className="lede">
            Plain English in. Look-ahead-safe simulation out. Institutional metrics you can trust.
          </p>
          <div className="hero-actions">
            <Link className="btn primary" to="/app">
              Start a backtest
            </Link>
            <Link className="btn secondary" to="/history">
              View results
            </Link>
          </div>
        </div>

        <div className="hero-dock" aria-hidden="true">
          <div className="dock-strategy">
            <span className="dock-kicker">Example strategy</span>
            <p>
              Buy SPY when SMA(20) crosses above SMA(50). Risk 1% per trade · exit RSI &gt; 70.
            </p>
          </div>
          <div className="dock-stats">
            <div>
              <small>Equity</small>
              <strong className="pos">+12.40%</strong>
            </div>
            <div>
              <small>Sharpe</small>
              <strong>1.38</strong>
            </div>
            <div>
              <small>Max DD</small>
              <strong className="neg">−8.2%</strong>
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
          <article className="feature">
            <div className="feature-index">01 — Parse</div>
            <h3>Natural language → logic</h3>
            <p>
              Strategies become validated specs. No arbitrary code execution — deterministic engine
              interpretation only.
            </p>
          </article>
          <article className="feature">
            <div className="feature-index">02 — Simulate</div>
            <h3>Look-ahead safe engine</h3>
            <p>
              Signal at close, execute next open. Risk, costs, and slippage applied on every fill.
            </p>
          </article>
          <article className="feature">
            <div className="feature-index">03 — Measure</div>
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
