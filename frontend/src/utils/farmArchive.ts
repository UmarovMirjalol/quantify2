import type { FarmJob, FarmResult } from '../services/api';

const KEY = 'quantify_farm_archive';
const MAX = 24;

export type FarmArchiveEntry = {
  id: string;
  saved_at: string;
  mode?: string;
  status: string;
  meta?: Record<string, unknown>;
  result: FarmResult;
  ok_count?: number;
  scanned?: number;
  label: string;
};

function read(): FarmArchiveEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as FarmArchiveEntry[];
  } catch {
    return [];
  }
}

function write(list: FarmArchiveEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    window.dispatchEvent(new CustomEvent('quantify-farm-archive'));
  } catch {
    // ignore quota
  }
}

export function listFarmArchive(): FarmArchiveEntry[] {
  return read();
}

export function saveFarmArchive(job: FarmJob, result: FarmResult): FarmArchiveEntry {
  const meta = job.meta || {};
  const uni = typeof meta.universe === 'string' ? meta.universe : '';
  const text = typeof meta.strategy_text === 'string' ? meta.strategy_text.trim() : '';
  const label =
    (text && text.slice(0, 72)) ||
    (uni && `${job.mode || 'farm'} · ${uni}`) ||
    `${job.mode || 'farm'} · ${result.ok ?? result.scanned ?? 0} ok`;
  const entry: FarmArchiveEntry = {
    id: job.id,
    saved_at: new Date().toISOString(),
    mode: job.mode,
    status: job.status,
    meta: job.meta,
    result,
    ok_count: result.ok ?? job.ok_count,
    scanned: result.scanned,
    label,
  };
  const rest = read().filter((e) => e.id !== entry.id);
  write([entry, ...rest]);
  return entry;
}

export function removeFarmArchive(id: string) {
  write(read().filter((e) => e.id !== id));
}

export function getFarmArchive(id: string): FarmArchiveEntry | undefined {
  return read().find((e) => e.id === id);
}
