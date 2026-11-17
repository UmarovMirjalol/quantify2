const KEY = 'quantify_run_tags';

type Store = Record<string, string[]>;

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
    window.dispatchEvent(new CustomEvent('quantify-tags'));
  } catch {
    // ignore
  }
}

export function getTags(id: number): string[] {
  return read()[String(id)] || [];
}

export function setTags(id: number, tags: string[]) {
  const store = read();
  const cleaned = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  if (!cleaned.length) delete store[String(id)];
  else store[String(id)] = cleaned;
  write(store);
}

export function addTag(id: number, tag: string) {
  setTags(id, [...getTags(id), tag]);
}

export function removeTag(id: number, tag: string) {
  setTags(
    id,
    getTags(id).filter((t) => t !== tag),
  );
}

export function allTags(): string[] {
  const set = new Set<string>();
  for (const tags of Object.values(read())) tags.forEach((t) => set.add(t));
  return [...set].sort();
}

export function idsWithTag(tag: string): number[] {
  const needle = tag.trim().toLowerCase();
  return Object.entries(read())
    .filter(([, tags]) => tags.includes(needle))
    .map(([id]) => Number(id));
}
