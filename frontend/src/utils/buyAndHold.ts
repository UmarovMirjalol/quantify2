import type { EquityPoint, PriceBar } from '../types';

export type BuyAndHoldSeries = {
  equity: EquityPoint[];
  totalReturn: number | null;
  finalCapital: number | null;
};

/**
 * Simple buy-and-hold benchmark on the same bars:
 * buy at first open (or close), mark equity to each close. No costs.
 */
export function buildBuyAndHold(
  prices: PriceBar[],
  initialCapital: number,
): BuyAndHoldSeries {
  if (!prices.length || !(initialCapital > 0)) {
    return { equity: [], totalReturn: null, finalCapital: null };
  }

  const entry = prices[0].open > 0 ? prices[0].open : prices[0].close;
  if (!(entry > 0)) {
    return { equity: [], totalReturn: null, finalCapital: null };
  }

  const shares = initialCapital / entry;
  const equity: EquityPoint[] = prices.map((bar) => {
    const eq = shares * bar.close;
    return {
      date: bar.date,
      equity: eq,
      cash: 0,
      drawdown: null,
    };
  });

  let peak = equity[0].equity;
  for (const pt of equity) {
    peak = Math.max(peak, pt.equity);
    pt.drawdown = peak > 0 ? (pt.equity - peak) / peak : 0;
  }

  const finalCapital = equity[equity.length - 1]?.equity ?? null;
  const totalReturn =
    finalCapital == null ? null : (finalCapital - initialCapital) / initialCapital;

  return { equity, totalReturn, finalCapital };
}
