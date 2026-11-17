import type {
  MonteCarloResult,
  OptimizerReport,
  StressReport,
  SyntheticReport,
  WalkForwardReport,
} from '../types';

export type ResearchPack = {
  stress: StressReport | null;
  walk: WalkForwardReport | null;
  synth: SyntheticReport | null;
  opt: OptimizerReport | null;
  mc: MonteCarloResult | null;
};

function chip(verdict: string | null | undefined): string {
  if (!verdict) return 'thin';
  if (['holds', 'stable', 'robust', 'improves', 'already_best', 'survives', 'plateau'].includes(verdict)) {
    return 'holds';
  }
  if (['overfit', 'fails', 'gone', 'luck', 'no_edge'].includes(verdict)) return 'overfit';
  if (['fragile', 'uneven', 'peak', 'weak', 'no_gain', 'history_only'].includes(verdict)) return 'fragile';
  return 'thin';
}

function pct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fixed(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(2);
}

function Cell({
  verdict,
  detail,
  loading,
}: {
  verdict?: string | null;
  detail: string;
  loading?: boolean;
}) {
  return (
    <div className={`compare-research__cell verdict-${chip(verdict)}`}>
      <strong>{loading ? '…' : verdict ? verdict.replace(/_/g, ' ') : '—'}</strong>
      <span className="hint">{loading ? 'Loading…' : detail}</span>
    </div>
  );
}

function packRows(a: ResearchPack, b: ResearchPack) {
  return [
    {
      title: 'Holdout',
      av: a.stress?.verdict,
      bv: b.stress?.verdict,
      ad: a.stress
        ? `OOS Sharpe ${fixed(a.stress.holdout.sharpe_ratio)} · ret ${pct(a.stress.holdout.total_return)}`
        : '—',
      bd: b.stress
        ? `OOS Sharpe ${fixed(b.stress.holdout.sharpe_ratio)} · ret ${pct(b.stress.holdout.total_return)}`
        : '—',
    },
    {
      title: 'Walk-forward',
      av: a.walk?.verdict,
      bv: b.walk?.verdict,
      ad: a.walk
        ? `hit ${a.walk.hit_rate == null ? '—' : `${Math.round(a.walk.hit_rate * 100)}%`} · ${a.walk.folds.length} folds`
        : '—',
      bd: b.walk
        ? `hit ${b.walk.hit_rate == null ? '—' : `${Math.round(b.walk.hit_rate * 100)}%`} · ${b.walk.folds.length} folds`
        : '—',
    },
    {
      title: 'Synthetic',
      av: a.synth?.verdict,
      bv: b.synth?.verdict,
      ad: a.synth ? `profitable ${pct(a.synth.profitable_share)} · real rank ${a.synth.real_rank}` : '—',
      bd: b.synth ? `profitable ${pct(b.synth.profitable_share)} · real rank ${b.synth.real_rank}` : '—',
    },
    {
      title: 'Optimizer',
      av: a.opt?.verdict,
      bv: b.opt?.verdict,
      ad: a.opt
        ? `unseen ${fixed(a.opt.best?.test?.sharpe_ratio)} · P(real) ${
            a.opt.deflated?.probability == null ? '—' : `${Math.round(a.opt.deflated.probability * 100)}%`
          }`
        : '—',
      bd: b.opt
        ? `unseen ${fixed(b.opt.best?.test?.sharpe_ratio)} · P(real) ${
            b.opt.deflated?.probability == null ? '—' : `${Math.round(b.opt.deflated.probability * 100)}%`
          }`
        : '—',
    },
    {
      title: 'Monte Carlo',
      av: a.mc && a.mc.num_simulations > 0 ? (a.mc.risk_of_ruin > 0.1 ? 'fragile' : 'holds') : null,
      bv: b.mc && b.mc.num_simulations > 0 ? (b.mc.risk_of_ruin > 0.1 ? 'fragile' : 'holds') : null,
      ad:
        a.mc && a.mc.num_simulations > 0
          ? `ruin ${pct(a.mc.risk_of_ruin)} · p5 ${pct(a.mc.confidence_95_lower)}`
          : '—',
      bd:
        b.mc && b.mc.num_simulations > 0
          ? `ruin ${pct(b.mc.risk_of_ruin)} · p5 ${pct(b.mc.confidence_95_lower)}`
          : '—',
    },
  ];
}

export function CompareResearchGrid({
  aId,
  bId,
  a,
  b,
  loading,
}: {
  aId: number;
  bId: number;
  a: ResearchPack;
  b: ResearchPack;
  loading?: boolean;
}) {
  const rows = packRows(a, b);

  return (
    <section className="panel compare-research">
      <h2>Research duel</h2>
      <p className="hint">
        Holdout, walk-forward, synthetic paths, optimizer, and Monte Carlo — loaded in parallel for #{aId} and #{bId}.
      </p>
      <div className="compare-research__grid">
        <div className="compare-research__head mono hint">Check</div>
        <div className="compare-research__head mono hint">A · #{aId}</div>
        <div className="compare-research__head mono hint">B · #{bId}</div>
        {rows.map((r) => (
          <div key={r.title} className="compare-research__row">
            <div className="compare-research__label">{r.title}</div>
            <Cell verdict={r.av} detail={r.ad} loading={loading && !r.av} />
            <Cell verdict={r.bv} detail={r.bd} loading={loading && !r.bv} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function emptyResearchPack(): ResearchPack {
  return { stress: null, walk: null, synth: null, opt: null, mc: null };
}
