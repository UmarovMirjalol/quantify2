import { authHeaders, getAccount } from './session';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function billingRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  const auth = authHeaders();
  for (const [k, v] of Object.entries(auth)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === 'string') detail = body.detail;
      else if (body.detail?.message) detail = body.detail.message;
      else if (body.detail) detail = JSON.stringify(body.detail);
    } catch {
      // ignore
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type PlanLimits = {
  backtests_per_day: number;
  forward_tests: number;
  farm_jobs: boolean;
  matrix_refresh: boolean;
  paper_webhook: boolean;
  book_desk: boolean;
  ops_ritual: boolean;
  llm_parser: boolean;
  export_pack: boolean;
};

export type Entitlements = {
  plan: 'free' | 'pro' | 'self_host';
  limits: PlanLimits;
  signed_in: boolean;
  username?: string | null;
  plan_status?: string;
  billing_enabled?: boolean;
  instance_plan?: string | null;
};

export type PlanCard = {
  id: string;
  name: string;
  price_usd_month?: number;
  price_usd_year?: number;
  blurb: string;
  features: string[];
  limits: PlanLimits;
};

export async function getBillingPlans(): Promise<{
  plans: PlanCard[];
  billing_enabled: boolean;
  instance_plan: string | null;
}> {
  return billingRequest('/api/billing/plans');
}

export async function getBillingMe(): Promise<Entitlements> {
  if (!getAccount()) {
    return {
      plan: 'free',
      signed_in: false,
      limits: {
        backtests_per_day: 20,
        forward_tests: 3,
        farm_jobs: false,
        matrix_refresh: false,
        paper_webhook: false,
        book_desk: false,
        ops_ritual: true,
        llm_parser: false,
        export_pack: false,
      },
    };
  }
  return billingRequest('/api/billing/me');
}

export async function startCheckout(successUrl: string, cancelUrl: string, email?: string) {
  return billingRequest<{ id: string; url: string }>('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success_url: successUrl, cancel_url: cancelUrl, email }),
  });
}

export async function openBillingPortal(returnUrl: string) {
  return billingRequest<{ url: string }>('/api/billing/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ return_url: returnUrl }),
  });
}

export async function activateLicense(key: string) {
  return billingRequest<{ ok: boolean; plan: string; licensee?: string; entitlements?: Entitlements }>(
    '/api/billing/license/activate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    },
  );
}

export async function devUpgrade(plan: 'free' | 'pro' | 'self_host') {
  return billingRequest<Entitlements>('/api/billing/dev-upgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
}
