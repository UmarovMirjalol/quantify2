import type { Trade } from '../types';

export type StreakReport = {
  max_win: number;
  max_loss: number;
  current: number;
  current_kind: 'win' | 'loss' | 'flat';
  win_trades: number;
  loss_trades: number;
};

export function tradeStreaks(trades: Trade[]): StreakReport {
  let maxWin = 0;
  let maxLoss = 0;
  let cur = 0;
  let kind: 'win' | 'loss' | 'flat' = 'flat';
  let wins = 0;
  let losses = 0;

  for (const t of trades) {
    if (t.pnl > 0) {
      wins += 1;
      if (kind === 'win') cur += 1;
      else {
        kind = 'win';
        cur = 1;
      }
      maxWin = Math.max(maxWin, cur);
    } else if (t.pnl < 0) {
      losses += 1;
      if (kind === 'loss') cur += 1;
      else {
        kind = 'loss';
        cur = 1;
      }
      maxLoss = Math.max(maxLoss, cur);
    } else {
      kind = 'flat';
      cur = 0;
    }
  }

  return {
    max_win: maxWin,
    max_loss: maxLoss,
    current: cur,
    current_kind: kind,
    win_trades: wins,
    loss_trades: losses,
  };
}
