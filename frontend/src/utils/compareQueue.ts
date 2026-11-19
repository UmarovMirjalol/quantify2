const KEY = 'quantify_compare_a';
const EVENT = 'quantify-compare-queue';

export function getCompareA(): number | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function setCompareA(id: number) {
  try {
    sessionStorage.setItem(KEY, String(id));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { id } }));
  } catch {
    // ignore
  }
}

export function clearCompareA() {
  try {
    sessionStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: null } }));
  } catch {
    // ignore
  }
}

export function peekCompareLabel(): string | null {
  const id = getCompareA();
  return id ? `#${id}` : null;
}
