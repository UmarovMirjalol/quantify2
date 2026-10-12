import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { getPlaybook } from '../services/api';
import type { PlaybookItem } from '../types';

export function PlaybookPage() {
  usePageMeta(
    'Trading Strategy Playbook — Free Backtest Presets | Quantify',
    'Browse free SMA, RSI, MACD and Bollinger strategy presets and run look-ahead-safe backtests with no API key.',
  );
  const [items, setItems] = useState<PlaybookItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPlaybook()
      .then((data) => setItems(data.items))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="playbook-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Strategy gallery</p>
          <h1>Playbook</h1>
          <p className="lede">
            Curated natural-language strategies. Open any card in the workspace — the engine parses
            it the same way as a typed idea.
          </p>
        </div>
        <Link className="btn primary" to="/app">
          Blank workspace
        </Link>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="skeleton-line" style={{ width: '42%', margin: '0 auto 0.75rem' }} />
          Loading playbook…
        </div>
      ) : null}

      {error ? (
        <div className="banner error">
          {error}
          <div style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn secondary small" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {!loading && items.length ? (
        <div className="playbook-grid">
          {items.map((item) => (
            <article key={item.id} className="playbook-card panel">
              <div className="gallery-meta">
                <span className="gallery-tag mono">{item.tag}</span>
                <span className="gallery-inds mono">{item.indicators.join(' · ')}</span>
              </div>
              <h2>{item.title}</h2>
              <p className="playbook-blurb">{item.blurb}</p>
              <pre className="playbook-text mono">{item.text}</pre>
              <div className="playbook-actions">
                <Link
                  className="btn primary small"
                  to={`/app?strategy=${encodeURIComponent(item.id)}`}
                >
                  Run backtest
                </Link>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => navigator.clipboard?.writeText(item.text)}
                >
                  Copy text
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
