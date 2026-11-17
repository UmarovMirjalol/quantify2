import { useEffect, useMemo, useState } from 'react';
import type { EquityPoint, PriceBar, Trade } from '../types';
import { EquitySparkline } from './EquitySparkline';

function money(n: number) {
  const sign = n < 0 ? '−' : n > 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

/** Scrub through closed trades with equity path up to that exit. */
export function TradeReplay({
  trades,
  equity,
  prices,
}: {
  trades: Trade[];
  equity: EquityPoint[];
  prices?: PriceBar[];
}) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  const safeIdx = Math.min(Math.max(0, idx), Math.max(0, trades.length - 1));
  const trade = trades[safeIdx];

  const equityToTrade = useMemo(() => {
    if (!trade || !equity.length) return [] as number[];
    const exit = trade.exit_date.slice(0, 19);
    const cut = equity.findIndex((p) => p.date.slice(0, 19) > exit);
    const slice = cut < 0 ? equity : equity.slice(0, Math.max(1, cut));
    return slice.map((p) => p.equity);
  }, [trade, equity]);

  const priceWindow = useMemo(() => {
    if (!trade || !prices?.length) return [] as number[];
    const entry = trade.entry_date.slice(0, 10);
    const exit = trade.exit_date.slice(0, 10);
    const win = prices.filter((p) => {
      const d = p.date.slice(0, 10);
      return d >= entry && d <= exit;
    });
    return win.map((p) => p.close);
  }, [trade, prices]);

  useEffect(() => {
    if (!playing || trades.length < 2) return;
    const id = window.setInterval(() => {
      setIdx((i) => {
        if (i >= trades.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 900);
    return () => window.clearInterval(id);
  }, [playing, trades.length]);

  if (!trades.length) {
    return <div className="empty-state">No trades to replay.</div>;
  }

  return (
    <section className="trade-replay panel">
      <div className="trade-replay__head">
        <div>
          <p className="eyebrow">Trade replay</p>
          <h2>
            Trade {safeIdx + 1} / {trades.length}
          </h2>
        </div>
        <div className="btn-row">
          <button type="button" className="btn ghost small" onClick={() => setIdx(0)} disabled={safeIdx === 0}>
            ⏮
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={safeIdx === 0}
          >
            ◀
          </button>
          <button type="button" className={`btn ${playing ? 'secondary' : 'primary'} small`} onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setIdx((i) => Math.min(trades.length - 1, i + 1))}
            disabled={safeIdx >= trades.length - 1}
          >
            ▶
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setIdx(trades.length - 1)}
            disabled={safeIdx >= trades.length - 1}
          >
            ⏭
          </button>
        </div>
      </div>

      <input
        className="trade-replay__scrub"
        type="range"
        min={0}
        max={trades.length - 1}
        value={safeIdx}
        onChange={(e) => {
          setPlaying(false);
          setIdx(Number(e.target.value));
        }}
        aria-label="Scrub trades"
      />

      <div className="trade-replay__body">
        <div className="trade-replay__card">
          <span className="tag">{trade.side || 'long'}</span>
          <p className="mono">
            {trade.entry_date.slice(0, 10)} → {trade.exit_date.slice(0, 10)}
          </p>
          <p>
            Entry <strong className="mono">${trade.entry_price.toFixed(2)}</strong> · Exit{' '}
            <strong className="mono">${trade.exit_price.toFixed(2)}</strong>
          </p>
          <p className={trade.pnl >= 0 ? 'pos' : 'neg'}>
            <strong>
              {money(trade.pnl)} · {pct(trade.return_pct)}
            </strong>
            <span className="hint"> · {trade.bars_held} bars</span>
          </p>
          <p className="hint trade-replay__why">
            {trade.entry_why ? (
              <>
                <b>In:</b> {trade.entry_why}
                <br />
              </>
            ) : null}
            <b>Out:</b> {trade.exit_why || trade.exit_reason.replace(/_/g, ' ')}
          </p>
        </div>
        <div className="trade-replay__charts">
          <div>
            <small>Equity to exit</small>
            <EquitySparkline values={equityToTrade} width={220} height={48} positive={(trade.pnl ?? 0) >= 0} />
          </div>
          {priceWindow.length > 1 ? (
            <div>
              <small>Price in trade</small>
              <EquitySparkline
                values={priceWindow}
                width={220}
                height={48}
                positive={trade.exit_price >= trade.entry_price}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
