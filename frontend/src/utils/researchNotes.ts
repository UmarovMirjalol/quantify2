const KEY = 'quantify_research_notes';

type Store = Record<string, string>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Store;
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function getNote(id: number): string {
  return read()[String(id)] || '';
}

export function setNote(id: number, text: string) {
  const store = read();
  const key = String(id);
  if (!text.trim()) delete store[key];
  else store[key] = text.slice(0, 4000);
  write(store);
}
