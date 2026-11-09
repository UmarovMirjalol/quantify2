import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  getAccountInfo,
  loginAccount,
  logoutAccount,
  registerAccount,
  type AccountInfo,
} from '../services/api';
import { getAccount } from '../services/session';

type Mode = 'login' | 'register';

export function AccountPage() {
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [mode, setMode] = useState<Mode>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    if (!getAccount()) {
      setInfo({ signed_in: false });
      return;
    }
    setInfo(await getAccountInfo());
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const moved = mode === 'register'
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
    setBusy(false);
  }

  return (
    <div className="settings">
      <div className="page-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>{info?.signed_in ? `Signed in as ${info.username}` : 'Keep your history everywhere'}</h1>
          <p className="lede">
            Without an account, results live in this browser only. With one, your backtests follow you
            to any browser or device. No email needed: a username and password are enough.
          </p>
        </div>
      </div>

      {error ? (
        <div className="banner error" role="alert">
          {error}
        </div>
      ) : null}
      {message ? <div className="banner ok">{message}</div> : null}

      {info?.signed_in ? (
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
          </dl>
          <div className="btn-row">
            <Link className="btn secondary" to="/history">
              Open results
            </Link>
            <button className="btn ghost" type="button" onClick={onLogout} disabled={busy}>
              Sign out
            </button>
          </div>
        </section>
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
            Backtests you already ran in this browser move into the account. There is no password
            reset without email, so keep the password somewhere safe.
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
