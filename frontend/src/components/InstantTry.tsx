import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { quickRun } from '../utils/quickRun';

const HINTS = [
  { label: 'RSI oversold bounce', text: 'Buy when RSI falls below 30 and sell when RSI rises above 70', ticker: 'SPY' },
  { label: 'Golden cross', text: 'Buy when the 50-day SMA crosses above the 200-day SMA and sell when it crosses below', ticker: 'SPY' },
  { label: 'Buy Monday, sell Friday', text: 'Buy on Monday and sell on Friday', ticker: 'SPY' },
  { label: 'Buy the 3% dip', text: 'Buy when the price drops 3% in a day', ticker: 'SPY' },
  { label: 'Bitcoin weekend', text: 'Buy on Friday and sell on Monday', ticker: 'BTC-USD' },
  { label: 'MACD momentum', text: 'Buy when MACD crosses above its signal line and sell when it crosses below', ticker: 'NVDA' },
];

const TICKERS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'BTC-USD', 'ETH-USD', 'EURUSD', 'GOLD'];

export function InstantTry() {
  const navigate = useNavigate();
  const [text, setText] = useState(HINTS[0].text);
  const [ticker, setTicker] = useState('SPY');
  const [flash, setFlash] = useState<string | null>(null);
  const [kick, setKick] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickHint(h: (typeof HINTS)[number]) {
    setText(h.text);
    setTicker(h.ticker);
    setFlash(h.label);
    window.setTimeout(() => setFlash(null), 420);
  }

  function openWorkspace() {
    const cleaned = text.trim();
    if (cleaned.length < 5) return;
    sessionStorage.setItem('quantify_instant_strategy', cleaned);
    navigate('/app?instant=1');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = text.trim();
    const symbol = ticker.trim().toUpperCase();
    if (cleaned.length < 5 || !symbol) return;
    setKick(true);
    setError(null);
    try {
      const id = await quickRun(cleaned, symbol, setStatus);
      navigate(`/results/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run the backtest.');
      setStatus(null);
      setKick(false);
    }
  }

  const busy = status !== null;

  return (
    <section className="landing-section instant-section in-view" id="try">
      <div className="section-head">
        <p className="eyebrow">Try it</p>
        <h2>Describe a strategy. Run it.</h2>
        <p className="section-lede">
          Pick a famous strategy or write your own in plain English. We test it on 10 years of real
          prices and compare it with simply buying and holding.
        </p>
      </div>
      <form className={`instant-form ${kick ? 'kick' : ''}`} onSubmit={onSubmit}>
        <label className="field">
          <span>Strategy</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            minLength={5}
            required
            disabled={busy}
            placeholder="Describe a trading idea in plain English…"
          />
        </label>
        <div className="instant-hints">
          {HINTS.map((h) => (
            <button
              key={h.label}
              type="button"
              className={`chip ${flash === h.label ? 'flash-click' : ''} ${text === h.text ? 'active' : ''}`}
              onClick={() => pickHint(h)}
              disabled={busy}
              title={h.text}
            >
              {h.label}
            </button>
          ))}
        </div>
        <div className="instant-run">
          <label className="field instant-ticker">
            <span>On</span>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              maxLength={20}
              disabled={busy}
              list="instant-tickers"
              aria-label="Ticker"
            />
            <datalist id="instant-tickers">
              {TICKERS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Running…' : 'Run backtest →'}
          </button>
          <button type="button" className="btn ghost" onClick={openWorkspace} disabled={busy}>
            Open in the workspace
          </button>
        </div>
        {status ? <p className="hint" aria-live="polite">{status}</p> : null}
        {error ? <div className="banner error">{error}</div> : null}
      </form>
    </section>
  );
}
