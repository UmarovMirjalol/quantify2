import { useEffect, useState, type FormEvent } from 'react';
import { clearLLMConfig, getLLMStatus, updateLLMConfig } from '../services/api';
import { normalizeSecret } from '../services/session';
import type { LLMStatus } from '../types';

export function SettingsPage() {
  const [status, setStatus] = useState<LLMStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canEdit = status?.runtime_config_allowed !== false;

  async function refresh() {
    const s = await getLLMStatus();
    setStatus(s);
    setModel(s.model || 'gpt-4o-mini');
    setBaseUrl(s.base_url || 'https://api.openai.com/v1');
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const s = await updateLLMConfig({
        api_key: normalizeSecret(apiKey),
        model: model.trim(),
        base_url: baseUrl.trim(),
        enabled: true,
      });
      setStatus(s);
      setApiKey('');
      setMessage('LLM connected. Natural-language strategies will use the model.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save LLM config');
    } finally {
      setSaving(false);
    }
  }

  async function onClear() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const s = await clearLLMConfig();
      setStatus(s);
      setMessage('LLM disabled. Built-in parser is active.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear LLM config');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings">
      <div className="results-header">
        <div>
          <p className="eyebrow">OpenAI-compatible provider</p>
          <h1>LLM Settings</h1>
          <p className="lede">
            QuantLLM converts strategy text with an LLM into a validated StrategySpec. Configure an
            OpenAI-compatible provider. Without a key, the built-in parser still runs backtests.
          </p>
        </div>
      </div>

      <section className="panel">
        <h2>Current status</h2>
        <dl className="kv">
          <div>
            <dt>LLM enabled</dt>
            <dd>{status?.enabled ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{status?.model ?? '—'}</dd>
          </div>
          <div>
            <dt>Base URL</dt>
            <dd className="mono">{status?.base_url ?? '—'}</dd>
          </div>
          <div>
            <dt>API key</dt>
            <dd>{status?.api_key_configured ? status.api_key_masked : 'Not configured'}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{status?.provider ?? 'openai-compatible'}</dd>
          </div>
        </dl>
      </section>

      {!canEdit ? (
        <div className="banner info">
          Runtime key editing is disabled on this server. An administrator must set{' '}
          <code>LLM_API_KEY</code> / <code>LLM_MODEL</code> / <code>LLM_BASE_URL</code> in the
          deployment environment.
        </div>
      ) : (
        <form className="panel form-panel" onSubmit={onSave}>
          <h2>Connect LLM</h2>
          <label className="field">
            <span>API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted) {
                  e.preventDefault();
                  setApiKey(normalizeSecret(pasted));
                }
              }}
              placeholder={status?.api_key_configured ? '•••• leave blank to keep current' : 'sk-…'}
              autoComplete="off"
            />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Model</span>
              <input value={model} onChange={(e) => setModel(e.target.value)} required />
            </label>
            <label className="field">
              <span>Base URL</span>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
            </label>
          </div>
          <p className="hint">
            Keys are stored only on the server in <code>.llm_runtime.json</code> (gitignored). Prefer
            env vars in production.
          </p>
          {error ? <div className="banner error">{error}</div> : null}
          {message ? <div className="banner ok">{message}</div> : null}
          <div className="btn-row">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save & enable LLM'}
            </button>
            <button className="btn secondary" type="button" onClick={onClear} disabled={saving}>
              Disable LLM
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
