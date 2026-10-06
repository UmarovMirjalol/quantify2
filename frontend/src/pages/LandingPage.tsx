import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2 12 L5.5 5 L9 9.5 L14 3"
                stroke="#5eead4"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="brand-text">
            <span className="brand-name">Quantify</span>
            <span className="brand-tag">AI quant research</span>
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
          <p className="eyebrow">AI-powered quantitative research</p>
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
        </div>

        <div className="product-preview" aria-hidden="true">
          <div className="preview-bar">
            <span className="preview-dot" />
            <span className="preview-dot" />
            <span className="preview-dot" />
            <span style={{ marginLeft: 8 }}>New Backtest · Quantify</span>
          </div>
          <div className="preview-body">
            <div className="preview-prompt">
              Buy SPY when the 20-day moving average crosses above the 50-day moving average. Risk 1%
              per trade and exit when RSI exceeds 70.
            </div>
            <div className="preview-flow">
              <span className="on">Natural language</span>
              <span>→</span>
              <span className="on">Interpretation</span>
              <span>→</span>
              <span className="on">Backtest</span>
              <span>→</span>
              <span className="on">Results</span>
            </div>
            <div className="preview-interp">
              <div className="interp-row">
                <span>Entry</span>
                <span>SMA(20) cross above SMA(50)</span>
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
            <div className="preview-metrics">
              <div>
                <small>Total return</small>
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
      </section>

      <section className="landing-section">
        <p className="eyebrow">Workflow</p>
        <h1 style={{ fontSize: '1.35rem' }}>Built for serious research, not chat demos.</h1>
        <div className="feature-grid">
          <article className="feature">
            <h3>Natural language → logic</h3>
            <p>
              Strategies become validated specs. No arbitrary code execution — deterministic engine
              interpretation only.
            </p>
          </article>
          <article className="feature">
            <h3>Look-ahead safe engine</h3>
            <p>
              Signal at close, execute next open. Risk, costs, and slippage applied on every fill.
            </p>
          </article>
          <article className="feature">
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
        <span>Signal at close → execute next open</span>
      </footer>
    </div>
  );
}
