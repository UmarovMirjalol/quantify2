import { useMemo } from 'react';
import type { EquityPoint } from '../types';

type State = {
  underwater: boolean;
  depth: number;
  bars: number;
  peakDate: string;
  troughDate: string;
};

function currentSpell(curve: EquityPoint[]): State | null {
  if (curve.length < 2) return null;
  let peak = curve[0].equity;
  let peakIdx = 0;
  let troughIdx = 0;
  let troughEq = peak;

  for (let i = 1; i < curve.length; i++) {
    const eq = curve[i].equity;
    if (eq >= peak) {
      peak = eq;
      peakIdx = i;
      troughIdx = i;
      troughEq = eq;
    } else if (eq < troughEq) {
      troughEq = eq;
      troughIdx = i;
    }
  }

  const last = curve.length - 1;
  const underwater = curve[last].equity < peak - 1e-9;
  if (!underwater && peakIdx === last) return null;

  const depth = peak > 0 ? troughEq / peak - 1 : 0;
  return {
    underwater,
    depth,
    bars: last - peakIdx,
    peakDate: curve[peakIdx].date.slice(0, 10),
    troughDate: curve[troughIdx].date.slice(0, 10),
  };
}

export function RecoveryClock({ curve }: { curve: EquityPoint[] }) {
  const state = useMemo(() => currentSpell(curve), [curve]);
  if (!state) {
    return (
      <section className="panel recovery-clock">
        <h2>Recovery clock</h2>
        <p className="hint">At equity highs — no open drawdown spell.</p>
        <div className="recovery-clock__ring recovery-clock__ring--ok">
          <span>ATH</span>
        </div>
      </section>
    );
  }

  const pctDepth = Math.min(100, Math.abs(state.depth) * 100);
  const angle = Math.min(360, pctDepth * 12);

  return (
    <section className="panel recovery-clock">
      <h2>Recovery clock</h2>
      <p className="hint">
        {state.underwater
          ? `Open spell since ${state.peakDate} · trough ${state.troughDate}`
          : `Last spell resolved · peak was ${state.peakDate}`}
      </p>
      <div className="recovery-clock__body">
        <div
          className={`recovery-clock__ring ${state.underwater ? 'recovery-clock__ring--dd' : ''}`}
          style={{
            background: `conic-gradient(rgba(229,122,132,0.85) ${angle}deg, rgba(255,255,255,0.06) 0)`,
          }}
        >
          <span className="neg mono">{(state.depth * 100).toFixed(1)}%</span>
        </div>
        <dl className="kv">
          <div>
            <dt>Bars since peak</dt>
            <dd className="mono">{state.bars}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{state.underwater ? 'Still underwater' : 'Recovered'}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
