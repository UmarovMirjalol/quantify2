import type {
  BacktestResult,
  BacktestSummary,
  DatasetInfo,
  ExportResult,
  DiscoveryResult,
  ForwardDetail,
  ForwardSummary,
  HealthStatus,
  LiveSignal,
  ScreenerResult,
  ScreenerUniverse,
  LLMStatus,
  OptimizerReport,
  PlaybookItem,
  PortfolioResult,
  PublicStats,
  PulseItem,
  RobustnessReport,
  StrategySpec,
  StressReport,
  SyntheticReport,
  VerdictReport,
  WalkForwardReport,
} from '../types';
import { getHistoryRange } from '../components/HistoryPicker';
import { authHeaders, clearAccount, getAccount, getClientId, setAccount } from './session';

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
    if (res.status === 403 && detail.startsWith('Your session has expired') && getAccount()) {
      clearAccount();
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

export async function fetchMarketData(ticker: string, interval = '1d', history = getHistoryRange()): Promise<{
  dataset_id: string;
  name: string;
  rows: number;
  source: string;
  date_start: string;
  date_end: string;
}> {
  return request('/api/market/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker, interval, history }),
  });
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

export async function exportAllBacktests(): Promise<{ count: number; backtests: BacktestResult[] }> {
  return request('/api/backtests/export-all');
}

export interface AccountInfo {
  signed_in: boolean;
  username?: string;
  client_id?: string;
  backtests?: number;
  created_at?: string | null;
}

async function startSession(path: string, username: string, password: string): Promise<number> {
  const result = await request<{ token: string; username: string; client_id: string; moved: number }>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, claim_client_id: getAccount() ? null : getClientId() }),
  });
  setAccount({ token: result.token, username: result.username, client_id: result.client_id });
  return result.moved;
}

export async function registerAccount(username: string, password: string): Promise<number> {
  return startSession('/api/auth/register', username, password);
}

export async function loginAccount(username: string, password: string): Promise<number> {
  return startSession('/api/auth/login', username, password);
}

export async function getAccountInfo(): Promise<AccountInfo> {
  return request('/api/auth/me');
}

export async function logoutAccount(): Promise<void> {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } finally {
    clearAccount();
  }
}

export async function getPythonStrategyInfo(): Promise<{ enabled: boolean; template: string }> {
  return request('/api/python-strategy');
}

export async function checkPythonStrategy(code: string): Promise<{ ok: boolean; errors: string[] }> {
  return request('/api/python-strategy/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

export async function getBacktest(id: number): Promise<BacktestResult> {
  return request(`/api/backtests/${id}`);
}

export async function getStress(id: number): Promise<StressReport> {
  return request(`/api/backtests/${id}/stress`);
}

export async function getWalkForward(id: number): Promise<WalkForwardReport> {
  return request(`/api/backtests/${id}/walk-forward`);
}

export async function getRobustness(id: number): Promise<RobustnessReport> {
  return request(`/api/backtests/${id}/robustness`);
}

export async function getOptimizer(id: number): Promise<OptimizerReport> {
  return request(`/api/backtests/${id}/optimize`);
}

export async function getSynthetic(id: number): Promise<SyntheticReport> {
  return request(`/api/backtests/${id}/synthetic`);
}

export async function runPortfolio(payload: {
  strategy_text: string;
  datasets: string[];
  initial_capital: number;
  commission: number;
  slippage: number;
}): Promise<PortfolioResult> {
  return request('/api/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getVerdict(id: number): Promise<VerdictReport> {
  return request(`/api/backtests/${id}/verdict`);
}

export async function shareBacktest(id: number): Promise<{ token: string }> {
  return request(`/api/backtests/${id}/share`, { method: 'POST' });
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function listScreenerUniverses(): Promise<ScreenerUniverse[]> {
  return request('/api/screener/universes');
}

export async function runScreener(payload: {
  strategy_text?: string;
  strategy?: StrategySpec;
  universe?: string | null;
  tickers?: string[];
  history?: string;
}): Promise<ScreenerResult> {
  return request('/api/screener', json(payload));
}

export type WhatIfPoint = { date: string; value: number; invested: number };

export type WhatIfResult = {
  ticker: string;
  source: string;
  first_available: string;
  clipped: boolean;
  start_date: string;
  end_date: string;
  start_price: number;
  end_price: number;
  invested: number;
  value: number;
  gain: number;
  total_return: number | null;
  cagr: number | null;
  max_drawdown: number | null;
  multiple: number | null;
  series: WhatIfPoint[];
  benchmark: {
    ticker: string;
    start_date: string;
    invested: number;
    value: number;
    gain: number;
    total_return: number | null;
    series: WhatIfPoint[];
  } | null;
};

export async function getWhatIf(params: { ticker: string; start: string; amount: number; monthly: number }): Promise<WhatIfResult> {
  const q = new URLSearchParams({
    ticker: params.ticker,
    start: params.start,
    amount: String(params.amount),
    monthly: String(params.monthly),
  });
  return request(`/api/whatif?${q}`);
}

export async function runDiscovery(dataset_id: string): Promise<DiscoveryResult> {
  return request('/api/discover', json({ dataset_id }));
}

export async function createForwardTest(payload: {
  backtest_id?: number;
  strategy_text?: string;
  strategy?: StrategySpec;
  ticker?: string;
  name?: string;
}): Promise<ForwardDetail> {
  return request('/api/forward', json(payload));
}

export async function listForwardTests(): Promise<ForwardSummary[]> {
  return request('/api/forward');
}

export async function getForwardTest(id: number): Promise<ForwardDetail> {
  return request(`/api/forward/${id}`);
}

export async function refreshForwardTest(id: number): Promise<ForwardDetail> {
  return request(`/api/forward/${id}/refresh`, { method: 'POST' });
}

export async function deleteForwardTest(id: number): Promise<{ deleted: boolean }> {
  return request(`/api/forward/${id}`, { method: 'DELETE' });
}

export async function refreshLiveSignal(id: number): Promise<LiveSignal> {
  return request(`/api/backtests/${id}/live-signal`, { method: 'POST' });
}

export async function unshareBacktest(id: number): Promise<{ token: null }> {
  return request(`/api/backtests/${id}/share`, { method: 'DELETE' });
}

export async function getReport(token: string): Promise<BacktestResult> {
  return request(`/api/reports/${encodeURIComponent(token)}`);
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

export async function exportStrategy(payload: {
  strategy: StrategySpec;
  format: 'pine' | 'python';
  title?: string;
}): Promise<ExportResult> {
  return request('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function exportBacktest(
  backtestId: number,
  format: 'pine' | 'python',
): Promise<ExportResult> {
  return request(`/api/backtests/${backtestId}/export/${format}`);
}
