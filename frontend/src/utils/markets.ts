/** One-click markets shown on the workspace and Instant Try. */
export const MARKET_CHIPS = [
  // Indices & broad
  'SPY',
  'QQQ',
  'IWM',
  'EEM',
  'FXI',
  // US names
  'NVDA',
  'AAPL',
  'TSLA',
  'AMD',
  'TSM',
  // Macro / factors
  'TLT',
  'HYG',
  'XLE',
  'GLD',
  'SLV',
  // FX & commodities aliases (resolved server-side / yahooSymbol)
  'EURUSD',
  'USDJPY',
  'GOLD',
  'OIL',
  // Crypto
  'BTC',
  'ETH',
  'SOL',
  'BNB',
  'XRP',
] as const;

export const YAHOO_ALIASES: Record<string, string> = {
  BTC: 'BTC-USD',
  ETH: 'ETH-USD',
  SOL: 'SOL-USD',
  BNB: 'BNB-USD',
  XRP: 'XRP-USD',
  DOGE: 'DOGE-USD',
  ADA: 'ADA-USD',
  AVAX: 'AVAX-USD',
  LINK: 'LINK-USD',
  DOT: 'DOT-USD',
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  USDJPY: 'USDJPY=X',
  USDCHF: 'USDCHF=X',
  AUDUSD: 'AUDUSD=X',
  USDCAD: 'USDCAD=X',
  GOLD: 'GC=F',
  SILVER: 'SI=F',
  OIL: 'CL=F',
  WTI: 'CL=F',
  BRENT: 'BZ=F',
  NATGAS: 'NG=F',
  COPPER: 'HG=F',
};

export function yahooSymbol(symbol: string): string {
  const key = symbol.trim().toUpperCase();
  return YAHOO_ALIASES[key] ?? key;
}
