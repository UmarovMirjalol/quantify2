import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EquityChart } from '../components/Charts';
import { KpiCard } from '../components/KpiCard';
import { toast } from '../components/ToastHost';
import { usePageMeta } from '../hooks/usePageMeta';
import type { BacktestResult } from '../types';
import { buildBuyAndHold } from '../utils/buyAndHold';
import { quickRunResult } from '../utils/quickRun';
import { shareCard, signedPct } from '../utils/shareCard';

const CLAIMS = [
  { label: '“RSI under 30 = free money”', text: 'Buy when RSI drops below 30 and sell when RSI goes above 70', ticker: 'SPY' },
  {
    label: '“The golden cross never fails”',
    text: 'Buy when the 50-day SMA crosses above the 200-day SMA and sell when it crosses below',
    ticker: 'SPY',
  },
  { label: '“Buy every Tesla dip”', text: 'Buy when the price drops 5% in a day', ticker: 'TSLA' },
  { label: '“Buy Monday, sell Friday”', text: 'Buy on Monday and sell on Friday', ticker: 'QQQ' },
  { label: '“Bitcoin weekend trick”', text: 'Buy on Friday and sell on Monday', ticker: 'BTC-USD' },
];

const ACCENT = '#4fd6a0';
const HOLD = '#98a2ac';

function pct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

export function CheckPage() {
  usePageMeta(
    'Check a guru’s strategy — Quantify',
    'Paste a trading strategy from TikTok, YouTube or X. We test it on 10 years of real prices against simply buying and holding. Free.',
  );
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const [ticker, setTicker] = useState(params.get('t') ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const busy = status !== null;
  const looksLikeLink = /^\s*https?:\/\//i.test(text);

  const hold = useMemo(() => {
    if (!result?.price_series?.length) return null;
    const start = result.metrics.initial_capital ?? result.strategy.initial_capital ?? 10000;
    return buildBuyAndHold(result.price_series, start);
  }, [result]);

  const vsHold =
    result?.metrics.total_return != null && hold?.totalReturn != null
      ? result.metrics.total_return - hold.totalReturn
      : null;

  async function runClaim(claimText: string, claimTicker: string) {
    const cleaned = claimText.trim();
    if (cleaned.length < 5) return;
    setError(null);
    setResult(null);
    try {
      const out = await quickRunResult(cleaned, claimTicker, setStatus);
      setResult(out);
      setStatus(null);
      setParams({ q: cleaned, ...(claimTicker.trim() ? { t: claimTicker.trim().toUpperCase() } : {}) }, { replace: true });
      toast('Guru check ready', { tone: 'ok', body: `#${out.id} · ${out.dataset_name}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not test this strategy.');
      setStatus(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (looksLikeLink) return;
    await runClaim(text, ticker);
  }

  useEffect(() => {
    const q = params.get('q');
    if (!q || q.trim().length < 5 || result) return;
    void runClaim(q, params.get('t') ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function card() {
    if (!result) return;
    try {
      await shareCard(
        {
          eyebrow: 'Guru check',
          title: result.strategy_description.slice(0, 90),
          meta: `${result.dataset_name} · 10y · #${result.id}`,
          stats: [
            {
              label: 'Strategy',
              value: signedPct(result.metrics.total_return ?? 0),
              color: ACCENT,
            },
            {
              label: 'Buy & hold',
              value: hold?.totalReturn == null ? '—' : signedPct(hold.totalReturn),
              color: HOLD,
            },
          ],
          verdict:
            vsHold == null
              ? result.strategy_description.slice(0, 80)
              : vsHold >= 0
                ? `Beat holding by ${signedPct(vsHold)}`
                : `Lost to holding by ${signedPct(Math.abs(vsHold))}`,
          verdictColor: (vsHold ?? 0) >= 0 ? ACCENT : '#e57a84',
          lines: [
            ...(hold ? [{ values: hold.equity.map((p) => p.equity), color: HOLD, dashed: true }] : []),
            { values: result.equity_curve.map((p) => p.equity), color: ACCENT },
          ],
        },
        `quantify-check-${result.id}.png`,
      );
      toast('Share card ready', { tone: 'ok' });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not draw the card.', { tone: 'error' });
    }
  }

  const m = result?.metrics;

  return (
    <div className="results check-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Guru check</p>
          <h1>Did that strategy from the video actually work?</h1>
          <p className="lede">
            Paste the claim. We parse rules, run 10 years of prices, and keep the verdict on this page — against buy &amp;
            hold.
          </p>
        </div>
      </div>

      <form className="panel check-form" onSubmit={(e) => void submit(e)}>
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
          Leave the ticker empty to use the one named in the text (S&amp;P 500 if none). Costs of 0.1% per trade are
          included.
        </p>
      </form>

      {result && m ? (
        <>
          <section className={`hold-verdict ${vsHold != null && vsHold >= 0 ? 'won' : 'lost'}`}>
            <p className="eyebrow">
              #{result.id} · {result.dataset_name} · {result.strategy.side ?? 'long'}
            </p>
            <h2>{result.strategy_description}</h2>
            <p className="hold-verdict-line">
              {vsHold == null
                ? 'Compared with buy & hold when prices are available.'
                : vsHold >= 0
                  ? `Beat buy & hold by ${pct(vsHold)}.`
                  : `Lost to buy & hold by ${pct(Math.abs(vsHold))}.`}
            </p>
            <div className="btn-row" style={{ marginTop: '0.75rem' }}>
              <button type="button" className="btn secondary small" onClick={() => void card()}>
                Share result card
              </button>
              <button
                type="button"
                className="btn primary small"
                onClick={() => navigate(`/results/${result.id}`, { state: { result } })}
              >
                Open full report
              </button>
              <Link className="btn ghost small" to={`/results/${result.id}#lab`}>
                Open Lab
              </Link>
            </div>
          </section>

          <section className="kpi-grid">
            <KpiCard
              label="Strategy return"
              value={pct(m.total_return)}
              tone={(m.total_return ?? 0) >= 0 ? 'positive' : 'negative'}
            />
            <KpiCard
              label="Buy & hold"
              value={pct(hold?.totalReturn)}
              tone={(hold?.totalReturn ?? 0) >= 0 ? 'positive' : 'negative'}
            />
            <KpiCard
              label="vs hold"
              value={pct(vsHold)}
              tone={vsHold == null ? 'neutral' : vsHold >= 0 ? 'positive' : 'negative'}
            />
            <KpiCard label="Sharpe" value={m.sharpe_ratio == null ? '—' : m.sharpe_ratio.toFixed(2)} />
            <KpiCard label="Max DD" value={pct(m.max_drawdown)} tone="negative" />
            <KpiCard label="Trades" value={String(m.number_of_trades)} />
            <KpiCard label="Win rate" value={pct(m.win_rate)} />
            <KpiCard
              label="CAGR"
              value={pct(m.cagr)}
              tone={(m.cagr ?? 0) >= 0 ? 'positive' : 'negative'}
            />
          </section>

          <section className="panel">
            <h2>Equity vs buy &amp; hold</h2>
            <EquityChart
              data={result.equity_curve}
              benchmark={hold?.equity}
              name="Strategy"
              benchmarkName="Buy & hold"
            />
          </section>

          <section className="panel">
            <h2>Rules we tested</h2>
            <p className="hint">{result.strategy_description}</p>
            <dl className="kv">
              <div>
                <dt>Asset</dt>
                <dd>{result.strategy.asset}</dd>
              </div>
              <div>
                <dt>Stop</dt>
                <dd>{result.strategy.stop_loss == null ? '—' : pct(result.strategy.stop_loss)}</dd>
              </div>
              <div>
                <dt>Take profit</dt>
                <dd>{result.strategy.take_profit == null ? '—' : pct(result.strategy.take_profit)}</dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd className="mono">
                  {m.start_date ?? '—'} → {m.end_date ?? '—'}
                </dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}
    </div>
  );
}
