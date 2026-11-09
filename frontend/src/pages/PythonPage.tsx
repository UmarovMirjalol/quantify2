import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  checkPythonStrategy,
  fetchMarketData,
  getPythonStrategyInfo,
  listDatasets,
  runBacktest,
} from '../services/api';
import type { DatasetInfo, StrategySpec } from '../types';

const DRAFT_KEY = 'quantify_python_draft';

export type PythonDraft = {
  code: string;
  dataset_id?: string;
  side?: 'long' | 'short';
  stop_loss?: number | null;
  take_profit?: number | null;
  initial_capital?: number;
  commission?: number;
  slippage?: number;
};

function titleFrom(code: string): string {
  const comment = code
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('#') && l.replace(/^#+/, '').trim().length > 3);
  const label = comment ? comment.replace(/^#+/, '').trim() : 'custom strategy';
  return `Python: ${label}`.slice(0, 120);
}

function optionalPct(value: string): number | null {
  const v = Number(value);
  return value.trim() === '' || !Number.isFinite(v) || v <= 0 ? null : v / 100;
}

export function PythonPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const incoming = (location.state as { draft?: PythonDraft } | null)?.draft;
  const [enabled, setEnabled] = useState(true);
  const [code, setCode] = useState(incoming?.code ?? localStorage.getItem(DRAFT_KEY) ?? '');
  const [template, setTemplate] = useState('');
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [datasetId, setDatasetId] = useState(incoming?.dataset_id ?? 'sample_data.csv');
  const [side, setSide] = useState<'long' | 'short'>(incoming?.side ?? 'long');
  const [stop, setStop] = useState(incoming?.stop_loss ? String(incoming.stop_loss * 100) : '');
  const [take, setTake] = useState(incoming?.take_profit ? String(incoming.take_profit * 100) : '');
  const [capital, setCapital] = useState(incoming?.initial_capital ?? 100000);
  const [commission, setCommission] = useState(incoming?.commission ?? 0.001);
  const [slippage, setSlippage] = useState(incoming?.slippage ?? 0.0005);
  const [checks, setChecks] = useState<string[] | null>(null);
  const [running, setRunning] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const editor = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getPythonStrategyInfo()
      .then((info) => {
        setEnabled(info.enabled);
        setTemplate(info.template);
        setCode((prev) => (prev.trim() ? prev : info.template));
      })
      .catch((err: Error) => setError(err.message));
    listDatasets()
      .then(setDatasets)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (code.trim()) localStorage.setItem(DRAFT_KEY, code);
    setChecks(null);
  }, [code]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = `${code.slice(0, start)}    ${code.slice(end)}`;
    setCode(next);
    requestAnimationFrame(() => {
      editor.current?.setSelectionRange(start + 4, start + 4);
    });
  }

  async function check(): Promise<boolean> {
    try {
      const res = await checkPythonStrategy(code);
      setChecks(res.errors);
      return res.ok;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed.');
      return false;
    }
  }

  async function loadTicker(sym: string) {
    setFetching(true);
    setError('');
    try {
      const res = await fetchMarketData(sym);
      setDatasets(await listDatasets());
      setDatasetId(res.dataset_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load market data.');
    } finally {
      setFetching(false);
    }
  }

  async function run() {
    setError('');
    if (!(await check())) return;
    setRunning(true);
    const strategy: StrategySpec = {
      asset: datasetId.replace(/\.csv$/i, '').split(/[_\-]/)[0].toUpperCase().slice(0, 32) || 'ASSET',
      side,
      timeframe: '1d',
      initial_capital: capital,
      entry_conditions: [],
      exit_conditions: [],
      custom_code: code,
      risk: { risk_per_trade: 0.01, percent_capital: 1 },
      stop_loss: optionalPct(stop),
      take_profit: optionalPct(take),
      position_sizing: 'percent_capital',
    };
    try {
      const result = await runBacktest({
        strategy_text: titleFrom(code),
        dataset_id: datasetId,
        strategy,
        config: { initial_capital: capital, commission, slippage },
      });
      navigate(`/results/${result.id}`, { state: { result } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backtest failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="python-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Code mode</p>
          <h1>Python strategy</h1>
          <p className="lede">
            Write any logic the visual builder can't express: custom indicators, regime filters, dynamic position
            size. It runs through the same engine, costs and overfitting checks as every other strategy.
          </p>
        </div>
        <Link className="btn secondary small" to="/app">
          ← Plain-English mode
        </Link>
      </div>

      {!enabled ? (
        <div className="banner warn">
          This server has Python strategies turned off (<code>ALLOW_CUSTOM_CODE=false</code>). Self-host Quantify to
          use them.
        </div>
      ) : null}

      <div className="workspace">
        <section className="panel form-panel">
          <div className="code-head">
            <span>strategy.py</span>
            <div className="btn-row">
              <button type="button" className="btn ghost small" onClick={() => setCode(template)} disabled={!template}>
                Reset to template
              </button>
              <button type="button" className="btn secondary small" onClick={check}>
                Check code
              </button>
            </div>
          </div>
          <textarea
            ref={editor}
            className="code-editor mono"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            rows={22}
            aria-label="Python strategy code"
          />
          {checks && checks.length === 0 ? <div className="banner ok">Static checks passed.</div> : null}
          {checks && checks.length > 0 ? (
            <div className="banner error">
              <ul className="check-list">
                {checks.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="param-grid">
            <label className="field">
              <span>Dataset</span>
              <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.source})
                  </option>
                ))}
                {!datasets.length ? <option value="sample_data.csv">sample_data.csv</option> : null}
              </select>
            </label>
            <label className="field">
              <span>Direction</span>
              <select value={side} onChange={(e) => setSide(e.target.value as 'long' | 'short')}>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </label>
            <label className="field">
              <span>Stop loss, %</span>
              <input type="number" min={0} step="any" placeholder="none" value={stop} onChange={(e) => setStop(e.target.value)} />
            </label>
            <label className="field">
              <span>Take profit, %</span>
              <input type="number" min={0} step="any" placeholder="none" value={take} onChange={(e) => setTake(e.target.value)} />
            </label>
            <label className="field">
              <span>Initial capital</span>
              <input type="number" min={1000} step={1000} value={capital} onChange={(e) => setCapital(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Commission</span>
              <input type="number" min={0} step="any" value={commission} onChange={(e) => setCommission(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Slippage</span>
              <input type="number" min={0} step="any" value={slippage} onChange={(e) => setSlippage(Number(e.target.value))} />
            </label>
          </div>
          <div className="chip-row">
            <span className="hint">Load live daily data:</span>
            {['BTC', 'ETH', 'SOL', 'SPY', 'NVDA', 'AAPL'].map((sym) => (
              <button key={sym} type="button" className="chip" disabled={fetching} onClick={() => loadTicker(sym)}>
                {sym}
              </button>
            ))}
          </div>

          {error ? (
            <div className="banner error" role="alert">
              <pre className="error-pre">{error}</pre>
            </div>
          ) : null}

          <div className="btn-row">
            <button type="button" className="btn primary" onClick={run} disabled={running || !enabled || !code.trim()}>
              {running ? 'Running…' : 'Run backtest'}
            </button>
          </div>
        </section>

        <aside className="panel panel-tight status-panel python-help">
          <h2>How it works</h2>
          <p>
            Define <code>strategy(df)</code>. <code>df</code> has <code>date, open, high, low, close, volume</code>.
            Return <code>entry, exit</code> as boolean series, and optionally <code>size</code>: the share of equity
            (0–1) to commit on each entry.
          </p>
          <h3>Available</h3>
          <ul className="cond-list">
            <li>
              <code>np</code>, <code>pd</code>, <code>math</code>
            </li>
            <li>
              <code>ta.sma / ema / rsi / atr / macd / bollinger / vwap / obv</code> — the same indicators the engine
              uses
            </li>
          </ul>
          <h3>Execution</h3>
          <ul className="cond-list">
            <li>A signal at the close of bar t fills at the open of bar t+1.</li>
            <li>Stop and take profit are checked inside each bar; slippage and commission hit every fill.</li>
            <li>One position at a time; size 0 skips an entry.</li>
          </ul>
          <h3>Guards</h3>
          <ul className="cond-list">
            <li>
              <strong>Look-ahead check:</strong> the code is rerun on cut-off history. If any past signal changes, the
              run is rejected — <code>shift(-1)</code> or a whole-series max would leak the future.
            </li>
            <li>
              Sandbox: separate process, 20 s limit, no files, network, or imports beyond numpy/pandas/math.
            </li>
          </ul>
          <p className="note">
            Every Python run gets holdout, walk-forward, synthetic markets, cost and Monte Carlo checks, and exports to
            a standalone <code>.py</code> file you can run without Quantify.
          </p>
        </aside>
      </div>
    </div>
  );
}
