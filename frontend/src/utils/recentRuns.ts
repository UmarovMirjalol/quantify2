const KEY = 'quantify_recent_runs';

export type RecentRun = {
  id: number;
  title: string;
  at: string;
};

function read(): RecentRun[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(items: RecentRun[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 12)));
  } catch {
    // ignore
  }
}

export function listRecentRuns(): RecentRun[] {
  return read();
}

export function pushRecentRun(id: number, title: string) {
  const next = [{ id, title: title.slice(0, 120), at: new Date().toISOString() }, ...read().filter((r) => r.id !== id)];
  write(next);
}
