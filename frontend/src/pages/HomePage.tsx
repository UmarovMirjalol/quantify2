import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  fetchMarketData,
  getPlaybook,
  listDatasets,
  parseStrategy,
  runBacktest,
  uploadDataset,
} from '../services/api';
import { HistoryPicker } from '../components/HistoryPicker';
import {
  applyManagement,
  EMPTY_MANAGEMENT,
  managementSummary,
  PositionManagement,
  type ManagementDraft,
} from '../components/PositionManagement';
import { normalizeStrategyText } from '../services/session';
import type { DatasetInfo, HealthStatus, PlaybookItem, StrategySpec } from '../types';
import { formatConditions, riskWarnings, sizingLabel } from '../utils/formatStrategy';
import { MARKET_CHIPS, yahooSymbol } from '../utils/markets';

type PresetStrategy = {
  id: string;
  label: string;
  text: string;
  tag?: string;
};

const EXAMPLE_STRATEGIES: PresetStrategy[] = [
  {
    id: 'sma-cross',
    label: '📈 Energy SMA cross',
    tag: 'Trend',
    text: 'Buy XLE when the 20-day moving average crosses above the 50-day moving average. Risk 1% per trade and exit when RSI exceeds 70.',
  },
  {
    id: 'rsi-reversion',
    label: '🔄 EM RSI bounce',
    tag: 'Mean Reversion',
    text: 'Buy EEM when RSI falls below 30 and sell when RSI rises above 70. Risk 1% per trade.',
  },
  {
    id: 'ema-stops',
    label: '📊 Gold EMA + stops',
    tag: 'Trend',
    text: 'Buy GLD when the 12-day EMA crosses above the 26-day EMA and sell when it crosses below. Use a 2% stop-loss and 5% take-profit.',
  },
  {
    id: 'bollinger-bounce',
    label: '📉 Bond Bollinger',
    tag: 'Volatility',
    text: 'Buy TLT when price closes below the lower Bollinger Band and sell when it crosses above the middle band. Risk 1% per trade.',
  },
  {
    id: 'turtle-breakout',
    label: '🐢 Small-cap turtle',
    tag: 'Breakout',
    text: 'Buy IWM when price breaks above the 20-day high and sell when it breaks below the 10-day low. Risk 1% per trade.',
  },
  {
    id: 'stochastic-swing',
    label: '〰️ FX stochastic',
    tag: 'Mean Reversion',
    text: 'Buy EURUSD when Stochastic %K crosses above %D below 20 and sell when %K crosses below %D above 80. Risk 1% per trade.',
  },
  {
    id: 'adx-trend',
    label: '🧭 Nasdaq + ADX',
    tag: 'Trend',
    text: 'Buy QQQ when the 20-day SMA crosses above the 50-day SMA and ADX above 25. Sell when the 20-day SMA crosses below the 50-day SMA. Risk 1% per trade.',
  },
  {
    id: 'pinbar-support',
    label: '🕯️ NVDA pin-bar',
    tag: 'Price Action',
    text: 'Buy NVDA when a Bullish Pin-bar pattern forms on daily chart. Use 2% stop-loss and 5% take-profit. Risk 1% per trade.',
  },
  {
    id: 'crypto-macd',
    label: '₿ BTC MACD',
    tag: 'Crypto',
    text: 'Buy BTC-USD when MACD crosses above its signal line and sell when it crosses below. Risk 1% per trade.',
  },
  {
    id: 'oil-breakout',
    label: '🛢️ Oil breakout',
    tag: 'Commodities',
    text: 'Buy OIL when price breaks above the 55-day high and sell when it breaks below the 20-day low. Risk 1% per trade.',
  },
  {
    id: 'volume-spike',
    label: '🔊 Semis volume',
    tag: 'Breakout',
    text: 'Buy SMH when volume is above 20-day average volume and close is above 50-day SMA. Exit when close crosses below 20-day SMA. Use 2% stop-loss.',
  },
];

const PIPELINE_STEPS = [
  'Strategy parsed',
  'Parameters identified',
  'Historical data loaded',
  'Backtest running',
  'Risk checks passed',
] as const;

interface Props {
  health: HealthStatus | null;
}

type StepState = 'pending' | 'active' | 'done';

type ParseState = {
  status: 'idle' | 'loading' | 'ok' | 'error';
  strategy: StrategySpec | null;
  parser: string | null;
  warnings: string[];
  error: string | null;
};

export function HomePage({ health }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [presets, setPresets] = useState(EXAMPLE_STRATEGIES);
  const [strategyText, setStrategyText] = useState(EXAMPLE_STRATEGIES[0].text);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [datasetId, setDatasetId] = useState('sample_data.csv');
  const [initialCapital, setInitialCapital] = useState(100000);
  const [riskPerTrade, setRiskPerTrade] = useState(0.01);
  const [commission, setCommission] = useState(0.001);
  const [slippage, setSlippage] = useState(0.0005);
  const [spread, setSpread] = useState(0);
  const [fundingPct, setFundingPct] = useState(0);
  const [borrowPct, setBorrowPct] = useState(0);
  const [timeframe, setTimeframe] = useState('1d');
  const [entryOrder, setEntryOrder] = useState<'market' | 'limit' | 'stop'>('market');
  const [limitOffsetPct, setLimitOffsetPct] = useState(0.1);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'run' | 'load' | 'upload' | 'form'>('run');
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [fetchingMarket, setFetchingMarket] = useState(false);
  const [fetchMsg, setFetchMsg] = useState<string | null>(null);

  async function handleFetchTicker(ticker: string) {
    setFetchingMarket(true);
    setFetchMsg(null);
    setError(null);
    try {
      const symbol = yahooSymbol(ticker);
      const interval = ['5m', '15m', '1h', '4h'].includes(timeframe) ? (timeframe === '4h' ? '1h' : timeframe) : '1d';
      const res = await fetchMarketData(symbol, interval);
      const items = await listDatasets();
      setDatasets(items);
      setDatasetId(res.dataset_id);
      setFetchMsg(
        `Loaded ${res.rows.toLocaleString()} daily bars for ${ticker} → ${symbol}, ${res.date_start.slice(0, 10)} → ${res.date_end.slice(0, 10)} (${res.source}).`,
      );
    } catch (err) {
      setErrorKind('load');
      setError(err instanceof Error ? err.message : 'Failed to fetch market data');
    } finally {
      setFetchingMarket(false);
    }
  }

  const [parse, setParse] = useState<ParseState>({
    status: 'idle',
    strategy: null,
    parser: null,
    warnings: [],
    error: null,
  });
  const [management, setManagement] = useState<ManagementDraft>(EMPTY_MANAGEMENT);
  const effectiveStrategy = useMemo(
    () => (parse.status === 'ok' && parse.strategy ? applyManagement(parse.strategy, management) : null),
    [parse, management],
  );

  useEffect(() => {
    listDatasets()
      .then((items) => {
        setDatasets(items);
        if (items.length && !items.find((d) => d.id === datasetId)) {
          setDatasetId(items[0].id);
        }
      })
      .catch((err: Error) => {
        setErrorKind('load');
        setError(err.message);
      });
  }, []);

  useEffect(() => {
    const applyStrategy = (list: { id: string; text: string }[]) => {
      const wanted = searchParams.get('strategy');
      if (!wanted) return;
      const hit = list.find((p) => p.id === wanted);
      if (!hit) return;
      setStrategyText(hit.text);
      const next = new URLSearchParams(searchParams);
      next.delete('strategy');
      setSearchParams(next, { replace: true });
    };

    if (searchParams.get('instant') === '1') {
      const draft = sessionStorage.getItem('quantify_instant_strategy');
      if (draft && draft.trim().length >= 5) {
        setStrategyText(draft.trim());
        sessionStorage.removeItem('quantify_instant_strategy');
      }
      const next = new URLSearchParams(searchParams);
      next.delete('instant');
      setSearchParams(next, { replace: true });
    }

    if (searchParams.get('rerun') === '1') {
      try {
        const raw = sessionStorage.getItem('quantify_rerun');
        if (raw) {
          const draft = JSON.parse(raw) as {
            strategy_text?: string;
            dataset_id?: string;
            initial_capital?: number;
            risk_per_trade?: number;
            commission?: number;
            slippage?: number;
          };
          if (draft.strategy_text) setStrategyText(draft.strategy_text);
          if (draft.dataset_id) setDatasetId(draft.dataset_id);
          if (typeof draft.initial_capital === 'number') setInitialCapital(draft.initial_capital);
          if (typeof draft.risk_per_trade === 'number') setRiskPerTrade(draft.risk_per_trade);
          if (typeof draft.commission === 'number') setCommission(draft.commission);
          if (typeof draft.slippage === 'number') setSlippage(draft.slippage);
          sessionStorage.removeItem('quantify_rerun');
        }
      } catch {
        // ignore bad draft
      }
      const next = new URLSearchParams(searchParams);
      next.delete('rerun');
      setSearchParams(next, { replace: true });
    }

    applyStrategy(EXAMPLE_STRATEGIES);

    let cancelled = false;
    getPlaybook()
      .then((data) => {
        if (cancelled || !data.items?.length) return;
        const mapped: PresetStrategy[] = data.items.map((item: PlaybookItem) => ({
          id: item.id,
          label: item.title,
          tag: item.tag,
          text: item.text,
        }));
        setPresets(mapped);
        applyStrategy(mapped);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) return;
    setProgressStep(0);
    const timers = [
      window.setTimeout(() => setProgressStep(1), 350),
      window.setTimeout(() => setProgressStep(2), 750),
      window.setTimeout(() => setProgressStep(3), 1200),
      window.setTimeout(() => setProgressStep(4), 1800),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [loading]);

  // Debounced real parse preview
  useEffect(() => {
    const cleaned = normalizeStrategyText(strategyText);
    if (cleaned.length < 5) {
      setParse({ status: 'idle', strategy: null, parser: null, warnings: [], error: null });
      return;
    }
    let cancelled = false;
    setParse((prev) => ({ ...prev, status: 'loading', error: null }));
    const timer = window.setTimeout(() => {
      parseStrategy({
        text: cleaned,
        initial_capital: initialCapital,
        risk_per_trade: riskPerTrade,
        commission,
        slippage,
      })
        .then((res) => {
          if (cancelled) return;
          setParse({
            status: 'ok',
            strategy: res.strategy,
            parser: res.parser,
            warnings: res.warnings ?? [],
            error: null,
          });
        })
        .catch((err: Error) => {
          if (cancelled) return;
          setParse({
            status: 'error',
            strategy: null,
            parser: null,
            warnings: [],
            error: err.message,
          });
        });
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [strategyText, initialCapital, riskPerTrade, commission, slippage]);

  const stepStates: StepState[] = useMemo(() => {
    return PIPELINE_STEPS.map((_, i) => {
      if (!loading && progressStep < 0) return 'pending';
      if (loading) {
        if (i < progressStep) return 'done';
        if (i === progressStep) return 'active';
        return 'pending';
      }
      return 'pending';
    });
  }, [loading, progressStep]);

  const entryLines = formatConditions(
    parse.strategy?.entry_conditions,
    parse.strategy?.entry_logic,
    parse.strategy?.entry_any,
  );
  const exitLines = formatConditions(
    parse.strategy?.exit_conditions,
    parse.strategy?.exit_logic,
    parse.strategy?.exit_any,
  );

  async function onUpload(file: File | null) {
    if (!file) return;
    setError(null);
    setErrorKind('upload');
    setUploadInfo(null);
    try {
      const res = await uploadDataset(file);
      setDatasetId(res.dataset_id);
      setUploadInfo(
        `Uploaded ${res.filename}: ${res.rows} rows (${res.date_start} → ${res.date_end})`,
      );
      const items = await listDatasets();
      setDatasets(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setErrorKind('run');
    const cleanedStrategy = normalizeStrategyText(strategyText);
    if (cleanedStrategy.length < 5) {
      setErrorKind('form');
      setError('Describe a complete strategy — entry, exit, and risk.');
      setLoading(false);
      setProgressStep(-1);
      return;
    }
    setStrategyText(cleanedStrategy);
    try {
      let runDataset = datasetId;
      const asset = parse.strategy?.asset?.trim().toUpperCase();
      if (datasetId.startsWith('sample') && asset && asset !== 'SAMPLE') {
        setFetchMsg(`Loading real ${asset} prices…`);
        const data = await fetchMarketData(yahooSymbol(asset));
        runDataset = data.dataset_id;
        setDatasetId(runDataset);
        setDatasets(await listDatasets());
      }
      const result = await runBacktest({
        strategy_text: cleanedStrategy,
        dataset_id: runDataset,
        strategy: effectiveStrategy ?? undefined,
        config: {
          initial_capital: initialCapital,
          commission,
          slippage,
          spread: spread > 0 ? spread : undefined,
          risk_per_trade: riskPerTrade,
          funding_rate: fundingPct > 0 ? fundingPct / 100 : undefined,
          borrow_rate: borrowPct > 0 ? borrowPct / 100 : undefined,
          entry_order: entryOrder,
          limit_offset: entryOrder === 'market' ? undefined : limitOffsetPct / 100,
          timeframe,
        },
      });
      setProgressStep(PIPELINE_STEPS.length);
      navigate(`/results/${result.id}`, { state: { result } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Backtest failed';
      setError(msg);
      setProgressStep(-1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="home">
      <div className="page-header">
        <div>
          <p className="eyebrow">Research workspace</p>
          <h1>New Backtest</h1>
          <p className="lede">
            Write your trading rules in plain English, pick a market, and see whether they would have made money, and whether
            they beat simply buying and holding. Coder? <Link to="/code">Write it in Python →</Link>
          </p>
        </div>
        {health?.llm_enabled ? (
          <span className="tag llm">LLM · {health.llm_model}</span>
        ) : (
          <span className="tag">
            Built-in · <Link to="/settings">Connect LLM</Link>
          </span>
        )}
      </div>

      <div className="workspace">
        <form className="panel form-panel" onSubmit={onSubmit}>
          <p className="form-step">
            <b>1</b> Describe your idea
          </p>
          <label className="field">
            <span className="sr-only">Describe your strategy</span>
            <textarea
              value={strategyText}
              onChange={(e) => setStrategyText(e.target.value)}
              rows={6}
              required
              minLength={5}
              placeholder="Buy SPY when the 20-day MA crosses above the 50-day MA. Risk 1% per trade…"
              disabled={loading}
            />
          </label>

          <div className="example-row">
            <span>Or try</span>
            {presets.slice(0, 6).map((ex) => (
              <button
                key={ex.id}
                type="button"
                className="chip"
                disabled={loading}
                onClick={() => setStrategyText(ex.text)}
              >
                {ex.label}
              </button>
            ))}
            <Link className="chip" to="/playbook">
              All →
            </Link>
          </div>

          <p className="form-step">
            <b>2</b> Pick a market <small>real prices, loaded in one click</small>
          </p>
          <div className="live-data-bar">
            {MARKET_CHIPS.map((sym) => (
              <button
                key={sym}
                type="button"
                className={`chip market-chip${datasetId.toUpperCase().includes(sym.replace('-', '_')) || datasetId.toUpperCase().startsWith(sym) ? ' active' : ''}`}
                disabled={loading || fetchingMarket}
                onClick={() => handleFetchTicker(sym)}
              >
                {fetchingMarket ? '…' : sym}
              </button>
            ))}
            <HistoryPicker disabled={loading || fetchingMarket} />
          </div>
          {fetchMsg ? (
            <div className="banner ok" style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem', margin: '0.4rem 0' }}>
              {fetchMsg}
            </div>
          ) : null}

          <div className="param-grid param-grid-main">
            <label className="field">
              <span>Price data in use</span>
              <select
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                required
                disabled={loading}
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id.startsWith('sample') ? 'Demo data (real prices load on run)' : `${d.name} (${d.source})`}
                  </option>
                ))}
                {!datasets.length ? <option value="sample_data.csv">sample_data.csv</option> : null}
              </select>
            </label>

            <label className="field">
              <span>Starting money ($)</span>
              <input
                type="number"
                min={1000}
                step={1000}
                value={initialCapital}
                onChange={(e) => setInitialCapital(Number(e.target.value))}
                required
                disabled={loading}
              />
            </label>
          </div>

          <details className="advanced-settings">
            <summary>
              <b>3</b> Advanced settings <small>costs, risk, exits, your own CSV. The defaults are realistic.</small>
            </summary>
            <div className="param-grid">
              <label className="field">
                <span>Timeframe</span>
                <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} disabled={loading}>
                  <option value="5m">5 minutes</option>
                  <option value="15m">15 minutes</option>
                  <option value="1h">1 hour</option>
                  <option value="4h">4 hours</option>
                  <option value="1d">1 day</option>
                  <option value="1w">1 week</option>
                </select>
                <small className="hint">
                  If your CSV is finer (e.g. 15m data + 1h strategy), the engine auto-resamples completed bars.
                </small>
              </label>

              <label className="field">
                <span>Entry order</span>
                <select
                  value={entryOrder}
                  onChange={(e) => setEntryOrder(e.target.value as 'market' | 'limit' | 'stop')}
                  disabled={loading}
                >
                  <option value="market">Market (next open)</option>
                  <option value="limit">Limit</option>
                  <option value="stop">Stop</option>
                </select>
                <small className="hint">Limit/stop wait for price to trade through a level from the signal close.</small>
              </label>

              {entryOrder !== 'market' ? (
                <label className="field">
                  <span>Limit / stop offset, %</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step="any"
                    value={limitOffsetPct}
                    onChange={(e) => setLimitOffsetPct(Number(e.target.value))}
                    disabled={loading}
                  />
                  <small className="hint">0.1 = 0.1% from the signal close.</small>
                </label>
              ) : null}

              <label className="field">
                <span>Risk per trade</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={riskPerTrade}
                  onChange={(e) => setRiskPerTrade(Number(e.target.value))}
                  required
                  disabled={loading}
                />
                <small className="hint">0.01 = 1%. Used only with a stop-loss; otherwise trades use 100% of capital.</small>
              </label>

              <label className="field">
                <span>Commission</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={commission}
                  onChange={(e) => setCommission(Number(e.target.value))}
                  required
                  disabled={loading}
                />
                <small className="hint">Broker fee per trade. 0.001 = 0.1%.</small>
              </label>

              <label className="field">
                <span>Slippage</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={slippage}
                  onChange={(e) => setSlippage(Number(e.target.value))}
                  required
                  disabled={loading}
                />
                <small className="hint">Price moving against you as the order fills. 0.0005 = 0.05%.</small>
              </label>

              <label className="field">
                <span>Spread (round-trip frac)</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={spread}
                  onChange={(e) => setSpread(Number(e.target.value))}
                  disabled={loading}
                />
                <small className="hint">Half-spread is applied adversarially with slippage. 0.0002 = 2 bps round-trip.</small>
              </label>

              <label className="field">
                <span>Holding cost, % a year</span>
                <input
                  type="number"
                  min={0}
                  max={500}
                  step="any"
                  value={fundingPct}
                  onChange={(e) => setFundingPct(Number(e.target.value))}
                  disabled={loading}
                />
                <small className="hint">
                  Crypto perpetual funding or margin interest, charged on the position while it is open. Around 10 for
                  leveraged crypto, 0 for spot stocks.
                </small>
              </label>

              <label className="field">
                <span>Short borrow, % a year</span>
                <input
                  type="number"
                  min={0}
                  max={500}
                  step="any"
                  value={borrowPct}
                  onChange={(e) => setBorrowPct(Number(e.target.value))}
                  disabled={loading}
                />
                <small className="hint">Added on top of holding cost for short positions only.</small>
              </label>
            </div>

            <PositionManagement value={management} onChange={setManagement} disabled={loading} />

            <label className="field">
              <span>Upload your own price CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
                disabled={loading}
              />
              {uploadInfo ? (
                <small className="hint ok-text">{uploadInfo}</small>
              ) : (
                <small className="hint">Columns: date, open, high, low, close, volume</small>
              )}
            </label>
          </details>

          {error ? (
            <div className="banner error" role="alert">
              <strong>
                {errorKind === 'load'
                  ? 'Could not load datasets.'
                  : errorKind === 'upload'
                    ? 'Upload failed.'
                    : errorKind === 'form'
                      ? 'Check your strategy.'
                      : 'Could not run backtest.'}
              </strong>{' '}
              {error}
              <div style={{ marginTop: '0.5rem' }}>
                <button type="button" className="btn secondary small" onClick={() => setError(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          <div className="btn-row">
            <button className="btn primary" type="submit" disabled={loading || parse.status === 'error'}>
              {loading ? 'Running backtest…' : 'Run Backtest'}
            </button>
            {parse.status === 'error' ? (
              <span className="hint">Fix the parse error before running.</span>
            ) : null}
          </div>
        </form>

        <aside className={`panel panel-tight status-panel${loading ? ' running' : ''}`}>
          <h2>Parsed specification</h2>
          <p className="hint" style={{ marginBottom: '0.85rem' }}>
            Live preview from <code className="mono">/api/parse-strategy</code>
          </p>

          <ul className="pipeline" aria-live="polite">
            {PIPELINE_STEPS.map((label, i) => (
              <li key={label} className={stepStates[i]}>
                <span className="step-icon">
                  {stepStates[i] === 'done' ? '✓' : stepStates[i] === 'active' ? '●' : String(i + 1)}
                </span>
                <span>
                  {label}
                  {loading && stepStates[i] === 'active' ? (
                    <span className="hint"> — in progress</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>

          <div className="parse-meta">
            {parse.status === 'loading' ? <span>Parsing…</span> : null}
            {parse.status === 'ok' && parse.parser ? (
              <span className="tag">{parse.parser === 'llm' ? 'LLM parser' : 'Built-in parser'}</span>
            ) : null}
            {parse.status === 'idle' ? <span>Type a strategy to preview</span> : null}
          </div>

          {parse.status === 'error' ? (
            <div className="banner error" style={{ marginTop: '0.5rem' }}>
              {parse.error}
            </div>
          ) : null}

          {parse.status === 'ok' && parse.strategy ? (
            <div className="interp-block">
              <div className="interp-row">
                <span>Asset</span>
                <span>{parse.strategy.asset}</span>
              </div>
              <div className="interp-row">
                <span>Position size</span>
                <span>{sizingLabel(parse.strategy)}</span>
              </div>
              <div className="interp-row">
                <span>Stop / TP</span>
                <span>
                  {parse.strategy.stop_loss == null
                    ? '—'
                    : `${(parse.strategy.stop_loss * 100).toFixed(2)}%`}
                  {' / '}
                  {parse.strategy.take_profit == null
                    ? '—'
                    : `${(parse.strategy.take_profit * 100).toFixed(2)}%`}
                </span>
              </div>
              {riskWarnings(parse.strategy).map((w) => (
                <div key={w} className="banner warn risk-warning">
                  {w}
                </div>
              ))}
              {effectiveStrategy && managementSummary(effectiveStrategy).length ? (
                <div style={{ marginTop: '0.75rem' }}>
                  <small className="hint">Position management</small>
                  <ul className="cond-list">
                    {managementSummary(effectiveStrategy).map((line) => (
                      <li key={`m-${line}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div style={{ marginTop: '0.75rem' }}>
                <small className="hint">Entry</small>
                <ul className="cond-list">
                  {entryLines.map((line) => (
                    <li key={`e-${line}`}>{line}</li>
                  ))}
                </ul>
              </div>
              <div style={{ marginTop: '0.65rem' }}>
                <small className="hint">Exit</small>
                <ul className="cond-list">
                  {exitLines.map((line) => (
                    <li key={`x-${line}`}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {parse.warnings.length ? (
            <div className="banner warn" style={{ marginTop: '0.75rem' }}>
              {parse.warnings.join(' ')}
            </div>
          ) : null}

          {loading ? (
            <div className="banner info" style={{ marginTop: '0.85rem' }}>
              Loading history and running simulation…
            </div>
          ) : (
            <p className="note">Signal at close → execute next open. Edit parameters, then run.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
