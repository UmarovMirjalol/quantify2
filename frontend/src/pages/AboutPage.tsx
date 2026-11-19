import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KpiCard } from '../components/KpiCard';
import { usePageMeta } from '../hooks/usePageMeta';
import { FOUNDER, PROJECT_ARCHIVE } from '../utils/projectArchive';

const REPO = 'https://github.com/UmarovMirjalol/quantify2';

const AUTHOR_NOTE = `I founded Quantify in January 2025 to answer one question without marketing theater: would this strategy have worked, and can I trust that answer? The fills are look-ahead-safe, the trades match an independent backtester to the cent, and the published study shows why pretty equity curves are not enough.`;

const PRINCIPLES = [
  {
    title: 'No peeking at the future',
    body: 'Signals use only the bar that just closed and fill at the next open. Python strategies are re-run on truncated data, and code whose past signals change is rejected.',
  },
  {
    title: 'Checked against an independent engine',
    body: 'The same rules run in Quantify and in backtrader, a separate open-source backtester, produce the same trades to the cent. The cross-check is a script anyone can re-run.',
  },
  {
    title: 'A verdict, not just a chart',
    body: 'Every run is graded with a holdout, walk-forward, synthetic markets, cost break-even, Monte Carlo and the Deflated Sharpe Ratio, because a pretty equity curve proves little.',
  },
  {
    title: 'Plain language in, real code out',
    body: 'Describe a strategy in English or Russian and get a precise rule set, then export it to TradingView Pine Script or a standalone Python file that reproduces every trade.',
  },
  {
    title: 'Forward, not only backward',
    body: 'Forward tests freeze a strategy and score it only on prices that arrive later: the one test that cannot be overfit.',
  },
  {
    title: 'Open core, paid desks',
    body: 'MIT source stays readable and self-hostable. Hosted Free covers the core desk; Pro and self-host licenses unlock farm, matrix refresh, webhooks and higher quotas — see Pricing.',
  },
];

interface Numbers {
  assets: number;
  pairs: number;
  matched: number;
  trades: number;
}

export function AboutPage() {
  usePageMeta(
    'About — Quantify',
    `Quantify is a research terminal founded ${FOUNDER.foundedLabel} by ${FOUNDER.name}: look-ahead-safe engine, nine overfitting tests, and a published multi-asset study.`,
  );
  const [numbers, setNumbers] = useState<Numbers | null>(null);

  useEffect(() => {
    Promise.all([fetch('/research/survival.json').then((r) => r.json()), fetch('/research/verification.json').then((r) => r.json())])
      .then(([s, v]) =>
        setNumbers({ assets: s.summary.assets, pairs: s.summary.pairs, matched: v.summary.matched_trades, trades: v.summary.trades }),
      )
      .catch(() => undefined);
  }, []);

  const recent = [...PROJECT_ARCHIVE].slice(-4).reverse();

  return (
    <article className="results research">
      <div className="page-header">
        <div>
          <p className="eyebrow">About · est. 2025</p>
          <h1>A research terminal that tries to disprove you</h1>
          <p className="lede">
            Most tools flatter an idea with a beautiful curve. Quantify is built so a skeptic can ask “is this real?” and
            get a receipt: verified fills, out-of-sample grades, and a public study — since {FOUNDER.foundedLabel}.
          </p>
        </div>
      </div>

      <section className="panel research-text about-author">
        <p className="eyebrow">Founder</p>
        <h2>
          {FOUNDER.name}
          <span className="hint" style={{ fontWeight: 400 }}>
            {' '}
            · {FOUNDER.role}
          </span>
        </h2>
        <p>
          Founded the Quantify research desk on <strong>{FOUNDER.foundedLabel}</strong>. Engine, research methodology,
          frontend, exports, and the survival study — one builder, open source, shipping continuously since 2025.
        </p>
        <p>{AUTHOR_NOTE}</p>
        <div className="about-links">
          <Link className="btn primary" to="/pricing">
            Free · Pro · self-host
          </Link>
          <Link className="btn secondary" to="/archive">
            2025– archive
          </Link>
          <a className="btn ghost" href={REPO} target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
          <Link className="btn ghost" to="/desk">
            Morning ops desk
          </Link>
        </div>
      </section>

      <section className="panel research-text">
        <h2>Why it exists</h2>
        <p>
          Anyone can find a trading rule that would have made money in the past: try enough of them and one will look
          brilliant by chance. Quantify takes the opposite side. You describe a strategy in plain words, it runs a
          careful, look-ahead-safe backtest, and then it tries hard to break the result: on data held back, on shifted
          periods, on synthetic markets, with higher costs, and with a statistical correction for how many ideas were
          tried. Our own <Link to="/research">study</Link> shows why this matters: the best of 30 classic rules on an
          asset usually lost to simply buying and holding it in the years that followed.
        </p>
      </section>

      {numbers ? (
        <section className="kpi-grid">
          <KpiCard label="Assets in the study" value={String(numbers.assets)} hint="stocks, ETFs, crypto, FX, futures" />
          <KpiCard label="Rule-asset backtests" value={numbers.pairs.toLocaleString()} hint="judged on unseen years" />
          <KpiCard
            label="Trades verified"
            value={`${numbers.matched.toLocaleString()} / ${numbers.trades.toLocaleString()}`}
            hint="identical to backtrader"
            tone="positive"
          />
          <KpiCard label="Founded" value="2025" hint={FOUNDER.foundedLabel} />
        </section>
      ) : null}

      <section className="panel">
        <h2>Principles</h2>
        <div className="about-grid">
          {PRINCIPLES.map((p) => (
            <div key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel research-text">
        <h2>Recent archive</h2>
        <ul className="about-receipts">
          {recent.map((e) => (
            <li key={e.date + e.title}>
              <strong className="mono">{e.date}</strong> — {e.title}
            </li>
          ))}
        </ul>
        <Link className="btn secondary" to="/archive">
          Full archive since 2025 →
        </Link>
      </section>

      <section className="panel research-text">
        <h2>How it is built</h2>
        <ul>
          <li>
            <strong>Engine:</strong> Python, pandas and NumPy. A bar-by-bar simulator with commissions, slippage, stops,
            trailing stops, partial exits, pyramiding and shorting.
          </li>
          <li>
            <strong>Research layer:</strong> holdout and walk-forward, synthetic markets, Monte Carlo, Deflated Sharpe,
            farm matrix, screener, factor and regime labs, forward tests.
          </li>
          <li>
            <strong>Desks:</strong> morning ops (forward + paper + live signals), playbook matrix, research book from
            saved runs, portfolio and history library.
          </li>
          <li>
            <strong>App:</strong> FastAPI and PostgreSQL, React and TypeScript, MIT-licensed, Docker Compose.
          </li>
        </ul>
      </section>
    </article>
  );
}
