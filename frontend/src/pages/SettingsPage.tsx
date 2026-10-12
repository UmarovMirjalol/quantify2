import { useEffect, useState, type FormEvent } from 'react';
import { clearLLMConfig, getLLMStatus, updateLLMConfig } from '../services/api';
import { normalizeSecret } from '../services/session';
import type { LLMStatus } from '../types';

export function SettingsPage() {
  const [status, setStatus] = useState<LLMStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canEdit = Boolean(status && status.runtime_config_allowed !== false);

  async function refresh() {
    const s = await getLLMStatus();
    setStatus(s);
    setModel(s.model || 'gpt-4o-mini');
    setBaseUrl(s.base_url || 'https://api.openai.com/v1');
  }

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
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
      <div className="page-header">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Settings</h1>
          <p className="lede">
            Connect an OpenAI-compatible LLM for broader natural-language parsing. Without a key,
            the built-in parser still runs backtests. Get an OpenAI key at{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
              platform.openai.com/api-keys
            </a>
            .
          </p>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="skeleton-line" style={{ width: '40%', margin: '0 auto 0.75rem' }} />
          Loading settings…
        </div>
      ) : null}

      {error ? (
        <div className="banner error" role="alert">
          {error}
          <div style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => {
                setError(null);
                setLoading(true);
                refresh()
                  .catch((err: Error) => setError(err.message))
                  .finally(() => setLoading(false));
              }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <section className="panel">
          <h2>Parser status</h2>
          <dl className="kv">
            <div>
              <dt>LLM enabled</dt>
              <dd>{status?.enabled ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd className="mono">{status?.model ?? '—'}</dd>
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
      ) : null}

      {!loading && status && !canEdit ? (
        <div className="banner info">
          Runtime key editing is disabled on this server. An administrator must set{' '}
          <code>LLM_API_KEY</code> / <code>LLM_MODEL</code> / <code>LLM_BASE_URL</code> in the
          deployment environment.
        </div>
      ) : null}

      {!loading && canEdit ? (
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
            Works with OpenAI, Groq, OpenRouter, and other OpenAI-compatible endpoints. Keys stay on
            the server in <code>.llm_runtime.json</code>.
          </p>
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
      ) : null}
    </div>
  );
}
