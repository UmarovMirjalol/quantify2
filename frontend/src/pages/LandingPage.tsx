import { Link } from 'react-router-dom';

const LogoMark = ({ size = 17 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 12 L5.5 5 L9 9.5 L14 3"
      stroke="#3dffb5"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function LandingPage() {
  return (
    <div className="landing">
      <div className="landing-atmosphere" aria-hidden="true">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
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

        <div className="hero-visual" aria-hidden="true">
          <div className="hero-visual-glow" />
          <div className="product-preview">
            <div className="preview-bar">
              <span className="preview-brand-mini">
                <LogoMark size={12} />
                quantify
              </span>
              <span className="preview-path">research / backtest / live</span>
              <span className="preview-live">
                <span className="live-pulse" />
                live
              </span>
            </div>

            <div className="preview-stage">
              <div className="preview-prompt">
                <span className="preview-kicker">Strategy</span>
                Buy SPY when the 20-day moving average crosses above the 50-day. Risk 1% per trade;
                exit when RSI exceeds 70.
              </div>

              <div className="preview-chart-hero">
                <header>
                  <div>
                    <small>Equity curve</small>
                    <strong className="preview-return">+12.40%</strong>
                  </div>
                  <div className="preview-spark-meta mono">
                    <span>Sharpe 1.38</span>
                    <span>DD −8.2%</span>
                  </div>
                </header>
                <svg viewBox="0 0 480 160" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3dffb5" stopOpacity="0.35" />
                      <stop offset="55%" stopColor="#3dffb5" stopOpacity="0.06" />
                      <stop offset="100%" stopColor="#3dffb5" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="eqStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#3dffb5" stopOpacity="0.55" />
                      <stop offset="100%" stopColor="#7dffcb" />
                    </linearGradient>
                  </defs>
                  <g className="grid-lines" opacity="0.35">
                    <line x1="0" y1="40" x2="480" y2="40" />
                    <line x1="0" y1="80" x2="480" y2="80" />
                    <line x1="0" y1="120" x2="480" y2="120" />
                  </g>
                  <path
                    className="fill"
                    d="M0 128 L40 118 L80 122 L120 98 L160 104 L200 78 L240 86 L280 62 L320 68 L360 42 L400 48 L440 28 L480 18 L480 160 L0 160 Z"
                  />
                  <path
                    className="line"
                    d="M0 128 L40 118 L80 122 L120 98 L160 104 L200 78 L240 86 L280 62 L320 68 L360 42 L400 48 L440 28 L480 18"
                  />
                </svg>
              </div>

              <div className="preview-spec">
                <div className="interp-row">
                  <span>Entry</span>
                  <span>SMA(20) × SMA(50)</span>
                </div>
                <div className="interp-row">
                  <span>Exit</span>
                  <span>RSI &gt; 70</span>
                </div>
                <div className="interp-row">
                  <span>Universe</span>
                  <span>SPY</span>
                </div>
                <div className="interp-row">
                  <span>Risk</span>
                  <span>1.00% / trade</span>
                </div>
              </div>
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
