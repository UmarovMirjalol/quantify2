import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createForwardTest, getBacktest, getVerdict } from '../services/api';
import type { BacktestResult, VerdictReport } from '../types';
import { upsertPromotion, getPromotion } from '../utils/promotion';
import { canPromote, gradeTone } from '../utils/promotionGate';
import { toast } from './ToastHost';

/**
 * Verdict-gated promote: grade → gate → forward test → ops link.
 * Used from Results and the morning desk.
 */
export function PromoteControl({
  result,
  verdict: verdictProp,
  compact,
}: {
  result: Pick<BacktestResult, 'id' | 'strategy_description' | 'dataset_name'> & {
    strategy?: { asset?: string } | null;
  };
  verdict?: VerdictReport | null;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<VerdictReport | null>(verdictProp ?? null);
  const [note, setNote] = useState<string | null>(null);
  const existing = getPromotion(result.id);

  async function ensureVerdict(): Promise<VerdictReport> {
    if (verdict) return verdict;
    const v = await getVerdict(result.id);
    setVerdict(v);
    return v;
  }

  async function promote(force = false) {
    setBusy(true);
    setNote(null);
    try {
      const v = await ensureVerdict();
      const gate = canPromote(v);
      if (!gate.ok) {
        if (force && gate.canOverride) {
          const ok = window.confirm(`${gate.reason}\n\nOverride and promote anyway?`);
          if (!ok) {
            setNote(gate.reason);
            return;
          }
        } else {
          setNote(gate.reason);
          toast('Promotion blocked', { tone: 'error', body: gate.reason });
          return;
        }
      }

      const detail = await createForwardTest({
        backtest_id: result.id,
        name: result.strategy_description.slice(0, 80),
      });

      let strategyText = result.strategy_description;
      try {
        const full = await getBacktest(result.id);
        strategyText = full.strategy_description || strategyText;
      } catch {
        // keep description
      }

      upsertPromotion({
        backtest_id: result.id,
        forward_id: detail.id,
        title: result.strategy_description.slice(0, 96),
        dataset: result.dataset_name,
        strategy_text: strategyText,
        ticker: result.strategy?.asset,
        promoted_at: new Date().toISOString(),
        last_verdict: v.grade,
        last_score: v.score,
        status: 'active',
        override: force && !gate.ok,
      });

      toast(force && !gate.ok ? 'Promoted with override' : 'Promoted to forward', {
        tone: 'ok',
        body: `#${result.id} → forward #${detail.id} · ${v.grade}`,
      });
      navigate('/desk');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Promote failed';
      setNote(msg);
      toast(msg, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const gate = canPromote(verdict);
  const tone = gradeTone(verdict?.grade);

  if (compact) {
    return (
      <button
        type="button"
        className="btn primary small"
        disabled={busy || Boolean(existing?.forward_id && existing.status === 'active')}
        onClick={() => void promote(false)}
        title={existing?.forward_id ? 'Already promoted' : 'Grade + promote to forward'}
      >
        {busy ? '…' : existing?.status === 'active' ? 'Promoted' : 'Promote'}
      </button>
    );
  }

  return (
    <div className="promote-control">
      <div className="btn-row">
        <button type="button" className="btn secondary small" disabled={busy} onClick={() => void ensureVerdict().then((v) => toast(`Verdict · ${v.grade}`, { tone: 'ok' }))}>
          {busy ? 'Working…' : verdict ? `Re-grade (${verdict.grade})` : 'Run verdict'}
        </button>
        <button
          type="button"
          className="btn primary small"
          disabled={busy || (existing?.status === 'active' && Boolean(existing.forward_id))}
          onClick={() => void promote(false)}
        >
          {existing?.status === 'active' ? 'Already on ops desk' : 'Promote if pass'}
        </button>
        {!gate.ok && gate.canOverride && verdict ? (
          <button type="button" className="btn ghost small" disabled={busy} onClick={() => void promote(true)}>
            Override
          </button>
        ) : null}
      </div>
      {verdict ? (
        <p className={`hint promote-control__grade tone-${tone}`}>
          {verdict.grade} · score {verdict.score} · {verdict.passed}/{verdict.scored} · {verdict.headline}
        </p>
      ) : (
        <p className="hint">Promotion requires a passing verdict (robust / promising by default).</p>
      )}
      {note ? <p className="banner warn" style={{ marginTop: '0.5rem' }}>{note}</p> : null}
    </div>
  );
}
