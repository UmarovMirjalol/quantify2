const SCREENER_KEY = 'quantify_screener_archive';
const DISCOVER_KEY = 'quantify_discover_archive';
const MAX = 16;

export type ScreenerArchiveEntry = {
  id: string;
  saved_at: string;
  label: string;
  history: string;
  scanned: number;
  actionable: number;
  strategy_text: string;
  result: unknown;
};

export type DiscoverArchiveEntry = {
  id: string;
  saved_at: string;
  label: string;
  asset: string;
  verdict: string;
  candidates: number;
  result: unknown;
};

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[];
  } catch {
    return [];
  }
}

function write(key: string, list: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // ignore
  }
}

export function listScreenerArchive(): ScreenerArchiveEntry[] {
  return read(SCREENER_KEY);
}

export function saveScreenerArchive(entry: Omit<ScreenerArchiveEntry, 'id' | 'saved_at'>) {
  const full: ScreenerArchiveEntry = {
    ...entry,
    id: `${Date.now().toString(36)}`,
    saved_at: new Date().toISOString(),
  };
  write(SCREENER_KEY, [full, ...listScreenerArchive().filter((e) => e.label !== full.label)]);
  return full;
}

export function removeScreenerArchive(id: string) {
  write(
    SCREENER_KEY,
    listScreenerArchive().filter((e) => e.id !== id),
  );
}

export function listDiscoverArchive(): DiscoverArchiveEntry[] {
  return read(DISCOVER_KEY);
}

export function saveDiscoverArchive(entry: Omit<DiscoverArchiveEntry, 'id' | 'saved_at'>) {
  const full: DiscoverArchiveEntry = {
    ...entry,
    id: `${Date.now().toString(36)}`,
    saved_at: new Date().toISOString(),
  };
  write(DISCOVER_KEY, [full, ...listDiscoverArchive().filter((e) => e.label !== full.label)]);
  return full;
}

export function removeDiscoverArchive(id: string) {
  write(
    DISCOVER_KEY,
    listDiscoverArchive().filter((e) => e.id !== id),
  );
}
