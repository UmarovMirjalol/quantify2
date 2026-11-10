import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KpiCard } from '../components/KpiCard';
import { usePageMeta } from '../hooks/usePageMeta';

interface Group {
  pairs: number;
  train_winners: number;
  survival: number | null;
  beat_hold: number | null;
  median_train_sharpe: number | null;
  median_test_sharpe: number | null;
}

interface StudyAsset {
  ticker: string;
  class: string;
  bars: number;
  start: string;
  split: string;
  end: string;
  hold: { train_sharpe: number | null; train_return: number | null; test_sharpe: number | null; test_return: number | null };
  best: string | null;
  best_luck: boolean | null;
  rules: (number | null)[][];
}

interface Study {
  generated: string;
  method: { train_fraction: number; min_trades: number; commission: number; slippage: number };
  summary: {
    assets: number;
    rules_per_asset: number;
    pairs: number;
    train_winners: number;
    winner_survival: number;
    winner_beat_hold: number;
    loser_positive_test: number;
    winner_positive_test: number;
    best_pick: {
      count: number;
      survival: number;
      beat_hold_return: number;
      beat_hold_sharpe: number;
      median_train_sharpe: number;
      median_test_sharpe: number;
      median_hold_test_sharpe: number;
      flagged_luck: number;
    };
    rank_correlation: { median: number; positive_share: number; assets: number };
    quintiles: { top_train_sharpe: number; top_test_sharpe: number; bottom_train_sharpe: number; bottom_test_sharpe: number };
    by_family: Record<string, Group>;
    by_class: Record<string, Group>;
    by_rule: Record<string, Group>;
  };
  rule_index: { label: string; family: string }[];
  assets: StudyAsset[];
}

interface Verification {
  generated: string;
  backtrader_version: string;
  summary: { cases: number; identical_cases: number; trades: number; matched_trades: number; max_final_diff_pct: number };
  rows: {
    ticker: string;
    strategy: string;
    bars: number;
    quantify_trades: number;
    backtrader_trades: number;
    matched_trades: number;
    quantify_final: number;
    backtrader_final: number;
    final_diff_pct: number;
  }[];
}

const FAMILY_COLOR: Record<string, string> = {
  Trend: '#5eead4',
  Breakout: '#fbbf24',
  Momentum: '#a78bfa',
  'Mean reversion': '#f472b6',
};

const share = (v: number | null | undefined, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`);
const num = (v: number | null | undefined, digits = 2) => (v == null ? '—' : v.toFixed(digits));
const money = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;

function Scatter({ study }: { study: Study }) {
  const W = 640;
  const H = 440;
  const pad = 44;
  const lo = -1.5;
  const hi = 2.5;
  const sx = (v: number) => pad + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (W - pad - 12);
  const sy = (v: number) => H - pad - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - pad - 12);
  const points = useMemo(() => {
    const out: { x: number; y: number; family: string }[] = [];
    for (const a of study.assets) {
      for (const r of a.rules) {
        const [rule, trainSharpe, , trainTrades, testSharpe] = r;
        if (trainSharpe == null || testSharpe == null || (trainTrades ?? 0) < study.method.min_trades) continue;
        out.push({ x: trainSharpe, y: testSharpe, family: study.rule_index[rule as number].family });
      }
    }
    return out;
  }, [study]);
  const ticks = [-1, 0, 1, 2];

  return (
    <figure className="research-figure">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Training Sharpe against unseen Sharpe for every rule and asset">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={sx(t)} x2={sx(t)} y1={sy(lo)} y2={sy(hi)} className="grid" />
            <line x1={sx(lo)} x2={sx(hi)} y1={sy(t)} y2={sy(t)} className="grid" />
            <text x={sx(t)} y={H - pad + 16} textAnchor="middle" className="tick">{t}</text>
            <text x={pad - 8} y={sy(t) + 4} textAnchor="end" className="tick">{t}</text>
          </g>
        ))}
        <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} className="diag" />
        {points.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.2} fill={FAMILY_COLOR[p.family] ?? '#94a3b8'} opacity={0.45} />
        ))}
        <text x={(W + pad) / 2} y={H - 6} textAnchor="middle" className="axis">Sharpe in the backtest (first 70%)</text>
        <text x={12} y={H / 2} textAnchor="middle" className="axis" transform={`rotate(-90 12 ${H / 2})`}>
          Sharpe afterwards (last 30%)
        </text>
      </svg>
      <figcaption>
        <span className="legend">
          {Object.entries(FAMILY_COLOR).map(([name, color]) => (
            <span key={name}>
              <i style={{ background: color }} /> {name}
            </span>
          ))}
        </span>
        Each dot is one rule on one asset ({points.length.toLocaleString()} in total). If backtests predicted the future, the
        dots would hug the dashed line. They form a flat cloud instead.
      </figcaption>
    </figure>
  );
}

function DecayBars({ groups }: { groups: Record<string, Group> }) {
  const rows = Object.entries(groups);
  const max = Math.max(...rows.flatMap(([, g]) => [g.median_train_sharpe ?? 0, g.median_test_sharpe ?? 0]), 0.1);
  return (
    <div className="decay-bars">
      {rows.map(([name, g]) => (
        <div key={name} className="decay-row">
          <span className="decay-name">{name}</span>
          <div className="decay-track">
            <span className="decay-bar train" style={{ width: `${(Math.max(0, g.median_train_sharpe ?? 0) / max) * 100}%` }}>
              {num(g.median_train_sharpe)}
            </span>
            <span
              className="decay-bar test"
              style={{ width: `${(Math.max(0, g.median_test_sharpe ?? 0) / max) * 100}%`, background: FAMILY_COLOR[name] }}
            >
              {num(g.median_test_sharpe)}
            </span>
          </div>
        </div>
      ))}
      <p className="note">
        Median Sharpe of the rules that were profitable in the backtest: grey bar in the backtest, coloured bar afterwards.
      </p>
    </div>
  );
}

export function ResearchPage() {
  usePageMeta(
    'Do backtest winners keep winning? — Quantify research',
    'A study of 30 classic trading rules on over 100 assets: how often a profitable backtest stays profitable on data it never saw.',
  );
  const [study, setStudy] = useState<Study | null>(null);
  const [verify, setVerify] = useState<Verification | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/research/survival.json').then((r) => r.json() as Promise<Study>),
      fetch('/research/verification.json').then((r) => r.json() as Promise<Verification>),
    ])
      .then(([s, v]) => {
        setStudy(s);
        setVerify(v);
      })
      .catch(() => setError('Could not load the study data.'));
    const openAll = () => document.querySelectorAll('.research details').forEach((d) => d.setAttribute('open', ''));
    window.addEventListener('beforeprint', openAll);
    return () => window.removeEventListener('beforeprint', openAll);
  }, []);

  const families = useMemo(() => {
    if (!study) return null;
    const decay = (g: Group) => (g.median_test_sharpe ?? 0) - (g.median_train_sharpe ?? 0);
    const entries = Object.entries(study.summary.by_family).filter(([, g]) => g.median_test_sharpe != null);
    entries.sort((a, b) => decay(b[1]) - decay(a[1]));
    return { best: entries[0], worst: entries[entries.length - 1] };
  }, [study]);

  const splitRange = useMemo(() => {
    if (!study) return '';
    const splits = study.assets.map((a) => a.split).sort();
    return `${splits[Math.floor(splits.length / 2)].slice(0, 7)} → ${study.assets[0].end.slice(0, 7)}`;
  }, [study]);

  const rules = useMemo(() => {
    if (!study) return [];
    return Object.entries(study.summary.by_rule).sort((a, b) => (b[1].median_test_sharpe ?? -9) - (a[1].median_test_sharpe ?? -9));
  }, [study]);

  if (error) return <div className="banner warn">{error}</div>;
  if (!study || !verify) return <div className="panel">Loading the study…</div>;

  const s = study.summary;
  const bp = s.best_pick;
  const q = s.quintiles;
  const v = verify.summary;

  return (
    <article className="results research">
      <div className="page-header">
        <div>
          <p className="eyebrow">Research · {study.generated}</p>
          <h1>Do backtest winners keep winning?</h1>
          <p className="lede">
            We backtested {s.rules_per_asset} classic trading rules on {s.assets} stocks, ETFs, crypto coins, currencies and
            futures, then ran the same rules, unchanged, on the years that came after. The short answer: a great backtest
            tells you very little about what comes next.
          </p>
        </div>
        <div className="btn-row no-print">
          <button type="button" className="btn primary" onClick={() => window.print()}>
            Download PDF
          </button>
          <a className="btn ghost" href="/research/survival.json" download>
            Raw data (JSON)
          </a>
        </div>
      </div>

      <section className="kpi-grid">
        <KpiCard
          label="Rank correlation, backtest vs after"
          value={num(s.rank_correlation.median)}
          hint="1 = perfect foresight, 0 = random"
        />
        <KpiCard
          label="Best backtest's Sharpe"
          value={`${num(bp.median_train_sharpe)} → ${num(bp.median_test_sharpe)}`}
          hint={`buy & hold afterwards: ${num(bp.median_hold_test_sharpe)}`}
          tone="negative"
        />
        <KpiCard label="Best backtest beat buy & hold" value={share(bp.beat_hold_return)} hint={`of ${bp.count} assets, unseen years`} />
        <KpiCard
          label="Backtest winners that stayed ahead"
          value={share(s.winner_beat_hold, 1)}
          hint="still profitable and beat buy & hold"
          tone="negative"
        />
        <KpiCard label="Best picks within luck" value={share(bp.flagged_luck)} hint="Deflated Sharpe test" />
        <KpiCard label="Engine verified" value={`${v.matched_trades}/${v.trades}`} hint="trades identical to backtrader" tone="positive" />
      </section>

      <section className="panel research-text">
        <h2>Abstract</h2>
        <p>
          Backtests are how most retail traders decide whether a strategy works. But with enough rules to try, something
          always looks good on past data. We measured how much of that edge survives. For every asset we took up to ten years
          of daily prices, ranked {s.rules_per_asset} well-known rules (moving-average crosses, breakouts, MACD, ADX, RSI,
          Bollinger bands, stochastics) on the first {share(study.method.train_fraction)} of the history, and then scored all
          of them on the last {share(1 - study.method.train_fraction)}, which no ranking step ever saw. In total{' '}
          {s.pairs.toLocaleString()} rule-asset pairs traded often enough to judge.
        </p>
        <p>
          The ordering of rules by backtest Sharpe ratio was almost unrelated to their ordering afterwards (median rank
          correlation {num(s.rank_correlation.median)}). The single best rule per asset lost about{' '}
          {share(1 - bp.median_test_sharpe / bp.median_train_sharpe)} of its Sharpe ratio out of sample, and it beat simply
          buying and holding the asset in only {share(bp.beat_hold_return)} of cases.
        </p>
      </section>

      <section className="panel research-text">
        <h2>Findings</h2>
        <ol className="findings">
          <li>
            <strong>The backtest ranking is close to random.</strong> Across {s.rank_correlation.assets} assets the median
            Spearman correlation between a rule's Sharpe in the backtest and its Sharpe afterwards was{' '}
            {num(s.rank_correlation.median)}, and it was positive on only {share(s.rank_correlation.positive_share)} of
            assets: barely better than a coin flip.
          </li>
          <li>
            <strong>Winners shrink, losers recover.</strong> The top fifth of rules by backtest Sharpe fell from a median{' '}
            {num(q.top_train_sharpe)} to {num(q.top_test_sharpe)}; the bottom fifth rose from {num(q.bottom_train_sharpe)} to{' '}
            {num(q.bottom_test_sharpe)}. Rules that won in the backtest stayed profitable {share(s.winner_positive_test)} of
            the time, while rules that lost turned profitable {share(s.loser_positive_test)} of the time. Most of what
            separated them was noise.
          </li>
          <li>
            <strong>The best backtest usually loses to doing nothing.</strong> Picking the rule with the highest backtest
            Sharpe, as any optimiser would, gave a median Sharpe of {num(bp.median_train_sharpe)} in the backtest but{' '}
            {num(bp.median_test_sharpe)} afterwards, while simply holding the same assets over the same unseen period
            scored {num(bp.median_hold_test_sharpe)}. Only {share(s.winner_beat_hold, 1)} of all backtest winners were still
            profitable and ahead of buy &amp; hold.
          </li>
          <li>
            <strong>A luck test catches most of it in advance.</strong> The Deflated Sharpe Ratio (Bailey and López de
            Prado), which discounts the best result for the number of rules tried, already flagged{' '}
            {share(bp.flagged_luck)} of the winning picks as indistinguishable from luck using the backtest data alone.
          </li>
          {families ? (
            <li>
              <strong>Not all rule types decay alike.</strong> {families.best[0]} rules held up best (median Sharpe{' '}
              {num(families.best[1].median_train_sharpe)} → {num(families.best[1].median_test_sharpe)}), while{' '}
              {families.worst[0].toLowerCase()} rules decayed the most ({num(families.worst[1].median_train_sharpe)} →{' '}
              {num(families.worst[1].median_test_sharpe)}). This one result is worth testing on other periods before
              trusting it.
            </li>
          ) : null}
        </ol>
      </section>

      <section className="panel">
        <h2>Backtest vs. reality</h2>
        <Scatter study={study} />
      </section>

      <section className="panel">
        <h2>Decay by rule type</h2>
        <DecayBars groups={s.by_family} />
      </section>

      <section className="panel table-wrap">
        <h2>By asset class</h2>
        <table className="data-table compact">
          <thead>
            <tr>
              <th>Class</th>
              <th>Rule-asset pairs</th>
              <th>Backtest winners</th>
              <th>Stayed profitable</th>
              <th>Also beat hold</th>
              <th>Median Sharpe, backtest → after</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(s.by_class).map(([name, g]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="mono">{g.pairs}</td>
                <td className="mono">{g.train_winners}</td>
                <td className="mono">{share(g.survival)}</td>
                <td className="mono">{share(g.beat_hold)}</td>
                <td className="mono">
                  {num(g.median_train_sharpe)} → {num(g.median_test_sharpe)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel table-wrap">
        <h2>All {rules.length} rules</h2>
        <table className="data-table compact">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Backtest winners</th>
              <th>Stayed profitable</th>
              <th>Also beat hold</th>
              <th>Median Sharpe, backtest → after</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(([name, g]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="mono">
                  {g.train_winners} / {g.pairs}
                </td>
                <td className="mono">{share(g.survival)}</td>
                <td className="mono">{share(g.beat_hold)}</td>
                <td className="mono">
                  {num(g.median_train_sharpe)} → {num(g.median_test_sharpe)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel table-wrap">
        <details>
          <summary>
            <h2>Every asset ({study.assets.length})</h2>
          </summary>
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Class</th>
                <th>Unseen period</th>
                <th>Best rule in backtest</th>
                <th>Its Sharpe, backtest → after</th>
                <th>Hold Sharpe after</th>
                <th>Luck test</th>
              </tr>
            </thead>
            <tbody>
              {study.assets.map((a) => {
                const idx = study.rule_index.findIndex((r) => r.label === a.best);
                const row = a.rules.find((r) => r[0] === idx);
                return (
                  <tr key={a.ticker}>
                    <td className="mono">{a.ticker}</td>
                    <td>{a.class}</td>
                    <td className="mono">
                      {a.split} → {a.end}
                    </td>
                    <td>{a.best ?? '—'}</td>
                    <td className="mono">{row ? `${num(row[1])} → ${num(row[4])}` : '—'}</td>
                    <td className="mono">{num(a.hold.test_sharpe)}</td>
                    <td>{a.best_luck == null ? '—' : a.best_luck ? 'Luck' : 'Passed'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      </section>

      <section className="panel research-text" id="verification">
        <h2>Is the engine itself right?</h2>
        <p>
          A study is only as good as the backtester behind it, so we ran Quantify against backtrader {verify.backtrader_version},
          an independent open-source engine, on {v.cases} combinations of 4 assets and 9 rules. Both got the same prices and
          the same rules (signal at the close, fill at the next open, 0.1% commission, 0.05% slippage); backtrader computed
          its own indicators. All {v.matched_trades.toLocaleString()} of {v.trades.toLocaleString()} trades matched to the
          share and the cent, and final account values differed by at most {v.max_final_diff_pct.toFixed(6)}%.
        </p>
        <p>
          The first run did not match perfectly. Two cases on gold differed because Quantify started its EMA and RSI from the
          first price, while backtrader and TradingView start from the average of the first N prices, the convention in
          Wilder's original definition. We switched to the standard, and every case now matches.
        </p>
        <div className="table-wrap">
        <table className="data-table compact">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Rule</th>
              <th>Trades (Quantify / backtrader)</th>
              <th>Identical</th>
              <th>Final value, Quantify</th>
              <th>Final value, backtrader</th>
            </tr>
          </thead>
          <tbody>
            {verify.rows.map((r) => (
              <tr key={`${r.ticker}-${r.strategy}`}>
                <td className="mono">{r.ticker}</td>
                <td>{r.strategy}</td>
                <td className="mono">
                  {r.quantify_trades} / {r.backtrader_trades}
                </td>
                <td className="mono">
                  {r.matched_trades === r.quantify_trades && r.quantify_trades === r.backtrader_trades ? 'Yes' : 'No'}
                </td>
                <td className="mono">{money(r.quantify_final)}</td>
                <td className="mono">{money(r.backtrader_final)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="panel research-text">
        <h2>Method</h2>
        <ul>
          <li>
            Data: daily bars from Yahoo Finance, up to ten years per asset, at least 750 bars. Unseen period for most assets:{' '}
            {splitRange}.
          </li>
          <li>
            Execution: long only, the whole account per trade, signal at the close and fill at the next open,{' '}
            {(study.method.commission * 100).toFixed(1)}% commission and {(study.method.slippage * 100).toFixed(2)}% slippage
            per side.
          </li>
          <li>
            A rule counts as a backtest winner if its Sharpe ratio was positive with at least {study.method.min_trades} trades.
            It "stayed profitable" if the unseen period had a positive return, a positive Sharpe and at least 2 trades.
          </li>
          <li>The best pick per asset is the rule with the highest backtest Sharpe, exactly what Quantify's Discover page does.</li>
        </ul>
        <h2>Limitations</h2>
        <ul>
          <li>
            Survivorship bias: the stock list is today's large companies, which did well by definition. This flatters buy
            &amp; hold, not the rules.
          </li>
          <li>
            One unseen window per asset, mostly a strong bull market for stocks. Trend rules that sit out sell-offs would look
            better in a crash year.
          </li>
          <li>
            Thirty textbook rules with fixed parameters. Professional strategies combine many signals, size positions and
            trade many assets at once; this study says nothing about them.
          </li>
          <li>Sharpe ratios over a few years are noisy; differences of 0.1–0.2 between groups are within that noise.</li>
        </ul>
        <h2>What it means</h2>
        <p>
          Treat a backtest as a hypothesis, not a result. That is why Quantify grades every run with a holdout, walk-forward
          and Deflated Sharpe verdict, and why <Link to="/forward">forward tests</Link> exist: the only clean test of a rule is
          data that did not exist when you chose it.
        </p>
        <h2>Reproduce it</h2>
        <pre className="code-block">
          {`git clone https://github.com/UmarovMirjalol/quantify2
cd quantify2/backend && pip install -r requirements.txt backtrader
python -m scripts.survival_study            # this study, ~2 minutes
python -m scripts.verify_against_backtrader # engine cross-check`}
        </pre>
      </section>
    </article>
  );
}
