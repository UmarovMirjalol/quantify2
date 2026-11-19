import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { KpiCard } from '../components/KpiCard';
import { PaperSignalTable } from '../components/PaperSignalTable';
import {
  listPaperJournal,
  runPaperBridge,
  type PaperJournalItem,
  type PaperResult,
  type PaperSignal,
} from '../services/api';
import { toast } from '../components/ToastHost';
import { WatchlistBar } from '../components/WatchlistBar';
import { downloadText, toCsv } from '../utils/download';

const DEFAULT =
  'Buy when the 20-day SMA crosses above the 50-day SMA and sell when it crosses below.';

function dayKey(iso: string | null | undefined): string {
  return (iso || '').slice(0, 10) || 'unknown';
}

export function PaperDeskPage() {
  usePageMeta(
    'Paper desk — Quantify',
    'Pull next-open paper signals, keep a journal, and log webhook deliveries.',
  );
  const [text, setText] = useState(DEFAULT);
  const [tickers, setTickers] = useState('SPY, QQQ, IWM, GLD, BTC-USD');
  const [webhook, setWebhook] = useState('');
  const [history, setHistory] = useState('1y');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState<PaperResult | null>(null);
  const [journal, setJournal] = useState<PaperJournalItem[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [onlyActionable, setOnlyActionable] = useState(false);
  const [onlyWebhookFail, setOnlyWebhookFail] = useState(false);

  const refresh = useCallback(() => {
    listPaperJournal(60)
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
        history,
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return journal.filter((j) => {
      if (onlyActionable && !(j.actionable_count > 0)) return false;
      if (onlyWebhookFail && !(j.webhook && j.webhook.ok === false)) return false;
      if (!needle) return true;
      return (
        j.strategy_text.toLowerCase().includes(needle) ||
        j.tickers.some((t) => t.toLowerCase().includes(needle)) ||
        String(j.id).includes(needle)
      );
    });
  }, [journal, q, onlyActionable, onlyWebhookFail]);

  const inbox = useMemo(() => {
    const map = new Map<string, PaperSignal & { pull_id: number; when: string }>();
    for (const j of journal.slice(0, 12)) {
      for (const s of j.actionable || []) {
        if (!map.has(s.ticker)) {
          map.set(s.ticker, {
            ...s,
            pull_id: j.id,
            when: j.created_at || '',
          });
        }
      }
    }
    return [...map.values()];
  }, [journal]);

  const byDay = useMemo(() => {
    const groups = new Map<string, PaperJournalItem[]>();
    for (const j of filtered) {
      const k = dayKey(j.created_at);
      const list = groups.get(k) || [];
      list.push(j);
      groups.set(k, list);
    }
    return [...groups.entries()];
  }, [filtered]);

  const actionableLogged = journal.reduce((n, j) => n + (j.actionable_count || 0), 0);
  const webhookOk = journal.filter((j) => j.webhook?.ok).length;
  const webhookFail = journal.filter((j) => j.webhook && j.webhook.ok === false).length;
  const errorLogged = journal.reduce((n, j) => n + (j.error_count || 0), 0);

  function exportInboxCsv() {
    if (!inbox.length) return;
    const csv = toCsv([
      ['ticker', 'action', 'side', 'close', 'entry', 'unrealized_pct', 'next_open', 'pull_id'],
      ...inbox.map((s) => [
        s.ticker,
        s.action,
        s.side ?? '',
        s.last_close,
        s.entry_price ?? '',
        s.unrealized_pct ?? '',
        s.order_for_next_open ?? '',
        s.pull_id,
      ]),
    ]);
    downloadText(`quantify-paper-inbox-${Date.now()}.csv`, csv, 'text/csv;charset=utf-8');
    toast('Inbox CSV ready', { tone: 'ok' });
  }

  return (
    <div className="results paper-desk">
      <div className="page-header">
        <div>
          <p className="eyebrow">Paper desk</p>
          <h1>Signals for the next open. Journal kept.</h1>
          <p className="lede">
            Actionable inbox, full signal detail, webhook trail, day-grouped history.{' '}
            <Link to="/farm">Back to farm →</Link>
          </p>
        </div>
      </div>

      <section className="kpi-grid">
        <KpiCard label="Journal pulls" value={String(journal.length)} />
        <KpiCard label="Actionable logged" value={String(actionableLogged)} />
        <KpiCard label="Inbox now" value={String(inbox.length)} hint="Latest unique tickers to act on" />
        <KpiCard label="Webhooks OK" value={String(webhookOk)} hint={webhookFail ? `${webhookFail} failed` : undefined} />
        <KpiCard label="Fetch errors" value={String(errorLogged)} tone={errorLogged ? 'negative' : 'neutral'} />
      </section>

      <WatchlistBar onApply={(list) => setTickers(list.join(', '))} />

      <div className="paper-desk__layout">
        <section className="panel">
          <h2>Pull</h2>
          <label className="field">
            <span>Strategy</span>
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !busy) {
                  e.preventDefault();
                  void pull();
                }
              }}
            />
          </label>
          <div className="param-grid">
            <label className="field">
              <span>Tickers</span>
              <input
                value={tickers}
                onChange={(e) => setTickers(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !busy) {
                    e.preventDefault();
                    void pull();
                  }
                }}
              />
            </label>
            <label className="field">
              <span>History</span>
              <select value={history} onChange={(e) => setHistory(e.target.value)}>
                <option value="1y">1y</option>
                <option value="5y">5y</option>
                <option value="10y">10y</option>
              </select>
            </label>
            <label className="field">
              <span>Webhook URL</span>
              <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://…" />
            </label>
          </div>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void pull()}>
            {busy ? 'Pulling…' : 'Pull & journal'}
          </button>
          <p className="hint">Ctrl/⌘+Enter pulls signals into the journal.</p>
          {error ? <div className="banner error">{error}</div> : null}
        </section>

        <section className="panel paper-inbox">
          <div className="page-header" style={{ marginBottom: '0.55rem' }}>
            <div>
              <h2 style={{ margin: 0 }}>Actionable inbox</h2>
              <p className="hint" style={{ margin: '0.2rem 0 0' }}>
                Latest enter/exit/add across recent pulls — one row per ticker.
              </p>
            </div>
            <button type="button" className="btn ghost small" disabled={!inbox.length} onClick={exportInboxCsv}>
              Export CSV
            </button>
          </div>
          {!inbox.length ? (
            <p className="hint">No actionable signals in recent pulls.</p>
          ) : (
            <ul className="paper-inbox__list">
              {inbox.map((s) => (
                <li key={s.ticker}>
                  <div>
                    <strong className="mono">{s.ticker}</strong>
                    <span className={`mono ${s.action === 'exit' ? 'neg' : 'pos'}`}>{s.action}</span>
                    <span className="hint mono">{s.order_for_next_open || s.side || '—'}</span>
                  </div>
                  <div className="mono hint">
                    {pctish(s.unrealized_pct)} · pull #{s.pull_id}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {latest ? (
        <section className="panel">
          <h2>Latest pull</h2>
          {(latest.actionable?.length ?? 0) > 0 ? (
            <div className="banner ok" style={{ marginBottom: '0.75rem' }}>
              {latest.actionable.length} actionable ·{' '}
              {latest.actionable.map((s) => s.ticker).join(', ')}
            </div>
          ) : (
            <p className="hint">No actionable orders this pull.</p>
          )}
          {latest.errors?.length ? (
            <div className="banner warn" style={{ marginBottom: '0.75rem' }}>
              Errors: {latest.errors.map((e) => `${e.ticker}: ${e.error}`).join(' · ')}
            </div>
          ) : null}
          <PaperSignalTable signals={latest.signals} />
          {latest.webhook ? (
            <p className="hint" style={{ marginTop: '0.55rem' }}>
              Webhook: {latest.webhook.ok ? `ok ${latest.webhook.status}` : latest.webhook.error}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="panel">
        <div className="page-header" style={{ marginBottom: '0.65rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>Journal</h2>
            <p className="hint" style={{ margin: '0.2rem 0 0' }}>
              Day-grouped history with full signal payloads from the API.
            </p>
          </div>
          <div className="btn-row">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter ticker / strategy…"
              aria-label="Filter journal"
            />
            <button
              type="button"
              className={`chip${onlyActionable ? ' active' : ''}`}
              onClick={() => setOnlyActionable((v) => !v)}
            >
              Actionable
            </button>
            <button
              type="button"
              className={`chip${onlyWebhookFail ? ' active' : ''}`}
              onClick={() => setOnlyWebhookFail((v) => !v)}
            >
              Webhook fail
            </button>
          </div>
        </div>

        {!filtered.length ? (
          <p className="hint">No pulls match.</p>
        ) : (
          byDay.map(([day, items]) => (
            <div key={day} className="paper-day">
              <h3 className="paper-day__h mono">{day}</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Tickers</th>
                      <th>Sig</th>
                      <th>Act</th>
                      <th>Err</th>
                      <th>Hist</th>
                      <th>Webhook</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((j) => (
                      <tr key={j.id} className={openId === j.id ? 'picked' : ''}>
                        <td className="mono">{j.created_at?.slice(11, 19) ?? '—'}</td>
                        <td className="mono">{j.tickers.slice(0, 8).join(', ')}</td>
                        <td className="mono">{j.signal_count}</td>
                        <td className="mono">{j.actionable_count}</td>
                        <td className={`mono ${j.error_count ? 'neg' : ''}`}>{j.error_count}</td>
                        <td className="mono hint">{j.history}</td>
                        <td className="mono">
                          {!j.webhook
                            ? j.webhook_url
                              ? 'queued'
                              : '—'
                            : j.webhook.ok
                              ? `ok ${j.webhook.status ?? ''}`.trim()
                              : j.webhook.error ?? 'fail'}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => setOpenId(openId === j.id ? null : j.id)}
                          >
                            {openId === j.id ? 'Hide' : 'Open'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {openId != null && items.some((x) => x.id === openId)
                ? (() => {
                    const j = items.find((x) => x.id === openId)!;
                    return (
                      <div className="paper-day__detail">
                        <p className="hint">{j.strategy_text}</p>
                        {j.webhook_url ? <p className="mono hint">Webhook → {j.webhook_url}</p> : null}
                        {(j.actionable?.length ?? 0) > 0 ? (
                          <p className="hint pos">
                            Actionable: {j.actionable.map((s) => `${s.ticker}:${s.action}`).join(' · ')}
                          </p>
                        ) : null}
                        {j.errors?.length ? (
                          <div className="banner warn">
                            {j.errors.map((e) => `${e.ticker}: ${e.error}`).join(' · ')}
                          </div>
                        ) : null}
                        <PaperSignalTable signals={j.signals} dense />
                      </div>
                    );
                  })()
                : null}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function pctish(v: number | null | undefined): string {
  if (v == null) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(1)}%`;
}
