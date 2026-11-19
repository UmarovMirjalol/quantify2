import type { VerdictReport } from '../types';

export type PromoteGrade = VerdictReport['grade'];

const KEY = 'quantify_promote_policy';

export type PromotePolicy = {
  /** Grades allowed to create a forward from research. */
  allow: PromoteGrade[];
  /** Re-grade that demotes an active promotion. */
  demote_on: PromoteGrade[];
  /** Minimum score (0–100) in addition to grade. */
  min_score: number;
  /** Allow explicit override after confirm. */
  allow_override: boolean;
};

export const DEFAULT_POLICY: PromotePolicy = {
  allow: ['robust', 'promising'],
  demote_on: ['overfit', 'no_edge', 'insufficient'],
  min_score: 55,
  allow_override: true,
};

export function getPromotePolicy(): PromotePolicy {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<PromotePolicy> | null;
    if (!raw) return { ...DEFAULT_POLICY };
    return {
      allow: Array.isArray(raw.allow) && raw.allow.length ? (raw.allow as PromoteGrade[]) : DEFAULT_POLICY.allow,
      demote_on:
        Array.isArray(raw.demote_on) && raw.demote_on.length
          ? (raw.demote_on as PromoteGrade[])
          : DEFAULT_POLICY.demote_on,
      min_score: typeof raw.min_score === 'number' ? raw.min_score : DEFAULT_POLICY.min_score,
      allow_override: raw.allow_override ?? DEFAULT_POLICY.allow_override,
    };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

export function setPromotePolicy(next: PromotePolicy) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('quantify-promote-policy'));
  } catch {
    // quota
  }
}

export type GateResult =
  | { ok: true; reason: string }
  | { ok: false; reason: string; canOverride: boolean };

/** Decide whether a verdict may promote research into forward/live ops. */
export function canPromote(verdict: VerdictReport | null | undefined, policy = getPromotePolicy()): GateResult {
  if (!verdict) {
    return { ok: false, reason: 'Run the verdict first — no grade on file.', canOverride: false };
  }
  if (!policy.allow.includes(verdict.grade)) {
    return {
      ok: false,
      reason: `Grade “${verdict.grade}” is blocked (need ${policy.allow.join(' / ')}). ${verdict.headline}`,
      canOverride: policy.allow_override,
    };
  }
  if (verdict.score < policy.min_score) {
    return {
      ok: false,
      reason: `Score ${verdict.score} is below the floor (${policy.min_score}).`,
      canOverride: policy.allow_override,
    };
  }
  return {
    ok: true,
    reason: `Pass · ${verdict.grade} · score ${verdict.score} · ${verdict.passed}/${verdict.scored} checks`,
  };
}

export function shouldDemote(verdict: VerdictReport, policy = getPromotePolicy()): boolean {
  if (policy.demote_on.includes(verdict.grade)) return true;
  if (verdict.score < policy.min_score) return true;
  return false;
}

export function gradeTone(grade: string | null | undefined): 'positive' | 'negative' | 'neutral' {
  if (grade === 'robust' || grade === 'promising') return 'positive';
  if (grade === 'overfit' || grade === 'no_edge' || grade === 'insufficient') return 'negative';
  return 'neutral';
}
