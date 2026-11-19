/** Public product archive — Quantify founding timeline from 2025. */

export const FOUNDER = {
  name: 'Mirjalol Umarov',
  role: 'Founder & builder',
  founded: '2025-01-15',
  foundedLabel: '15 January 2025',
} as const;

export type ArchiveEntry = {
  date: string;
  title: string;
  body: string;
  tag: 'founding' | 'engine' | 'research' | 'desk' | 'release';
};

/** Curated public archive of the research desk since founding. */
export const PROJECT_ARCHIVE: ArchiveEntry[] = [
  {
    date: '2025-01-15',
    title: 'Quantify founded',
    body: 'Mirjalol Umarov opens the research desk: a look-ahead-safe engine meant to disprove weak edges, not decorate them.',
    tag: 'founding',
  },
  {
    date: '2025-02-03',
    title: 'Next-open execution locked',
    body: 'Signal on the closed bar, fill on the next open — the execution convention that still underpins every run.',
    tag: 'engine',
  },
  {
    date: '2025-03-18',
    title: 'Backtrader cross-check suite',
    body: 'Independent engine parity: the same rules must print the same trades to the cent before a build ships.',
    tag: 'engine',
  },
  {
    date: '2025-05-09',
    title: 'Holdout & walk-forward grades',
    body: 'Every result earns an out-of-sample grade instead of a single in-sample equity curve.',
    tag: 'research',
  },
  {
    date: '2025-07-22',
    title: 'Multi-asset survival study',
    body: 'Published research on whether backtest winners keep winning across stocks, ETFs, FX, futures and crypto.',
    tag: 'research',
  },
  {
    date: '2025-09-14',
    title: 'Plain-language strategy parser',
    body: 'English and Russian rules compile into an inspectable spec before capital is simulated.',
    tag: 'desk',
  },
  {
    date: '2025-11-02',
    title: 'Forward tests & paper desk',
    body: 'Freeze a strategy and score only bars that arrive later — the workflow that cannot be overfit.',
    tag: 'desk',
  },
  {
    date: '2026-01-20',
    title: 'Research farm & published suite',
    body: 'One rule across universes, plus a cached playbook × market matrix with costs and VaR.',
    tag: 'research',
  },
  {
    date: '2026-04-08',
    title: 'Python strategies with look-ahead guard',
    body: 'Sandboxed custom code; truncated re-runs reject any strategy that peeks at future bars.',
    tag: 'engine',
  },
  {
    date: '2026-07-16',
    title: 'Factor, regime & stress labs',
    body: 'Alpha vs liquid benchmarks, regime-painted price, and holdout stress in one results terminal.',
    tag: 'research',
  },
  {
    date: '2026-10-01',
    title: 'Ops desk & book tools',
    body: 'Morning promotion from pinned research into forward/paper monitoring, plus multi-run book overlays.',
    tag: 'desk',
  },
  {
    date: '2026-11-17',
    title: 'Release 47',
    body: 'Matrix studio, depth labs and the public founding archive — the desk researchers open every day.',
    tag: 'release',
  },
];
