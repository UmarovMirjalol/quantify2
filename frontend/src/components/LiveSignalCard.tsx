import { useEffect, useState } from 'react';
import { refreshLiveSignal } from '../services/api';
import type { LiveSignal } from '../types';
import { price } from '../utils/signal';

const TONE: Record<LiveSignal['action'], string> = {
  enter: 'holds',
  add: 'holds',
  hold: 'holds',
  exit: 'overfit',
  wait: 'thin',
};

function headline(s: LiveSignal): string {
  const long = s.side === 'long';
  switch (s.action) {
    case 'enter':
      return long ? 'Buy at the next open' : 'Sell short at the next open';
    case 'add':
      return long ? 'Add to the long at the next open' : 'Add to the short at the next open';
    case 'exit':
      return long ? 'Sell at the next open' : 'Cover at the next open';
    case 'hold':
      return long ? 'Hold the long' : 'Hold the short';
    default:
      return 'Stay out';
  }
}

function detail(s: LiveSignal): string {
  if (s.action === 'enter') return 'The entry rule fired on the latest close. Orders fill at the next bar’s open.';
  if (s.action === 'exit') return 'The exit rule fired on the latest close. The position closes at the next bar’s open.';
  if (s.action === 'add') return 'The entry rule fired again while in a position, and pyramiding allows another entry.';
  if (s.action === 'hold') return 'In a position and no exit rule fired on the latest close. Stops and targets still apply intrabar.';
  return 'No position and no entry signal on the latest close. Nothing to do until the rule fires.';
}

const STALE_DAYS = 7;

function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function LiveSignalCard({
  backtestId,
  initial,
  canRefresh,
  datasetName,
}: {
  backtestId: number;
  initial?: LiveSignal;
  canRefresh: boolean;
  datasetName?: string;
}) {
  const [signal, setSignal] = useState<LiveSignal | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSignal(initial ?? null);
    setError('');
  }, [backtestId, initial]);

  async function refresh() {
    setBusy(true);
    setError('');
    try {
      setSignal(await refreshLiveSignal(backtestId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh the signal.');
    } finally {
      setBusy(false);
    }
  }

  if (!signal && !canRefresh) return null;

  const demo = /^sample_/i.test(datasetName ?? '');
  const age = signal ? ageDays(signal.as_of) : 0;

  return (
    <section className={`stress-verdict live-signal verdict-${signal ? TONE[signal.action] : 'thin'}`}>
      {demo ? (
        <p className="banner warn">
          Demo data: this is a built-in synthetic sample, not a real market, so this “signal” is only an example. Load a
          ticker in the workspace for a live signal.
        </p>
      ) : signal && age > STALE_DAYS ? (
        <p className="banner warn">
          The latest bar is from {signal.as_of.slice(0, 10)}, {age} days ago. Update with the latest data before acting
          on it.
        </p>
      ) : null}
      <div className="verdict-head">
        <div>
          <p className="eyebrow">{demo ? 'Signal on demo data' : age > STALE_DAYS ? `Signal as of ${signal?.as_of.slice(0, 10)}` : 'Signal today'}</p>
          <h2>{signal ? headline(signal) : 'Check today’s signal'}</h2>
          <p>
            {signal
              ? detail(signal)
              : 'Run the strategy on the latest bar to see whether it is in a position and what it would do next.'}
          </p>
        </div>
        {canRefresh ? (
          <button type="button" className="btn secondary small no-print" onClick={refresh} disabled={busy}>
            {busy ? 'Updating…' : 'Update with latest data'}
          </button>
        ) : null}
      </div>
      {signal ? (
        <dl className="live-signal-facts">
          <div>
            <dt>As of</dt>
            <dd className="mono">{signal.as_of.slice(0, 10)}</dd>
          </div>
          <div>
            <dt>Last close</dt>
            <dd className="mono">{price(signal.last_close)}</dd>
          </div>
          <div>
            <dt>Position</dt>
            <dd>{signal.in_position ? (signal.side === 'long' ? 'Long' : 'Short') : 'Flat'}</dd>
          </div>
          {signal.in_position ? (
            <>
              <div>
                <dt>Entered</dt>
                <dd className="mono">
                  {price(signal.entry_price)} · {signal.entry_date?.slice(0, 10) ?? '—'}
                </dd>
              </div>
              <div>
                <dt>Open P&L</dt>
                <dd className={`mono ${signal.unrealized_pnl >= 0 ? 'positive' : 'negative'}`}>
                  {signal.unrealized_pct >= 0 ? '+' : ''}
                  {(signal.unrealized_pct * 100).toFixed(2)}%
                </dd>
              </div>
              <div>
                <dt>Stop / target</dt>
                <dd className="mono">
                  {price(signal.stop_loss_price)} / {price(signal.take_profit_price)}
                </dd>
              </div>
            </>
          ) : null}
        </dl>
      ) : null}
      {signal?.note || error ? <p className="hint">{error || signal?.note}</p> : null}
      <p className="hint">Research output, not investment advice.</p>
    </section>
  );
}
