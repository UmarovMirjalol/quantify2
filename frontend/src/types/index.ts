export interface StrategySpec {
  asset: string;
  side?: 'long' | 'short';
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

export interface MonteCarloResult {
  num_simulations: number;
  num_trades: number;
  risk_of_ruin: number;
  worst_drawdown_p95: number;
  median_return: number;
  median_final_equity: number;
  confidence_95_lower: number;
  confidence_95_upper: number;
  fan_chart: {
    p5: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p95: number[];
    steps: number[];
  };
  error?: string;
}

export interface RobustnessReport {
  deflated: {
    verdict: 'survives' | 'weak' | 'luck' | 'thin';
    headline: string;
    trials: number;
    sharpe: number | null;
    expected_max_sharpe: number | null;
    probability: number | null;
  };
  costs: {
    verdict: 'no_edge' | 'room' | 'gone' | 'thin';
    headline: string;
    current_cost: number;
    breakeven: number | null;
    points: { cost: number; total_return: number | null }[];
  };
  heatmap:
    | { available: false; headline: string }
    | {
        available: true;
        indicator: string;
        fast_values: number[];
        slow_values: number[];
        chosen: { fast: number; slow: number };
        cells: {
          fast: number;
          slow: number;
          sharpe: number | null;
          total_return: number | null;
          chosen: boolean;
        }[];
        verdict: 'plateau' | 'peak' | 'no_edge';
        headline: string;
        neighbor_share: number | null;
      };
}

export interface WalkForwardFold {
  fold: number;
  parameter: string | null;
  value: number | null;
  test_return: number | null;
  test_sharpe: number | null;
  test_trades: number;
  start_date: string;
  end_date: string;
}

export interface WalkForwardReport {
  verdict: 'stable' | 'uneven' | 'fails' | 'thin';
  headline: string;
  parameter: string | null;
  refit: boolean;
  hit_rate: number | null;
  folds: WalkForwardFold[];
}

export interface RegimeBucket {
  trades: number;
  pnl: number;
  win_rate: number | null;
}

export interface RegimeReport {
  verdict: 'uptrend' | 'downtrend' | 'both' | 'neither' | 'thin';
  headline: string;
  window: number;
  up: RegimeBucket;
  down: RegimeBucket;
}

export interface BacktestResult {
  id: number;
  parser: string;
  warnings?: string[];
  clarifications?: string[];
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
  monte_carlo?: MonteCarloResult;
  regimes?: RegimeReport;
  market?: MarketReport;
  verdict?: VerdictReport;
  share_token?: string | null;
  shared?: boolean;
}

export interface MarketReport {
  verdict: 'alpha' | 'unproven' | 'beta' | 'no_edge' | 'thin';
  headline: string;
  bars: number;
  market_return: number;
  strategy_return: number;
  excess_return: number;
  beta: number;
  alpha_annual: number;
  alpha_t: number;
  correlation: number;
  r_squared: number;
  up_capture: number;
  down_capture: number;
}

export interface Percentiles {
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface SyntheticReport {
  verdict: 'robust' | 'fragile' | 'history_only' | 'no_edge' | 'thin';
  headline: string;
  paths: number;
  block: number;
  real: { total_return: number; sharpe_ratio: number };
  profitable_share: number;
  real_rank: number;
  median_trades: number;
  returns: Percentiles;
  sharpes: Percentiles;
  hold_median: number;
  histogram: { edges: number[]; counts: number[] };
}

export interface OptimizerScore {
  sharpe_ratio: number | null;
  total_return: number | null;
  max_drawdown: number | null;
  number_of_trades: number;
}

export interface OptimizerReport {
  verdict: 'improves' | 'no_gain' | 'overfit' | 'already_best' | 'thin';
  headline: string;
  parameters: string[];
  trials: number;
  eligible: number;
  split: { train_bars: number; test_bars: number; train_end: string; test_start: string };
  top: {
    label: string;
    params: Record<string, number | null>;
    train_sharpe: number | null;
    train_return: number | null;
    trades: number;
    original: boolean;
  }[];
  best: {
    label: string;
    params: Record<string, number | null>;
    train: OptimizerScore | null;
    test: OptimizerScore | null;
    is_original: boolean;
  } | null;
  original: {
    label: string;
    params: Record<string, number | null>;
    train: OptimizerScore | null;
    test: OptimizerScore | null;
  } | null;
  deflated: { verdict: string; probability: number | null; expected_max_sharpe: number | null } | null;
  best_strategy: StrategySpec | null;
}

export interface PortfolioAsset {
  total_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  trades_count: number;
  final_equity: number;
  pnl: number;
  contribution: number;
  buy_hold_return: number | null;
}

export interface PortfolioResult {
  strategy: StrategySpec;
  datasets: string[];
  portfolio_metrics: Metrics;
  portfolio_equity_curve: { date: string; equity: number; drawdown: number }[];
  benchmark_equity_curve: { date: string; equity: number }[];
  asset_results: Record<string, PortfolioAsset>;
  correlation: { assets: string[]; matrix: number[][]; average: number | null };
  diversification_ratio: number | null;
  trades: (Trade & { asset: string })[];
}

export interface VerdictCheck {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'skip';
  detail: string;
}

export interface VerdictReport {
  grade: 'robust' | 'promising' | 'overfit' | 'no_edge' | 'insufficient';
  score: number;
  headline: string;
  passed: number;
  scored: number;
  checks: VerdictCheck[];
}

export interface ExportResult {
  code: string;
  format: string;
  filename: string;
}

export interface StressSlice {
  total_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  number_of_trades: number;
  start_date: string;
  end_date: string;
  equity?: { date: string; equity: number }[];
}

export interface StressNeighbor {
  label: string;
  value: number;
  chosen: boolean;
  sharpe_ratio: number | null;
  total_return: number | null;
  number_of_trades: number;
}

export interface StressReport {
  verdict: 'holds' | 'fragile' | 'overfit' | 'thin';
  headline: string;
  split: {
    in_sample_bars: number;
    holdout_bars: number;
    holdout_fraction: number;
  };
  in_sample: StressSlice;
  holdout: StressSlice;
  parameter: { label: string; value: number } | null;
  neighbors: StressNeighbor[];
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

export interface PlaybookItem {
  id: string;
  title: string;
  tag: string;
  blurb: string;
  text: string;
  indicators: string[];
}

export interface PulseItem {
  strategy: string;
  dataset: string;
  parser: string;
  total_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  number_of_trades: number | null;
  created_at: string;
  sample: boolean;
}

export interface ReleaseItem {
  version: string;
  title: string;
  body: string;
}
