import type { EquityPoint } from '../types';

export type UnderwaterReport = {
  periods: number;
  longest_days: number;
  time_underwater: number;
  avg_recovery_days: number | null;
  currently_underwater: boolean;
};

/** Drawdown spell stats from equity curve (uses drawdown field when present). */
export function underwaterReport(curve: EquityPoint[]): UnderwaterReport {
  if (curve.length < 2) {
    return {
      periods: 0,
      longest_days: 0,
      time_underwater: 0,
      avg_recovery_days: null,
      currently_underwater: false,
    };
  }

  let peak = curve[0].equity;
  let inDd = false;
  let start = 0;
  let periods = 0;
  let longest = 0;
  let underBars = 0;
  const recoveries: number[] = [];

  for (let i = 0; i < curve.length; i++) {
    const eq = curve[i].equity;
    const dd =
      curve[i].drawdown != null
        ? (curve[i].drawdown as number)
        : peak > 0
          ? eq / peak - 1
          : 0;
    if (eq > peak) peak = eq;

    if (dd < -1e-9) {
      underBars += 1;
      if (!inDd) {
        inDd = true;
        start = i;
        periods += 1;
      }
    } else if (inDd) {
      const len = i - start;
      longest = Math.max(longest, len);
      recoveries.push(len);
      inDd = false;
    }
  }
  if (inDd) {
    longest = Math.max(longest, curve.length - 1 - start);
  }

  return {
    periods,
    longest_days: longest,
    time_underwater: underBars / curve.length,
    avg_recovery_days: recoveries.length
      ? Math.round(recoveries.reduce((a, b) => a + b, 0) / recoveries.length)
      : null,
    currently_underwater: inDd,
  };
}
