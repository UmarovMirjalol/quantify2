import type { Trade } from '../types';

function fmt(n: number, digits = 2) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function money(n: number) {
  const sign = n < 0 ? '−' : n > 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function TradeTable({ trades, asset }: { trades: Trade[]; asset?: string }) {
  if (!trades.length) {
    return <div className="empty-state">No trades were executed in this backtest.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Asset</th>
            <th>Side</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>P&amp;L</th>
            <th>Return</th>
            <th>Holding</th>
            <th>Exit reason</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={`${t.entry_date}-${i}`}>
              <td className="mono">
                {t.entry_date.slice(0, 10)}
                <span className="hint"> → {t.exit_date.slice(0, 10)}</span>
              </td>
              <td className="mono">{asset ?? '—'}</td>
              <td>
                <span className="tag">{t.side || 'long'}</span>
              </td>
              <td className="mono">${fmt(t.entry_price)}</td>
              <td className="mono">${fmt(t.exit_price)}</td>
              <td className={t.pnl >= 0 ? 'pos' : 'neg'}>{money(t.pnl)}</td>
              <td className={t.return_pct >= 0 ? 'pos' : 'neg'}>
                {(t.return_pct * 100).toFixed(2)}%
              </td>
              <td className="mono">{t.bars_held}d</td>
              <td className="truncate">{t.exit_reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
