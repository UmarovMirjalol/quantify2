import type { RegimeReport } from '../types';

const LABEL: Record<RegimeReport['verdict'], string> = {
  uptrend: 'Uptrend edge',
  downtrend: 'Downtrend edge',
  both: 'Both regimes',
  neither: 'Neither regime',
  thin: 'Too thin',
};

function money(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pct(value: number | null): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(0)}%`;
}

function Row({
  name,
  bucket,
  peak,
}: {
  name: string;
  bucket: RegimeReport['up'];
  peak: number;
}) {
  const width = `${Math.max(8, (Math.abs(bucket.pnl) / peak) * 100)}%`;
  return (
    <li>
      <span>{name}</span>
      <span className="stress-bar" aria-hidden="true">
        <i className={bucket.pnl < 0 ? 'neg' : ''} style={{ width }} />
      </span>
      <strong className="mono">{money(bucket.pnl)}</strong>
      <span className="mono regime-meta">
        {bucket.trades} trades · win {pct(bucket.win_rate)}
      </span>
    </li>
  );
}

export function RegimeSplit({ report }: { report: RegimeReport }) {
  const peak = Math.max(1, Math.abs(report.up.pnl), Math.abs(report.down.pnl));
  return (
    <div className="stress-audit">
      <section className={`stress-verdict verdict-${report.verdict === 'both' ? 'holds' : report.verdict === 'neither' ? 'overfit' : report.verdict === 'thin' ? 'thin' : 'fragile'}`}>
        <p className="eyebrow">Regime split</p>
        <h2>{LABEL[report.verdict]}</h2>
        <p>{report.headline}</p>
        <p className="mono stress-split">
          Trend is the close before the fill versus its {report.window}-day average. The fill bar itself is not used.
        </p>
      </section>
      <section className="panel">
        <h2>Profit by trend</h2>
        <ul className="regime-rows">
          <Row name="Above average" bucket={report.up} peak={peak} />
          <Row name="Below average" bucket={report.down} peak={peak} />
        </ul>
      </section>
    </div>
  );
}
