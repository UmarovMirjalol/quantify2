import type { PaperSignal } from '../services/api';

function pct(v: number | null | undefined): string {
  if (v == null) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(2)}%`;
}

function actionClass(action: string): string {
  if (action === 'enter' || action === 'add') return 'pos';
  if (action === 'exit') return 'neg';
  return '';
}

export function PaperSignalTable({
  signals,
  dense,
}: {
  signals: PaperSignal[];
  dense?: boolean;
}) {
  if (!signals.length) {
    return <p className="hint">No signals in this pull.</p>;
  }
  return (
    <div className="table-wrap">
      <table className={dense ? 'data-table' : undefined}>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Action</th>
            <th>Side</th>
            <th>In pos</th>
            <th>Close</th>
            <th>Entry</th>
            <th>Unreal.</th>
            <th>Next open</th>
            <th>Sharpe</th>
            <th>As of</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => (
            <tr key={s.ticker}>
              <td className="mono">{s.ticker}</td>
              <td className={actionClass(s.action)}>{s.action}</td>
              <td className="mono hint">{s.side ?? '—'}</td>
              <td>{s.in_position ? 'yes' : 'no'}</td>
              <td className="mono">{s.last_close ?? '—'}</td>
              <td className="mono">{s.entry_price ?? '—'}</td>
              <td className={`mono ${ (s.unrealized_pct ?? 0) >= 0 ? 'pos' : 'neg' }`}>
                {pct(s.unrealized_pct)}
              </td>
              <td className="mono hint">{s.order_for_next_open ?? '—'}</td>
              <td className="mono">
                {s.metrics_snapshot?.sharpe_ratio == null
                  ? '—'
                  : s.metrics_snapshot.sharpe_ratio.toFixed(2)}
              </td>
              <td className="mono">{String(s.as_of ?? '').slice(0, 10) || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
