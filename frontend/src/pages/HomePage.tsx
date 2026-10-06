import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listDatasets, runBacktest, uploadDataset } from '../services/api';
import { normalizeStrategyText } from '../services/session';
import type { DatasetInfo, HealthStatus } from '../types';

const EXAMPLE_STRATEGIES = [
  {
    label: 'SMA crossover',
    text: 'Buy SPY when the 20-day moving average crosses above the 50-day moving average. Risk 1% per trade and exit when RSI exceeds 70.',
  },
  {
    label: 'RSI mean reversion',
    text: 'Buy when RSI falls below 30 and sell when RSI rises above 70. Risk 1% per trade.',
  },
  {
    label: 'EMA + stops',
    text: 'Buy when the 12-day EMA crosses above the 26-day EMA and sell when it crosses below. Use a 2% stop-loss and 5% take-profit.',
  },
  {
    label: 'Bollinger bounce',
    text: 'Buy when price closes below the lower Bollinger Band and sell when it crosses above the middle band. Risk 1% per trade.',
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

export function HomePage({ health }: Props) {
  const navigate = useNavigate();
  const [strategyText, setStrategyText] = useState(EXAMPLE_STRATEGIES[0].text);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [datasetId, setDatasetId] = useState('sample_data.csv');
  const [initialCapital, setInitialCapital] = useState(100000);
  const [riskPerTrade, setRiskPerTrade] = useState(0.01);
  const [commission, setCommission] = useState(0.001);
  const [slippage, setSlippage] = useState(0.0005);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);

  useEffect(() => {
    listDatasets()
      .then((items) => {
        setDatasets(items);
        if (items.length && !items.find((d) => d.id === datasetId)) {
          setDatasetId(items[0].id);
        }
      })
      .catch((err: Error) => setError(err.message));
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

  const previewInterpretation = useMemo(() => {
    const text = strategyText.toLowerCase();
    const known = text.match(/\b(spy|qqq|iwm|dia|aapl|msft|nvda|tsla|amzn|meta|googl|btc|eth)\b/i);
    const afterBuy = strategyText.match(/\bbuy\s+([A-Za-z]{1,6})\b/i);
    const asset = (known?.[1] ?? afterBuy?.[1] ?? '—').toUpperCase();
    const riskMatch = text.match(/risk\s+(\d+(?:\.\d+)?)\s*%/i);
    return {
      asset,
      entry: text.includes('cross')
        ? 'Crossover / signal rule'
        : text.includes('rsi')
          ? 'RSI threshold'
          : 'Parsed from description',
      exit: text.includes('rsi')
        ? 'RSI / reverse signal'
        : text.includes('stop')
          ? 'Stop / take-profit'
          : 'Exit rule from description',
      risk: riskMatch ? `${riskMatch[1]}%` : `${(riskPerTrade * 100).toFixed(2)}%`,
      sizing: 'Risk-based position size',
      frequency: 'Daily',
    };
  }, [strategyText, riskPerTrade]);

  async function onUpload(file: File | null) {
    if (!file) return;
    setError(null);
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
    const cleanedStrategy = normalizeStrategyText(strategyText);
    if (cleanedStrategy.length < 5) {
      setError('Describe a complete strategy — entry, exit, and risk.');
      setLoading(false);
      setProgressStep(-1);
      return;
    }
    setStrategyText(cleanedStrategy);
    try {
      const result = await runBacktest({
        strategy_text: cleanedStrategy,
        dataset_id: datasetId,
        config: {
          initial_capital: initialCapital,
          commission,
          slippage,
          risk_per_trade: riskPerTrade,
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
            Describe your strategy in plain English. Quantify interprets it, loads history, and runs
            a look-ahead-safe simulation.
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
          <label className="field">
            <span>Describe your strategy</span>
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
            <span>Examples</span>
            {EXAMPLE_STRATEGIES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                className="chip"
                disabled={loading}
                onClick={() => setStrategyText(ex.text)}
              >
                {ex.label}
              </button>
            ))}
          </div>

          <div className="param-grid">
            <label className="field">
              <span>Dataset / asset</span>
              <select
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                required
                disabled={loading}
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.source})
                  </option>
                ))}
                {!datasets.length ? <option value="sample_data.csv">sample_data.csv</option> : null}
              </select>
            </label>

            <label className="field">
              <span>Timeframe</span>
              <input value="Daily" readOnly disabled />
            </label>

            <label className="field">
              <span>Initial capital</span>
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
              <small className="hint">0.01 = 1% (or type 1 for 1%)</small>
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
            </label>
          </div>

          <label className="field">
            <span>Upload market CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
              disabled={loading}
            />
            {uploadInfo ? <small className="hint ok-text">{uploadInfo}</small> : (
              <small className="hint">Columns: date, open, high, low, close, volume</small>
            )}
          </label>

          {error ? (
            <div className="banner error">
              <strong>Could not run backtest.</strong> {error}
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setError(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          <div className="btn-row">
            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? 'Running backtest…' : 'Run Backtest'}
            </button>
            {!strategyText.trim() ? (
              <span className="hint">Describe a strategy to start your first backtest.</span>
            ) : null}
          </div>
        </form>

        <aside className={`panel panel-tight status-panel${loading ? ' running' : ''}`}>
          <h2>Strategy interpretation</h2>
          <p className="hint" style={{ marginBottom: '0.85rem' }}>
            Research copilot — assumptions before execution
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

          <div className="interp-block" key={strategyText}>
            <div className="interp-row flash">
              <span>Universe</span>
              <span>{previewInterpretation.asset}</span>
            </div>
            <div className="interp-row flash" style={{ animationDelay: '40ms' }}>
              <span>Entry</span>
              <span>{previewInterpretation.entry}</span>
            </div>
            <div className="interp-row flash" style={{ animationDelay: '80ms' }}>
              <span>Exit</span>
              <span>{previewInterpretation.exit}</span>
            </div>
            <div className="interp-row flash" style={{ animationDelay: '120ms' }}>
              <span>Position size</span>
              <span>{previewInterpretation.sizing}</span>
            </div>
            <div className="interp-row flash" style={{ animationDelay: '160ms' }}>
              <span>Risk / trade</span>
              <span>{previewInterpretation.risk}</span>
            </div>
            <div className="interp-row flash" style={{ animationDelay: '200ms' }}>
              <span>Data frequency</span>
              <span>{previewInterpretation.frequency}</span>
            </div>
          </div>

          {loading ? (
            <div className="banner info" style={{ marginTop: '0.85rem' }}>
              Parsing strategy… loading history… running simulation…
            </div>
          ) : (
            <p className="note">
              Signal at close → execute next open. Edit parameters above, then run.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
