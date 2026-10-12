import { useMemo } from 'react';

const FACTS = [
  'Look-ahead bias is one of the most common ways a “perfect” backtest dies in live trading.',
  'A signal on today’s close that fills on today’s close is usually fantasy — next open is more honest.',
  'Sharpe ratio punishes volatility; Sortino focuses on downside pain only.',
  'Max drawdown is the number that shows how bad it felt, not how good the average return looked.',
  'Commission + slippage can flip a “winning” SMA cross into a loser on the same dataset.',
  'RSI below 30 is oversold by convention — not a guarantee of a bounce.',
  'MACD is just two EMAs and a signal line; the magic is in the execution rules around it.',
  'Bollinger Bands widen when volatility expands — mean-reversion edges often shrink right then.',
  'Risking 1% per trade means a 10-loss streak costs ~10% — before compounding effects.',
  'CAGR smooths the path; the equity curve shows the bruises between the CAGR points.',
  'Win rate alone is noise — profit factor asks whether winners pay for the losers.',
  'A 20/50 SMA cross is popular because it’s simple, not because it’s always profitable.',
  'Daily bars hide overnight gaps; stops can fill worse than your chart suggests.',
  'Overfitting loves extra indicators. Out-of-sample pain loves those same indicators.',
  'Cash drag matters: sitting flat is a decision, and backtests should count it.',
  'Two strategies with the same return can have totally different drawdown shapes.',
  'Golden cross (50/200) is a long-horizon story — it trades slowly on purpose.',
  'If both stop-loss and take-profit could hit the same bar, a conservative engine assumes the stop first.',
  'Sample CSV data is for demos. Real research needs your own OHLCV history.',
  'Free parsers that never fail still warn you when they fell back to a default SMA cross.',
  'Institutional desks care about process: signal timing, costs, and audit trails — not chat vibes.',
  'A high win rate with tiny wins and rare huge losses is a classic “looks fine until it doesn’t” profile.',
  'Position sizing often matters more than the entry indicator you obsess over.',
  'EMA reacts faster than SMA — that speed is both edge and whipsaw fuel.',
  'Backtests don’t include emotions. Your next trade still will.',
  'Public pulse feeds are anonymized on purpose — research privacy beats vanity leaderboards.',
  'Rate limits exist so free public backtesters stay usable for everyone.',
  'The boring invariant wins: decide on the close, trade the next open, charge costs.',
  'Strategy of the day rotates so return visitors always have a fresh free idea to run.',
  'If Google sent you here: start with Instant Try, then steal a Playbook preset.',
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
