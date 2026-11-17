import type { FactorReport } from '../services/api';

const KEY = 'quantify_factor_archive';
const MAX = 40;

export type FactorArchiveEntry = {
  id: string;
  saved_at: string;
  backtest_id: number;
  label: string;
  dataset: string;
  report: FactorReport;
};

function read(): FactorArchiveEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as FactorArchiveEntry[];
  } catch {
    return [];
  }
}

function write(list: FactorArchiveEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // quota
  }
}

export function listFactorArchive(): FactorArchiveEntry[] {
  return read();
}

export function saveFactorArchive(input: {
  backtest_id: number;
  label: string;
  dataset: string;
  report: FactorReport;
}): FactorArchiveEntry {
  const entry: FactorArchiveEntry = {
    id: `${input.backtest_id}-${input.report.benchmark}-${Date.now()}`,
    saved_at: new Date().toISOString(),
    backtest_id: input.backtest_id,
    label: input.label.slice(0, 96),
    dataset: input.dataset,
    report: {
      benchmark: input.report.benchmark,
      beta: input.report.beta,
      alpha_daily: input.report.alpha_daily,
      alpha_annual: input.report.alpha_annual,
      r2: input.report.r2,
      n: input.report.n,
    },
  };
  write([entry, ...read()]);
  return entry;
}

export function removeFactorArchive(id: string) {
  write(read().filter((e) => e.id !== id));
}
