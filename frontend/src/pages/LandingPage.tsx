import { Link } from 'react-router-dom';

const ACCENT = '#36f0a8';

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
      <div className="landing-backdrop" aria-hidden="true">
        <svg className="backdrop-equity" viewBox="0 0 1400 700" preserveAspectRatio="xMaxYMid slice">
          <defs>
            <linearGradient id="bgFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.14" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="bgStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0" />
              <stop offset="35%" stopColor={ACCENT} stopOpacity="0.35" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0.75" />
            </linearGradient>
          </defs>
          <path
            fill="url(#bgFill)"
            d="M0 520 L120 500 L240 510 L360 430 L480 450 L600 340 L720 370 L840 260 L960 290 L1080 170 L1200 200 L1320 90 L1400 60 L1400 700 L0 700 Z"
          />
          <path
            fill="none"
            stroke="url(#bgStroke)"
            strokeWidth="2.5"
            d="M0 520 L120 500 L240 510 L360 430 L480 450 L600 340 L720 370 L840 260 L960 290 L1080 170 L1200 200 L1320 90 L1400 60"
          />
        </svg>
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
          <div className="product-preview">
            <div className="preview-bar">
              <span className="preview-brand-mini">
                <LogoMark size={12} />
                quantify
              </span>
              <span className="preview-path">research · backtest</span>
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
                <svg viewBox="0 0 480 168" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <g className="grid-lines">
                    <line x1="0" y1="42" x2="480" y2="42" />
                    <line x1="0" y1="84" x2="480" y2="84" />
                    <line x1="0" y1="126" x2="480" y2="126" />
                  </g>
                  <path
                    className="fill"
                    d="M0 132 L40 122 L80 126 L120 102 L160 108 L200 82 L240 90 L280 64 L320 70 L360 44 L400 50 L440 28 L480 18 L480 168 L0 168 Z"
                  />
                  <path
                    className="line"
                    d="M0 132 L40 122 L80 126 L120 102 L160 108 L200 82 L240 90 L280 64 L320 70 L360 44 L400 50 L440 28 L480 18"
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
