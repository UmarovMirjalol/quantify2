import { fetchMarketData, parseStrategy, runBacktest } from '../services/api';
import type { BacktestResult } from '../types';
import { yahooSymbol } from './markets';

export { yahooSymbol } from './markets';

/**
 * Parse, load 10 years of daily prices and run one backtest.
 * Leave `ticker` empty to use the asset named in the text (QQQ when none is named).
 */
export async function quickRunResult(
  text: string,
  ticker: string,
  onStatus: (msg: string) => void,
): Promise<BacktestResult> {
  let symbol = ticker.trim().toUpperCase();
  if (!symbol) {
    onStatus('Reading the strategy…');
    const parsed = await parseStrategy({ text });
    symbol = parsed.strategy.asset || 'QQQ';
  }
  symbol = yahooSymbol(symbol);
  onStatus(`Loading 10 years of ${symbol} prices…`);
  const data = await fetchMarketData(symbol, '1d', '10y');
  onStatus('Running the backtest…');
  return runBacktest({
    strategy_text: text,
    dataset_id: data.dataset_id,
    asset: symbol,
    config: { initial_capital: 10_000, commission: 0.001, slippage: 0.0005, risk_per_trade: 0.01 },
  });
}

/** Returns the saved result id (legacy callers). */
export async function quickRun(text: string, ticker: string, onStatus: (msg: string) => void): Promise<number> {
  const result = await quickRunResult(text, ticker, onStatus);
  return result.id;
}
