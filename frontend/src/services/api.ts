import type {
  BacktestResult,
  BacktestSummary,
  DatasetInfo,
  HealthStatus,
  LLMStatus,
  PlaybookItem,
  PublicStats,
  PulseItem,
  ReleaseItem,
  StrategySpec,
} from '../types';
import { authHeaders } from './session';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  const auth = authHeaders();
  for (const [k, v] of Object.entries(auth)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new Event('quantify:unauthorized'));
    }
    let detail: string = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === 'string') {
        detail = body.detail;
      } else if (body.detail?.errors) {
        detail = body.detail.errors.join('; ');
      } else if (Array.isArray(body.detail)) {
        detail = body.detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join('; ');
      } else {
        detail = JSON.stringify(body.detail ?? body);
      }
    } catch {
      // keep statusText
    }
    if (res.status === 429) {
      detail = detail || 'Too many requests. Please wait a minute and try again.';
    }
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function getHealth(): Promise<HealthStatus> {
  return request('/api/health');
}

export async function getPublicStats(): Promise<PublicStats> {
  return request('/api/stats');
}

export async function pingStats(): Promise<{ ok: boolean; client_id: string | null }> {
  return request('/api/stats/ping', { method: 'POST' });
}

export async function getPulse(): Promise<{ items: PulseItem[]; updated_at: string }> {
  return request('/api/pulse');
}

export async function getPlaybook(): Promise<{ items: PlaybookItem[]; count: number }> {
  return request('/api/playbook');
}

export async function getReleases(): Promise<{ items: ReleaseItem[]; count: number }> {
  return request('/api/releases');
}

export async function listDatasets(): Promise<DatasetInfo[]> {
  return request('/api/datasets');
}

export async function uploadDataset(file: File): Promise<{
  dataset_id: string;
  filename: string;
  rows: number;
  date_start: string | null;
  date_end: string | null;
  warnings: string[];
}> {
  const form = new FormData();
  form.append('file', file);
  return request('/api/data/upload', { method: 'POST', body: form });
}

export async function parseStrategy(payload: {
  text: string;
  initial_capital?: number;
  risk_per_trade?: number;
  commission?: number;
  slippage?: number;
  asset?: string;
}): Promise<{ strategy: StrategySpec; parser: string; warnings: string[] }> {
  return request('/api/parse-strategy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function runBacktest(payload: {
  strategy_text: string;
  dataset_id: string;
  strategy?: StrategySpec;
  config: {
    initial_capital: number;
    commission: number;
    slippage: number;
    risk_per_trade?: number;
  };
  asset?: string;
}): Promise<BacktestResult> {
  return request('/api/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function listBacktests(): Promise<BacktestSummary[]> {
  return request('/api/backtests');
}

export async function getBacktest(id: number): Promise<BacktestResult> {
  return request(`/api/backtests/${id}`);
}

export async function getLLMStatus(): Promise<LLMStatus> {
  return request('/api/llm/status');
}

export async function updateLLMConfig(payload: {
  api_key?: string;
  model?: string;
  base_url?: string;
  enabled?: boolean;
}): Promise<LLMStatus> {
  return request('/api/llm/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function clearLLMConfig(): Promise<LLMStatus> {
  return request('/api/llm/config', { method: 'DELETE' });
}
