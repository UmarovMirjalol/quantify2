import { useEffect, useState } from 'react';
import { listWatchlist, setWatchlist, toggleWatch } from '../utils/watchlist';
import { toast } from './ToastHost';

export function WatchlistBar({
  onApply,
}: {
  onApply?: (tickers: string[]) => void;
}) {
  const [items, setItems] = useState(() => listWatchlist());
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const sync = () => setItems(listWatchlist());
    window.addEventListener('quantify-watchlist', sync);
    return () => window.removeEventListener('quantify-watchlist', sync);
  }, []);

  if (!items.length && !onApply) {
    // still show add UI
  }

  return (
    <section className="watchlist-bar panel">
      <div className="watchlist-bar__head">
        <h2>Watchlist</h2>
        {onApply && items.length ? (
          <button type="button" className="btn ghost small" onClick={() => onApply(items)}>
            Apply to form
          </button>
        ) : null}
      </div>
      <div className="watchlist-bar__chips">
        {items.map((t) => (
          <button
            key={t}
            type="button"
            className="watch-chip"
            onClick={() => {
              setItems(toggleWatch(t));
              toast(`Removed ${t}`, { tone: 'info' });
            }}
            title="Click to remove"
          >
            {t} ×
          </button>
        ))}
        {!items.length ? <span className="hint">Empty — add tickers below.</span> : null}
      </div>
      <div className="btn-row">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="AAPL, NVDA, BTC-USD"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const next = setWatchlist([
                ...items,
                ...draft.split(/[\s,;]+/).map((x) => x.trim()),
              ]);
              setItems(next);
              setDraft('');
              toast('Watchlist updated', { tone: 'ok' });
            }
          }}
        />
        <button
          type="button"
          className="btn secondary small"
          onClick={() => {
            const next = setWatchlist([
              ...items,
              ...draft.split(/[\s,;]+/).map((x) => x.trim()),
            ]);
            setItems(next);
            setDraft('');
            toast('Watchlist updated', { tone: 'ok' });
          }}
        >
          Add
        </button>
      </div>
    </section>
  );
}
