import type { StrategySpec } from '../types';

type IndLike = {
  indicator?: string;
  period?: number | null;
  [key: string]: unknown;
};

type CondLike = {
  left?: IndLike;
  right?: IndLike | number;
  [key: string]: unknown;
};

export type CrossoverPair = {
  indicator: string;
  fast: number;
  slow: number;
  fastSide: 'left' | 'right';
  slowSide: 'left' | 'right';
};

function isInd(v: unknown): v is IndLike {
  return Boolean(v) && typeof v === 'object' && 'indicator' in (v as object);
}

/** Detect SMA/EMA-style crossover from the first entry condition (mirrors backend). */
export function detectCrossover(strategy: StrategySpec): CrossoverPair | null {
  const cond = (strategy.entry_conditions?.[0] ?? null) as CondLike | null;
  if (!cond?.left || !isInd(cond.right)) return null;
  const left = cond.left;
  const right = cond.right;
  if (!left.indicator || left.indicator !== right.indicator) return null;
  if (left.period == null || right.period == null || left.period === right.period) return null;
  if (left.period < right.period) {
    return {
      indicator: String(left.indicator),
      fast: Number(left.period),
      slow: Number(right.period),
      fastSide: 'left',
      slowSide: 'right',
    };
  }
  return {
    indicator: String(left.indicator),
    fast: Number(right.period),
    slow: Number(left.period),
    fastSide: 'right',
    slowSide: 'left',
  };
}

function remapCond(cond: unknown, oldFast: number, oldSlow: number, fast: number, slow: number): unknown {
  if (!cond || typeof cond !== 'object') return cond;
  const c = cond as CondLike;
  const next: CondLike = { ...c };
  let changed = false;
  for (const side of ['left', 'right'] as const) {
    const ref = c[side];
    if (!isInd(ref) || ref.period == null) continue;
    if (ref.period === oldFast) {
      next[side] = { ...ref, period: fast };
      changed = true;
    } else if (ref.period === oldSlow) {
      next[side] = { ...ref, period: slow };
      changed = true;
    }
  }
  return changed ? next : cond;
}

/** Deep-ish copy of StrategySpec with crossover periods remapped (entry + exit). */
export function remapStrategyPeriods(strategy: StrategySpec, fast: number, slow: number): StrategySpec {
  const pair = detectCrossover(strategy);
  if (!pair) {
    throw new Error('This strategy is not a period crossover — cannot remap the surface cell.');
  }
  if (fast >= slow) {
    throw new Error('Fast period must be shorter than slow.');
  }
  const oldFast = pair.fast;
  const oldSlow = pair.slow;
  return {
    ...strategy,
    entry_conditions: (strategy.entry_conditions || []).map((c) =>
      remapCond(c, oldFast, oldSlow, fast, slow),
    ),
    exit_conditions: (strategy.exit_conditions || []).map((c) =>
      remapCond(c, oldFast, oldSlow, fast, slow),
    ),
    entry_any: (strategy.entry_any || []).map((c) => remapCond(c, oldFast, oldSlow, fast, slow)),
    exit_any: (strategy.exit_any || []).map((c) => remapCond(c, oldFast, oldSlow, fast, slow)),
  };
}

/** Apply optimizer `params` when they look like period/threshold knobs on conditions. */
export function applyOptimizerParams(
  strategy: StrategySpec,
  params: Record<string, number | null>,
): StrategySpec {
  const fast = params.fast ?? params.fast_period ?? null;
  const slow = params.slow ?? params.slow_period ?? null;
  if (typeof fast === 'number' && typeof slow === 'number' && detectCrossover(strategy)) {
    return remapStrategyPeriods(strategy, fast, slow);
  }
  // Period-only tweaks on single-indicator rules
  const period = params.period ?? params.lookback ?? null;
  if (typeof period === 'number') {
    const patchInd = (ref: unknown): unknown => {
      if (!isInd(ref) || ref.period == null) return ref;
      return { ...ref, period };
    };
    const patchCond = (cond: unknown): unknown => {
      if (!cond || typeof cond !== 'object') return cond;
      const c = cond as CondLike;
      return { ...c, left: patchInd(c.left) as IndLike, right: isInd(c.right) ? patchInd(c.right) : c.right };
    };
    return {
      ...strategy,
      entry_conditions: (strategy.entry_conditions || []).map(patchCond),
      exit_conditions: (strategy.exit_conditions || []).map(patchCond),
    };
  }
  const threshold = params.threshold ?? params.level ?? null;
  if (typeof threshold === 'number') {
    const patchCond = (cond: unknown): unknown => {
      if (!cond || typeof cond !== 'object') return cond;
      const c = cond as CondLike & { threshold?: number | null };
      if (typeof c.right === 'number') return { ...c, right: threshold };
      if (c.threshold != null) return { ...c, threshold };
      return cond;
    };
    return {
      ...strategy,
      entry_conditions: (strategy.entry_conditions || []).map(patchCond),
      exit_conditions: (strategy.exit_conditions || []).map(patchCond),
    };
  }
  throw new Error('Cannot map these optimizer params onto the strategy.');
}
