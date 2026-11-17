import { useMemo } from 'react';
import type { StrategySpec } from '../types';
import { fingerprintBits, strategyFingerprint } from '../utils/strategyFingerprint';
import { toast } from './ToastHost';

export function StrategyFingerprint({ strategy }: { strategy: StrategySpec }) {
  const hex = useMemo(() => strategyFingerprint(strategy), [strategy]);
  const bits = useMemo(() => fingerprintBits(hex), [hex]);

  return (
    <section className="panel strategy-fp">
      <div className="page-header" style={{ marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>Strategy DNA</h2>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            void navigator.clipboard.writeText(hex).then(() => toast('Fingerprint copied', { tone: 'ok' }));
          }}
        >
          Copy
        </button>
      </div>
      <p className="hint">Stable hash of rules + risk — same DNA ⇒ same setup.</p>
      <div className="strategy-fp__bits" aria-hidden>
        {bits.map((b, i) => (
          <i key={i} className={b ? 'on' : ''} />
        ))}
      </div>
      <code className="mono strategy-fp__hex">{hex}</code>
    </section>
  );
}
