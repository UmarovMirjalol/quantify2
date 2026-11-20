import type { NavigateFunction } from 'react-router-dom';
import { listRecentRuns } from './recentRuns';

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

export type CompareToggleResult =
  | { kind: 'duel'; a: number; b: number }
  | { kind: 'queued'; id: number }
  | { kind: 'cleared'; id: number };

/** Queue as A, clear if same A, or navigate to duel when B arrives. */
export function toggleCompareRun(currentId: number, navigate: NavigateFunction): CompareToggleResult {
  const prev = getCompareA();
  if (prev && prev !== currentId) {
    clearCompareA();
    navigate(`/compare?a=${prev}&b=${currentId}`);
    return { kind: 'duel', a: prev, b: currentId };
  }
  if (prev === currentId) {
    clearCompareA();
    return { kind: 'cleared', id: currentId };
  }
  setCompareA(currentId);
  return { kind: 'queued', id: currentId };
}

/** Duel the two most recent runs if available. */
export function duelRecentPair(navigate: NavigateFunction): boolean {
  const recent = listRecentRuns();
  if (recent.length < 2) return false;
  clearCompareA();
  navigate(`/compare?a=${recent[0].id}&b=${recent[1].id}`);
  return true;
}
