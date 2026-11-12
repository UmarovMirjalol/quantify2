import type { StrategySpec } from '../types';

export type ManagementDraft = {
  trailing: string;
  levels: { profit: string; fraction: string }[];
  breakeven: boolean;
  maxEntries: number;
};

export const EMPTY_MANAGEMENT: ManagementDraft = { trailing: '', levels: [], breakeven: false, maxEntries: 1 };

const pctText = (v: number) => String(Math.round(v * 10000) / 100);

export function managementFromSpec(spec: Partial<StrategySpec> | null | undefined): ManagementDraft {
  if (!spec) return EMPTY_MANAGEMENT;
  return {
    trailing: spec.trailing_stop ? pctText(spec.trailing_stop) : '',
    levels: (spec.scale_out ?? []).map((l) => ({ profit: pctText(l.profit), fraction: pctText(l.fraction) })),
    breakeven: Boolean(spec.breakeven_after_scale),
    maxEntries: spec.max_entries ?? 1,
  };
}

function pct(value: string): number | null {
  const v = Number(value);
  return value.trim() === '' || !Number.isFinite(v) || v <= 0 ? null : v / 100;
}

/** Fields set in the draft override the strategy; empty fields leave it as parsed. */
export function applyManagement(spec: StrategySpec, draft: ManagementDraft): StrategySpec {
  const next = { ...spec };
  const trailing = pct(draft.trailing);
  if (trailing) next.trailing_stop = trailing;
  const levels = draft.levels
    .map((l) => ({ profit: pct(l.profit), fraction: pct(l.fraction) }))
    .filter((l): l is { profit: number; fraction: number } => Boolean(l.profit && l.fraction));
  if (levels.length) next.scale_out = levels;
  if (draft.breakeven) next.breakeven_after_scale = true;
  if (draft.maxEntries > 1) next.max_entries = draft.maxEntries;
  return next;
}

export function managementSummary(spec: Partial<StrategySpec>): string[] {
  const lines: string[] = [];
  if (spec.trailing_stop) lines.push(`Trailing stop ${pctText(spec.trailing_stop)}%`);
  for (const l of spec.scale_out ?? []) {
    lines.push(`Close ${pctText(l.fraction)}% at +${pctText(l.profit)}%`);
  }
  if (spec.breakeven_after_scale) lines.push('Stop to breakeven after the first partial exit');
  if ((spec.max_entries ?? 1) > 1) lines.push(`Pyramiding: up to ${spec.max_entries} entries`);
  if (spec.funding_rate) lines.push(`Holding cost ${pctText(spec.funding_rate)}% a year`);
  return lines;
}

interface Props {
  value: ManagementDraft;
  onChange: (next: ManagementDraft) => void;
  disabled?: boolean;
}

export function PositionManagement({ value, onChange, disabled }: Props) {
  const set = (patch: Partial<ManagementDraft>) => onChange({ ...value, ...patch });
  const setLevel = (i: number, patch: Partial<{ profit: string; fraction: string }>) =>
    set({ levels: value.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const active = managementSummary(applyManagement({} as StrategySpec, value)).length > 0;
  const totalFraction = value.levels.reduce((sum, l) => sum + (Number(l.fraction) || 0), 0);

  return (
    <details className="management" open={active}>
      <summary>
        Position management
        <span className="hint"> — trailing stop, partial exits, pyramiding</span>
      </summary>
      <div className="param-grid">
        <label className="field">
          <span>Trailing stop, %</span>
          <input
            type="number"
            min={0}
            max={50}
            step="any"
            placeholder="off"
            value={value.trailing}
            disabled={disabled}
            onChange={(e) => set({ trailing: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Max entries (pyramiding)</span>
          <select
            value={value.maxEntries}
            disabled={disabled}
            onChange={(e) => set({ maxEntries: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? '1 — no adding' : `${n} — add on each new signal`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {value.levels.map((level, i) => (
        <div className="param-grid scale-row" key={i}>
          <label className="field">
            <span>Take {i + 1}: close, % of position</span>
            <input
              type="number"
              min={5}
              max={100}
              step="any"
              value={level.fraction}
              disabled={disabled}
              onChange={(e) => setLevel(i, { fraction: e.target.value })}
            />
          </label>
          <label className="field">
            <span>…when profit reaches, %</span>
            <input
              type="number"
              min={0.1}
              step="any"
              value={level.profit}
              disabled={disabled}
              onChange={(e) => setLevel(i, { profit: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="btn ghost small"
            disabled={disabled}
            onClick={() => set({ levels: value.levels.filter((_, j) => j !== i) })}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="btn-row">
        {value.levels.length < 3 ? (
          <button
            type="button"
            className="btn secondary small"
            disabled={disabled}
            onClick={() =>
              set({ levels: [...value.levels, { fraction: '50', profit: String(5 * (value.levels.length + 1)) }] })
            }
          >
            + Partial take-profit
          </button>
        ) : null}
        <label className="check">
          <input
            type="checkbox"
            checked={value.breakeven}
            disabled={disabled}
            onChange={(e) => set({ breakeven: e.target.checked })}
          />
          Move stop to breakeven after the first partial exit
        </label>
      </div>
      {totalFraction > 100 ? (
        <div className="banner warn">Partial exits add up to more than 100% of the position.</div>
      ) : null}
      <p className="hint">
        The trailing stop follows the best price since entry and never loosens. Partial exits are measured from the
        average entry. With pyramiding, each bar where the entry rule still holds adds one more unit, sized by the
        same risk limits.
      </p>
    </details>
  );
}
