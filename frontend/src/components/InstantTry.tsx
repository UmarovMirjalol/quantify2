import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

const HINTS = [
  'Buy when RSI falls below 30 and sell when RSI rises above 70',
  'Buy when the 20-day SMA crosses above the 50-day SMA',
  'Buy when MACD crosses above its signal line',
  'Buy when price closes below the lower Bollinger Band',
];

export function InstantTry() {
  const navigate = useNavigate();
  const [text, setText] = useState(HINTS[0]);
  const [flash, setFlash] = useState<string | null>(null);
  const [kick, setKick] = useState(false);

  function pickHint(h: string) {
    setText(h);
    setFlash(h);
    window.setTimeout(() => setFlash(null), 420);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = text.trim();
    if (cleaned.length < 5) return;
    setKick(true);
    sessionStorage.setItem('quantify_instant_strategy', cleaned);
    window.setTimeout(() => navigate('/app?instant=1'), 160);
  }

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
            >
              {h.slice(0, 42)}…
            </button>
          ))}
        </div>
        <button className="btn primary" type="submit">
          Run backtest →
        </button>
      </form>
    </section>
  );
}
