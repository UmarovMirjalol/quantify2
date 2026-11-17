import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { KpiCard } from '../components/KpiCard';
import {
  listPaperJournal,
  runPaperBridge,
  type PaperJournalItem,
  type PaperResult,
} from '../services/api';
import { toast } from '../components/ToastHost';

const DEFAULT =
  'Buy when the 20-day SMA crosses above the 50-day SMA and sell when it crosses below.';

export function PaperDeskPage() {
  usePageMeta(
    'Paper desk — Quantify',
    'Pull next-open paper signals, keep a journal, and log webhook deliveries.',
  );
  const [text, setText] = useState(DEFAULT);
  const [tickers, setTickers] = useState('SPY, QQQ, IWM, GLD, BTC-USD');
  const [webhook, setWebhook] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState<PaperResult | null>(null);
  const [journal, setJournal] = useState<PaperJournalItem[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  const refresh = useCallback(() => {
    listPaperJournal(40)
      .then((r) => setJournal(r.items))
      .catch(() => setJournal([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function pull() {
    setBusy(true);
    setError('');
    try {
      const list = tickers
        .split(/[\s,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const out = await runPaperBridge({
        strategy_text: text,
        tickers: list,
        webhook_url: webhook.trim() || undefined,
        history: '1y',
        save: true,
      });
      setLatest(out);
      refresh();
      toast('Paper signals journaled', {
        tone: 'ok',
        body: `${out.signals.length} names · ${out.actionable?.length ?? 0} actionable`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paper pull failed.');
      toast('Paper pull failed', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const actionableToday = journal.reduce((n, j) => n + (j.actionable_count || 0), 0);
  const webhookOk = journal.filter((j) => j.webhook && (j.webhook as { ok?: boolean }).ok).length;

  return (
    <div className="results">
      <div className="page-header">
        <div>
          <p className="eyebrow">Paper desk</p>
          <h1>Signals for the next open. Journal kept.</h1>
          <p className="lede">
            Same bridge as the farm — with a persistent log of pulls and webhook deliveries.{' '}
            <Link to="/farm">Back to farm →</Link>
          </p>
        </div>
      </div>

      <section className="kpi-grid">
        <KpiCard label="Journal pulls" value={String(journal.length)} />
        <KpiCard label="Actionable logged" value={String(actionableToday)} />
        <KpiCard label="Webhooks OK" value={String(webhookOk)} />
      </section>

      <section className="panel">
        <label className="field">
          <span>Strategy</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="param-grid">
          <label className="field">
            <span>Tickers</span>
            <input value={tickers} onChange={(e) => setTickers(e.target.value)} />
          </label>
          <label className="field">
            <span>Webhook URL</span>
            <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://…" />
          </label>
        </div>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void pull()}>
          {busy ? 'Pulling…' : 'Pull & journal'}
        </button>
        {error ? <div className="banner error">{error}</div> : null}
      </section>

      {latest ? (
        <section className="panel table-wrap">
          <h2>Latest pull</h2>
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Action</th>
                <th>In pos</th>
                <th>Close</th>
                <th>As of</th>
              </tr>
            </thead>
            <tbody>
              {latest.signals.map((s) => (
                <tr key={s.ticker}>
                  <td className="mono">{s.ticker}</td>
                  <td>{s.action}</td>
                  <td>{s.in_position ? 'yes' : 'no'}</td>
                  <td className="mono">{s.last_close}</td>
                  <td className="mono">{String(s.as_of).slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {latest.webhook ? (
            <p className="hint">
              Webhook: {latest.webhook.ok ? `ok ${latest.webhook.status}` : latest.webhook.error}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="panel">
        <h2>Journal</h2>
        {!journal.length ? (
          <p className="hint">No pulls yet. Run one above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Tickers</th>
                  <th>Signals</th>
                  <th>Actionable</th>
                  <th>Webhook</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {journal.map((j) => (
                  <tr key={j.id}>
                    <td className="mono">{j.created_at?.slice(0, 19) ?? '—'}</td>
                    <td className="mono">{j.tickers.slice(0, 6).join(', ')}</td>
                    <td className="mono">{j.signal_count}</td>
                    <td className="mono">{j.actionable_count}</td>
                    <td className="mono">
                      {!j.webhook
                        ? '—'
                        : (j.webhook as { ok?: boolean }).ok
                          ? 'ok'
                          : (j.webhook as { error?: string }).error ?? 'fail'}
                    </td>
                    <td>
                      <button type="button" className="btn ghost small" onClick={() => setOpenId(openId === j.id ? null : j.id)}>
                        {openId === j.id ? 'Hide' : 'Open'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {openId != null
          ? (() => {
              const j = journal.find((x) => x.id === openId);
              if (!j) return null;
              return (
                <div className="table-wrap" style={{ marginTop: '0.8rem' }}>
                  <p className="hint">{j.strategy_text.slice(0, 180)}</p>
                  <table>
                    <thead>
                      <tr>
                        <th>Ticker</th>
                        <th>Action</th>
                        <th>In pos</th>
                        <th>Close</th>
                      </tr>
                    </thead>
                    <tbody>
                      {j.signals.map((s) => (
                        <tr key={`${j.id}-${s.ticker}`}>
                          <td className="mono">{s.ticker}</td>
                          <td>{s.action}</td>
                          <td>{s.in_position ? 'yes' : 'no'}</td>
                          <td className="mono">{s.last_close}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()
          : null}
      </section>
    </div>
  );
}
