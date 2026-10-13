import { useMemo } from 'react';

const FACTS = [
  'Look-ahead bias is a common reason a strong backtest fails live.',
  'A signal on today’s close that fills on today’s close usually overstates realism — next open is safer.',
  'Sharpe penalizes total volatility; Sortino focuses on downside deviation.',
  'Max drawdown measures the worst peak-to-trough decline, not average return quality.',
  'Commission and slippage can turn a profitable SMA cross into a losing one on the same data.',
  'RSI below 30 is a conventional oversold level, not a guarantee of a bounce.',
  'MACD is two EMAs plus a signal line; results depend on the execution rules around it.',
  'Bollinger Bands widen when volatility expands — mean-reversion edges often shrink then.',
  'Risking 1% per trade means ten consecutive losses cost about 10% before compounding.',
  'CAGR summarizes the path; the equity curve shows the path itself.',
  'Win rate alone is incomplete — profit factor asks whether winners cover losers.',
  'A 20/50 SMA cross is popular because it is simple, not because it is always profitable.',
  'Daily bars hide overnight gaps; stops can fill worse than the chart suggests.',
  'Extra indicators make overfitting easier; out-of-sample tests catch that.',
  'Sitting in cash is a decision — backtests should reflect it.',
  'Two strategies with the same return can have very different drawdown shapes.',
  'A 50/200 golden cross is a long-horizon rule and trades infrequently by design.',
  'If stop-loss and take-profit could both hit the same bar, a conservative engine assumes the stop first.',
  'Sample CSV data is for demos. Research needs your own OHLCV history.',
  'When the parser falls back to a default SMA cross, the UI should say so.',
  'Process matters: signal timing, costs, and an audit trail of the rules that ran.',
  'High win rate with small wins and rare large losses is a fragile profile.',
  'Position sizing often matters more than the entry indicator.',
  'EMA reacts faster than SMA — that speed cuts both ways.',
  'Backtests omit emotions; live trading does not.',
  'Public pulse rows are anonymized so recent activity does not expose research detail.',
  'Rate limits keep a free public backtester usable under load.',
  'A durable invariant: decide on the close, trade the next open, apply costs.',
  'Strategy of the day rotates so return visitors see a different preset.',
  'A practical start: Instant Try, then a playbook preset, then your own CSV.',
] as const;

function dayOfYear(): number {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  return Math.floor((now.getTime() - start) / 86_400_000);
}

export function DailyFact() {
  const { fact, n, total } = useMemo(() => {
    const n = dayOfYear();
    return {
      fact: FACTS[n % FACTS.length],
      n: (n % FACTS.length) + 1,
      total: FACTS.length,
    };
  }, []);

  return (
    <section className="landing-section daily-fact-section in-view" aria-label="Daily quant fact">
      <div className="daily-fact-inner">
        <p className="eyebrow">
          <span className="live-pulse" aria-hidden="true" />
          Fact of the day
        </p>
        <p className="daily-fact-text">“{fact}”</p>
        <p className="daily-fact-meta mono">
          Rotates daily · #{n} / {total}
        </p>
      </div>
    </section>
  );
}
