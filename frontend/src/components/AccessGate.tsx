import { useState, type FormEvent } from 'react';
import { listDatasets } from '../services/api';
import { getAccessToken, normalizeSecret, setAccessToken } from '../services/session';

interface Props {
  onUnlocked: () => void;
}

export function AccessGate({ onUnlocked }: Props) {
  const [token, setToken] = useState(getAccessToken());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const cleaned = normalizeSecret(token);
    if (cleaned.length < 4) {
      setError('Paste the full access token from your administrator.');
      setLoading(false);
      return;
    }
    setAccessToken(cleaned);
    setToken(cleaned);
    try {
      await listDatasets();
      onUnlocked();
    } catch (err) {
      setAccessToken('');
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid access token. Ask your admin for APP_ACCESS_TOKEN.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="access-gate">
      <div className="access-atmosphere" aria-hidden="true">
        <span className="beam beam-a" />
        <span className="orbit orbit-a" />
      </div>
      <div className="panel access-card">
        <div className="brand" style={{ padding: '0 0 1rem' }}>
          <span className="brand-mark brand-mark-lg" aria-hidden="true">
            <img src="/logo.svg" width={28} height={28} alt="" />
          </span>
          <span className="brand-text">
            <span className="brand-name">Quantify</span>
            <span className="brand-tag">Secure access</span>
          </span>
        </div>
        <p className="eyebrow">Production gate</p>
        <h1>Enter access token</h1>
        <p className="lede">
          Paste <code className="mono">APP_ACCESS_TOKEN</code> from the server{' '}
          <code className="mono">.env.production</code> (printed by{' '}
          <code className="mono">./deploy/scripts/deploy.sh</code>). Spaces and quotes are cleaned
          automatically.
        </p>
        <form className="form-panel" onSubmit={onSubmit} style={{ marginTop: '1.25rem' }}>
          <label className="field">
            <span>Access token</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted) {
                  e.preventDefault();
                  setToken(normalizeSecret(pasted));
                }
              }}
              required
              minLength={4}
              autoComplete="off"
              autoFocus
              placeholder="Paste APP_ACCESS_TOKEN"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'access-error' : undefined}
            />
          </label>
          {error ? (
            <div className="banner error" id="access-error" role="alert">
              {error}
            </div>
          ) : null}
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'Continue to workspace'}
          </button>
        </form>
      </div>
    </div>
  );
}
