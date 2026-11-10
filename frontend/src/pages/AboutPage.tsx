import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KpiCard } from '../components/KpiCard';
import { usePageMeta } from '../hooks/usePageMeta';

const REPO = 'https://github.com/UmarovMirjalol/quantify2';

/** A few sentences in the author's own words; the section is hidden while empty. */
const AUTHOR_NOTE = '';

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
    title: 'Free and open',
    body: 'No paywall, no ads, no email required. MIT-licensed, so anyone can read the code, run the whole stack with one Docker command, or build on it.',
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
    'Why Quantify exists: a free, open-source backtester built to tell you whether to believe your backtest.',
  );
  const [numbers, setNumbers] = useState<Numbers | null>(null);

  useEffect(() => {
    Promise.all([fetch('/research/survival.json').then((r) => r.json()), fetch('/research/verification.json').then((r) => r.json())])
      .then(([s, v]) =>
        setNumbers({ assets: s.summary.assets, pairs: s.summary.pairs, matched: v.summary.matched_trades, trades: v.summary.trades }),
      )
      .catch(() => undefined);
  }, []);

  return (
    <article className="results research">
      <div className="page-header">
        <div>
          <p className="eyebrow">About</p>
          <h1>Honest backtesting, free for everyone</h1>
          <p className="lede">
            Most backtesting tools are built to show you a beautiful equity curve. Quantify is built to tell you whether to
            believe it.
          </p>
        </div>
      </div>

      <section className="panel research-text">
        <h2>Why it exists</h2>
        <p>
          Anyone can find a trading rule that would have made money in the past: try enough of them and one will look
          brilliant by chance. That is how many beginners lose real money, and the tools they use rarely warn them, because
          a great-looking result is what keeps people using the tool.
        </p>
        <p>
          Quantify takes the opposite side. You describe a strategy in plain words, it runs a careful, look-ahead-safe
          backtest, and then it tries hard to break the result: on data held back, on shifted periods, on synthetic markets,
          with higher costs, and with a statistical correction for how many ideas were tried. Our own{' '}
          <Link to="/research">study</Link> shows why this matters: the best of 30 classic rules on an asset usually lost to
          simply buying and holding it in the years that followed.
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
          <KpiCard label="Price" value="$0" hint="MIT-licensed, self-hostable" />
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
        <h2>How it is built</h2>
        <ul>
          <li>
            <strong>Engine:</strong> Python, pandas and NumPy. A bar-by-bar simulator with commissions, slippage, stops,
            trailing stops, partial exits, pyramiding and shorting, plus vectorised paths for the thousands of runs the
            robustness checks need.
          </li>
          <li>
            <strong>Research layer:</strong> holdout and walk-forward tests, block-bootstrap synthetic markets, Monte Carlo,
            the Deflated Sharpe Ratio, a parameter optimiser judged out of sample, a 30-rule strategy search, a multi-asset
            screener and forward tests.
          </li>
          <li>
            <strong>App:</strong> FastAPI and PostgreSQL on the server, React and TypeScript in the browser, deployed on
            Vercel or with Docker Compose.
          </li>
          <li>
            <strong>Quality:</strong> an automated test suite covering the engine, parser, exports and every research tool,
            and an independent cross-check against backtrader.
          </li>
        </ul>
      </section>

      <section className="panel research-text">
        <h2>Author</h2>
        <p>
          Designed, built and tested by <strong>Mirjalol Umarov</strong>: the engine, the research, the interface and the
          study on this site.
        </p>
        {AUTHOR_NOTE ? <p>{AUTHOR_NOTE}</p> : null}
        <div className="about-links">
          <Link className="btn primary" to="/research">
            Read the study
          </Link>
          <a className="btn ghost" href={REPO} target="_blank" rel="noreferrer">
            Source code on GitHub
          </a>
          <Link className="btn ghost" to="/guide">
            How to use it
          </Link>
        </div>
      </section>
    </article>
  );
}
