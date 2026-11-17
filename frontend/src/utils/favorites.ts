const KEY = 'quantify_favorites';

export type FavoriteRun = {
  id: number;
  title: string;
  dataset: string;
  return_pct: number | null;
  sharpe: number | null;
  pinned_at: string;
};

function read(): FavoriteRun[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: FavoriteRun[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 40)));
    window.dispatchEvent(new CustomEvent('quantify-favorites'));
  } catch {
    // ignore
  }
}

export function listFavorites(): FavoriteRun[] {
  return read();
}

export function isFavorite(id: number): boolean {
  return read().some((f) => f.id === id);
}

export function toggleFavorite(run: Omit<FavoriteRun, 'pinned_at'>): FavoriteRun[] {
  const cur = read();
  if (cur.some((f) => f.id === run.id)) {
    const next = cur.filter((f) => f.id !== run.id);
    write(next);
    return next;
  }
  const next = [{ ...run, pinned_at: new Date().toISOString() }, ...cur];
  write(next);
  return next;
}
