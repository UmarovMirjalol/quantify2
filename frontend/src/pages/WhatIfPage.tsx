import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EquityChart } from '../components/Charts';
import { usePageMeta } from '../hooks/usePageMeta';
import { getWhatIf, type WhatIfPoint, type WhatIfResult } from '../services/api';
import type { EquityPoint } from '../types';
import { money, shareCard, signedPct } from '../utils/shareCard';

const PICKS = ['AAPL', 'NVDA', 'TSLA', 'AMZN', 'BTC-USD', 'SPY'];
const YEARS_AGO = [1, 5, 10, 20];
const ACCENT_HEX = '#4fd6a0';
const HOLD_HEX = '#98a2ac';

const isoYearsAgo = (n: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};

const toPoints = (series: WhatIfPoint[], key: 'value' | 'invested'): EquityPoint[] =>
  series.map((p) => ({ date: p.date, equity: p[key], cash: 0, drawdown: null }));

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function WhatIfPage() {
  usePageMeta(
    'What if I had bought it? — Quantify',
    'See what $1,000 in Apple, Nvidia, Tesla, Bitcoin or the S&P 500 would be worth today. Free, real prices.',
  );
  const [params, setParams] = useSearchParams();
  const [ticker, setTicker] = useState(params.get('t') ?? 'AAPL');
  const [start, setStart] = useState(params.get('from') ?? isoYearsAgo(10));
  const [amount, setAmount] = useState(Number(params.get('amount') ?? 1000));
  const [monthly, setMonthly] = useState(Number(params.get('monthly') ?? 0));
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run(t = ticker, from = start, a = amount, m = monthly) {
    const clean = t.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const r = await getWhatIf({ ticker: clean, start: from, amount: a || 0, monthly: m || 0 });
      setResult(r);
      const next: Record<string, string> = { t: clean, from, amount: String(a || 0) };
      if (m) next.monthly = String(m);
      setParams(next, { replace: true });
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Could not load prices.');
    } finally {
      setLoading(false);
    }
  }

  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !params.get('t')) return;
    autoRan.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    void run();
  }

  const plan = result
    ? `${amount ? money(amount) : ''}${amount && monthly ? ' + ' : ''}${monthly ? `${money(monthly)}/month` : ''}`
    : '';

  async function card() {
    if (!result) return;
    const b = result.benchmark;
    try {
      const how = await shareCard(
        {
          eyebrow: 'What if I had bought it?',
          title: `${plan} in ${result.ticker} since ${longDate(result.start_date)}`,
          meta: `${result.start_date} → ${result.end_date}  ·  real prices`,
          stats: [
            { label: `${result.ticker} today`, value: money(result.value), sub: result.total_return == null ? undefined : signedPct(result.total_return), color: ACCENT_HEX },
            b
              ? { label: 'Same in S&P 500', value: money(b.value), sub: b.total_return == null ? undefined : signedPct(b.total_return), color: HOLD_HEX }
              : { label: 'Put in', value: money(result.invested), color: HOLD_HEX },
          ],
          verdict: result.multiple ? `That's ${result.multiple.toFixed(result.multiple < 10 ? 1 : 0)}× the money` : '',
          verdictColor: result.gain >= 0 ? ACCENT_HEX : '#e57a84',
          lines: [
            ...(b ? [{ values: b.series.map((p) => p.value), color: HOLD_HEX, dashed: true }] : []),
            { values: result.series.map((p) => p.value), color: ACCENT_HEX },
          ],
        },
        `quantify-whatif-${result.ticker}.png`,
      );
      if (how === 'downloaded') setNote('Card saved as PNG.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not draw the card.');
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNote('Link copied. It opens with these numbers already filled in.');
    } catch {
      setNote(window.location.href);
    }
  }

  const b = result?.benchmark;

  return (
    <div className="results whatif">
      <div className="page-header">
        <div>
          <p className="eyebrow">Calculator</p>
          <h1>What if I had bought it?</h1>
          <p className="lede">Pick a stock or coin, an amount and a date. See what it would be worth today, on real prices.</p>
        </div>
      </div>

      <form className="panel whatif-form" onSubmit={submit}>
        <div className="whatif-picks">
          {PICKS.map((p) => (
            <button
              key={p}
              type="button"
              className={`chip${ticker.toUpperCase() === p ? ' active' : ''}`}
              onClick={() => {
                setTicker(p);
                void run(p);
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="whatif-fields">
          <label className="field">
            <span>Stock or coin</span>
            <input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="AAPL, BTC-USD…" maxLength={20} />
          </label>
          <label className="field">
            <span>Amount</span>
            <input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Bought on</span>
            <input type="date" value={start} max={isoYearsAgo(0)} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            <span>
              Add every month <small className="hint">optional</small>
            </span>
            <input type="number" min={0} step="any" value={monthly} onChange={(e) => setMonthly(Number(e.target.value))} />
          </label>
        </div>
        <div className="whatif-picks">
          {YEARS_AGO.map((n) => (
            <button
              key={n}
              type="button"
              className="chip"
              onClick={() => {
                const from = isoYearsAgo(n);
                setStart(from);
                void run(ticker, from);
              }}
            >
              {n} {n === 1 ? 'year' : 'years'} ago
            </button>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? 'Loading prices…' : 'Show me'}
          </button>
        </div>
        {error ? <div className="banner error">{error}</div> : null}
      </form>

      {result ? (
        <>
          <section className={`hold-verdict ${result.gain >= 0 ? 'won' : 'lost'}`}>
            <p>
              <strong>{plan}</strong> in <strong>{result.ticker}</strong> from {longDate(result.start_date)} would be worth
            </p>
            <p className="whatif-big mono">{money(result.value)}</p>
            <p className="hold-verdict-line">
              {result.total_return == null ? null : `${signedPct(result.total_return)} `}
              {result.multiple ? `· ${result.multiple.toFixed(result.multiple < 10 ? 2 : 1)}× the ${money(result.invested)} put in` : null}
            </p>
            {b ? (
              <p className="hint">
                The same plan in the S&amp;P 500 ({b.ticker}): <strong className="mono">{money(b.value)}</strong>
                {b.total_return == null ? null : ` (${signedPct(b.total_return)})`}.{' '}
                {result.value >= b.value ? `${result.ticker} won by ${money(result.value - b.value)}.` : `The S&P 500 won by ${money(b.value - result.value)}.`}
              </p>
            ) : null}
            {result.clipped ? (
              <p className="hint">Price history for {result.ticker} starts on {longDate(result.first_available)}, so the plan starts there.</p>
            ) : null}
            <div className="hold-verdict-actions no-print">
              <button type="button" className="btn secondary small" onClick={card}>
                Share result card
              </button>
              <button type="button" className="btn ghost small" onClick={copyLink}>
                Copy link
              </button>
              {note ? <span className="hint">{note}</span> : null}
            </div>
          </section>

          <section className="panel">
            <h2>
              {result.ticker} vs {b ? 'the S&P 500' : 'money put in'}
            </h2>
            <EquityChart
              data={toPoints(result.series, 'value')}
              name={result.ticker}
              benchmark={b ? toPoints(b.series, 'value') : toPoints(result.series, 'invested')}
              benchmarkName={b ? `S&P 500 (${b.ticker})` : 'Money put in'}
            />
            <p className="hint">
              Daily closing prices, split-adjusted; dividends are not added. Worst drop along the way:{' '}
              {result.max_drawdown == null ? '—' : `${(result.max_drawdown * 100).toFixed(0)}%`}. Past returns say nothing certain about the future.
            </p>
          </section>

          <section className="panel whatif-next">
            <h2>Now test a strategy on {result.ticker}</h2>
            <p className="note">Would buying the dips or following a moving average have beaten just holding? Find out in a minute.</p>
            <Link className="btn primary" to="/app">
              Open the free backtester
            </Link>
          </section>
        </>
      ) : null}
    </div>
  );
}
