import type { PromoteGrade } from './promotionGate';

const KEY = 'quantify_promotion';

export type PromotionStatus = 'active' | 'demoted' | 'pending';

export type PromotionLink = {
  backtest_id: number;
  forward_id?: number;
  title: string;
  dataset?: string;
  strategy_text?: string;
  ticker?: string;
  promoted_at: string;
  last_verdict?: PromoteGrade | string | null;
  last_score?: number | null;
  status: PromotionStatus;
  demoted_at?: string | null;
  demote_reason?: string | null;
  last_refresh_at?: string | null;
  override?: boolean;
};

function read(): PromotionLink[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as PromotionLink[];
    return Array.isArray(raw)
      ? raw.map((p) => ({
          ...p,
          status: p.status || (p.forward_id ? 'active' : 'pending'),
        }))
      : [];
  } catch {
    return [];
  }
}

function write(list: PromotionLink[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 60)));
    window.dispatchEvent(new CustomEvent('quantify-promotions'));
  } catch {
    // quota
  }
}

export function listPromotions(): PromotionLink[] {
  return read();
}

export function listActivePromotions(): PromotionLink[] {
  return read().filter((p) => p.status === 'active' && p.forward_id);
}

export function upsertPromotion(link: PromotionLink) {
  const rest = read().filter((p) => p.backtest_id !== link.backtest_id);
  write([{ ...link, status: link.status || 'active' }, ...rest]);
}

export function removePromotion(backtestId: number) {
  write(read().filter((p) => p.backtest_id !== backtestId));
}

export function getPromotion(backtestId: number): PromotionLink | undefined {
  return read().find((p) => p.backtest_id === backtestId);
}

export function markDemoted(backtestId: number, reason: string) {
  const cur = read();
  const next = cur.map((p) =>
    p.backtest_id === backtestId
      ? {
          ...p,
          status: 'demoted' as const,
          demoted_at: new Date().toISOString(),
          demote_reason: reason,
        }
      : p,
  );
  write(next);
}

export function touchRefresh(backtestId: number) {
  const cur = read();
  write(
    cur.map((p) =>
      p.backtest_id === backtestId ? { ...p, last_refresh_at: new Date().toISOString() } : p,
    ),
  );
}
