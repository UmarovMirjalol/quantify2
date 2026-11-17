import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HistoryPicker } from '../components/HistoryPicker';
import { KpiCard } from '../components/KpiCard';
import { ResearchScatter } from '../components/ResearchScatter';
import { toast } from '../components/ToastHost';
import { usePageMeta } from '../hooks/usePageMeta';
import { createForwardTest, fetchMarketData, listDatasets, runBacktest, runDiscovery } from '../services/api';
import type { DatasetInfo, DiscoveryCandidate, DiscoveryResult } from '../types';
import { downloadText, toCsv } from '../utils/download';
import {
  listDiscoverArchive,
  removeDiscoverArchive,
  saveDiscoverArchive,
  type DiscoverArchiveEntry,
} from '../utils/scanArchive';
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
  const [family, setFamily] = useState('all');
  const [passesOnly, setPassesOnly] = useState(false);
  const [beatHoldOnly, setBeatHoldOnly] = useState(false);
  const [archive, setArchive] = useState<DiscoverArchiveEntry[]>(() => listDiscoverArchive());
  const [focus, setFocus] = useState<string | null>(null);

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
    setFocus(null);
    try {
      const out = await runDiscovery(datasetId);
      setResult(out);
      saveDiscoverArchive({
        label: `${out.asset} · ${out.verdict}`,
        asset: out.asset,
        verdict: out.verdict,
        candidates: out.candidates.length,
        result: out,
      });
      setArchive(listDiscoverArchive());
      toast('Discovery finished', {
        tone: 'ok',
        body: `${out.candidates.length} candidates · ${out.verdict}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setRunning(false);
    }
  }

  const families = useMemo(() => {
    if (!result) return [] as string[];
    return [...new Set(result.candidates.map((c) => c.family))].sort();
  }, [result]);

  const filtered = useMemo(() => {
    if (!result) return [] as DiscoveryCandidate[];
    return result.candidates.filter((c) => {
      if (family !== 'all' && c.family !== family) return false;
      if (passesOnly && !c.passes) return false;
      if (beatHoldOnly && !c.beats_hold_test) return false;
      return true;
    });
  }, [result, family, passesOnly, beatHoldOnly]);

  const scatter = useMemo(
    () =>
      filtered
        .filter((c) => c.train.sharpe_ratio != null && c.test?.sharpe_ratio != null)
        .map((c) => ({
          id: c.label,
          x: c.train.sharpe_ratio as number,
          y: c.test!.sharpe_ratio as number,
          label: c.label,
          tone: c.passes ? ('pos' as const) : ('muted' as const),
          r: focus === c.label ? 2.6 : 1.8,
        })),
    [filtered, focus],
  );

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
          <h1>Discover studio</h1>
          <p className="lede">
            Thirty classic templates ranked on the first 70% only — scatter train vs unseen, family filters, archive, and
            one-click full tests.
          </p>
        </div>
      </div>

      {archive.length ? (
        <section className="panel">
          <h2>Discover archive</h2>
          <ul className="paper-inbox__list">
            {archive.slice(0, 6).map((e) => (
              <li key={e.id}>
                <div>
                  <strong>
                    {e.asset} · {e.verdict}
                  </strong>
                  <span className="hint mono">
                    {e.candidates} candidates · {e.saved_at.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn primary small"
                    onClick={() => {
                      setResult(e.result as DiscoveryResult);
                      toast('Archive restored', { tone: 'ok' });
                    }}
                  >
                    Reopen
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      removeDiscoverArchive(e.id);
                      setArchive(listDiscoverArchive());
                    }}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

          <section className="kpi-grid">
            <KpiCard label="Candidates" value={String(result.candidates.length)} />
            <KpiCard
              label="Held up"
              value={String(result.candidates.filter((c) => c.passes).length)}
              tone="positive"
            />
            <KpiCard
              label="Beat hold (unseen)"
              value={String(result.candidates.filter((c) => c.beats_hold_test).length)}
            />
            <KpiCard
              label="P(real edge)"
              value={
                result.deflated?.probability == null
                  ? '—'
                  : `${Math.round(result.deflated.probability * 100)}%`
              }
              hint={result.deflated?.verdict}
            />
          </section>

          {scatter.length > 1 ? (
            <section className="panel">
              <h2>Train Sharpe vs unseen Sharpe</h2>
              <p className="hint">Click a dot to highlight the row. Green = held up on the unseen window.</p>
              <ResearchScatter
                points={scatter}
                xLabel="Train Sharpe"
                yLabel="Unseen Sharpe"
                onSelect={(id) => setFocus(id)}
              />
            </section>
          ) : null}

          {result.candidates.length ? (
            <section className="panel table-wrap">
              <div className="page-header" style={{ marginBottom: '0.65rem' }}>
                <h2 style={{ margin: 0 }}>
                  {filtered.length} of {result.candidates.length} by training Sharpe
                </h2>
                <div className="btn-row">
                  <select value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Family">
                    <option value="all">All families</option>
                    {families.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={`chip${passesOnly ? ' active' : ''}`}
                    onClick={() => setPassesOnly((v) => !v)}
                  >
                    Held up
                  </button>
                  <button
                    type="button"
                    className={`chip${beatHoldOnly ? ' active' : ''}`}
                    onClick={() => setBeatHoldOnly((v) => !v)}
                  >
                    Beat hold
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      const csv = toCsv([
                        ['label', 'family', 'train_sharpe', 'test_sharpe', 'passes', 'beat_hold'],
                        ...filtered.map((c) => [
                          c.label,
                          c.family,
                          c.train.sharpe_ratio ?? '',
                          c.test?.sharpe_ratio ?? '',
                          c.passes ? 1 : 0,
                          c.beats_hold_test ? 1 : 0,
                        ]),
                      ]);
                      downloadText(`quantify-discover-${Date.now()}.csv`, csv, 'text/csv;charset=utf-8');
                      toast('Discover CSV ready', { tone: 'ok' });
                    }}
                  >
                    CSV
                  </button>
                </div>
              </div>
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
                  {filtered.map((c) => (
                    <tr key={c.label} className={focus === c.label ? 'picked' : ''}>
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
