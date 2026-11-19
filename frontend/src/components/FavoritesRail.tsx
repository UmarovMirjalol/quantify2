import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listFavorites, type FavoriteRun } from '../utils/favorites';
import { getPromotion } from '../utils/promotion';

function pct(v: number | null): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

export function FavoritesRail() {
  const [items, setItems] = useState<FavoriteRun[]>(() => listFavorites());

  useEffect(() => {
    const sync = () => setItems(listFavorites());
    window.addEventListener('quantify-favorites', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('quantify-favorites', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!items.length) return null;

  return (
    <div className="fav-rail">
      <div className="fav-rail__head">
        <p className="fav-rail__label">Pinned</p>
        <Link className="fav-rail__desk" to="/desk" title="Morning command desk">
          Desk →
        </Link>
      </div>
      <div className="fav-rail__list">
        {items.slice(0, 8).map((f) => {
          const promo = getPromotion(f.id);
          const active = promo?.status === 'active';
          return (
            <Link
              key={f.id}
              to={`/results/${f.id}`}
              className={`fav-chip${active ? ' fav-chip--live' : ''}`}
              title={active ? `${f.title} · promoted` : f.title}
            >
              {active ? <span className="fav-chip__dot" aria-hidden /> : null}
              <span className="mono">#{f.id}</span>
              <span className={(f.return_pct ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(f.return_pct)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
