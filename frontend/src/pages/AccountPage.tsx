import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from '../components/ToastHost';
import {
  getAccountInfo,
  loginAccount,
  logoutAccount,
  registerAccount,
  type AccountInfo,
} from '../services/api';
import { activateLicense, type Entitlements } from '../services/billingApi';
import { getAccount } from '../services/session';
import { cacheEntitlements, isPro, refreshEntitlements } from '../utils/entitlements';

type Mode = 'login' | 'register';

export function AccountPage() {
  const [params, setParams] = useSearchParams();
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [mode, setMode] = useState<Mode>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [license, setLicense] = useState('');
  const [busy, setBusy] = useState(false);
  const [licBusy, setLicBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    if (!getAccount()) {
      setInfo({ signed_in: false });
      const e = await refreshEntitlements().catch(() => null);
      setEnt(e);
      return;
    }
    const [account, entitlements] = await Promise.all([getAccountInfo(), refreshEntitlements()]);
    setInfo(account);
    setEnt(entitlements);
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    const upgraded = params.get('upgraded');
    const canceled = params.get('canceled');
    if (!upgraded && !canceled) return;
    if (upgraded) {
      toast('Welcome to Pro', { tone: 'ok', body: 'Entitlements refreshed for this account.' });
      setMessage('Checkout complete — plan unlocked for this account.');
      void refreshEntitlements()
        .then((e) => {
          setEnt(e);
          cacheEntitlements(e);
        })
        .catch(() => undefined);
    } else if (canceled) {
      toast('Checkout canceled', { tone: 'warn', body: 'No charge. You can upgrade anytime.' });
    }
    const next = new URLSearchParams(params);
    next.delete('upgraded');
    next.delete('canceled');
    setParams(next, { replace: true });
  }, [params, setParams]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const moved =
        mode === 'register'
          ? await registerAccount(username.trim(), password)
          : await loginAccount(username.trim(), password);
      setPassword('');
      setMessage(
        moved > 0
          ? `Signed in. ${moved} backtest${moved === 1 ? '' : 's'} from this browser moved into your account.`
          : 'Signed in. Your history now follows you to any browser or device.',
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setBusy(true);
    setError(null);
    try {
      await logoutAccount();
    } catch {
      // The local session is cleared either way.
    }
    setMessage('Signed out. This browser now starts with an empty history.');
    setInfo({ signed_in: false });
    setEnt(null);
    setBusy(false);
  }

  async function onLicense(e: FormEvent) {
    e.preventDefault();
    if (!license.trim()) return;
    setLicBusy(true);
    setError(null);
    try {
      const res = await activateLicense(license.trim());
      if (res.entitlements) {
        setEnt(res.entitlements);
        cacheEntitlements(res.entitlements);
      } else {
        await refresh();
      }
      setLicense('');
      toast(`License active · ${res.plan}`, { tone: 'ok', body: res.licensee });
      setMessage(`Self-host / license unlocked (${res.plan}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'License activation failed');
    } finally {
      setLicBusy(false);
    }
  }

  const limits = ent?.limits ?? info?.limits;
  const plan = ent?.plan ?? info?.plan ?? 'free';
  const pro = isPro(ent) || plan === 'pro' || plan === 'self_host';

  return (
    <div className="settings">
      <div className="page-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>{info?.signed_in ? `Signed in as ${info.username}` : 'Keep your history everywhere'}</h1>
          <p className="lede">
            Without an account, results live in this browser only. With one, history follows you — and Hosted Pro /
            license unlocks attach to the account. Username + password (keep it safe; no email reset yet).
          </p>
        </div>
        <Link className="btn primary" to="/pricing">
          {pro ? 'Manage plan' : 'Upgrade'}
        </Link>
      </div>

      {error ? (
        <div className="banner error" role="alert">
          {error}
        </div>
      ) : null}
      {message ? <div className="banner ok">{message}</div> : null}

      {info?.signed_in ? (
        <>
          <section className="panel">
            <h2>Your account</h2>
            <dl className="kv">
              <div>
                <dt>Username</dt>
                <dd className="mono">{info.username}</dd>
              </div>
              <div>
                <dt>Saved backtests</dt>
                <dd>{info.backtests ?? 0}</dd>
              </div>
              <div>
                <dt>Member since</dt>
                <dd>{info.created_at ? new Date(info.created_at).toLocaleDateString() : '—'}</dd>
              </div>
              <div>
                <dt>Plan</dt>
                <dd className="mono">
                  {plan}
                  {(ent?.plan_status || info.plan_status) &&
                  (ent?.plan_status || info.plan_status) !== 'none'
                    ? ` · ${ent?.plan_status || info.plan_status}`
                    : ''}
                </dd>
              </div>
            </dl>
            <div className="btn-row">
              <Link className="btn primary" to="/pricing">
                {pro ? 'Manage plan' : 'Upgrade to Pro'}
              </Link>
              <Link className="btn secondary" to="/history">
                Open results
              </Link>
              <button className="btn ghost" type="button" onClick={onLogout} disabled={busy}>
                Sign out
              </button>
            </div>
          </section>

          {limits ? (
            <section className="panel">
              <h2>Entitlements</h2>
              <p className="hint">Live limits from billing — Hosted Pro or a self-host license unlocks farm, matrix force-refresh and webhooks.</p>
              <div className="kpi-grid" style={{ marginTop: '0.75rem' }}>
                <div className="kpi-card">
                  <span className="kpi-label">Backtests / day</span>
                  <strong className="kpi-value mono">{String(limits.backtests_per_day)}</strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Forward slots</span>
                  <strong className="kpi-value mono">{String(limits.forward_tests)}</strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Farm jobs</span>
                  <strong className="kpi-value">{limits.farm_jobs ? 'On' : 'Off'}</strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Matrix refresh</span>
                  <strong className="kpi-value">{limits.matrix_refresh ? 'On' : 'Off'}</strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Paper webhook</span>
                  <strong className="kpi-value">{limits.paper_webhook ? 'On' : 'Off'}</strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Export pack</span>
                  <strong className="kpi-value">{limits.export_pack ? 'On' : 'Off'}</strong>
                </div>
              </div>
            </section>
          ) : null}

          <section className="panel">
            <h2>Redeem license</h2>
            <p className="hint">Paste a QNT1… key or PRO-DEV (development) to unlock self-host / Pro on this account.</p>
            <form className="btn-row" onSubmit={onLicense} style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <input
                value={license}
                onChange={(e) => setLicense(e.target.value)}
                placeholder="QNT1.… or PRO-DEV"
                aria-label="License key"
                style={{ flex: '1 1 16rem', minWidth: '12rem' }}
              />
              <button className="btn secondary" type="submit" disabled={licBusy || !license.trim()}>
                {licBusy ? 'Activating…' : 'Activate'}
              </button>
            </form>
          </section>
        </>
      ) : info ? (
        <form className="panel form-panel" onSubmit={onSubmit}>
          <div className="tabs" role="tablist">
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Create account
            </button>
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Sign in
            </button>
          </div>
          <label className="field">
            <span>Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_.\-]{3,32}"
              title="3–32 letters, digits, dot, dash or underscore"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
          </label>
          <p className="hint">
            Backtests you already ran in this browser move into the account. There is no password reset without email, so
            keep the password somewhere safe.
          </p>
          <div className="btn-row">
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Working…' : mode === 'register' ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
