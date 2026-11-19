import { getBillingMe, type Entitlements } from '../services/billingApi';

const KEY = 'quantify_entitlements_cache';

export function cacheEntitlements(ent: Entitlements) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...ent, cached_at: Date.now() }));
    window.dispatchEvent(new CustomEvent('quantify-entitlements', { detail: ent }));
  } catch {
    // ignore
  }
}

export function readCachedEntitlements(): Entitlements | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') as Entitlements | null;
  } catch {
    return null;
  }
}

export async function refreshEntitlements(): Promise<Entitlements> {
  const ent = await getBillingMe();
  cacheEntitlements(ent);
  return ent;
}

export function isPro(ent: Entitlements | null | undefined): boolean {
  return ent?.plan === 'pro' || ent?.plan === 'self_host';
}

export function canUse(ent: Entitlements | null | undefined, feature: keyof Entitlements['limits']): boolean {
  if (!ent) return feature === 'ops_ritual';
  const v = ent.limits[feature];
  return v === true;
}
