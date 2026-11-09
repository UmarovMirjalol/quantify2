import { KpiCard } from './KpiCard';
import type { MarketReport } from '../types';

const VERDICT_LABEL: Record<MarketReport['verdict'], string> = {
  alpha: 'Real alpha',
  unproven: 'Unproven alpha',
  beta: 'Mostly market',
  no_edge: 'No alpha',
  thin: 'Too thin',
};

const VERDICT_TONE: Record<MarketReport['verdict'], string> = {
  alpha: 'holds',
  unproven: 'fragile',
  beta: 'overfit',
  no_edge: 'overfit',
  thin: 'thin',
};

function pct(v: number): string {
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
}

export function MarketExposure({ report }: { report: MarketReport | undefined }) {
  if (!report) {
    return <div className="banner warn">Alpha and beta are not available for this run. Rerun it to compute them.</div>;
  }
  return (
    <div className="stress-audit">
      <section className={`stress-verdict verdict-${VERDICT_TONE[report.verdict]}`}>
        <p className="eyebrow">Alpha vs buy & hold</p>
        <h2>{VERDICT_LABEL[report.verdict]}</h2>
        <p>{report.headline}</p>
        <p className="mono stress-split">
          Per-bar strategy returns regressed on the asset over {report.bars} bars · alpha t-stat {report.alpha_t.toFixed(2)}
        </p>
      </section>

      <section className="kpi-grid">
        <KpiCard
          label="Alpha (ann.)"
          value={pct(report.alpha_annual)}
          tone={report.alpha_annual > 0 ? 'positive' : report.alpha_annual < 0 ? 'negative' : 'neutral'}
          hint="Return not explained by the asset"
        />
        <KpiCard label="Beta" value={report.beta.toFixed(2)} hint="1.00 = moves with the asset" />
        <KpiCard label="R²" value={report.r_squared.toFixed(2)} hint="Share of variance from the asset" />
        <KpiCard label="Correlation" value={report.correlation.toFixed(2)} />
        <KpiCard label="Up capture" value={`${(report.up_capture * 100).toFixed(0)}%`} hint="Of the asset's up bars" />
        <KpiCard
          label="Down capture"
          value={`${(report.down_capture * 100).toFixed(0)}%`}
          hint="Lower is better; negative earns on down bars"
        />
        <KpiCard label="Asset return" value={pct(report.market_return)} />
        <KpiCard
          label="Excess return"
          value={pct(report.excess_return)}
          tone={report.excess_return > 0 ? 'positive' : 'negative'}
        />
      </section>
      <p className="note">
        Beta is how much of the asset's move the strategy carries. Alpha is what is left after paying for that
        exposure. A strategy that only made money because the asset rose has high R² and alpha near zero, so it
        would have been cheaper to just hold the asset.
      </p>
    </div>
  );
}
