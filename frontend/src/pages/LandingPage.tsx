import { Link } from 'react-router-dom';

const LogoMark = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 12 L5.5 5 L9 9.5 L14 3"
      stroke="#4adeb0"
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

      <section className="hero">
        <div className="hero-copy">
          <div className="brand-lockup">
            <span className="brand-mark">
              <LogoMark />
            </span>
            <span className="brand-text">
              <span className="brand-name">Quantify</span>
              <span className="brand-tag">AI-powered quantitative research</span>
            </span>
          </div>
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
          <div className="hero-meta">
            <div>
              <small>Execution</small>
              <strong>Close → next open</strong>
            </div>
            <div>
              <small>Engine</small>
              <strong>Custom Python</strong>
            </div>
            <div>
              <small>Parser</small>
              <strong>LLM + builtin</strong>
            </div>
          </div>
        </div>

        <div className="product-preview" aria-hidden="true">
          <div className="preview-bar">
            <span className="preview-dot" />
            <span className="preview-dot" />
            <span className="preview-dot" />
            <span style={{ marginLeft: 8 }}>workspace · new backtest</span>
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
                  <small>Equity</small>
                  <strong>+12.4%</strong>
                </header>
                <svg viewBox="0 0 240 72" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4adeb0" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#4adeb0" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    className="fill"
                    d="M0 58 L18 52 L36 54 L54 42 L72 46 L90 34 L108 38 L126 28 L144 30 L162 18 L180 22 L198 12 L216 16 L240 8 L240 72 L0 72 Z"
                  />
                  <path
                    className="line"
                    d="M0 58 L18 52 L36 54 L54 42 L72 46 L90 34 L108 38 L126 28 L144 30 L162 18 L180 22 L198 12 L216 16 L240 8"
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
      </section>

      <section className="landing-section">
        <p className="eyebrow">Research workflow</p>
        <h2>Built for serious research, not chat demos.</h2>
        <div className="feature-grid">
          <article className="feature">
            <div className="feature-index">01</div>
            <h3>Natural language → logic</h3>
            <p>
              Strategies become validated specs. No arbitrary code execution — deterministic engine
              interpretation only.
            </p>
          </article>
          <article className="feature">
            <div className="feature-index">02</div>
            <h3>Look-ahead safe engine</h3>
            <p>
              Signal at close, execute next open. Risk, costs, and slippage applied on every fill.
            </p>
          </article>
          <article className="feature">
            <div className="feature-index">03</div>
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
