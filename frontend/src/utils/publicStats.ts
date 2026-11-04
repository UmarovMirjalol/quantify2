/** Mirror of `backend/app/stats_drift.py`. Do not change one without the other. */

export const STATS_BASELINE = {
  users: 852,
  backtests: 1442,
  releases: 22,
} as const;

const EPOCH_UTC = Date.UTC(2026, 10, 4);
const MOD = 2_147_483_648;

export function dailyUserOffset(now = new Date()): number {
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const elapsed = Math.floor((utc - EPOCH_UTC) / 86_400_000);
  if (elapsed <= 0) return 0;
  let total = 0;
  for (let i = 0; i < elapsed; i++) {
    const mixed = (i * 1_103_515_245 + 12_345) % MOD;
    total += 1 + (mixed % 3);
  }
  return total;
}

export function baselineUsers(now = new Date()): number {
  return STATS_BASELINE.users + dailyUserOffset(now);
}
