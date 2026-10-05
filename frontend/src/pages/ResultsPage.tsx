import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DrawdownChart, EquityChart, PriceTradeChart } from '../components/Charts';
import { KpiCard } from '../components/KpiCard';
import { TradeTable } from '../components/TradeTable';
import type { BacktestResult } from '../types';

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

export function ResultsView({ result }: { result: BacktestResult }) {
  const m = result.metrics;
  const strategyJson = useMemo(
    () => JSON.stringify(result.strategy, null, 2),
    [result.strategy],
  );

  return (
    <div className="results">
      <div className="results-header">
        <div>
          <p className="eyebrow">Backtest #{result.id}</p>
          <h1>Results</h1>
          <p className="lede">{result.strategy_description}</p>
          <div className="meta-row">
            <span>Dataset: {result.dataset_name}</span>
            <span>{result.created_at?.slice(0, 19).replace('T', ' ')} UTC</span>
            {result.parser === 'llm' ? (
              <span className="tag llm">LLM parser</span>
            ) : (
              <span className="tag">Built-in parser</span>
            )}
          </div>
        </div>
        <Link className="btn secondary" to="/">
          New Backtest
        </Link>
      </div>

      {result.warnings && result.warnings.length > 0 ? (
        <div className="banner warn">{result.warnings.join(' ')}</div>
      ) : null}

      <section className="kpi-grid">
        <KpiCard label="Final Portfolio" value={money(m.final_capital)} hint={`Start ${money(m.initial_capital)}`} />
        <KpiCard label="Total Return" value={pct(m.total_return)} tone={toneFor(m.total_return)} />
        <KpiCard label="Sharpe Ratio" value={num(m.sharpe_ratio)} />
        <KpiCard label="Max Drawdown" value={pct(m.max_drawdown)} tone="negative" />
        <KpiCard label="Trades" value={String(m.number_of_trades)} hint={`Win rate ${pct(m.win_rate)}`} />
        <KpiCard label="CAGR" value={pct(m.cagr)} tone={toneFor(m.cagr)} />
        <KpiCard label="Sortino" value={num(m.sortino_ratio)} />
        <KpiCard label="Profit Factor" value={num(m.profit_factor)} />
      </section>

      <section className="panel">
        <h2>Equity Curve</h2>
        <EquityChart data={result.equity_curve} />
      </section>

      <div className="split">
        <section className="panel">
          <h2>Drawdown</h2>
          <DrawdownChart data={result.equity_curve} />
        </section>
        <section className="panel">
          <h2>Strategy Summary</h2>
          <dl className="kv">
            <div><dt>Asset</dt><dd>{result.strategy.asset}</dd></div>
            <div><dt>Position sizing</dt><dd>{result.strategy.position_sizing}</dd></div>
            <div><dt>Risk / trade</dt><dd>{pct(result.strategy.risk.risk_per_trade)}</dd></div>
            <div><dt>Stop loss</dt><dd>{result.strategy.stop_loss == null ? '—' : pct(result.strategy.stop_loss)}</dd></div>
            <div><dt>Take profit</dt><dd>{result.strategy.take_profit == null ? '—' : pct(result.strategy.take_profit)}</dd></div>
            <div><dt>Commission paid</dt><dd>{money(result.total_commission ?? 0)}</dd></div>
            <div><dt>Slippage cost</dt><dd>{money(result.total_slippage ?? 0)}</dd></div>
            <div><dt>Avg win / loss</dt><dd>{money(m.average_winning_trade)} / {money(m.average_losing_trade)}</dd></div>
          </dl>
          {result.execution_convention ? (
            <p className="note">{result.execution_convention}</p>
          ) : null}
        </section>
      </div>

      <section className="panel">
        <h2>Price & Trades</h2>
        <PriceTradeChart prices={result.price_series} markers={result.markers} />
      </section>

      <section className="panel">
        <h2>Trade History</h2>
        <TradeTable trades={result.trades} />
      </section>

      <section className="panel">
        <h2>Parsed Strategy Specification</h2>
        <pre className="code-block">{strategyJson}</pre>
      </section>
    </div>
  );
}
