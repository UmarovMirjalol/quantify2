import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { quickRun } from '../utils/quickRun';

const CLAIMS = [
  { label: '“RSI under 30 = free money”', text: 'Buy when RSI drops below 30 and sell when RSI goes above 70', ticker: 'SPY' },
  { label: '“The golden cross never fails”', text: 'Buy when the 50-day SMA crosses above the 200-day SMA and sell when it crosses below', ticker: 'SPY' },
  { label: '“Buy every Tesla dip”', text: 'Buy when the price drops 5% in a day', ticker: 'TSLA' },
  { label: '“Buy Monday, sell Friday”', text: 'Buy on Monday and sell on Friday', ticker: 'QQQ' },
  { label: '“Bitcoin weekend trick”', text: 'Buy on Friday and sell on Monday', ticker: 'BTC-USD' },
];

export function CheckPage() {
  usePageMeta(
    'Check a guru’s strategy — Quantify',
    'Paste a trading strategy from TikTok, YouTube or X. We test it on 10 years of real prices against simply buying and holding. Free.',
  );
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const [ticker, setTicker] = useState(params.get('t') ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = status !== null;
  const looksLikeLink = /^\s*https?:\/\//i.test(text);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cleaned = text.trim();
    if (cleaned.length < 5 || looksLikeLink) return;
    setError(null);
    try {
      const id = await quickRun(cleaned, ticker, setStatus);
      navigate(`/results/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not test this strategy.');
      setStatus(null);
    }
  }

  return (
    <div className="results check-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Guru check</p>
          <h1>Did that strategy from the video actually work?</h1>
          <p className="lede">
            Paste what the guru said. We turn it into exact rules, test it on 10 years of real prices, and show
            whether it beat simply buying and holding.
          </p>
        </div>
      </div>

      <form className="panel check-form" onSubmit={submit}>
        <div className="whatif-picks">
          {CLAIMS.map((c) => (
            <button
              key={c.label}
              type="button"
              className={`chip${text === c.text ? ' active' : ''}`}
              onClick={() => {
                setText(c.text);
                setTicker(c.ticker);
              }}
              disabled={busy}
            >
              {c.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>What did they say?</span>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. “Buy Nvidia every time RSI drops below 30 and sell above 70, it wins 90% of the time”"
            disabled={busy}
            maxLength={4000}
          />
        </label>
        {looksLikeLink ? (
          <div className="banner warn">
            We can’t watch videos. Paste the words instead: the caption, the transcript, or the rules in your own words.
          </div>
        ) : null}
        <div className="instant-run">
          <label className="field instant-ticker">
            <span>
              Ticker <small className="hint">optional</small>
            </span>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="auto"
              maxLength={20}
              disabled={busy}
            />
          </label>
          <button className="btn primary" type="submit" disabled={busy || looksLikeLink || text.trim().length < 5}>
            {busy ? 'Testing…' : 'Test it on real prices →'}
          </button>
        </div>
        {status ? (
          <p className="hint" aria-live="polite">
            {status}
          </p>
        ) : null}
        {error ? <div className="banner error">{error}</div> : null}
        <p className="hint">
          Leave the ticker empty to use the one named in the text (S&amp;P 500 if none). Costs of 0.1% per trade
          are included, the way a real broker would charge.
        </p>
      </form>
    </div>
  );
}
