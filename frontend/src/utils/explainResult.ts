import type { EquityPoint, Metrics, Trade } from '../types';

export interface ExplainInput {
  metrics: Metrics;
  trades: Trade[];
  bars: number;
  holdEquity: EquityPoint[];
  holdReturn: number | null;
  won: boolean;
}

const pct0 = (v: number) => `${Math.round(v * 100)}%`;

function worstDrop(equity: EquityPoint[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const p of equity) {
    peak = Math.max(peak, p.equity);
    if (peak > 0) worst = Math.min(worst, p.equity / peak - 1);
  }
  return worst;
}

/** Up to three plain-English reasons why the strategy beat or lost to buying and holding. */
export function explainResult({ metrics, trades, bars, holdEquity, holdReturn, won }: ExplainInput): string[] {
  const out: string[] = [];
  const n = trades.length;

  if (n === 0) {
    return [
      'Your rule never fired on this data, so the money sat in cash the whole time.',
      'Try a longer history, a different ticker, or a looser rule.',
    ];
  }

  const held = trades.reduce((sum, t) => sum + Math.max(0, t.bars_held || 0), 0);
  const inMarket = bars > 0 ? Math.min(1, held / bars) : null;
  const fees = trades.reduce((sum, t) => sum + Math.abs(t.commission || 0), 0);
  const winners = trades.filter((t) => t.pnl > 0).length;
  const stratDrop = metrics.max_drawdown != null ? -Math.abs(metrics.max_drawdown) : null;
  const holdDrop = holdEquity.length ? worstDrop(holdEquity) : null;
  const marketUp = holdReturn != null && holdReturn > 0;

  if (inMarket != null) {
    if (!won && marketUp && inMarket < 0.7) {
      out.push(
        `You were in the market only ${pct0(inMarket)} of the time. The market rose ${pct0(holdReturn!)} overall, and sitting in cash missed much of that rise.`,
      );
    } else if (won && !marketUp) {
      out.push(`The market fell ${pct0(Math.abs(holdReturn ?? 0))}, and your rule spent ${pct0(1 - inMarket)} of the time safely in cash.`);
    } else {
      out.push(`You were in the market ${pct0(inMarket)} of the time.`);
    }
  }

  if (stratDrop != null && holdDrop != null) {
    if (stratDrop > holdDrop + 0.05) {
      out.push(`Your worst drop was ${pct0(stratDrop)}, versus ${pct0(holdDrop)} for holding, so the ride was smoother.`);
    } else if (stratDrop < holdDrop - 0.05) {
      out.push(`Your worst drop was ${pct0(stratDrop)}, deeper than the ${pct0(holdDrop)} you would have seen just holding.`);
    }
  }

  const start = metrics.initial_capital ?? 0;
  if (start > 0 && fees / start > 0.03) {
    out.push(`Fees and slippage cost about $${Math.round(fees).toLocaleString('en-US')} over ${n} trades. Trading less often keeps more of the gains.`);
  } else {
    out.push(`${winners} of ${n} trade${n === 1 ? '' : 's'} made money.`);
  }

  return out.slice(0, 3);
}
