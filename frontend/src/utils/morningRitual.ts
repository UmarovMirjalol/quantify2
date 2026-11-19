import {
  getVerdict,
  listForwardTests,
  listPaperJournal,
  refreshForwardTest,
  refreshLiveSignal,
  runPaperBridge,
  type ForwardSummary,
  type PaperJournalItem,
  type PaperSignal,
} from '../services/api';
import type { LiveSignal, VerdictReport } from '../types';
import { listFavorites } from './favorites';
import {
  getPromotion,
  listActivePromotions,
  listPromotions,
  markDemoted,
  touchRefresh,
  upsertPromotion,
} from './promotion';
import { canPromote, getPromotePolicy, shouldDemote } from './promotionGate';
import { listWatchlist } from './watchlist';

export type InboxItem = {
  source: 'live' | 'forward' | 'paper';
  action: string;
  label: string;
  detail: string;
  href?: string;
  when?: string;
};

export type MorningReport = {
  forwards_refreshed: number;
  lives_refreshed: number;
  demotions: number;
  paper_run: boolean;
  paper_actionable: number;
  inbox: InboxItem[];
  forwards: ForwardSummary[];
  lives: Record<number, LiveSignal>;
  verdicts: Record<number, VerdictReport>;
  paper?: PaperJournalItem | null;
  errors: string[];
};

export type MorningProgress = { step: string; done: number; total: number };

/**
 * One morning ritual: re-grade promotions, demote failures, refresh forwards + live,
 * optional paper bridge on watchlist using the top active strategy.
 */
export async function runMorningRitual(
  opts: {
    runPaper?: boolean;
    webhookUrl?: string;
    onProgress?: (p: MorningProgress) => void;
  } = {},
): Promise<MorningReport> {
  const policy = getPromotePolicy();
  const favs = listFavorites();
  const promos = listPromotions();
  const active = listActivePromotions();
  const errors: string[] = [];
  const lives: Record<number, LiveSignal> = {};
  const verdicts: Record<number, VerdictReport> = {};
  let demotions = 0;
  let forwards_refreshed = 0;
  let lives_refreshed = 0;

  const gradeTargets = [
    ...new Set([...favs.map((f) => f.id), ...promos.map((p) => p.backtest_id)]),
  ].slice(0, 20);

  const total =
    gradeTargets.length + active.length + Math.min(12, favs.length) + (opts.runPaper ? 1 : 0);
  let done = 0;
  const tick = (step: string) => {
    done += 1;
    opts.onProgress?.({ step, done, total: Math.max(total, 1) });
  };

  for (const id of gradeTargets) {
    try {
      const v = await getVerdict(id);
      verdicts[id] = v;
      const promo = getPromotion(id);
      if (promo) {
        upsertPromotion({
          ...promo,
          last_verdict: v.grade,
          last_score: v.score,
        });
        if (promo.status === 'active' && shouldDemote(v, policy)) {
          markDemoted(id, `Re-grade ${v.grade} (score ${v.score}) · ${v.headline}`);
          demotions += 1;
        }
      }
    } catch (err) {
      errors.push(`#${id} verdict: ${err instanceof Error ? err.message : 'failed'}`);
    }
    tick(`Graded #${id}`);
  }

  for (const p of active) {
    if (!p.forward_id) continue;
    // Skip if just demoted in this pass
    if (getPromotion(p.backtest_id)?.status === 'demoted') {
      tick(`Skip demoted forward #${p.forward_id}`);
      continue;
    }
    try {
      await refreshForwardTest(p.forward_id);
      touchRefresh(p.backtest_id);
      forwards_refreshed += 1;
    } catch (err) {
      errors.push(`forward #${p.forward_id}: ${err instanceof Error ? err.message : 'failed'}`);
    }
    tick(`Forward #${p.forward_id}`);
  }

  let forwards: ForwardSummary[] = [];
  try {
    forwards = await listForwardTests();
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'forward list failed');
  }

  for (const fav of favs.slice(0, 12)) {
    try {
      lives[fav.id] = await refreshLiveSignal(fav.id);
      lives_refreshed += 1;
    } catch (err) {
      errors.push(`live #${fav.id}: ${err instanceof Error ? err.message : 'failed'}`);
    }
    tick(`Live #${fav.id}`);
  }

  let paper: PaperJournalItem | null = null;
  let paper_run = false;
  let paper_actionable = 0;
  if (opts.runPaper) {
    const watch = listWatchlist();
    const strategy =
      listActivePromotions().find((p) => p.strategy_text)?.strategy_text ||
      forwards[0]?.strategy_text ||
      '';
    if (strategy && watch.length) {
      try {
        const result = await runPaperBridge({
          strategy_text: strategy,
          tickers: watch.slice(0, 24),
          webhook_url: opts.webhookUrl?.trim() || undefined,
          save: true,
        });
        paper_run = true;
        paper_actionable = result.actionable?.length ?? 0;
        const journal = await listPaperJournal(5);
        paper = journal.items[0] ?? null;
      } catch (err) {
        errors.push(`paper: ${err instanceof Error ? err.message : 'failed'}`);
      }
    } else {
      errors.push('Paper skipped — need an active strategy text and a watchlist.');
    }
    tick('Paper fleet');
  }

  const inbox = buildInbox({ lives, forwards, paper, favs: favs.map((f) => ({ id: f.id, title: f.title })) });

  return {
    forwards_refreshed,
    lives_refreshed,
    demotions,
    paper_run,
    paper_actionable,
    inbox,
    forwards,
    lives,
    verdicts,
    paper,
    errors,
  };
}

function buildInbox(input: {
  lives: Record<number, LiveSignal>;
  forwards: ForwardSummary[];
  paper: PaperJournalItem | null;
  favs: { id: number; title: string }[];
}): InboxItem[] {
  const out: InboxItem[] = [];
  const title = (id: number) => input.favs.find((f) => f.id === id)?.title ?? `#${id}`;

  for (const [idStr, sig] of Object.entries(input.lives)) {
    if (!sig) continue;
    if (sig.action !== 'enter' && sig.action !== 'exit' && sig.action !== 'add') continue;
    const id = Number(idStr);
    out.push({
      source: 'live',
      action: sig.action,
      label: title(id),
      detail: `${sig.side} · close ${sig.last_close}${sig.note ? ` · ${sig.note}` : ''}`,
      href: `/results/${id}`,
      when: sig.as_of,
    });
  }

  for (const f of input.forwards) {
    if (!f.action || f.action === 'wait' || f.action === 'hold') continue;
    out.push({
      source: 'forward',
      action: f.action,
      label: f.name || f.ticker,
      detail: `${f.ticker} · fwd ${(f.forward_return * 100).toFixed(1)}% vs hold ${(f.hold_return * 100).toFixed(1)}%`,
      href: '/forward',
      when: f.as_of ?? undefined,
    });
  }

  const paperSignals: PaperSignal[] = input.paper?.actionable ?? [];
  for (const s of paperSignals) {
    out.push({
      source: 'paper',
      action: s.action,
      label: s.ticker,
      detail: s.order_for_next_open || `${s.side ?? ''} · ${s.last_close}`,
      href: '/paper',
      when: s.as_of,
    });
  }

  return out;
}

export { canPromote };
