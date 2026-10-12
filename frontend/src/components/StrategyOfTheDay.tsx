import { useMemo } from 'react';
import { Link } from 'react-router-dom';

const ROTATION = [
  {
    id: 'sma-cross',
    title: 'Classic SMA crossover',
    hook: 'The most searched starter strategy — 20/50 cross with RSI take-profit.',
    text: 'Buy SPY when the 20-day moving average crosses above the 50-day moving average. Risk 1% per trade and exit when RSI exceeds 70.',
  },
  {
    id: 'rsi-reversion',
    title: 'RSI mean reversion',
    hook: 'Fade oversold prints — a favorite for short-horizon research.',
    text: 'Buy when RSI falls below 30 and sell when RSI rises above 70. Risk 1% per trade.',
  },
  {
    id: 'macd-momentum',
    title: 'MACD momentum',
    hook: 'Ride signal-line crosses with clean long-only rules.',
    text: 'Buy when MACD crosses above its signal line and sell when MACD crosses below the signal line. Risk 1% per trade.',
  },
  {
    id: 'bollinger-bounce',
    title: 'Bollinger bounce',
    hook: 'Volatility mean reversion off the lower band.',
    text: 'Buy when price closes below the lower Bollinger Band and sell when it crosses above the middle band. Risk 1% per trade.',
  },
  {
    id: 'ema-stops',
    title: 'EMA trend + stops',
    hook: 'Trend follow with hard risk exits baked in.',
    text: 'Buy when the 12-day EMA crosses above the 26-day EMA and sell when it crosses below. Use a 2% stop-loss and 5% take-profit.',
  },
  {
    id: 'dual-filter',
    title: 'Trend + RSI filter',
    hook: 'Only take crosses when momentum is not already stretched.',
    text: 'Buy when the 20-day SMA crosses above the 50-day SMA and RSI is below 60. Sell when the 20-day SMA crosses below the 50-day SMA or RSI exceeds 75. Risk 1% per trade.',
  },
] as const;

function dayIndex(): number {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start) / 86_400_000);
  return day % ROTATION.length;
}

export function StrategyOfTheDay() {
  const pick = useMemo(() => ROTATION[dayIndex()], []);

  return (
    <section className="landing-section sotd-section in-view" aria-label="Strategy of the day">
      <div className="sotd-inner">
        <div>
          <p className="eyebrow">
            <span className="live-pulse" aria-hidden="true" />
            Strategy of the day
          </p>
          <h2>{pick.title}</h2>
          <p className="section-lede">{pick.hook}</p>
          <pre className="sotd-text mono">{pick.text}</pre>
          <div className="sotd-actions">
            <Link className="btn primary" to={`/app?strategy=${encodeURIComponent(pick.id)}`}>
              Backtest this free
            </Link>
            <button
              type="button"
              className="btn secondary"
              onClick={() => navigator.clipboard?.writeText(pick.text)}
            >
              Copy strategy
            </button>
          </div>
        </div>
        <aside className="sotd-aside">
          <p className="mono">Daily rotation · {ROTATION.length} featured ideas</p>
          <ul>
            <li>No signup</li>
            <li>No API key</li>
            <li>Look-ahead-safe fills</li>
            <li>Shareable workspace link</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
