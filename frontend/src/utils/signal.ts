import type { LiveSignal } from '../types';

type Action = LiveSignal['action'];

export function actionLabel(action: Action | null | undefined, side: 'long' | 'short' = 'long'): string {
  const long = side === 'long';
  switch (action) {
    case 'enter':
      return long ? 'Buy' : 'Short';
    case 'add':
      return 'Add';
    case 'exit':
      return long ? 'Sell' : 'Cover';
    case 'hold':
      return 'Hold';
    case 'wait':
      return 'Wait';
    default:
      return '—';
  }
}

export function actionTone(action: Action | null | undefined): string {
  if (action === 'enter' || action === 'add') return 'sig-buy';
  if (action === 'exit') return 'sig-sell';
  if (action === 'hold') return 'sig-hold';
  return 'sig-wait';
}

export function pct(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`;
}

export function price(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 10 ? 4 : 2 });
}
