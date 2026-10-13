const ROWS = [
  { s: 'SPY', v: '+0.42%', up: true },
  { s: 'QQQ', v: '+0.61%', up: true },
  { s: 'IWM', v: '−0.18%', up: false },
  { s: 'SMA 20/50', v: 'cross ↑', up: true },
  { s: 'RSI(14)', v: '47.2', up: true },
  { s: 'MACD', v: 'signal +', up: true },
  { s: 'Sharpe', v: '1.38', up: true },
  { s: 'Max DD', v: '−8.2%', up: false },
  { s: 'Fill', v: 'next open', up: true },
  { s: 'Cost', v: '10 bps', up: true },
  { s: 'Parser', v: 'built-in', up: true },
  { s: 'API key', v: 'not required', up: true },
] as const;

export function MarketTicker() {
  const loop = [...ROWS, ...ROWS];
  return (
    <div className="market-ticker" aria-hidden="true">
      <div className="market-ticker-track">
        {loop.map((row, i) => (
          <span key={`${row.s}-${i}`} className={`ticker-item ${row.up ? 'up' : 'down'}`}>
            <strong>{row.s}</strong>
            <em>{row.v}</em>
          </span>
        ))}
      </div>
    </div>
  );
}
