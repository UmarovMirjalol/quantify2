import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KpiCard } from '../components/KpiCard';
import { PromoteControl } from '../components/PromoteControl';
import { toast } from '../components/ToastHost';
import { usePageMeta } from '../hooks/usePageMeta';
import {
  createForwardTest,
  getBacktest,
  getVerdict,
  listForwardTests,
  listPaperJournal,
  refreshLiveSignal,
  type ForwardSummary,
  type PaperJournalItem,
} from '../services/api';
import type { LiveSignal, VerdictReport } from '../types';
import { listFavorites, type FavoriteRun } from '../utils/favorites';
import {
  type MorningProgress,
  type InboxItem,
  runMorningRitual,
} from '../utils/morningRitual';
import {
  getPromotion,
  listActivePromotions,
  listPromotions,
  removePromotion,
  upsertPromotion,
  type PromotionLink,
} from '../utils/promotion';
import {
  canPromote,
  DEFAULT_POLICY,
  getPromotePolicy,
  gradeTone,
  setPromotePolicy,
  type PromotePolicy,
} from '../utils/promotionGate';
import { listWatchlist } from '../utils/watchlist';

type Row = {
  fav: FavoriteRun;
  promo?: PromotionLink;
  forward?: ForwardSummary;
  verdict?: VerdictReport | null;
  live?: LiveSignal | null;
};

export function OpsDeskPage() {
  usePageMeta(
    'Morning command desk — Quantify',
    'One open ritual: re-grade promotions, demote failures, refresh forwards and live signals, optional paper fleet.',
  );

  const [favs, setFavs] = useState<FavoriteRun[]>(() => listFavorites());
  const [promos, setPromos] = useState<PromotionLink[]>(() => listPromotions());
  const [forwards, setForwards] = useState<ForwardSummary[]>([]);
  const [verdicts, setVerdicts] = useState<Record<number, VerdictReport | null>>({});
  const [lives, setLives] = useState<Record<number, LiveSignal | null>>({});
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [paper, setPaper] = useState<PaperJournalItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<MorningProgress | null>(null);
  const [runPaper, setRunPaper] = useState(true);
  const [webhook, setWebhook] = useState(() => localStorage.getItem('quantify_paper_webhook') || '');
  const [policy, setPolicy] = useState<PromotePolicy>(() => getPromotePolicy());
  const [error, setError] = useState<string | null>(null);
  const [lastErrors, setLastErrors] = useState<string[]>([]);

  const reloadForwards = useCallback(async () => {
    try {
      setForwards(await listForwardTests());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load forward tests.');
    }
  }, []);

  const reloadLocal = useCallback(() => {
    setFavs(listFavorites());
    setPromos(listPromotions());
  }, []);

  useEffect(() => {
    void reloadForwards();
    void listPaperJournal(3)
      .then((j) => setPaper(j.items[0] ?? null))
      .catch(() => undefined);
    const onFav = () => reloadLocal();
    const onPromo = () => reloadLocal();
    const onPol = () => setPolicy(getPromotePolicy());
    window.addEventListener('quantify-favorites', onFav);
    window.addEventListener('quantify-promotions', onPromo);
    window.addEventListener('quantify-promote-policy', onPol);
    return () => {
      window.removeEventListener('quantify-favorites', onFav);
      window.removeEventListener('quantify-promotions', onPromo);
      window.removeEventListener('quantify-promote-policy', onPol);
    };
  }, [reloadForwards, reloadLocal]);

  const rows: Row[] = useMemo(() => {
    const byFwd = new Map(forwards.map((f) => [f.id, f]));
    return favs.map((fav) => {
      const promo = promos.find((p) => p.backtest_id === fav.id);
      return {
        fav,
        promo,
        forward: promo?.forward_id ? byFwd.get(promo.forward_id) : undefined,
        verdict: verdicts[fav.id],
        live: lives[fav.id],
      };
    });
  }, [favs, promos, forwards, verdicts, lives]);

  const demoted = promos.filter((p) => p.status === 'demoted');
  const activeCount = listActivePromotions().length;
  const watch = listWatchlist();

  async function loadVerdict(id: number) {
    setBusyId(id);
    try {
      const v = await getVerdict(id);
      setVerdicts((m) => ({ ...m, [id]: v }));
      const promo = getPromotion(id);
      if (promo) {
        upsertPromotion({ ...promo, last_verdict: v.grade, last_score: v.score });
        reloadLocal();
      }
      toast(`Verdict · ${v.grade}`, { tone: 'ok', body: v.headline });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Verdict failed', { tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function promote(fav: FavoriteRun, force = false) {
    setBusyId(fav.id);
    try {
      let v = verdicts[fav.id];
      if (!v) {
        v = await getVerdict(fav.id);
        setVerdicts((m) => ({ ...m, [fav.id]: v! }));
      }
      const gate = canPromote(v, policy);
      if (!gate.ok) {
        if (!(force && gate.canOverride && window.confirm(`${gate.reason}\n\nOverride?`))) {
          toast('Blocked', { tone: 'error', body: gate.reason });
          return;
        }
      }
      const detail = await createForwardTest({ backtest_id: fav.id, name: fav.title });
      let strategyText = fav.title;
      try {
        const full = await getBacktest(fav.id);
        strategyText = full.strategy_description || strategyText;
      } catch {
        // keep
      }
      upsertPromotion({
        backtest_id: fav.id,
        forward_id: detail.id,
        title: fav.title,
        dataset: fav.dataset,
        strategy_text: strategyText,
        promoted_at: new Date().toISOString(),
        last_verdict: v.grade,
        last_score: v.score,
        status: 'active',
        override: force && !gate.ok,
      });
      reloadLocal();
      await reloadForwards();
      toast(`Promoted → forward #${detail.id}`, { tone: 'ok' });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Promote failed', { tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function refreshLive(id: number) {
    setBusyId(id);
    try {
      const sig = await refreshLiveSignal(id);
      setLives((m) => ({ ...m, [id]: sig }));
      toast(`${sig.action}`, { tone: 'ok' });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Live refresh failed', { tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function morningGo() {
    setRefreshing(true);
    setError(null);
    setLastErrors([]);
    setProgress({ step: 'Starting…', done: 0, total: 1 });
    try {
      localStorage.setItem('quantify_paper_webhook', webhook.trim());
      const report = await runMorningRitual({
        runPaper,
        webhookUrl: webhook,
        onProgress: setProgress,
      });
      setForwards(report.forwards);
      setLives(report.lives);
      setVerdicts(report.verdicts);
      setInbox(report.inbox);
      setPaper(report.paper ?? null);
      setLastErrors(report.errors);
      reloadLocal();
      toast('Morning ritual done', {
        tone: 'ok',
        body: `${report.forwards_refreshed} fwd · ${report.lives_refreshed} live · ${report.demotions} demoted · inbox ${report.inbox.length}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Morning ritual failed');
    } finally {
      setRefreshing(false);
      setProgress(null);
    }
  }

  function savePolicy(next: PromotePolicy) {
    setPromotePolicy(next);
    setPolicy(next);
    toast('Promote policy saved', { tone: 'ok' });
  }

  return (
    <div className="results ops-desk">
      <div className="page-header">
        <div>
          <p className="eyebrow">Command desk</p>
          <h1>What do I do at the open?</h1>
          <p className="lede">
            One ritual: re-grade pinned research, demote failures, refresh forwards and live signals
            {runPaper ? ', run the paper fleet on your watchlist' : ''}. Promotion is verdict-gated — no peak-Sharpe
            shortcuts.
          </p>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn primary"
            disabled={refreshing}
            onClick={() => void morningGo()}
          >
            {refreshing
              ? progress
                ? `${progress.done}/${progress.total}…`
                : 'Running…'
              : 'Run morning ritual'}
          </button>
          <Link className="btn secondary" to="/paper">
            Paper
          </Link>
          <Link className="btn ghost" to="/forward">
            Forwards
          </Link>
          <Link className="btn ghost" to="/book">
            Book
          </Link>
        </div>
      </div>

      {error ? <div className="banner error">{error}</div> : null}
      {progress ? (
        <div className="banner info" aria-live="polite">
          {progress.step} · {progress.done}/{progress.total}
        </div>
      ) : null}

      <section className="kpi-grid">
        <KpiCard label="Pinned" value={String(favs.length)} />
        <KpiCard label="Active promotions" value={String(activeCount)} tone={activeCount ? 'positive' : 'neutral'} />
        <KpiCard label="Demoted" value={String(demoted.length)} tone={demoted.length ? 'negative' : 'neutral'} />
        <KpiCard
          label="Inbox"
          value={String(inbox.length)}
          tone={inbox.length ? 'positive' : 'neutral'}
          hint="enter / exit / add"
        />
        <KpiCard label="Watchlist" value={String(watch.length)} hint="for paper fleet" />
        <KpiCard
          label="Paper last"
          value={paper ? String(paper.actionable_count) : '—'}
          hint={paper ? `journal #${paper.id}` : 'not run'}
        />
      </section>

      <section className="panel ops-ritual">
        <h2>Morning options</h2>
        <div className="ops-ritual__row">
          <label className="chip">
            <input type="checkbox" checked={runPaper} onChange={(e) => setRunPaper(e.target.checked)} />
            Run paper fleet on watchlist
          </label>
          <label className="field" style={{ flex: '1 1 220px', margin: 0 }}>
            <span>Webhook (optional)</span>
            <input
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder="https://hooks.slack.com/…"
            />
          </label>
        </div>
        <p className="hint">
          Policy: allow <span className="mono">{policy.allow.join(', ')}</span> · min score{' '}
          <span className="mono">{policy.min_score}</span> · demote on{' '}
          <span className="mono">{policy.demote_on.join(', ')}</span>
          {watch.length ? ` · watchlist ${watch.join(', ')}` : ' · add tickers on Paper / Screener watchlist'}
        </p>
      </section>

      <section className="panel">
        <h2>Promote policy</h2>
        <div className="ops-policy">
          <label className="field">
            <span>Min score</span>
            <input
              type="number"
              min={0}
              max={100}
              value={policy.min_score}
              onChange={(e) => setPolicy({ ...policy, min_score: Number(e.target.value) })}
            />
          </label>
          <label className="chip">
            <input
              type="checkbox"
              checked={policy.allow_override}
              onChange={(e) => setPolicy({ ...policy, allow_override: e.target.checked })}
            />
            Allow override
          </label>
          <button type="button" className="btn secondary small" onClick={() => savePolicy(policy)}>
            Save policy
          </button>
          <button type="button" className="btn ghost small" onClick={() => savePolicy({ ...DEFAULT_POLICY })}>
            Reset defaults
          </button>
        </div>
        <p className="hint">
          Default pass grades: robust / promising. Overfit, no_edge and insufficient cannot promote without override —
          and they demote active promotions on the morning re-grade.
        </p>
      </section>

      {inbox.length ? (
        <section className="panel">
          <h2>Actionable inbox</h2>
          <ul className="ops-inbox">
            {inbox.map((item, i) => (
              <li key={`${item.source}-${item.label}-${item.action}-${i}`}>
                <span className={`chip tiny ops-src-${item.source}`}>{item.source}</span>
                <strong className="mono">{item.action}</strong>
                {item.href ? <Link to={item.href}>{item.label}</Link> : <span>{item.label}</span>}
                <span className="hint">{item.detail}</span>
                {item.when ? <span className="mono hint">{item.when.slice(0, 16).replace('T', ' ')}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="panel">
          <h2>Actionable inbox</h2>
          <p className="hint">Empty until you run the morning ritual or refresh live signals.</p>
        </section>
      )}

      {!favs.length ? (
        <div className="panel">
          <p>
            Pin research with <kbd>P</kbd> on a result, then grade and promote here.
          </p>
          <Link className="btn primary" to="/history">
            Open history
          </Link>
        </div>
      ) : (
        <div className="panel table-wrap">
          <h2>Pinned pipeline</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Verdict</th>
                <th>Gate</th>
                <th>Status</th>
                <th>Forward</th>
                <th>Live</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const v = row.verdict;
                const cachedGrade = v?.grade ?? row.promo?.last_verdict;
                const gate = canPromote(v ?? (cachedGrade ? ({
                  grade: cachedGrade as VerdictReport['grade'],
                  score: row.promo?.last_score ?? 0,
                  headline: '',
                  passed: 0,
                  scored: 0,
                  checks: [],
                } as VerdictReport) : null));
                return (
                  <tr key={row.fav.id} className={row.promo?.status === 'demoted' ? 'ops-demoted' : undefined}>
                    <td>
                      <Link to={`/results/${row.fav.id}`}>#{row.fav.id}</Link>
                      <div className="hint">{row.fav.title.slice(0, 42)}</div>
                    </td>
                    <td className={`mono tone-${gradeTone(cachedGrade)}`}>
                      {cachedGrade ?? '—'}
                      {v ? ` · ${v.score}` : row.promo?.last_score != null ? ` · ${row.promo.last_score}` : ''}
                    </td>
                    <td className="hint">{gate.ok ? 'pass' : 'block'}</td>
                    <td className="mono">{row.promo?.status ?? '—'}</td>
                    <td className="mono">
                      {row.forward ? <Link to="/forward">#{row.forward.id}</Link> : '—'}
                    </td>
                    <td className="mono">
                      {row.live ? `${row.live.action}${row.live.in_position ? ' · in' : ''}` : '—'}
                    </td>
                    <td>
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn ghost small"
                          disabled={busyId === row.fav.id}
                          onClick={() => void loadVerdict(row.fav.id)}
                        >
                          Grade
                        </button>
                        <button
                          type="button"
                          className="btn secondary small"
                          disabled={
                            busyId === row.fav.id ||
                            (row.promo?.status === 'active' && Boolean(row.promo.forward_id))
                          }
                          onClick={() => void promote(row.fav, false)}
                        >
                          Promote
                        </button>
                        {!gate.ok && policy.allow_override ? (
                          <button
                            type="button"
                            className="btn ghost small"
                            disabled={busyId === row.fav.id}
                            onClick={() => void promote(row.fav, true)}
                          >
                            Override
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn primary small"
                          disabled={busyId === row.fav.id}
                          onClick={() => void refreshLive(row.fav.id)}
                        >
                          Live
                        </button>
                        {row.promo ? (
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => {
                              removePromotion(row.fav.id);
                              reloadLocal();
                            }}
                          >
                            Unlink
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {demoted.length ? (
        <section className="panel">
          <h2>Demoted (failed re-grade)</h2>
          <ul className="about-receipts">
            {demoted.map((d) => (
              <li key={d.backtest_id}>
                <Link to={`/results/${d.backtest_id}`}>#{d.backtest_id}</Link> · {d.title.slice(0, 48)} —{' '}
                <span className="hint">{d.demote_reason || d.last_verdict}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {lastErrors.length ? (
        <section className="panel">
          <h2>Ritual warnings</h2>
          <ul className="hint">
            {lastErrors.slice(0, 12).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {favs[0] ? (
        <section className="panel">
          <h2>Quick promote (top pin)</h2>
          <PromoteControl
            result={{
              id: favs[0].id,
              strategy_description: favs[0].title,
              dataset_name: favs[0].dataset,
            }}
            verdict={verdicts[favs[0].id]}
          />
        </section>
      ) : null}
    </div>
  );
}
