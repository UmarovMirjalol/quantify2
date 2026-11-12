/** Human-readable lines from a parsed StrategySpec condition blob. */

import type { StrategySpec } from '../types';

const pctText = (x: number) => `${+(x * 100).toFixed(2)}%`;

/** Position size in plain words, matching how the risk engine sizes entries. */
export function sizingLabel(s: Pick<StrategySpec, 'position_sizing' | 'risk' | 'stop_loss'>): string {
  if (s.position_sizing === 'percent_capital') return `${pctText(s.risk.percent_capital ?? 0.1)} of capital per trade`;
  if (s.position_sizing === 'fixed') return 'Fixed number of units';
  if (s.stop_loss) return `Risk ${pctText(s.risk.risk_per_trade)} of capital per trade`;
  return `${pctText(s.risk.max_position_pct ?? 1)} of capital per trade (no stop)`;
}

/** Plain-language warnings about stop-loss and position size choices. */
export function riskWarnings(
  s: Pick<StrategySpec, 'position_sizing' | 'risk' | 'stop_loss' | 'side'>,
): string[] {
  const out: string[] = [];
  const size =
    s.position_sizing === 'percent_capital'
      ? s.risk.percent_capital ?? 0.1
      : s.position_sizing === 'risk_based' && !s.stop_loss
        ? s.risk.max_position_pct ?? 1
        : null;
  if (!s.stop_loss && s.position_sizing !== 'fixed' && (size ?? 0) >= 0.25) {
    out.push(
      `No stop-loss: each trade puts ${pctText(size ?? 1)} of your money on the line until the exit rule fires. ` +
        'Add “stop loss 5%” to the text to cap the damage of one bad trade.',
    );
  }
  if (size != null && size > 1) {
    out.push(`A position of ${pctText(size)} is more than all your capital, which means borrowed money (leverage).`);
  }
  if (s.stop_loss && s.position_sizing === 'risk_based' && s.risk.risk_per_trade > 0.05) {
    out.push(
      `Risking ${pctText(s.risk.risk_per_trade)} per trade is aggressive: ten losses in a row would cost about ` +
        `${pctText(1 - (1 - s.risk.risk_per_trade) ** 10)} of the account.`,
    );
  }
  if (s.stop_loss && s.stop_loss < 0.005) {
    out.push(`A ${pctText(s.stop_loss)} stop is tighter than normal daily noise and will be hit often.`);
  }
  if (s.side === 'short' && !s.stop_loss) {
    out.push('Short trades without a stop can lose more than the position size if the price keeps rising.');
  }
  return out;
}

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

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function changeSpan(bars: number): string {
  if (bars === 1) return '1 day';
  if (bars === 5) return '1 week';
  if (bars === 21) return '1 month';
  return `${bars} days`;
}

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
  if (name === 'STOCH') {
    return `Stoch(${ind.period ?? 14},${ind.signal_period ?? 3}).%${ind.component === 'd' ? 'D' : 'K'}`;
  }
  if (name === 'ADX') {
    const label = ind.component === 'plus' ? '+DI' : ind.component === 'minus' ? '-DI' : 'ADX';
    return `${label}(${ind.period ?? 14})`;
  }
  if (name === 'DONCHIAN') {
    const p = ind.period ?? 20;
    if (ind.component === 'lower') return `${p}-bar low`;
    if (ind.component === 'middle') return `${p}-bar channel mid`;
    return `${p}-bar high`;
  }
  if (name === 'CHANGE') return `Change(${changeSpan(ind.period ?? 1)}) %`;
  if (name === 'WEEKDAY') return ind.component === 'next' ? 'Next session weekday' : 'Weekday';
  if (ind.period != null) return `${name}(${ind.period})`;
  return name;
}

export function formatCondition(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return String(raw ?? '—');
  const c = raw as CondLike;

  if (c.left?.indicator === 'WEEKDAY' && typeof c.right === 'number') {
    const day = DAYS[c.right] ?? `day ${c.right}`;
    return c.left.component === 'next' ? `At ${day}'s open` : `On ${day}`;
  }
  if (c.left?.indicator === 'CHANGE' && typeof c.right === 'number') {
    const span = changeSpan(c.left.period ?? 1);
    const op = c.operator === 'less_than' ? '<' : c.operator === 'greater_than' ? '>' : OP_LABEL[c.operator ?? ''] ?? '';
    return `Price change over ${span} ${op} ${c.right > 0 ? '+' : ''}${c.right}%`;
  }

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

export function formatConditions(list: unknown[] | undefined, logic?: string, anyOf?: unknown[]): string[] {
  if (!list?.length) return ['—'];
  const joiner = logic === 'OR' ? 'OR' : 'AND';
  const lines = list.map((c, i) => {
    const line = formatCondition(c);
    return i === 0 ? line : `${joiner} ${line}`;
  });
  if (anyOf?.length) lines.push(`AND any of: ${anyOf.map(formatCondition).join(' | ')}`);
  return lines;
}
