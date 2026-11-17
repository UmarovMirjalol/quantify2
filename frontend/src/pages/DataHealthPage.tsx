import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KpiCard } from '../components/KpiCard';
import { toast } from '../components/ToastHost';
import { WatchlistBar } from '../components/WatchlistBar';
import { usePageMeta } from '../hooks/usePageMeta';
import {
  listScreenerUniverses,
  runDataHealth,
  type DataHealthReport,
  type DataHealthRow,
} from '../services/api';
import type { ScreenerUniverse } from '../types';
import { downloadText, toCsv } from '../utils/download';

export function DataHealthPage() {
  usePageMeta(
    'Data health — Quantify',
    'Probe bars, gaps, and adjustment quality across a universe before you trust a farm or portfolio run.',
  );
  const [universes, setUniverses] = useState<ScreenerUniverse[]>([]);
  const [universe, setUniverse] = useState('etfs');
  const [tickers, setTickers] = useState('');
  const [history, setHistory] = useState('1y');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<DataHealthReport | null>(null);
  const [grade, setGrade] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    listScreenerUniverses()
      .then((list) => {
        setUniverses(list);
        if (list[0] && !list.some((u) => u.id === universe)) setUniverse(list[0].id);
      })
      .catch(() => setUniverses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const custom = useMemo(
    () =>
      tickers
        .split(/[\s,;]+/)
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean),
    [tickers],
  );

  const rows = useMemo(() => {
    if (!report) return [] as DataHealthRow[];
    const needle = q.trim().toLowerCase();
    return report.rows.filter((r) => {
      if (grade !== 'all' && r.grade !== grade) return false;
      if (!needle) return true;
      return r.ticker.toLowerCase().includes(needle) || (r.error || '').toLowerCase().includes(needle);
    });
  }, [report, grade, q]);

  async function run() {
    setBusy(true);
    setError('');
    try {
      const out = await runDataHealth({
        universe: universe || null,
        tickers: custom,
        history,
      });
      setReport(out);
      toast('Data health ready', {
        tone: 'ok',
        body: `${out.ok} ok · ${out.warn} warn · ${out.fail} fail`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health probe failed.');
      toast('Health probe failed', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (!rows.length) return;
    const csv = toCsv([
      ['ticker', 'grade', 'bars', 'gaps', 'max_gap', 'median_gap', 'adj', 'start', 'end', 'error'],
      ...rows.map((r) => [
        r.ticker,
        r.grade,
        r.bars,
        r.gaps ?? '',
        r.max_gap_days ?? '',
        r.median_gap_days ?? '',
        r.has_adj_close ? 1 : 0,
        r.date_start ?? '',
        r.date_end ?? '',
        r.error ?? '',
      ]),
    ]);
    downloadText(`quantify-data-health-${Date.now()}.csv`, csv, 'text/csv;charset=utf-8');
    toast('Health CSV ready', { tone: 'ok' });
  }

  return (
    <div className="results data-health-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Universe hygiene</p>
          <h1>Data health</h1>
          <p className="lede">
            Probe gaps, bar counts, and adjusted closes before a farm or portfolio run.{' '}
            <Link to="/farm">Farm →</Link> · <Link to="/portfolio">Portfolio →</Link>
          </p>
        </div>
      </div>

      <WatchlistBar
        onApply={(list) => {
          setTickers(list.join(', '));
          toast('Watchlist applied', { tone: 'ok', body: `${list.length} tickers` });
        }}
      />

      <section className="panel">
        <div className="param-grid">
          <label className="field">
            <span>Universe</span>
            <select value={universe} onChange={(e) => setUniverse(e.target.value)}>
              {universes.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label} ({u.count})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Extra tickers</span>
            <input
              value={tickers}
              onChange={(e) => setTickers(e.target.value)}
              placeholder="NVDA, TSM, EURUSD=X"
            />
          </label>
          <label className="field">
            <span>History</span>
            <select value={history} onChange={(e) => setHistory(e.target.value)}>
              <option value="1y">1y</option>
              <option value="5y">5y</option>
              <option value="10y">10y</option>
            </select>
          </label>
        </div>
        <div className="btn-row">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void run()}>
            {busy ? 'Probing…' : 'Run health probe'}
          </button>
          <button type="button" className="btn ghost" disabled={!rows.length} onClick={exportCsv}>
            Export CSV
          </button>
        </div>
        {error ? <div className="banner error">{error}</div> : null}
      </section>

      {report ? (
        <>
          <section className="kpi-grid">
            <KpiCard label="Scanned" value={String(report.scanned)} />
            <KpiCard label="OK" value={String(report.ok)} tone="positive" />
            <KpiCard label="Warn" value={String(report.warn)} />
            <KpiCard label="Thin" value={String(report.thin)} />
            <KpiCard label="Fail" value={String(report.fail)} tone={report.fail ? 'negative' : 'neutral'} />
          </section>

          <section className="panel table-wrap">
            <div className="page-header" style={{ marginBottom: '0.65rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>
                  Rows {rows.length}
                  {rows.length !== report.rows.length ? ` / ${report.rows.length}` : ''}
                </h2>
              </div>
              <div className="btn-row">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter ticker…"
                  aria-label="Filter health rows"
                />
                <select value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade filter">
                  <option value="all">All grades</option>
                  <option value="ok">ok</option>
                  <option value="warn">warn</option>
                  <option value="thin">thin</option>
                  <option value="fail">fail</option>
                </select>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Grade</th>
                  <th>Bars</th>
                  <th>Gaps</th>
                  <th>Max gap</th>
                  <th>Median gap</th>
                  <th>Adj</th>
                  <th>Source</th>
                  <th>Range</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ticker}>
                    <td className="mono">{r.ticker}</td>
                    <td className={`mono health-${r.grade}`}>{r.grade}</td>
                    <td className="mono">{r.bars}</td>
                    <td className="mono">{r.gaps ?? '—'}</td>
                    <td className="mono">{r.max_gap_days ?? '—'}</td>
                    <td className="mono">{r.median_gap_days ?? '—'}</td>
                    <td className="mono">{r.has_adj_close ? 'yes' : 'no'}</td>
                    <td className="mono hint">{r.source ?? '—'}</td>
                    <td className="mono">
                      {r.date_start && r.date_end ? `${r.date_start} → ${r.date_end}` : r.error ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? <p className="hint">No rows match the filter.</p> : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
