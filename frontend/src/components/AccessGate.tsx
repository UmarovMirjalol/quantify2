import { useState, type FormEvent } from 'react';
import { listDatasets } from '../services/api';
import { getAccessToken, setAccessToken } from '../services/session';

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
    setAccessToken(token);
    try {
      // Validate token against a protected endpoint
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
      <div className="panel access-card">
        <p className="eyebrow">Secure access</p>
        <h1>Enter access token</h1>
        <p className="lede">
          This QuantLLM deployment is protected. Paste the shared access token provided by your
          administrator to continue.
        </p>
        <form className="form-panel" onSubmit={onSubmit}>
          <label className="field">
            <span>Access token</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              minLength={4}
              autoComplete="off"
              placeholder="APP_ACCESS_TOKEN"
            />
          </label>
          {error ? <div className="banner error">{error}</div> : null}
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
