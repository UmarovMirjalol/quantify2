import { fetchMarketData, parseStrategy, runBacktest } from '../services/api';

const YAHOO_ALIASES: Record<string, string> = { BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD' };

export const yahooSymbol = (symbol: string) => YAHOO_ALIASES[symbol] ?? symbol;

/**
 * Parse, load 10 years of daily prices and run one backtest; returns the saved result id.
 * Leave `ticker` empty to use the asset named in the text (SPY when none is named).
 */
export async function quickRun(text: string, ticker: string, onStatus: (msg: string) => void): Promise<number> {
  let symbol = ticker.trim().toUpperCase();
  if (!symbol) {
    onStatus('Reading the strategy…');
    const parsed = await parseStrategy({ text });
    symbol = parsed.strategy.asset || 'SPY';
  }
  symbol = YAHOO_ALIASES[symbol] ?? symbol;
  onStatus(`Loading 10 years of ${symbol} prices…`);
  const data = await fetchMarketData(symbol, '1d', '10y');
  onStatus('Running the backtest…');
  const result = await runBacktest({
    strategy_text: text,
    dataset_id: data.dataset_id,
    asset: symbol,
    config: { initial_capital: 10_000, commission: 0.001, slippage: 0.0005, risk_per_trade: 0.01 },
  });
  return result.id;
}
