import { useCallback, useEffect, useState } from 'react';
import { getSynthetic } from '../services/api';
import type { SyntheticReport } from '../types';
import { KpiCard } from './KpiCard';
import { toast } from './ToastHost';

const VERDICT_LABEL: Record<SyntheticReport['verdict'], string> = {
  robust: 'Pays across histories',
  fragile: 'Coin flip',
  history_only: 'Only this history',
  no_edge: 'No edge',
  thin: 'Too thin',
};

const VERDICT_TONE: Record<SyntheticReport['verdict'], string> = {
  robust: 'holds',
  fragile: 'fragile',
  history_only: 'overfit',
  no_edge: 'overfit',
  thin: 'thin',
};

function pct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
}

function Histogram({
  edges,
  counts,
  marker,
  markerClass = 'real',
}: {
  edges: number[];
  counts: number[];
  marker?: number;
  markerClass?: string;
}) {
  if (!counts.length || edges.length < 2) return null;
  const lo = edges[0];
  const hi = edges[edges.length - 1];
  const span = hi - lo || 1;
  const peak = Math.max(...counts, 1);
  const x = (v: number) => ((v - lo) / span) * 100;
  const width = 100 / counts.length;
  const mark = marker == null ? null : Math.min(hi, Math.max(lo, marker));
  return (
    <svg className="synth-hist" viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden>
      {counts.map((count, i) => {
        const h = (count / peak) * 38;
        const mid = (edges[i] + edges[i + 1]) / 2;
        return (
          <rect
            key={i}
            x={i * width + 0.3}
            y={40 - h}
            width={width - 0.6}
            height={h}
            className={mid >= 0 ? 'pos' : 'neg'}
          />
        );
      })}
      {lo < 0 && hi > 0 ? <line className="zero" x1={x(0)} x2={x(0)} y1="0" y2="40" /> : null}
      {mark != null ? (
        <line className={markerClass} x1={x(mark)} x2={x(mark)} y1="0" y2="40" />
      ) : null}
    </svg>
  );
}

function Band({
  label,
  band,
}: {
  label: string;
  band: { p5: number; p25: number; p50: number; p75: number; p95: number };
}) {
  const vals = [band.p5, band.p25, band.p50, band.p75, band.p95];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const left = ((band.p5 - lo) / span) * 100;
  const midL = ((band.p25 - lo) / span) * 100;
  const midR = ((band.p75 - lo) / span) * 100;
  const right = ((band.p95 - lo) / span) * 100;
  const med = ((band.p50 - lo) / span) * 100;
  return (
    <div className="synth-band">
      <div className="synth-band__label">
        <strong>{label}</strong>
        <span className="mono hint">
          {pct(band.p5)} … {pct(band.p95)}
        </span>
      </div>
      <div className="synth-band__track">
        <i style={{ left: `${left}%`, width: `${Math.max(2, right - left)}%` }} className="outer" />
        <i style={{ left: `${midL}%`, width: `${Math.max(2, midR - midL)}%` }} className="inner" />
        <b style={{ left: `${med}%` }} />
      </div>
    </div>
  );
}

export function SyntheticMarkets({ backtestId }: { backtestId: number }) {
  const [report, setReport] = useState<SyntheticReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paths, setPaths] = useState(100);
  const [block, setBlock] = useState(20);

  const load = useCallback(
    async (opts?: { paths?: number; block?: number; quiet?: boolean }) => {
      setBusy(true);
      setError('');
      try {
        const data = await getSynthetic(backtestId, {
          paths: opts?.paths ?? paths,
          block: opts?.block ?? block,
        });
        setReport(data);
        if (!opts?.quiet) {
          toast('Synthetic markets ready', {
            tone: 'ok',
            body: `${data.paths} paths · block ${data.block}`,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Synthetic markets failed.');
      } finally {
        setBusy(false);
      }
    },
    [backtestId, paths, block],
  );

  useEffect(() => {
    void load({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backtestId]);

  if (error && !report) return <div className="banner warn">{error}</div>;
  if (!report && busy) {
    return (
      <p className="note">
        Building alternate histories and rerunning the rules on each — this can take a few seconds…
      </p>
    );
  }
  if (!report) return <div className="banner warn">{error || 'Synthetic markets failed.'}</div>;

  const samples = report.path_samples ?? [];

  return (
    <div className="synth-studio stress-audit">
      <header className="synth-studio__hero">
        <section className={`stress-verdict verdict-${VERDICT_TONE[report.verdict]}`}>
          <p className="eyebrow">Synthetic markets studio</p>
          <h2>{VERDICT_LABEL[report.verdict]}</h2>
          <p>{report.headline}</p>
          <p className="mono stress-split">
            {report.paths} paths · {report.block}-bar blocks · seed {report.seed ?? '—'}
          </p>
        </section>
        <section className="panel synth-studio__controls">
          <h3>Controls</h3>
          <div className="param-grid">
            <label className="field">
              <span>Paths</span>
              <select value={paths} onChange={(e) => setPaths(Number(e.target.value))} disabled={busy}>
                <option value={40}>40 · fast</option>
                <option value={100}>100 · default</option>
                <option value={150}>150</option>
                <option value={200}>200 · heavy</option>
              </select>
            </label>
            <label className="field">
              <span>Block size</span>
              <select value={block} onChange={(e) => setBlock(Number(e.target.value))} disabled={busy}>
                <option value={10}>10 bars</option>
                <option value={20}>20 · default</option>
                <option value={40}>40 bars</option>
                <option value={60}>60 bars</option>
              </select>
            </label>
          </div>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void load()}>
            {busy ? 'Resampling…' : 'Re-run synthetic'}
          </button>
          {error ? <div className="banner warn">{error}</div> : null}
        </section>
      </header>

      <section className="kpi-grid">
        <KpiCard
          label="Profitable paths"
          value={`${Math.round(report.profitable_share * 100)}%`}
          tone={
            report.profitable_share >= 0.7
              ? 'positive'
              : report.profitable_share < 0.4
                ? 'negative'
                : 'neutral'
          }
        />
        <KpiCard
          label="Median return"
          value={pct(report.returns.p50)}
          tone={report.returns.p50 > 0 ? 'positive' : 'negative'}
        />
        <KpiCard label="5th – 95th pct" value={`${pct(report.returns.p5)} … ${pct(report.returns.p95)}`} />
        <KpiCard
          label="Real history rank"
          value={`${Math.round(report.real_rank * 100)}th pct`}
          hint={`Real return ${pct(report.real.total_return)}`}
        />
        <KpiCard label="Median Sharpe" value={report.sharpes.p50.toFixed(2)} />
        <KpiCard
          label="Median trades"
          value={String(Math.round(report.median_trades))}
          hint="Per alternate path"
        />
        <KpiCard label="Asset median" value={pct(report.hold_median)} hint="Buy & hold on same paths" />
        <KpiCard
          label="Median max DD"
          value={pct(report.drawdowns?.p50)}
          tone="negative"
          hint={
            report.drawdowns
              ? `5–95: ${pct(report.drawdowns.p5)} … ${pct(report.drawdowns.p95)}`
              : undefined
          }
        />
      </section>

      <div className="split">
        <section className="panel">
          <h2>Return bands</h2>
          <Band label="Strategy return" band={report.returns} />
          <Band label="Sharpe" band={report.sharpes} />
          {report.drawdowns ? <Band label="Max drawdown" band={report.drawdowns} /> : null}
        </section>
        <section className="panel">
          <h2>Return histogram</h2>
          <Histogram
            edges={report.histogram.edges}
            counts={report.histogram.counts}
            marker={report.real.total_return}
          />
          <p className="mono stress-split">White line = real history return</p>
        </section>
      </div>

      {report.sharpe_histogram?.counts?.length ? (
        <section className="panel">
          <h2>Sharpe histogram</h2>
          <Histogram
            edges={report.sharpe_histogram.edges}
            counts={report.sharpe_histogram.counts}
            marker={report.real.sharpe_ratio}
            markerClass="real"
          />
        </section>
      ) : null}

      {samples.length ? (
        <section className="panel table-wrap">
          <h2>Path explorer</h2>
          <p className="hint">Best and worst alternate histories (not the real sequence).</p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Path</th>
                <th>Return</th>
                <th>Sharpe</th>
                <th>Max DD</th>
                <th>Trades</th>
                <th>Hold</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((row) => (
                <tr key={row.path}>
                  <td className="mono">#{row.path}</td>
                  <td className={row.total_return >= 0 ? 'pos' : 'neg'}>{pct(row.total_return)}</td>
                  <td className="mono">{row.sharpe_ratio.toFixed(2)}</td>
                  <td className="neg mono">{pct(row.max_drawdown)}</td>
                  <td className="mono">{row.trades}</td>
                  <td className="mono">{pct(row.hold_return)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
