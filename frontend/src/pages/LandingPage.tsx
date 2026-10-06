import { Link } from 'react-router-dom';

const LogoMark = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 12 L5.5 5 L9 9.5 L14 3"
      stroke="#3dffb5"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function LandingPage() {
  return (
    <div className="landing">
      <div className="landing-atmosphere" aria-hidden="true" />

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
          <p className="wordmark">
            <span className="wordmark-glow">Quantify</span>
          </p>
          <h1>Turn trading ideas into backtests.</h1>
          <p className="lede">
            Describe your strategy in plain English. Quantify translates it into executable logic,
            runs the backtest, and gives you the results.
          </p>
          <div className="hero-actions">
            <Link className="btn primary" to="/app">
              Start a backtest
            </Link>
            <Link className="btn secondary" to="/history">
              View results
            </Link>
          </div>
          <p className="hero-proof mono">Signal at close → execute next open · look-ahead safe</p>
        </div>

        <div className="hero-stage" aria-hidden="true">
          <div className="hero-glow" />
          <div className="product-preview">
            <div className="preview-bar">
              <span className="preview-dot" />
              <span className="preview-dot" />
              <span className="preview-dot" />
              <span className="preview-title">quantify · research workspace</span>
              <span className="preview-live">
                <span className="live-pulse" />
                live
              </span>
            </div>
            <div className="preview-body">
              <div className="preview-left">
                <div className="preview-prompt">
                  Buy SPY when the 20-day moving average crosses above the 50-day moving average. Risk
                  1% per trade and exit when RSI exceeds 70.
                </div>
                <div className="preview-flow">
                  <span className="on">Natural language</span>
                  <span className="arrow">→</span>
                  <span className="on">Interpretation</span>
                  <span className="arrow">→</span>
                  <span className="on">Backtest</span>
                  <span className="arrow">→</span>
                  <span className="on">Results</span>
                </div>
                <div className="preview-interp">
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
                    <span>Risk / trade</span>
                    <span>1.00%</span>
                  </div>
                </div>
              </div>
              <div className="preview-right">
                <div className="preview-chart">
                  <header>
                    <small>Equity curve</small>
                    <strong>+12.40%</strong>
                  </header>
                  <svg viewBox="0 0 240 88" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3dffb5" stopOpacity="0.38" />
                        <stop offset="100%" stopColor="#3dffb5" stopOpacity="0" />
                      </linearGradient>
                      <filter id="eqGlow" x="-20%" y="-40%" width="140%" height="180%">
                        <feGaussianBlur stdDeviation="1.4" result="b" />
                        <feMerge>
                          <feMergeNode in="b" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>
                    <path
                      className="fill"
                      d="M0 70 L20 64 L40 66 L60 52 L80 56 L100 42 L120 46 L140 34 L160 36 L180 22 L200 26 L220 14 L240 10 L240 88 L0 88 Z"
                    />
                    <path
                      className="line"
                      filter="url(#eqGlow)"
                      d="M0 70 L20 64 L40 66 L60 52 L80 56 L100 42 L120 46 L140 34 L160 36 L180 22 L200 26 L220 14 L240 10"
                    />
                  </svg>
                </div>
                <div className="preview-metrics">
                  <div>
                    <small>Return</small>
                    <strong style={{ color: 'var(--positive)' }}>+12.4%</strong>
                  </div>
                  <div>
                    <small>Sharpe</small>
                    <strong>1.38</strong>
                  </div>
                  <div>
                    <small>Max DD</small>
                    <strong style={{ color: 'var(--negative)' }}>−8.2%</strong>
                  </div>
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
