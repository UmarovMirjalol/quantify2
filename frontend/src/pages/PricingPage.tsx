import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from '../components/ToastHost';
import { usePageMeta } from '../hooks/usePageMeta';
import {
  activateLicense,
  devUpgrade,
  getBillingMe,
  getBillingPlans,
  openBillingPortal,
  startCheckout,
  type Entitlements,
  type PlanCard,
} from '../services/billingApi';
import { getAccount } from '../services/session';
import { cacheEntitlements, isPro } from '../utils/entitlements';
import { FOUNDER } from '../utils/projectArchive';

export function PricingPage() {
  usePageMeta(
    'Pricing — Quantify Free, Pro & self-host',
    'Hosted Free and Pro ($29/mo), or a self-host commercial license. Founded 2025 by Mirjalol Umarov.',
  );
  const [plans, setPlans] = useState<PlanCard[]>([]);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [license, setLicense] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = Boolean(getAccount());

  useEffect(() => {
    void getBillingPlans()
      .then((p) => {
        setPlans(p.plans);
        setBillingEnabled(p.billing_enabled);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load plans'));
    void getBillingMe()
      .then((e) => {
        setEnt(e);
        cacheEntitlements(e);
      })
      .catch(() => undefined);
  }, []);

  async function checkout() {
    if (!signedIn) {
      toast('Sign in first', { tone: 'info', body: 'Create an account, then subscribe.' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const origin = window.location.origin;
      const session = await startCheckout(`${origin}/account?upgraded=1`, `${origin}/pricing?canceled=1`, email || undefined);
      if (session.url) window.location.href = session.url;
      else throw new Error('No checkout URL');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setBusy(false);
    }
  }

  async function portal() {
    setBusy(true);
    try {
      const session = await openBillingPortal(`${window.location.origin}/account`);
      if (session.url) window.location.href = session.url;
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Portal failed', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    setBusy(true);
    setError(null);
    try {
      const res = await activateLicense(license.trim());
      if (res.entitlements) {
        setEnt(res.entitlements);
        cacheEntitlements(res.entitlements);
      } else {
        const me = await getBillingMe();
        setEnt(me);
        cacheEntitlements(me);
      }
      toast(`License active · ${res.plan}`, { tone: 'ok', body: res.licensee });
      setLicense('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'License failed');
    } finally {
      setBusy(false);
    }
  }

  async function bumpDev(plan: 'free' | 'pro' | 'self_host') {
    setBusy(true);
    try {
      const next = await devUpgrade(plan);
      setEnt(next);
      cacheEntitlements(next);
      toast(`Dev plan → ${plan}`, { tone: 'ok' });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Dev upgrade failed', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="results pricing-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Pricing · est. 2025</p>
          <h1>Free cloud, Pro hosted, or self-host license</h1>
          <p className="lede">
            Model A: run Quantify on your servers with a commercial unlock. Model B: Hosted Pro on our cloud via Stripe.
            Founded {FOUNDER.foundedLabel} by {FOUNDER.name}.
          </p>
        </div>
        <div className="btn-row">
          <Link className="btn secondary" to="/account">
            Account
          </Link>
          <Link className="btn ghost" to="/archive">
            Archive
          </Link>
        </div>
      </div>

      {error ? <div className="banner error">{error}</div> : null}
      {ent ? (
        <div className={`banner ${isPro(ent) ? 'ok' : 'info'}`}>
          Current plan: <strong className="mono">{ent.plan}</strong>
          {ent.instance_plan ? ` · instance ${ent.instance_plan}` : ''}
          {ent.plan_status && ent.plan_status !== 'none' ? ` · ${ent.plan_status}` : ''}
        </div>
      ) : null}

      <section className="pricing-grid">
        {plans.map((p) => (
          <article key={p.id} className={`panel pricing-card${p.id === 'pro' ? ' pricing-card--pro' : ''}`}>
            <p className="eyebrow">{p.id}</p>
            <h2>{p.name}</h2>
            <p className="pricing-price mono">
              {p.price_usd_month != null
                ? p.price_usd_month === 0
                  ? '$0'
                  : `$${p.price_usd_month}/mo`
                : p.price_usd_year != null
                  ? `$${p.price_usd_year}/yr`
                  : '—'}
            </p>
            <p className="hint">{p.blurb}</p>
            <ul className="pricing-features">
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {p.id === 'free' ? (
              <Link className="btn secondary" to={signedIn ? '/app' : '/account'}>
                {signedIn ? 'Open workspace' : 'Create free account'}
              </Link>
            ) : null}
            {p.id === 'pro' ? (
              <div className="btn-row">
                <button type="button" className="btn primary" disabled={busy || !billingEnabled} onClick={() => void checkout()}>
                  {billingEnabled ? (busy ? '…' : 'Upgrade with Stripe') : 'Stripe not configured'}
                </button>
                {ent?.plan === 'pro' && ent.billing_enabled ? (
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => void portal()}>
                    Manage billing
                  </button>
                ) : null}
              </div>
            ) : null}
            {p.id === 'self_host' ? (
              <a className="btn secondary" href="#self-host">
                Self-host license →
              </a>
            ) : null}
          </article>
        ))}
      </section>

      {billingEnabled ? (
        <section className="panel">
          <h2>Checkout email (optional)</h2>
          <label className="field">
            <span>Receipt email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@firm.com" />
          </label>
        </section>
      ) : (
        <section className="panel">
          <h2>Hosted Pro (Stripe)</h2>
          <p className="hint">
            Set <span className="mono">STRIPE_SECRET_KEY</span> and optionally{' '}
            <span className="mono">STRIPE_PRICE_PRO</span> on the server to enable Checkout. Until then, use a license
            key or the dev upgrade below.
          </p>
        </section>
      )}

      <section className="panel" id="self-host">
        <h2>A · Self-host license</h2>
        <p>
          Deploy with Docker Compose on your infra. Redeem a <span className="mono">QNT1…</span> key (or{' '}
          <span className="mono">PRO-DEV</span> in development) to unlock Pro entitlements for the instance / account.
          Source stays MIT; the license covers commercial operation support and the Pro unlock.
        </p>
        <p className="hint">
          Docs: <Link to="/about">About</Link> · env <span className="mono">INSTANCE_PLAN=self_host</span> or activate
          below. Issue keys with <span className="mono">POST /api/billing/license/issue</span> + admin token.
        </p>
        <div className="btn-row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1, margin: 0 }}>
            <span>License key</span>
            <input
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              placeholder="QNT1.… or PRO-DEV"
              className="mono"
            />
          </label>
          <button type="button" className="btn primary" disabled={busy || !license.trim()} onClick={() => void redeem()}>
            Activate
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Dev plan switch</h2>
        <p className="hint">Non-production only — flips your signed-in account plan without Stripe.</p>
        <div className="btn-row">
          <button type="button" className="btn ghost" disabled={busy || !signedIn} onClick={() => void bumpDev('free')}>
            Free
          </button>
          <button type="button" className="btn secondary" disabled={busy || !signedIn} onClick={() => void bumpDev('pro')}>
            Pro
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy || !signedIn}
            onClick={() => void bumpDev('self_host')}
          >
            Self-host
          </button>
          {!signedIn ? (
            <Link className="btn primary" to="/account">
              Sign in
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}
