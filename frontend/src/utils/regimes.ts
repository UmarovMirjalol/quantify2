import type { PriceBar, RegimeReport, Trade } from '../types';

const DEFAULT_WINDOW = 50;
const SHORT_WINDOW = 20;

export function classifyRegimes(
  prices: PriceBar[],
  trades: Trade[],
  window = DEFAULT_WINDOW,
): RegimeReport {
  const dates = prices.map((bar) => bar.date.slice(0, 10));
  const closes = prices.map((bar) => bar.close);
  const used = closes.length >= window + 2 ? window : SHORT_WINDOW;
  if (closes.length < used + 2) {
    return empty(used, 'Not enough bars to place trades on a finished moving average.');
  }
  const average = sma(closes, used);
  const index = new Map(dates.map((day, i) => [day, i]));
  const grouped = { up: [] as Trade[], down: [] as Trade[] };
  for (const trade of trades) {
    const signal = signalIndex(trade.entry_date.slice(0, 10), dates, index);
    if (signal == null || average[signal] == null) continue;
    const regime = closes[signal] > (average[signal] as number) ? 'up' : 'down';
    grouped[regime].push(trade);
  }
  const up = bucket(grouped.up);
  const down = bucket(grouped.down);
  const [verdict, headline] = judge(up, down, used);
  return { verdict, headline, window: used, up, down };
}

function sma(closes: number[], window: number): Array<number | null> {
  const out: Array<number | null> = Array(closes.length).fill(null);
  let total = 0;
  closes.forEach((close, i) => {
    total += close;
    if (i >= window) total -= closes[i - window];
    if (i >= window - 1) out[i] = total / window;
  });
  return out;
}

function signalIndex(entry: string, dates: string[], index: Map<string, number>): number | null {
  if (!entry) return null;
  let found = index.get(entry);
  if (found == null) found = dates.findIndex((day) => day >= entry);
  if (found == null || found < 1) return null;
  return found - 1;
}

function bucket(trades: Trade[]) {
  const pnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  return {
    trades: trades.length,
    pnl,
    win_rate: trades.length ? wins / trades.length : null,
  };
}

function judge(
  up: RegimeReport['up'],
  down: RegimeReport['down'],
  window: number,
): [RegimeReport['verdict'], string] {
  if (up.trades + down.trades < 3) {
    return [
      'thin',
      `Fewer than three trades land on a finished ${window}-day average, so the split is not evidence.`,
    ];
  }
  const label = `${window}-day average`;
  if (up.pnl > 0 && down.pnl > 0) {
    return [
      'both',
      `The rules made money both above and below the ${label}. The profit is not a one-regime accident.`,
    ];
  }
  if (up.pnl > 0 && down.pnl <= 0 && up.trades >= 2) {
    return [
      'uptrend',
      `The profit showed up while price was above its ${label}. Below that average the same rules did not pay.`,
    ];
  }
  if (down.pnl > 0 && up.pnl <= 0 && down.trades >= 2) {
    return [
      'downtrend',
      `The profit is concentrated below the ${label}. In uptrends these rules did not pay.`,
    ];
  }
  return [
    'neither',
    `Neither side of the ${label} saves the strategy. The result is not hiding in only one kind of market.`,
  ];
}

function empty(window: number, headline: string): RegimeReport {
  const blank = { trades: 0, pnl: 0, win_rate: null };
  return { verdict: 'thin', headline, window, up: blank, down: blank };
}
