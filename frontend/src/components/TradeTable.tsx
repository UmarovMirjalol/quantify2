import type { Trade } from '../types';

function fmt(n: number, digits = 2) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function TradeTable({ trades }: { trades: Trade[] }) {
  if (!trades.length) {
    return <div className="empty-state">No trades were executed in this backtest.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Entry</th>
            <th>Exit</th>
            <th>Qty</th>
            <th>Entry $</th>
            <th>Exit $</th>
            <th>PnL</th>
            <th>Return</th>
            <th>Bars</th>
            <th>Exit Reason</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={`${t.entry_date}-${i}`}>
              <td>{t.entry_date.slice(0, 10)}</td>
              <td>{t.exit_date.slice(0, 10)}</td>
              <td>{fmt(t.quantity, 0)}</td>
              <td>{fmt(t.entry_price)}</td>
              <td>{fmt(t.exit_price)}</td>
              <td className={t.pnl >= 0 ? 'pos' : 'neg'}>{fmt(t.pnl)}</td>
              <td className={t.return_pct >= 0 ? 'pos' : 'neg'}>
                {(t.return_pct * 100).toFixed(2)}%
              </td>
              <td>{t.bars_held}</td>
              <td>{t.exit_reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
