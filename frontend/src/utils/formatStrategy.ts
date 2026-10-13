/** Human-readable lines from a parsed StrategySpec condition blob. */

type IndLike = {
  indicator?: string;
  period?: number | null;
  fast_period?: number | null;
  slow_period?: number | null;
  signal_period?: number | null;
  std_dev?: number | null;
  component?: string;
};

type CondLike = {
  left?: IndLike;
  operator?: string;
  right?: IndLike | number;
  indicator?: string;
  fast_period?: number | null;
  slow_period?: number | null;
  condition?: string;
  threshold?: number | null;
  period?: number | null;
};

const OP_LABEL: Record<string, string> = {
  greater_than: '>',
  less_than: '<',
  cross_above: 'crosses above',
  cross_below: 'crosses below',
  equals: '=',
};

function formatInd(ind: IndLike | undefined): string {
  if (!ind?.indicator) return '?';
  const name = ind.indicator;
  if (name === 'MACD') {
    const parts = [ind.fast_period ?? 12, ind.slow_period ?? 26, ind.signal_period ?? 9];
    const comp = ind.component && ind.component !== 'macd' ? `.${ind.component}` : '';
    return `MACD(${parts.join(',')})${comp}`;
  }
  if (name === 'BOLLINGER') {
    const band = ind.component && ind.component !== 'middle' ? `.${ind.component}` : '';
    return `BB(${ind.period ?? 20},${ind.std_dev ?? 2})${band}`;
  }
  if (name === 'PRICE') {
    return (ind.component ?? 'close').toUpperCase();
  }
  if (ind.period != null) return `${name}(${ind.period})`;
  return name;
}

export function formatCondition(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return String(raw ?? '—');
  const c = raw as CondLike;

  if (c.left && c.operator != null) {
    const op = OP_LABEL[c.operator] ?? c.operator;
    const right =
      typeof c.right === 'number' ? String(c.right) : formatInd(c.right as IndLike | undefined);
    return `${formatInd(c.left)} ${op} ${right}`;
  }

  // Shorthand left from parser before expand
  if (c.indicator && (c.condition || c.operator)) {
    const op = OP_LABEL[c.condition ?? c.operator ?? ''] ?? c.condition ?? c.operator;
    if (c.fast_period != null && c.slow_period != null) {
      return `${c.indicator}(${c.fast_period}) ${op} ${c.indicator}(${c.slow_period})`;
    }
    if (c.threshold != null) {
      return `${c.indicator}${c.period != null ? `(${c.period})` : ''} ${op} ${c.threshold}`;
    }
  }

  try {
    return JSON.stringify(raw);
  } catch {
    return '—';
  }
}

export function formatConditions(list: unknown[] | undefined, logic?: string): string[] {
  if (!list?.length) return ['—'];
  const joiner = logic === 'OR' ? 'OR' : 'AND';
  return list.map((c, i) => {
    const line = formatCondition(c);
    return i === 0 ? line : `${joiner} ${line}`;
  });
}
