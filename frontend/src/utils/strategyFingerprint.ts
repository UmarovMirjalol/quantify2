import type { StrategySpec } from '../types';

/** Short stable hash of strategy DNA for quick “same rules?” checks. */
export function strategyFingerprint(s: StrategySpec): string {
  const payload = JSON.stringify({
    a: s.asset,
    side: s.side ?? 'long',
    tf: s.timeframe,
    e: s.entry_conditions,
    x: s.exit_conditions,
    ea: s.entry_any ?? [],
    xa: s.exit_any ?? [],
    el: s.entry_logic,
    xl: s.exit_logic,
    sl: s.stop_loss,
    tp: s.take_profit,
    tr: s.trailing_stop ?? null,
    ps: s.position_sizing,
    risk: s.risk,
    code: s.custom_code ? s.custom_code.slice(0, 400) : null,
    sess: s.session ?? 'all',
  });
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function fingerprintBits(hex: string): number[] {
  const n = parseInt(hex.slice(0, 8), 16) || 0;
  return Array.from({ length: 16 }, (_, i) => (n >> i) & 1);
}
