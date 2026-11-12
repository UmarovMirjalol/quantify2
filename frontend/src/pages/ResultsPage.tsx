import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DrawdownChart,
  EquityChart,
  ExposureChart,
  MonthlyReturnsChart,
  MonteCarloChart,
  PriceTradeChart,
  ReturnsDistributionChart,
} from '../components/Charts';
import { ExportButtons } from '../components/ExportButtons';
import { managementSummary } from '../components/PositionManagement';
import { KpiCard } from '../components/KpiCard';
import { MarketExposure } from '../components/MarketExposure';
import { Optimizer } from '../components/Optimizer';
import { SyntheticMarkets } from '../components/SyntheticMarkets';
import { RegimeSplit } from '../components/RegimeSplit';
import { Robustness } from '../components/Robustness';
import { StressAudit } from '../components/StressAudit';
import { TradeTable } from '../components/TradeTable';
import { VerdictCard } from '../components/VerdictCard';
import { LiveSignalCard } from '../components/LiveSignalCard';
import { createForwardTest, shareBacktest, unshareBacktest } from '../services/api';
import type { BacktestResult } from '../types';
import { buildBuyAndHold } from '../utils/buyAndHold';
import { classifyRegimes } from '../utils/regimes';
import { WalkForward } from '../components/WalkForward';
import { downloadText, toCsv } from '../utils/download';
import { sizingLabel } from '../utils/formatStrategy';
import { shareCard, signedPct } from '../utils/shareCard';

const ACCENT_HEX = '#4fd6a0';
const HOLD_HEX = '#98a2ac';
const NEG_HEX = '#e57a84';

type Tab =
  | 'overview'
  | 'risk'
  | 'monte_carlo'
  | 'trades'
  | 'statistics'
  | 'stress'
  | 'regimes'
  | 'walk'
  | 'robust'
  | 'synthetic'
  | 'optimize'
  | 'alpha';

const OWNER_ONLY: Tab[] = ['stress', 'walk', 'robust', 'synthetic', 'optimize'];

export function reportUrl(token: string): string {
  return `${window.location.origin}/r/${token}`;
}

function pct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

function num(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function money(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function toneFor(v: number | null | undefined): 'positive' | 'negative' | 'neutral' {
  if (v === null || v === undefined) return 'neutral';
  if (v > 0) return 'positive';
  if (v < 0) return 'negative';
  return 'neutral';
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'risk', label: 'Risk' },
  { id: 'monte_carlo', label: '🎲 Monte Carlo' },
  { id: 'trades', label: 'Trades' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'stress', label: 'Holdout' },
  { id: 'regimes', label: 'Regimes' },
  { id: 'walk', label: 'Walk-forward' },
  { id: 'robust', label: 'Robustness' },
  { id: 'synthetic', label: 'Synthetic markets' },
  { id: 'optimize', label: 'Optimizer' },
  { id: 'alpha', label: 'Alpha & beta' },
];

export function ResultsView({ result, readOnly = false }: { result: BacktestResult; readOnly?: boolean }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [shareToken, setShareToken] = useState<string | null>(result.share_token ?? null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const isCustom = Boolean(result.strategy.custom_code);
  const tabs = TABS.filter(
    (t) => !(readOnly && OWNER_ONLY.includes(t.id)) && !(isCustom && t.id === 'optimize'),
  );
  const isShort = result.strategy.side === 'short';
  const m = result.metrics;
  const strategyJson = useMemo(
    () => JSON.stringify(result.strategy, null, 2),
    [result.strategy],
  );

  const regimes = useMemo(
    () => result.regimes ?? classifyRegimes(result.price_series, result.trades),
    [result],
  );

  const buyHold = useMemo(
    () => buildBuyAndHold(result.price_series, m.initial_capital ?? result.strategy.initial_capital),
    [result.price_series, m.initial_capital, result.strategy.initial_capital],
  );

  const vsHold =
    m.total_return != null && buyHold.totalReturn != null
      ? m.total_return - buyHold.totalReturn
      : null;

  const start = m.initial_capital ?? result.strategy.initial_capital;
  const holdVerdict =
    m.final_capital != null && buyHold.finalCapital != null && start > 0
      ? { start, strategy: m.final_capital, hold: buyHold.finalCapital, won: m.final_capital >= buyHold.finalCapital }
      : null;
  const [cardBusy, setCardBusy] = useState(false);
  const [cardNote, setCardNote] = useState<string | null>(null);

  async function downloadCard() {
    if (!holdVerdict) return;
    setCardBusy(true);
    setCardNote(null);
    const bars = result.price_series;
    const period = bars.length ? `${bars[0].date.slice(0, 10)} → ${bars[bars.length - 1].date.slice(0, 10)}` : '';
    const diff = money(Math.abs(holdVerdict.strategy - holdVerdict.hold));
    try {
      const how = await shareCard(
        {
          eyebrow: `Backtest · ${result.strategy.asset}`,
          title: result.strategy_description || 'My trading strategy',
          meta: [result.strategy.asset, period, `${m.number_of_trades} trades`].filter(Boolean).join('  ·  '),
          stats: [
            { label: 'My strategy', value: money(holdVerdict.strategy), sub: signedPct(holdVerdict.strategy / start - 1), color: ACCENT_HEX },
            { label: 'Just buy & hold', value: money(holdVerdict.hold), sub: signedPct(holdVerdict.hold / start - 1), color: HOLD_HEX },
          ],
          verdict: holdVerdict.won ? `Beat buy & hold by ${diff}` : `Lost to buy & hold by ${diff}`,
          verdictColor: holdVerdict.won ? ACCENT_HEX : NEG_HEX,
          lines: [
            { values: buyHold.equity.map((p) => p.equity), color: HOLD_HEX, dashed: true },
            { values: result.equity_curve.map((p) => p.equity), color: ACCENT_HEX },
          ],
        },
        `quantify-result-${result.id}.png`,
      );
      setCardNote(how === 'downloaded' ? 'Card saved as PNG. Post it anywhere.' : null);
    } catch (err) {
      setCardNote(err instanceof Error ? err.message : 'Could not draw the card.');
    } finally {
      setCardBusy(false);
    }
  }

  function exportTradesCsv() {
    const rows: (string | number)[][] = [
      [
        'entry_date',
        'exit_date',
        'side',
        'entry_price',
        'exit_price',
        'quantity',
        'pnl',
        'return_pct',
        'commission',
        'bars_held',
        'entry_reason',
        'exit_reason',
      ],
      ...result.trades.map((t) => [
        t.entry_date,
        t.exit_date,
        t.side,
        t.entry_price,
        t.exit_price,
        t.quantity,
        t.pnl,
        t.return_pct,
        t.commission,
        t.bars_held,
        t.entry_reason,
        t.exit_reason,
      ]),
    ];
    downloadText(`quantify-trades-${result.id}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  }

  function exportEquityCsv() {
    const rows: (string | number | null)[][] = [
      ['date', 'strategy_equity', 'buy_hold_equity', 'drawdown'],
      ...result.equity_curve.map((pt, i) => [
        pt.date,
        pt.equity,
        buyHold.equity[i]?.equity ?? '',
        pt.drawdown,
      ]),
    ];
    downloadText(`quantify-equity-${result.id}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  }

  function exportMetricsJson() {
    downloadText(
      `quantify-result-${result.id}.json`,
      JSON.stringify(
        {
          id: result.id,
          strategy_description: result.strategy_description,
          dataset_name: result.dataset_name,
          parser: result.parser,
          created_at: result.created_at,
          metrics: result.metrics,
          strategy: result.strategy,
          buy_and_hold: {
            total_return: buyHold.totalReturn,
            final_capital: buyHold.finalCapital,
          },
          vs_buy_and_hold: vsHold,
          trade_count: result.trades.length,
        },
        null,
        2,
      ),
      'application/json;charset=utf-8',
    );
  }

  function rerunInWorkspace() {
    if (isCustom) {
      const s = result.strategy;
      navigate('/code', {
        state: {
          draft: {
            code: s.custom_code ?? '',
            dataset_id: result.dataset_name,
            side: s.side,
            stop_loss: s.stop_loss,
            take_profit: s.take_profit,
            trailing_stop: s.trailing_stop,
            scale_out: s.scale_out,
            breakeven_after_scale: s.breakeven_after_scale,
            max_entries: s.max_entries,
            initial_capital: s.initial_capital,
            commission: s.commission,
            slippage: s.slippage,
          },
        },
      });
      return;
    }
    let config: {
      initial_capital?: number;
      risk_per_trade?: number;
      commission?: number;
      slippage?: number;
    } = {};
    try {
      // config is not always on the result payload; fall back to strategy fields
      config = {
        initial_capital: result.strategy.initial_capital,
        risk_per_trade: result.strategy.risk.risk_per_trade,
        commission: result.strategy.commission,
        slippage: result.strategy.slippage,
      };
    } catch {
      // ignore
    }
    sessionStorage.setItem(
      'quantify_rerun',
      JSON.stringify({
        strategy_text: result.strategy_description,
        dataset_id: result.dataset_name,
        ...config,
      }),
    );
    navigate('/app?rerun=1');
  }

  async function share() {
    setShareBusy(true);
    setShareNote('Running every check so the report carries its verdict…');
    try {
      const { token } = await shareBacktest(result.id);
      setShareToken(token);
      try {
        await navigator.clipboard.writeText(reportUrl(token));
        setShareNote('Link copied. Anyone with it can view this report, no account needed.');
      } catch {
        setShareNote('Anyone with this link can view the report, no account needed.');
      }
    } catch (err) {
      setShareNote(err instanceof Error ? err.message : 'Could not create the link.');
    } finally {
      setShareBusy(false);
    }
  }

  async function trackForward() {
    setShareBusy(true);
    setShareNote('Freezing the rules and loading the latest bars…');
    try {
      await createForwardTest({ backtest_id: result.id });
      navigate('/forward');
    } catch (err) {
      setShareNote(err instanceof Error ? err.message : 'Could not start the forward test.');
      setShareBusy(false);
    }
  }

  async function revoke() {
    setShareBusy(true);
    try {
      await unshareBacktest(result.id);
      setShareToken(null);
      setShareNote('Link revoked. The old URL no longer opens.');
    } catch (err) {
      setShareNote(err instanceof Error ? err.message : 'Could not revoke the link.');
    } finally {
      setShareBusy(false);
    }
  }

  return (
    <div className="results">
      <div className="page-header">
        <div>
          <p className="eyebrow">{readOnly ? 'Shared report' : `Backtest #${result.id}`}</p>
          <h1>Results</h1>
          <p className="lede">{result.strategy_description}</p>
          <div className="meta-row">
            <span className="mono">{result.dataset_name}</span>
            <span>{result.created_at?.slice(0, 19).replace('T', ' ')} UTC</span>
            {isCustom ? (
              <span className="tag llm">Python</span>
            ) : result.parser === 'llm' ? (
              <span className="tag llm">LLM parser</span>
            ) : (
              <span className="tag">Built-in parser</span>
            )}
            <span className={`tag ${isShort ? 'short' : ''}`}>{isShort ? 'Short' : 'Long'}</span>
          </div>
        </div>
        <div className="results-actions no-print">
          <button type="button" className="btn secondary small" onClick={exportTradesCsv}>
            Export trades CSV
          </button>
          <button type="button" className="btn secondary small" onClick={exportEquityCsv}>
            Export equity CSV
          </button>
          <button type="button" className="btn secondary small" onClick={exportMetricsJson}>
            Export JSON
          </button>
          <button type="button" className="btn secondary small" onClick={() => window.print()}>
            Save PDF
          </button>
          {readOnly ? (
            <Link className="btn primary" to="/app">
              Test your own strategy
            </Link>
          ) : (
            <>
              <button type="button" className="btn secondary" onClick={share} disabled={shareBusy}>
                {shareToken ? 'Copy share link' : 'Share link'}
              </button>
              <button type="button" className="btn secondary" onClick={rerunInWorkspace}>
                Edit & re-run
              </button>
              {!isCustom ? (
                <button type="button" className="btn secondary" onClick={trackForward} disabled={shareBusy}>
                  Track forward
                </button>
              ) : null}
              <Link className="btn primary" to="/app">
                New Backtest
              </Link>
            </>
          )}
        </div>
      </div>

      {!readOnly && (shareToken || shareNote) ? (
        <div className="share-bar no-print">
          {shareToken ? (
            <input className="mono" readOnly value={reportUrl(shareToken)} onFocus={(e) => e.target.select()} />
          ) : null}
          {shareNote ? <span className="hint">{shareNote}</span> : null}
          {shareToken ? (
            <button type="button" className="btn ghost small" onClick={revoke} disabled={shareBusy}>
              Revoke
            </button>
          ) : null}
        </div>
      ) : null}

      {result.warnings && result.warnings.length > 0 ? (
        <div className="banner warn">{result.warnings.join(' ')}</div>
      ) : null}

      {result.clarifications && result.clarifications.length > 0 ? (
        <div className="banner info">
          <strong>Suggestions</strong>
          <ul style={{ margin: '6px 0 0 16px', padding: 0, listStyle: 'disc' }}>
            {result.clarifications.map((c, i) => (
              <li key={i} style={{ margin: '2px 0' }}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {readOnly ? null : <ExportButtons strategy={result.strategy} title={result.strategy_description} />}

      <VerdictCard backtestId={result.id} initial={result.verdict} />

      <LiveSignalCard
        backtestId={result.id}
        initial={result.live_signal}
        canRefresh={!readOnly}
        datasetName={result.dataset_name}
      />

      {holdVerdict ? (
        <section className={`hold-verdict ${holdVerdict.won ? 'won' : 'lost'}`}>
          <p>
            Your strategy turned <strong>{money(holdVerdict.start)}</strong> into{' '}
            <strong className="mono">{money(holdVerdict.strategy)}</strong>. Just buying and holding:{' '}
            <strong className="mono">{money(holdVerdict.hold)}</strong>.
          </p>
          <p className="hold-verdict-line">
            {holdVerdict.won ? 'Your strategy won by ' : 'Holding won by '}
            <span className="mono">{money(Math.abs(holdVerdict.strategy - holdVerdict.hold))}</span>
          </p>
          <div className="hold-verdict-actions no-print">
            <button type="button" className="btn secondary small" onClick={downloadCard} disabled={cardBusy}>
              {cardBusy ? 'Drawing…' : 'Share result card'}
            </button>
            {cardNote ? <span className="hint">{cardNote}</span> : null}
          </div>
        </section>
      ) : null}

      <section className="kpi-grid">
        <KpiCard label="Total Return" value={pct(m.total_return)} tone={toneFor(m.total_return)} />
        <KpiCard
          label="Buy & hold"
          value={pct(buyHold.totalReturn)}
          tone={toneFor(buyHold.totalReturn)}
          hint="Same bars, no costs"
        />
        <KpiCard
          label="vs Buy & hold"
          value={vsHold == null ? '—' : `${vsHold >= 0 ? '+' : ''}${(vsHold * 100).toFixed(2)}%`}
          tone={toneFor(vsHold)}
        />
        <KpiCard label="CAGR" value={pct(m.cagr)} tone={toneFor(m.cagr)} />
        <KpiCard label="Sharpe Ratio" value={num(m.sharpe_ratio)} />
        <KpiCard label="Sortino Ratio" value={num(m.sortino_ratio)} />
        <KpiCard label="Max Drawdown" value={pct(m.max_drawdown)} tone="negative" />
        <KpiCard
          label="Trades"
          value={String(m.number_of_trades)}
          hint={`Final ${money(m.final_capital)}`}
        />
      </section>

      <div className="tabs no-print" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="tab-pane" key="overview">
          <section className="panel">
            <h2>Portfolio equity vs buy & hold</h2>
            <EquityChart data={result.equity_curve} benchmark={buyHold.equity} />
          </section>
          <div className="split">
            <section className="panel">
              <h2>Drawdown</h2>
              <DrawdownChart data={result.equity_curve} />
            </section>
            <section className="panel">
              <h2>Strategy detected</h2>
              <dl className="kv">
                <div>
                  <dt>Asset</dt>
                  <dd>{result.strategy.asset}</dd>
                </div>
                <div>
                  <dt>Position size</dt>
                  <dd>{sizingLabel(result.strategy)}</dd>
                </div>
                <div>
                  <dt>Stop loss</dt>
                  <dd>{result.strategy.stop_loss == null ? '—' : pct(result.strategy.stop_loss)}</dd>
                </div>
                <div>
                  <dt>Take profit</dt>
                  <dd>
                    {result.strategy.take_profit == null ? '—' : pct(result.strategy.take_profit)}
                  </dd>
                </div>
                {managementSummary(result.strategy).length ? (
                  <div>
                    <dt>Position management</dt>
                    <dd>{managementSummary(result.strategy).join(' · ')}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Period</dt>
                  <dd className="mono">
                    {m.start_date?.slice(0, 10) ?? '—'} → {m.end_date?.slice(0, 10) ?? '—'}
                  </dd>
                </div>
              </dl>
              {result.execution_convention ? (
                <p className="note">{result.execution_convention}</p>
              ) : null}
            </section>
          </div>
          {isCustom ? (
            <section className="panel">
              <h2>Strategy code</h2>
              <pre className="code-block">{result.strategy.custom_code}</pre>
            </section>
          ) : null}
          <section className="panel">
            <h2>Price & trades</h2>
            <PriceTradeChart prices={result.price_series} markers={result.markers} />
          </section>
        </div>
      ) : null}

      {tab === 'risk' ? (
        <div className="tab-pane" key="risk">
          <div className="split">
            <section className="panel">
              <h2>Drawdown</h2>
              <DrawdownChart data={result.equity_curve} />
            </section>
            <section className="panel">
              <h2>Position exposure</h2>
              <ExposureChart data={result.equity_curve} />
            </section>
          </div>
          <div className="split">
            <section className="panel">
              <h2>Monthly returns</h2>
              <MonthlyReturnsChart data={result.equity_curve} />
            </section>
            <section className="panel">
              <h2>Returns distribution</h2>
              <ReturnsDistributionChart data={result.equity_curve} />
            </section>
          </div>
          <section className="kpi-grid">
            <KpiCard label="Volatility (ann.)" value={pct(m.annualized_volatility)} />
            <KpiCard label="Calmar" value={num(m.calmar_ratio)} />
            <KpiCard label="Max Drawdown" value={pct(m.max_drawdown)} tone="negative" />
            <KpiCard label="Sortino" value={num(m.sortino_ratio)} />
          </section>
        </div>
      ) : null}

      {tab === 'monte_carlo' ? (
        <div className="tab-pane" key="monte_carlo">
          {result.monte_carlo && result.monte_carlo.num_simulations > 0 ? (
            <>
              <section className="kpi-grid">
                <KpiCard
                  label="Risk of Ruin (>40% DD)"
                  value={pct(result.monte_carlo.risk_of_ruin)}
                  tone={
                    result.monte_carlo.risk_of_ruin === 0
                      ? 'positive'
                      : result.monte_carlo.risk_of_ruin > 0.1
                        ? 'negative'
                        : 'neutral'
                  }
                  hint="Simulated severe drawdown risk"
                />
                <KpiCard
                  label="95% Worst Drawdown"
                  value={pct(result.monte_carlo.worst_drawdown_p95)}
                  tone="negative"
                  hint="Pessimistic stress outcome"
                />
                <KpiCard
                  label="Median Return"
                  value={pct(result.monte_carlo.median_return)}
                  tone={toneFor(result.monte_carlo.median_return)}
                  hint="50th percentile expectation"
                />
                <KpiCard
                  label="95% Confidence Band"
                  value={`${pct(result.monte_carlo.confidence_95_lower)} … ${pct(result.monte_carlo.confidence_95_upper)}`}
                  hint="Expected return range"
                />
              </section>

              <section className="panel">
                <div className="page-header" style={{ marginBottom: '0.75rem' }}>
                  <div>
                    <h2 style={{ margin: 0 }}>Monte Carlo Fan Chart (1,000 Resamplings)</h2>
                    <p className="hint">
                      Simulates 1,000 alternative market paths by randomly permuting your trade outcomes.
                    </p>
                  </div>
                </div>
                <MonteCarloChart fanChart={result.monte_carlo.fan_chart} />
              </section>
            </>
          ) : (
            <div className="banner warn">
              {result.monte_carlo?.error ||
                'At least 3 closed trades are required to run Monte Carlo stress simulations.'}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'trades' ? (
        <div className="tab-pane" key="trades">
          <section className="panel">
            <div className="page-header" style={{ marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>Trade ledger</h2>
              <button type="button" className="btn secondary small" onClick={exportTradesCsv}>
                Download CSV
              </button>
            </div>
            <TradeTable trades={result.trades} asset={result.strategy.asset} />
          </section>
        </div>
      ) : null}

      {tab === 'stress' ? (
        <div className="tab-pane" key="stress">
          <StressAudit backtestId={result.id} />
        </div>
      ) : null}

      {tab === 'regimes' ? (
        <div className="tab-pane" key="regimes">
          <RegimeSplit report={regimes} />
        </div>
      ) : null}

      {tab === 'walk' ? (
        <div className="tab-pane" key="walk">
          <WalkForward backtestId={result.id} />
        </div>
      ) : null}

      {tab === 'robust' ? (
        <div className="tab-pane" key="robust">
          <Robustness backtestId={result.id} />
        </div>
      ) : null}

      {tab === 'synthetic' ? (
        <div className="tab-pane" key="synthetic">
          <SyntheticMarkets backtestId={result.id} />
        </div>
      ) : null}

      {tab === 'optimize' ? (
        <div className="tab-pane" key="optimize">
          <Optimizer result={result} />
        </div>
      ) : null}

      {tab === 'alpha' ? (
        <div className="tab-pane" key="alpha">
          <MarketExposure report={result.market} />
        </div>
      ) : null}

      {tab === 'statistics' ? (
        <div className="tab-pane" key="statistics">
          <section className="kpi-grid">
            <KpiCard label="Initial capital" value={money(m.initial_capital)} />
            <KpiCard label="Final capital" value={money(m.final_capital)} tone={toneFor(m.total_return)} />
            <KpiCard label="Avg trade return" value={pct(m.average_trade_return)} />
            <KpiCard
              label="Avg win / loss"
              value={`${money(m.average_winning_trade)} / ${money(m.average_losing_trade)}`}
            />
            <KpiCard label="Commission paid" value={money(result.total_commission ?? 0)} />
            <KpiCard label="Slippage cost" value={money(result.total_slippage ?? 0)} />
            <KpiCard label="Win rate" value={pct(m.win_rate)} />
            <KpiCard label="Profit factor" value={num(m.profit_factor)} />
          </section>
          <section className="panel">
            <h2>Parsed strategy specification</h2>
            <details open>
              <summary className="hint" style={{ cursor: 'pointer', marginBottom: '0.65rem' }}>
                Expand technical details
              </summary>
              <pre className="code-block">{strategyJson}</pre>
            </details>
          </section>
        </div>
      ) : null}
    </div>
  );
}
