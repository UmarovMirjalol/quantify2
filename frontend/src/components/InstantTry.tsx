import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMarketData, runBacktest } from '../services/api';

const HINTS = [
  'Buy when RSI falls below 30 and sell when RSI rises above 70',
  'Buy when the 20-day SMA crosses above the 50-day SMA',
  'Buy when MACD crosses above its signal line',
  'Buy when price closes below the lower Bollinger Band',
];

const TICKERS = ['SPY', 'AAPL', 'NVDA', 'BTC-USD'];

export function InstantTry() {
  const navigate = useNavigate();
  const [text, setText] = useState(HINTS[0]);
  const [ticker, setTicker] = useState('SPY');
  const [flash, setFlash] = useState<string | null>(null);
  const [kick, setKick] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickHint(h: string) {
    setText(h);
    setFlash(h);
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
      setStatus(`Loading 10 years of ${symbol} prices…`);
      const data = await fetchMarketData(symbol, '1d', '10y');
      setStatus('Running the backtest…');
      const result = await runBacktest({
        strategy_text: cleaned,
        dataset_id: data.dataset_id,
        asset: symbol,
        config: { initial_capital: 10_000, commission: 0.001, slippage: 0.0005, risk_per_trade: 0.01 },
      });
      navigate(`/results/${result.id}`);
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
          Supports SMA, EMA, RSI, MACD, and Bollinger. Free-form text is parsed into a validated
          spec when possible.
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
              key={h}
              type="button"
              className={`chip ${flash === h ? 'flash-click' : ''} ${text === h ? 'active' : ''}`}
              onClick={() => pickHint(h)}
              disabled={busy}
            >
              {h.slice(0, 42)}…
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
