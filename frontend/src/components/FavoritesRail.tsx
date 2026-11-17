import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listFavorites, type FavoriteRun } from '../utils/favorites';

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
      <p className="fav-rail__label">Pinned</p>
      <div className="fav-rail__list">
        {items.slice(0, 8).map((f) => (
          <Link key={f.id} to={`/results/${f.id}`} className="fav-chip" title={f.title}>
            <span className="mono">#{f.id}</span>
            <span className={(f.return_pct ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(f.return_pct)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
