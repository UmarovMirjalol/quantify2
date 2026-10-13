import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';

export function GuidePage() {
  usePageMeta(
    'How to Backtest Trading Strategies Free — Quantify Guide',
    'Learn how to backtest SMA, RSI, MACD and Bollinger strategies free with Quantify. No API key, look-ahead-safe execution.',
  );

  return (
    <div className="guide-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Guide</p>
          <h1>How to backtest a trading strategy for free</h1>
          <p className="lede">
            Quantify parses plain-English rules into look-ahead-safe simulations. No signup. No API
            key. Start from a playbook preset or write your own.
          </p>
        </div>
        <Link className="btn primary" to="/app">
          Open workspace
        </Link>
      </div>

      <article className="guide-article panel">
        <h2>1. Pick or write a strategy</h2>
        <p>
          Use the <Link to="/playbook">strategy playbook</Link> or describe rules with SMA, EMA,
          RSI, MACD, or Bollinger Bands. Example:{' '}
          <em>“Buy when RSI falls below 30 and sell when RSI rises above 70. Risk 1% per trade.”</em>
        </p>

        <h2>2. Run a look-ahead-safe backtest</h2>
        <p>
          Signals form on the bar close; fills execute on the next open. Commission and slippage are
          applied on every trade before equity updates.
        </p>

        <h2>3. Read the metrics</h2>
        <p>
          Inspect total return, CAGR, Sharpe, Sortino, max drawdown, win rate, profit factor, and
          the full trade blotter. Runs are saved in your browser history.
        </p>

        <h2>Do I need an LLM key?</h2>
        <p>
          No. The built-in parser covers common SMA, EMA, RSI, MACD, and Bollinger patterns without
          an external model. An optional API key only expands freestyle phrasing.
        </p>

        <h2>Popular free strategy types</h2>
        <ul>
          <li>SMA / EMA crossovers (trend following)</li>
          <li>RSI mean reversion (oversold / overbought)</li>
          <li>MACD signal-line momentum</li>
          <li>Bollinger Band bounce</li>
          <li>Price vs moving-average filters</li>
        </ul>

        <div className="landing-cta-row" style={{ marginTop: '1.5rem' }}>
          <Link className="btn primary" to="/app">
            Start a backtest
          </Link>
          <Link className="btn secondary" to="/playbook">
            Browse playbook
          </Link>
          <Link className="btn ghost" to="/">
            Back to home
          </Link>
        </div>
      </article>
    </div>
  );
}
