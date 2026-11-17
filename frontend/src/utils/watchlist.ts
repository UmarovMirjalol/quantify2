const KEY = 'quantify_watchlist';

function read(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

function write(items: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 60)));
    window.dispatchEvent(new CustomEvent('quantify-watchlist'));
  } catch {
    // ignore
  }
}

export function listWatchlist(): string[] {
  return read();
}

export function toggleWatch(ticker: string): string[] {
  const t = ticker.trim().toUpperCase();
  if (!t) return read();
  const cur = read();
  const next = cur.includes(t) ? cur.filter((x) => x !== t) : [t, ...cur];
  write(next);
  return next;
}

export function setWatchlist(tickers: string[]): string[] {
  const next = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  write(next);
  return next;
}

export function inWatchlist(ticker: string): boolean {
  return read().includes(ticker.trim().toUpperCase());
}
