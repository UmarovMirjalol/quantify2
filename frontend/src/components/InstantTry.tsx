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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = text.trim();
    if (cleaned.length < 5) return;
    sessionStorage.setItem('quantify_instant_strategy', cleaned);
    navigate('/app?instant=1');
  }

  return (
    <section className="landing-section instant-section in-view" id="try">
      <div className="section-head">
        <p className="eyebrow">Instant try</p>
        <h2>Type any idea. Run it free.</h2>
        <p className="section-lede">
          Not stuck to the playbook — paste SMA, EMA, RSI, MACD, Bollinger, or free-form text. We
          always return a backtest.
        </p>
      </div>
      <form className="instant-form" onSubmit={onSubmit}>
        <label className="field">
          <span>Your strategy</span>
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
            <button key={h} type="button" className="chip" onClick={() => setText(h)}>
              {h.slice(0, 42)}…
            </button>
          ))}
        </div>
        <button className="btn primary" type="submit">
          Run free backtest →
        </button>
      </form>
    </section>
  );
}
