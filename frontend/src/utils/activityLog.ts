const KEY = 'quantify_activity';

export type ActivityItem = {
  id: string;
  at: string;
  label: string;
  href?: string;
};

function read(): ActivityItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(items: ActivityItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 30)));
    window.dispatchEvent(new CustomEvent('quantify-activity'));
  } catch {
    // ignore
  }
}

export function listActivity(): ActivityItem[] {
  return read();
}

export function logActivity(label: string, href?: string) {
  const item: ActivityItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    label: label.slice(0, 140),
    href,
  };
  write([item, ...read().filter((x) => x.label !== label)]);
}
