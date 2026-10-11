export interface StrategySpec {
  asset: string;
  timeframe: string;
  initial_capital: number;
  entry_conditions: unknown[];
  exit_conditions: unknown[];
  entry_logic?: string;
  exit_logic?: string;
  risk: {
    risk_per_trade: number;
    max_position_pct?: number;
    max_portfolio_exposure?: number;
  };
  stop_loss: number | null;
  take_profit: number | null;
  position_sizing: string;
  commission?: number;
  slippage?: number;
}

export interface Metrics {
  initial_capital: number | null;
  final_capital: number | null;
  total_return: number | null;
  cagr: number | null;
  annualized_volatility: number | null;
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  max_drawdown: number | null;
  calmar_ratio: number | null;
  number_of_trades: number;
  win_rate: number | null;
  average_trade_return: number | null;
  profit_factor: number | null;
  average_winning_trade: number | null;
  average_losing_trade: number | null;
  start_date: string | null;
  end_date: string | null;
}

export interface Trade {
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  side: string;
  pnl: number;
  return_pct: number;
  commission: number;
  entry_reason: string;
  exit_reason: string;
  bars_held: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
  cash: number;
  drawdown: number | null;
}

export interface Marker {
  date: string;
  price: number;
  type: 'entry' | 'exit' | string;
  reason: string;
}

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface BacktestResult {
  id: number;
  parser: string;
  warnings?: string[];
  strategy_description: string;
  dataset_name: string;
  created_at: string;
  strategy: StrategySpec;
  metrics: Metrics;
  equity_curve: EquityPoint[];
  trades: Trade[];
  markers: Marker[];
  price_series: PriceBar[];
  total_commission?: number;
  total_slippage?: number;
  execution_convention?: string;
}

export interface BacktestSummary {
  id: number;
  strategy_description: string;
  dataset_name: string;
  created_at: string;
  parser: string;
  total_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  final_capital: number | null;
  number_of_trades: number | null;
}

export interface DatasetInfo {
  id: string;
  name: string;
  source: string;
  path: string;
}

export interface HealthStatus {
  status: string;
  parser: string;
  llm_enabled: boolean;
  llm_model: string;
  llm_base_url?: string;
  product?: string;
  auth_required?: boolean;
  runtime_llm_config_allowed?: boolean;
}

export interface LLMStatus {
  enabled: boolean;
  model: string;
  base_url: string;
  api_key_configured: boolean;
  api_key_masked: string;
  provider: string;
  runtime_config_allowed?: boolean;
}

export interface PublicStats {
  users: number;
  backtests: number;
  releases: number;
  users_live: number;
  backtests_live: number;
  updated_at: string;
}
