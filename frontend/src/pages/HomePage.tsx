import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listDatasets, runBacktest, uploadDataset } from '../services/api';
import { normalizeStrategyText } from '../services/session';
import type { DatasetInfo, HealthStatus } from '../types';

const EXAMPLE_STRATEGIES = [
  'Buy SPY when the 20-day SMA crosses above the 50-day SMA and sell when the 20-day SMA crosses below the 50-day SMA. Risk 1% per trade.',
  'Buy when RSI falls below 30 and sell when RSI rises above 70.',
  'Buy when the 12-day EMA crosses above the 26-day EMA and sell when it crosses below. Use a 2% stop-loss and 5% take-profit.',
  'Buy when price closes below the lower Bollinger Band and sell when it crosses above the middle band.',
];

interface Props {
  health: HealthStatus | null;
}

export function HomePage({ health }: Props) {
  const navigate = useNavigate();
  const [strategyText, setStrategyText] = useState(EXAMPLE_STRATEGIES[0]);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [datasetId, setDatasetId] = useState('sample_data.csv');
  const [initialCapital, setInitialCapital] = useState(100000);
  const [riskPerTrade, setRiskPerTrade] = useState(0.01);
  const [commission, setCommission] = useState(0.001);
  const [slippage, setSlippage] = useState(0.0005);
  const [loading, setLoading] = useState(false);
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
      setError('Please paste a full strategy description.');
      setLoading(false);
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
      navigate(`/results/${result.id}`, { state: { result } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Backtest failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="home">
      <section className="hero-panel">
        <p className="eyebrow">Natural language quantitative research</p>
        <h1>QuantLLM Backtester</h1>
        <p className="lede">
          Describe a long-only strategy in plain English. The platform converts it into a validated
          specification, runs a look-ahead-safe simulation with risk, costs, and slippage, then
          returns production metrics, charts, and trade history.
        </p>
        {health?.llm_enabled ? (
          <p className="subtle-status">
            LLM parser active · {health.llm_model} — strategies are interpreted by the model, then
            validated before the engine runs.
          </p>
        ) : (
          <p className="subtle-status">
            Built-in parser active ·{' '}
            <Link to="/settings">connect LLM</Link> (OpenAI-compatible) for broader natural language.
          </p>
        )}
      </section>

      <form className="panel form-panel" onSubmit={onSubmit}>
        <label className="field">
          <span>Strategy</span>
          <textarea
            value={strategyText}
            onChange={(e) => setStrategyText(e.target.value)}
            rows={5}
            required
            minLength={5}
            placeholder="Describe entry, exit, and risk in plain English…"
          />
        </label>

        <div className="example-row">
          <span>Quick start:</span>
          {EXAMPLE_STRATEGIES.map((ex, i) => (
            <button
              key={i}
              type="button"
              className="chip"
              onClick={() => setStrategyText(ex)}
            >
              Example {i + 1}
            </button>
          ))}
        </div>

        <div className="grid-2">
          <label className="field">
            <span>Historical dataset</span>
            <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} required>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.source})
                </option>
              ))}
              {!datasets.length ? <option value="sample_data.csv">sample_data.csv</option> : null}
            </select>
            <small className="hint">
              Included sample is synthetic OHLCV for local runs. Upload your own market CSV for real
              research.
            </small>
          </label>

          <label className="field">
            <span>Upload CSV (date, open, high, low, close, volume)</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
            />
            {uploadInfo ? <small className="hint ok-text">{uploadInfo}</small> : null}
          </label>
        </div>

        <div className="grid-4">
          <label className="field">
            <span>Initial capital ($)</span>
            <input
              type="number"
              min={1000}
              step={1000}
              value={initialCapital}
              onChange={(e) => setInitialCapital(Number(e.target.value))}
              required
            />
          </label>
          <label className="field">
            <span>Risk per trade (0.01 = 1%, or type 1 for 1%)</span>
            <input
              type="number"
              min={0.0001}
              max={100}
              step={0.001}
              value={riskPerTrade}
              onChange={(e) => setRiskPerTrade(Number(e.target.value))}
              required
            />
          </label>
          <label className="field">
            <span>Commission (0.001 = 0.1%)</span>
            <input
              type="number"
              min={0}
              max={5}
              step={0.0001}
              value={commission}
              onChange={(e) => setCommission(Number(e.target.value))}
              required
            />
          </label>
          <label className="field">
            <span>Slippage (0.0005 = 0.05%)</span>
            <input
              type="number"
              min={0}
              max={5}
              step={0.0001}
              value={slippage}
              onChange={(e) => setSlippage(Number(e.target.value))}
              required
            />
          </label>
        </div>

        {error ? <div className="banner error">{error}</div> : null}

        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? 'Running backtest…' : 'Run Backtest'}
        </button>
      </form>
    </div>
  );
}
