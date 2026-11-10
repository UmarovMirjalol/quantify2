import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HistoryPicker } from '../components/HistoryPicker';
import { usePageMeta } from '../hooks/usePageMeta';
import { createForwardTest, fetchMarketData, listDatasets, runBacktest, runDiscovery } from '../services/api';
import type { DatasetInfo, DiscoveryCandidate, DiscoveryResult } from '../types';
import { pct } from '../utils/signal';

const QUICK = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'BTC', 'ETH', 'GLD'];

const TONE: Record<DiscoveryResult['verdict'], string> = {
  found: 'holds',
  mixed: 'fragile',
  none: 'overfit',
  thin: 'thin',
};

const TITLE: Record<DiscoveryResult['verdict'], string> = {
  found: 'Found a candidate',
  mixed: 'Ideas, not proof',
  none: 'No durable edge',
  thin: 'Not enough trades',
};

function sharpe(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(2);
}

export function DiscoverPage() {
  usePageMeta(
    'Strategy discovery — Quantify',
    'Test 30 classic trading strategies on any asset, ranked on past data and judged on unseen data, with a luck adjustment.',
  );
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [datasetId, setDatasetId] = useState('sample_data.csv');
  const [fetching, setFetching] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  useEffect(() => {
    listDatasets()
      .then(setDatasets)
      .catch(() => undefined);
  }, []);

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

  async function search() {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      setResult(await runDiscovery(datasetId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setRunning(false);
    }
  }

  async function backtest(c: DiscoveryCandidate) {
    if (!result) return;
    setBusy(`bt-${c.label}`);
    setError('');
    try {
      const run = await runBacktest({
        strategy_text: `${c.label}: ${c.text}`,
        dataset_id: result.dataset_id,
        strategy: c.strategy,
        config: { initial_capital: 100000, commission: 0.001, slippage: 0.0005 },
      });
      navigate(`/results/${run.id}`, { state: { result: run } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backtest failed.');
      setBusy('');
    }
  }

  async function track(c: DiscoveryCandidate) {
    if (!result?.live_ticker) return;
    setBusy(`fw-${c.label}`);
    setError('');
    try {
      await createForwardTest({
        strategy: c.strategy,
        strategy_text: c.text,
        ticker: result.live_ticker,
        name: `${result.live_ticker} · ${c.label}`,
      });
      navigate('/forward');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the forward test.');
      setBusy('');
    }
  }

  return (
    <div className="results discover">
      <div className="page-header">
        <div>
          <p className="eyebrow">Idea search</p>
          <h1>Discover</h1>
          <p className="lede">
            Quantify tries 30 classic rule sets on your asset: trend, breakout, momentum and mean reversion. Each is ranked on
            the first 70% of history only; the last 30% is never used to pick, just to show what held up.
          </p>
        </div>
      </div>

      <section className="panel portfolio-form">
        <label className="field">
          <span>Asset</span>
          <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.source})
              </option>
            ))}
            {!datasets.length ? <option value="sample_data.csv">sample_data.csv</option> : null}
          </select>
        </label>
        <div className="chip-row">
          <span className="hint">Load live daily data:</span>
          <HistoryPicker disabled={fetching} />
          {QUICK.map((sym) => (
            <button key={sym} type="button" className="chip" disabled={fetching} onClick={() => loadTicker(sym)}>
              {sym}
            </button>
          ))}
        </div>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={search} disabled={running || fetching}>
            {running ? 'Testing 30 strategies…' : 'Find strategies'}
          </button>
        </div>
        <p className="hint">Every template trades the full allocation with 0.1% commission and 0.05% slippage per side.</p>
        {error ? <div className="banner warn">{error}</div> : null}
      </section>

      {result ? (
        <>
          <section className={`stress-verdict verdict-${TONE[result.verdict]}`}>
            <p className="eyebrow">
              {result.asset} · {result.tried} templates · {result.eligible} traded enough
            </p>
            <h2>{TITLE[result.verdict]}</h2>
            <p>{result.headline}</p>
            <p className="note discover-split">
              Ranked on {result.split.train_start} → {result.split.train_end} (buy &amp; hold {pct(result.split.train_hold, 1)}).
              Judged on {result.split.test_start} → {result.split.test_end} (buy &amp; hold {pct(result.split.test_hold, 1)}).
              {result.deflated?.expected_max_sharpe != null
                ? ` Luck alone would give the best of ${result.tried} a Sharpe near ${result.deflated.expected_max_sharpe.toFixed(2)}.`
                : ''}
            </p>
          </section>

          {result.candidates.length ? (
            <section className="panel table-wrap">
              <h2>Top {result.candidates.length} by training Sharpe</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Type</th>
                    <th>Train Sharpe</th>
                    <th>Train return</th>
                    <th>Unseen Sharpe</th>
                    <th>Unseen return</th>
                    <th>Beat hold?</th>
                    <th>Trades</th>
                    <th>Held up</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {result.candidates.map((c) => (
                    <tr key={c.label}>
                      <td title={c.text}>
                        <strong>{c.label}</strong>
                        <div className="hint">{c.text}</div>
                      </td>
                      <td className="mono">{c.family}</td>
                      <td className="mono">{sharpe(c.train.sharpe_ratio)}</td>
                      <td className={(c.train.total_return ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(c.train.total_return, 1)}</td>
                      <td className="mono">{sharpe(c.test?.sharpe_ratio)}</td>
                      <td className={(c.test?.total_return ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(c.test?.total_return, 1)}</td>
                      <td className="mono">{c.beats_hold_test ? 'Yes' : 'No'}</td>
                      <td className="mono">
                        {c.train.trades} / {c.test?.trades ?? 0}
                      </td>
                      <td>
                        <span className={`sig-badge ${c.passes ? 'sig-buy' : 'sig-sell'}`}>{c.passes ? 'Yes' : 'No'}</span>
                      </td>
                      <td className="row-actions">
                        <button type="button" className="btn ghost small" disabled={Boolean(busy)} onClick={() => backtest(c)}>
                          {busy === `bt-${c.label}` ? '…' : 'Full test'}
                        </button>
                        {result.live_ticker ? (
                          <button type="button" className="btn ghost small" disabled={Boolean(busy)} onClick={() => track(c)}>
                            {busy === `fw-${c.label}` ? '…' : 'Track'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="note">
                "Held up" means profitable with a positive Sharpe on the unseen 30%. A strategy picked from many is still
                partly luck: run the full test for the overfitting verdict, then track it forward before trusting it.
              </p>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
