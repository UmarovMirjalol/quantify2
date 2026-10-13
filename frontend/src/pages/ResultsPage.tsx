import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DrawdownChart,
  EquityChart,
  ExposureChart,
  MonthlyReturnsChart,
  PriceTradeChart,
  ReturnsDistributionChart,
} from '../components/Charts';
import { KpiCard } from '../components/KpiCard';
import { TradeTable } from '../components/TradeTable';
import type { BacktestResult } from '../types';
import { buildBuyAndHold } from '../utils/buyAndHold';
import { downloadText, toCsv } from '../utils/download';

type Tab = 'overview' | 'risk' | 'trades' | 'statistics';

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
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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
  { id: 'trades', label: 'Trades' },
  { id: 'statistics', label: 'Statistics' },
];

export function ResultsView({ result }: { result: BacktestResult }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const m = result.metrics;
  const strategyJson = useMemo(
    () => JSON.stringify(result.strategy, null, 2),
    [result.strategy],
  );

  const buyHold = useMemo(
    () => buildBuyAndHold(result.price_series, m.initial_capital ?? result.strategy.initial_capital),
    [result.price_series, m.initial_capital, result.strategy.initial_capital],
  );

  const vsHold =
    m.total_return != null && buyHold.totalReturn != null
      ? m.total_return - buyHold.totalReturn
      : null;

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

  return (
    <div className="results">
      <div className="page-header">
        <div>
          <p className="eyebrow">Backtest #{result.id}</p>
          <h1>Results</h1>
          <p className="lede">{result.strategy_description}</p>
          <div className="meta-row">
            <span className="mono">{result.dataset_name}</span>
            <span>{result.created_at?.slice(0, 19).replace('T', ' ')} UTC</span>
            {result.parser === 'llm' ? (
              <span className="tag llm">LLM parser</span>
            ) : (
              <span className="tag">Built-in parser</span>
            )}
          </div>
        </div>
        <div className="results-actions">
          <button type="button" className="btn secondary small" onClick={exportTradesCsv}>
            Export trades CSV
          </button>
          <button type="button" className="btn secondary small" onClick={exportEquityCsv}>
            Export equity CSV
          </button>
          <button type="button" className="btn secondary small" onClick={exportMetricsJson}>
            Export JSON
          </button>
          <button type="button" className="btn secondary" onClick={rerunInWorkspace}>
            Edit & re-run
          </button>
          <Link className="btn primary" to="/app">
            New Backtest
          </Link>
        </div>
      </div>

      {result.warnings && result.warnings.length > 0 ? (
        <div className="banner warn">{result.warnings.join(' ')}</div>
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

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
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
                  <dt>Position sizing</dt>
                  <dd>{result.strategy.position_sizing}</dd>
                </div>
                <div>
                  <dt>Risk / trade</dt>
                  <dd>{pct(result.strategy.risk.risk_per_trade)}</dd>
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
