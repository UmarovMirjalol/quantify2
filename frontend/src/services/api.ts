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
  MonteCarloResult,
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
    spread?: number;
    risk_per_trade?: number;
    funding_rate?: number;
    borrow_rate?: number;
    entry_order?: 'market' | 'limit' | 'stop';
    limit_offset?: number;
    timeframe?: string;
    session?: 'all' | 'rth';
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
  capital_mode?: 'shared' | 'sleeves';
  max_positions?: number;
}): Promise<PortfolioResult> {
  return request('/api/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capital_mode: 'shared', ...payload }),
  });
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export type FarmRow = {
  ticker: string;
  id?: string;
  title?: string;
  sharpe_ratio?: number | null;
  total_return?: number | null;
  alpha_vs_hold?: number | null;
  max_drawdown?: number | null;
  trades?: number;
  action?: string;
  error?: string;
};

export type FarmResult = {
  mode: string;
  scanned: number;
  ok: number;
  beat_hold?: number;
  beat_hold_share?: number | null;
  rows: FarmRow[];
  top?: FarmRow[];
  history?: string;
};

export async function runResearchFarm(payload: {
  mode?: 'strategy' | 'playbook';
  strategy_text?: string;
  universe?: string | null;
  tickers?: string[];
  history?: string;
  max_rules?: number;
}): Promise<FarmResult> {
  return request('/api/farm', json(payload));
}

export type FarmJob = {
  id: string;
  mode?: string;
  status: string;
  total: number;
  done: number;
  ok_count?: number;
  fail_count?: number;
  progress: number;
  partial_rows?: FarmRow[];
  result?: FarmResult | null;
  error?: string | null;
  meta?: Record<string, unknown>;
  started_at?: number | string | null;
  finished_at?: number | string | null;
};

export async function startFarmJob(payload: {
  mode?: 'strategy' | 'playbook';
  strategy_text?: string;
  universe?: string | null;
  tickers?: string[];
  history?: string;
  max_rules?: number;
}): Promise<FarmJob> {
  return request('/api/farm/jobs', json(payload));
}

export async function getFarmJob(id: string): Promise<FarmJob> {
  return request(`/api/farm/jobs/${id}`);
}

export async function cancelFarmJob(id: string): Promise<FarmJob> {
  return request(`/api/farm/jobs/${id}/cancel`, { method: 'POST' });
}

export async function listFarmJobs(): Promise<FarmJob[]> {
  const data = await request<{ jobs: FarmJob[] }>('/api/farm/jobs');
  return data.jobs ?? [];
}

export type DataHealthRow = {
  ticker: string;
  ok: boolean;
  grade: string;
  bars: number;
  source?: string | null;
  has_adj_close?: boolean;
  gaps?: number | null;
  max_gap_days?: number | null;
  date_start?: string | null;
  date_end?: string | null;
  error?: string | null;
};

export type DataHealthReport = {
  universe?: string | null;
  scanned: number;
  ok: number;
  warn: number;
  thin: number;
  fail: number;
  rows: DataHealthRow[];
};

export async function runDataHealth(payload: {
  universe?: string | null;
  tickers?: string[];
  history?: string;
}): Promise<DataHealthReport> {
  return request('/api/data-health', json(payload));
}

export type BenchmarkSuite = {
  status: string;
  as_of?: string;
  count?: number;
  beat_hold?: number;
  beat_hold_share?: number | null;
  rows?: {
    id: string;
    title: string;
    ticker: string;
    sharpe: number | null;
    total_return: number | null;
    buy_hold: number | null;
    var_95?: number | null;
  }[];
};

export async function getBenchmarkSuite(force = false): Promise<BenchmarkSuite> {
  return request(`/api/benchmark-suite${force ? '?force=true' : ''}`);
}

export type PaperSignal = {
  ticker: string;
  action: string;
  in_position: boolean;
  last_close: number;
  as_of: string;
  source?: string;
  side?: string;
  entry_price?: number | null;
  unrealized_pct?: number | null;
  order_for_next_open?: string | null;
  metrics_snapshot?: {
    sharpe_ratio?: number | null;
    total_return?: number | null;
    trades?: number | null;
  };
};

export type PaperResult = {
  signals: PaperSignal[];
  actionable: PaperSignal[];
  errors: { ticker: string; error: string }[];
  webhook?: { ok?: boolean; status?: number; error?: string } | null;
};

export async function runPaperBridge(payload: {
  strategy_text: string;
  tickers: string[];
  webhook_url?: string;
  history?: string;
  save?: boolean;
}): Promise<PaperResult & { journal_id?: number | null }> {
  return request('/api/paper', json(payload));
}

export type PaperJournalItem = {
  id: number;
  created_at: string | null;
  strategy_text: string;
  tickers: string[];
  signal_count: number;
  actionable_count: number;
  error_count: number;
  signals: PaperSignal[];
  actionable: PaperSignal[];
  errors: { ticker: string; error: string }[];
  webhook_url?: string | null;
  webhook?: PaperResult['webhook'];
  history: string;
};

export async function listPaperJournal(limit = 30): Promise<{ items: PaperJournalItem[]; count: number }> {
  return request(`/api/paper/journal?limit=${limit}`);
}

export async function getMonteCarlo(
  id: number,
  params?: { sims?: number; ruin?: number; seed?: number },
): Promise<MonteCarloResult> {
  const q = new URLSearchParams();
  if (params?.sims != null) q.set('sims', String(params.sims));
  if (params?.ruin != null) q.set('ruin', String(params.ruin));
  if (params?.seed != null) q.set('seed', String(params.seed));
  const qs = q.toString();
  return request(`/api/backtests/${id}/monte-carlo${qs ? `?${qs}` : ''}`);
}

export type FactorReport = {
  benchmark: string;
  beta: number | null;
  alpha_daily: number | null;
  alpha_annual: number | null;
  r2: number | null;
  n: number;
};

export async function getFactorReport(payload: {
  equity_curve: { date: string; equity: number }[];
  benchmark?: string;
  history?: string;
}): Promise<FactorReport> {
  return request('/api/factors', json(payload));
}

export type MultiFactorReport = {
  benchmarks: string[];
  rows: FactorReport[];
  best_fit?: string | null;
  count: number;
  errors?: { benchmark: string; error: string }[];
};

export async function getMultiFactorReport(payload: {
  equity_curve: { date: string; equity: number }[];
  benchmarks?: string[];
  history?: string;
}): Promise<MultiFactorReport> {
  return request('/api/factors/multi', json(payload));
}

export async function getVerdict(id: number): Promise<VerdictReport> {
  return request(`/api/backtests/${id}/verdict`);
}

export async function shareBacktest(id: number): Promise<{ token: string }> {
  return request(`/api/backtests/${id}/share`, { method: 'POST' });
}

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

export interface LeaderboardRow {
  id: string;
  title: string;
  tag: string;
  text: string;
  ticker: string;
  return_year: number | null;
  hold_year: number;
  trades_year: number;
  return_week: number | null;
  hold_week: number;
  return_10y: number | null;
  hold_10y: number;
  max_drawdown_10y: number | null;
}

export type Leaderboard =
  | { status: 'building' }
  | { status: 'ready'; as_of: string; tickers: string[]; capital: number; rows: LeaderboardRow[]; beat_hold_10y: number };

export async function getLeaderboard(): Promise<Leaderboard> {
  return request('/api/leaderboard');
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
