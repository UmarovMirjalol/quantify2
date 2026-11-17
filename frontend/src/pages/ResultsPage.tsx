import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DrawdownChart,
  EquityChart,
  ExposureChart,
  MonthlyReturnsChart,
  PriceTradeChart,
  ReturnsDistributionChart,
  RollingSharpeChart,
} from '../components/Charts';
import { MonteCarloLab } from '../components/MonteCarloLab';
import { ExportButtons } from '../components/ExportButtons';
import { managementSummary } from '../components/PositionManagement';
import { KpiCard } from '../components/KpiCard';
import { FactorAlphaLab } from '../components/FactorAlphaLab';
import { Optimizer } from '../components/Optimizer';
import { ParamSurfaceLab } from '../components/ParamSurfaceLab';
import { SyntheticMarkets } from '../components/SyntheticMarkets';
import { RegimeLab } from '../components/RegimeLab';
import { Robustness } from '../components/Robustness';
import { StressAudit } from '../components/StressAudit';
import { TradeTable } from '../components/TradeTable';
import { VerdictCard } from '../components/VerdictCard';
import { LiveSignalCard } from '../components/LiveSignalCard';
import {
  createForwardTest,
  getFactorReport,
  getMultiFactorReport,
  shareBacktest,
  unshareBacktest,
  type FactorReport,
  type MultiFactorReport,
} from '../services/api';
import type { BacktestResult } from '../types';
import { buildBuyAndHold } from '../utils/buyAndHold';
import { WalkForward } from '../components/WalkForward';
import { downloadText, toCsv } from '../utils/download';
import { formatConditions, riskWarnings, sizingLabel } from '../utils/formatStrategy';
import { shareCard, signedPct } from '../utils/shareCard';
import { explainResult } from '../utils/explainResult';
import { tearsheetMarkdown } from '../utils/tearsheetMarkdown';
import { reproduceNotebook, reproducePython } from '../utils/notebookExport';
import { ResultsDock } from '../components/ResultsDock';
import { TradeReplay } from '../components/TradeReplay';
import { CostCapacityPanel } from '../components/CostCapacityPanel';
import { MonthlyHeatmap } from '../components/MonthlyHeatmap';
import { SessionBadge } from '../components/SessionBadge';
import { EquityRace } from '../components/EquityRace';
import { ResearchNotes } from '../components/ResearchNotes';
import { ExitAttribution } from '../components/ExitAttribution';
import { WeekdayPnl } from '../components/WeekdayPnl';
import { UnderwaterPeriods } from '../components/UnderwaterPeriods';
import { RunTags } from '../components/RunTags';
import { TradeSpotlight } from '../components/TradeSpotlight';
import { RecoveryClock } from '../components/RecoveryClock';
import { StrategyFingerprint } from '../components/StrategyFingerprint';
import { HoldDuration } from '../components/HoldDuration';
import { StreakStrip } from '../components/StreakStrip';
import { TradeEquityPath } from '../components/TradeEquityPath';
import { ExcursionPanel } from '../components/ExcursionPanel';
import { toast } from '../components/ToastHost';
import { logActivity } from '../utils/activityLog';
import { isFavorite, toggleFavorite } from '../utils/favorites';
import { pushRecentRun } from '../utils/recentRuns';
import { tradeStreaks } from '../utils/streaks';
import { underwaterReport } from '../utils/underwater';

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
  | 'lab'
  | 'optimize'
  | 'alpha';

const OWNER_ONLY: Tab[] = ['stress', 'walk', 'robust', 'synthetic', 'lab', 'optimize'];

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
  { id: 'lab', label: 'Lab' },
  { id: 'optimize', label: 'Optimizer' },
  { id: 'alpha', label: 'Alpha & beta' },
];

const TAB_IDS = new Set(TABS.map((t) => t.id));

function tabFromHash(): Tab {
  const raw = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
  return TAB_IDS.has(raw as Tab) ? (raw as Tab) : 'overview';
}

export function ResultsView({ result, readOnly = false }: { result: BacktestResult; readOnly?: boolean }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>(() => tabFromHash());
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
  const reasons = useMemo(
    () =>
      holdVerdict
        ? explainResult({
            metrics: m,
            trades: result.trades,
            bars: result.price_series.length,
            holdEquity: buyHold.equity,
            holdReturn: buyHold.totalReturn,
            won: holdVerdict.won,
          })
        : [],
    [holdVerdict?.won, m, result.trades, result.price_series.length, buyHold],
  );
  const [cardBusy, setCardBusy] = useState(false);
  const [cardNote, setCardNote] = useState<string | null>(null);
  const [factors, setFactors] = useState<FactorReport | null>(null);
  const [multiFactors, setMultiFactors] = useState<MultiFactorReport | null>(null);
  const [factorsErr, setFactorsErr] = useState('');
  const [factorBench, setFactorBench] = useState('SPY');
  const [compareNote, setCompareNote] = useState('');
  const [favorited, setFavorited] = useState(() => isFavorite(result.id));
  const [focusMode, setFocusMode] = useState(false);
  const streaks = useMemo(() => tradeStreaks(result.trades), [result.trades]);
  const underwater = useMemo(() => underwaterReport(result.equity_curve), [result.equity_curve]);

  useEffect(() => {
    document.documentElement.classList.toggle('results-focus', focusMode);
    return () => document.documentElement.classList.remove('results-focus');
  }, [focusMode]);

  useEffect(() => {
    pushRecentRun(result.id, result.strategy_description);
    logActivity(`Opened #${result.id}`, `/results/${result.id}`);
  }, [result.id, result.strategy_description]);

  useEffect(() => {
    const next = `#${tab}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${next}`);
    }
  }, [tab]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        toast('Shortcuts', {
          tone: 'info',
          body: '1–9 tabs · [ ] · c compare · p pin · t tearsheet · f focus · l link',
        });
        return;
      }
      if (e.key >= '1' && e.key <= '9') {
        const i = Number(e.key) - 1;
        if (tabs[i]) {
          e.preventDefault();
          setTab(tabs[i].id);
        }
        return;
      }
      if (e.key === '[') {
        e.preventDefault();
        setTab((cur) => {
          const i = tabs.findIndex((t) => t.id === cur);
          return tabs[Math.max(0, i - 1)]?.id ?? cur;
        });
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        setTab((cur) => {
          const i = tabs.findIndex((t) => t.id === cur);
          return tabs[Math.min(tabs.length - 1, i + 1)]?.id ?? cur;
        });
        return;
      }
      if (e.key.toLowerCase() === 'c' && !readOnly) {
        e.preventDefault();
        queueForCompare();
        return;
      }
      if (e.key.toLowerCase() === 'p' && !readOnly) {
        e.preventDefault();
        const next = toggleFavorite({
          id: result.id,
          title: result.strategy_description,
          dataset: result.dataset_name,
          return_pct: result.metrics.total_return,
          sharpe: result.metrics.sharpe_ratio,
        });
        const on = next.some((f) => f.id === result.id);
        setFavorited(on);
        toast(on ? 'Pinned' : 'Unpinned', { tone: 'ok' });
        return;
      }
      if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        void navigator.clipboard
          .writeText(
            tearsheetMarkdown(result, {
              buyHold: { totalReturn: buyHold.totalReturn, finalCapital: buyHold.finalCapital },
              vsHold,
              factors,
              multiFactors: multiFactors?.rows,
            }),
          )
          .then(() => toast('Tearsheet copied', { tone: 'ok' }))
          .catch(() => exportTearsheet());
        return;
      }
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFocusMode((v) => !v);
        toast(focusMode ? 'Focus off' : 'Focus on', { tone: 'info', body: 'Press F again to toggle' });
        return;
      }
      if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const url = `${window.location.origin}/results/${result.id}`;
        void navigator.clipboard.writeText(url).then(() => toast('Result link copied', { tone: 'ok' }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabs, readOnly, result, buyHold, vsHold, factors, multiFactors, focusMode]);

  useEffect(() => {
    if (tab !== 'alpha' || result.equity_curve.length < 30) return;
    let cancelled = false;
    setFactorsErr('');
    getFactorReport({ equity_curve: result.equity_curve, benchmark: factorBench, history: '10y' })
      .then((rep) => {
        if (!cancelled) setFactors(rep);
      })
      .catch((err) => {
        if (!cancelled) setFactorsErr(err instanceof Error ? err.message : 'Factor fit failed');
      });
    getMultiFactorReport({
      equity_curve: result.equity_curve,
      benchmarks: ['SPY', 'QQQ', 'IWM', 'TLT', 'GLD'],
      history: '10y',
    })
      .then((rep) => {
        if (!cancelled) setMultiFactors(rep);
      })
      .catch(() => {
        if (!cancelled) setMultiFactors(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, result.equity_curve, factorBench]);

  function queueForCompare() {
    const key = 'quantify_compare_a';
    const prev = sessionStorage.getItem(key);
    if (prev && Number(prev) !== result.id) {
      sessionStorage.removeItem(key);
      navigate(`/compare?a=${prev}&b=${result.id}`);
      return;
    }
    sessionStorage.setItem(key, String(result.id));
    setCompareNote(`Run #${result.id} queued. Open another result and hit Compare again.`);
  }

  function exportTearsheet() {
    downloadText(
      `quantify-tearsheet-${result.id}.md`,
      tearsheetMarkdown(result, {
        buyHold: { totalReturn: buyHold.totalReturn, finalCapital: buyHold.finalCapital },
        vsHold,
        factors,
        multiFactors: multiFactors?.rows,
      }),
      'text/markdown;charset=utf-8',
    );
    toast('Tearsheet downloaded', { tone: 'ok' });
  }

  function exportNotebook() {
    downloadText(`quantify-reproduce-${result.id}.ipynb`, reproduceNotebook(result), 'application/json;charset=utf-8');
    toast('Notebook ready', { tone: 'ok', body: 'Open in Jupyter / VS Code' });
  }

  function exportReproducePy() {
    downloadText(`quantify-reproduce-${result.id}.py`, reproducePython(result), 'text/x-python;charset=utf-8');
  }

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
        'entry_why',
        'exit_why',
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
        t.entry_why ?? '',
        t.exit_why ?? '',
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
        toast('Share link copied', { tone: 'ok', body: `Report #${result.id}` });
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
    <div className="results results--docked">
      <ResultsDock result={result} vsHold={vsHold} onCompare={readOnly ? undefined : queueForCompare} readOnly={readOnly} />
      <div className="page-header">
        <div>
          <p className="eyebrow">{readOnly ? 'Shared report' : `Backtest #${result.id}`}</p>
          <h1>Results</h1>
          <p className="lede">{result.strategy_description}</p>
          <div className="meta-row">
            <span className="mono">{result.dataset_name}</span>
            <span>{result.created_at?.slice(0, 19).replace('T', ' ')} UTC</span>
            <SessionBadge strategy={result.strategy} bars={result.bars} />
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
          <details className="download-menu">
            <summary className="btn secondary">Download ▾</summary>
            <div className="download-menu-list" onClick={(e) => e.currentTarget.parentElement?.removeAttribute('open')}>
              <button type="button" onClick={exportTradesCsv}>
                Trades (CSV)
              </button>
              <button type="button" onClick={exportEquityCsv}>
                Equity curve (CSV)
              </button>
              <button type="button" onClick={exportMetricsJson}>
                Metrics (JSON)
              </button>
              <button type="button" onClick={exportTearsheet}>
                Tearsheet (Markdown)
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(
                      tearsheetMarkdown(result, {
                        buyHold: { totalReturn: buyHold.totalReturn, finalCapital: buyHold.finalCapital },
                        vsHold,
                        factors,
                        multiFactors: multiFactors?.rows,
                      }),
                    )
                    .then(() => {
                      toast('Tearsheet copied', { tone: 'ok' });
                      logActivity(`Copied tearsheet #${result.id}`, `/results/${result.id}`);
                    })
                    .catch(() => toast('Copy failed', { tone: 'error' }));
                }}
              >
                Copy tearsheet
              </button>
              <button type="button" onClick={exportNotebook}>
                Reproduce (.ipynb)
              </button>
              <button type="button" onClick={exportReproducePy}>
                Reproduce (.py)
              </button>
              <button type="button" onClick={() => window.print()}>
                Report (PDF)
              </button>
            </div>
          </details>
          {readOnly ? (
            <Link className="btn primary" to="/app">
              Test your own strategy
            </Link>
          ) : (
            <>
              <button
                type="button"
                className={`btn ${favorited ? 'primary' : 'secondary'}`}
                onClick={() => {
                  const next = toggleFavorite({
                    id: result.id,
                    title: result.strategy_description,
                    dataset: result.dataset_name,
                    return_pct: result.metrics.total_return,
                    sharpe: result.metrics.sharpe_ratio,
                  });
                  const on = next.some((f) => f.id === result.id);
                  setFavorited(on);
                  toast(on ? 'Pinned to favorites' : 'Removed from favorites', { tone: 'ok' });
                }}
              >
                {favorited ? '★ Pinned' : '☆ Pin'}
              </button>
              <button
                type="button"
                className={`btn ${focusMode ? 'primary' : 'secondary'}`}
                onClick={() => setFocusMode((v) => !v)}
                title="Hide chrome (F)"
              >
                {focusMode ? 'Focus · on' : 'Focus'}
              </button>
              <button type="button" className="btn secondary" onClick={queueForCompare}>
                Compare
              </button>
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

      {!readOnly && compareNote ? (
        <div className="share-bar no-print">
          <span className="hint">{compareNote}</span>
        </div>
      ) : null}

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
          {reasons.length ? (
            <ul className="hold-verdict-why">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
          {riskWarnings(result.strategy).map((w) => (
            <div key={w} className="banner warn risk-warning">
              {w}
            </div>
          ))}
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
        <KpiCard label="CAGR" value={pct(m.cagr)} tone={toneFor(m.cagr)} hint="Average growth per year" />
        <KpiCard label="Sharpe Ratio" value={num(m.sharpe_ratio)} hint="Return per unit of risk. Above 1 is good" />
        <KpiCard label="Sortino Ratio" value={num(m.sortino_ratio)} hint="Like Sharpe, but only drops count as risk" />
        <KpiCard
          label="Max Drawdown"
          value={pct(m.max_drawdown)}
          tone="negative"
          hint="Worst fall from a peak along the way"
        />
        <KpiCard
          label="Trades"
          value={String(m.number_of_trades)}
          hint={`Final ${money(m.final_capital)}`}
        />
        <KpiCard
          label="Max win streak"
          value={String(streaks.max_win)}
          hint={`${streaks.win_trades} winners`}
          tone="positive"
        />
        <KpiCard
          label="Max loss streak"
          value={String(streaks.max_loss)}
          hint={
            streaks.current_kind === 'flat'
              ? `${streaks.loss_trades} losers`
              : `Now ${streaks.current} ${streaks.current_kind}`
          }
          tone="negative"
        />
        <KpiCard
          label="Longest underwater"
          value={`${underwater.longest_days}d`}
          hint={
            underwater.currently_underwater
              ? `Still under · ${pct(underwater.time_underwater)} of bars`
              : `Avg recovery ${underwater.avg_recovery_days ?? '—'}d · ${underwater.periods} spells`
          }
          tone="negative"
        />
      </section>

      <VerdictCard backtestId={result.id} initial={result.verdict} />

      <LiveSignalCard
        backtestId={result.id}
        initial={result.live_signal}
        canRefresh={!readOnly}
        datasetName={result.dataset_name}
      />

      {readOnly ? null : <ExportButtons strategy={result.strategy} title={result.strategy_description} />}

      <div className="tabs no-print" role="tablist" id="results-tabs">
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
          <EquityRace strategy={result.equity_curve} hold={buyHold.equity} />
          <section className="panel">
            <h2>Rolling Sharpe · 63 trading days</h2>
            <RollingSharpeChart data={result.equity_curve} />
          </section>
          {!readOnly ? <RunTags backtestId={result.id} /> : null}
          {!readOnly ? <ResearchNotes backtestId={result.id} /> : null}
          <div className="split">
            <RecoveryClock curve={result.equity_curve} />
            <StrategyFingerprint strategy={result.strategy} />
          </div>
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
                {result.strategy.custom_code ? null : (
                  <>
                    <div>
                      <dt>Enters when</dt>
                      <dd>
                        {formatConditions(
                          result.strategy.entry_conditions,
                          result.strategy.entry_logic,
                          result.strategy.entry_any,
                        ).join(' ')}
                      </dd>
                    </div>
                    <div>
                      <dt>Exits when</dt>
                      <dd>
                        {formatConditions(
                          result.strategy.exit_conditions,
                          result.strategy.exit_logic,
                          result.strategy.exit_any,
                        ).join(' ')}
                      </dd>
                    </div>
                  </>
                )}
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
            {result.bars ? (
              <p className="note">
                Bars: {result.bars.source}
                {result.bars.resampled ? ` → ${result.bars.applied}` : ` · ${result.bars.applied}`}
                {result.bars.resampled && result.bars.result_bars
                  ? ` (${result.bars.source_bars.toLocaleString()} → ${result.bars.result_bars.toLocaleString()})`
                  : null}
                {result.bars.warning ? ` · ${result.bars.warning}` : null}
              </p>
            ) : null}
            <PriceTradeChart
              prices={result.price_series}
              markers={result.markers}
              indicators={result.indicator_series}
              debugBars={result.debug_bars}
            />
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
          <section className="panel">
            <h2>Return calendar</h2>
            <MonthlyHeatmap data={result.equity_curve} />
          </section>
          <section className="panel">
            <h2>Worst underwater spells</h2>
            <UnderwaterPeriods curve={result.equity_curve} />
          </section>
          <section className="kpi-grid">
            <KpiCard label="Volatility (ann.)" value={pct(m.annualized_volatility)} />
            <KpiCard label="Calmar" value={num(m.calmar_ratio)} />
            <KpiCard label="Max Drawdown" value={pct(m.max_drawdown)} tone="negative" />
            <KpiCard label="Sortino" value={num(m.sortino_ratio)} />
            <KpiCard
              label="VaR 95% (daily)"
              value={
                result.risk?.tails?.['0.95']?.var_pct == null
                  ? '—'
                  : `${result.risk.tails['0.95'].var_pct}%`
              }
              tone="negative"
              hint="Historical left-tail loss"
            />
            <KpiCard
              label="ES 95% (daily)"
              value={
                result.risk?.tails?.['0.95']?.es_pct == null
                  ? '—'
                  : `${result.risk.tails['0.95'].es_pct}%`
              }
              tone="negative"
              hint="Expected shortfall beyond VaR"
            />
            <KpiCard
              label="VaR 99%"
              value={
                result.risk?.tails?.['0.99']?.var_pct == null
                  ? '—'
                  : `${result.risk.tails['0.99'].var_pct}%`
              }
              tone="negative"
            />
            <KpiCard
              label="Avg invested"
              value={
                result.risk?.margin?.avg_invested == null
                  ? '—'
                  : `${(result.risk.margin.avg_invested * 100).toFixed(0)}%`
              }
            />
          </section>
          <CostCapacityPanel result={result} />
        </div>
      ) : null}

      {tab === 'monte_carlo' ? (
        <div className="tab-pane" key="monte_carlo">
          <MonteCarloLab backtestId={result.id} initial={result.monte_carlo} />
        </div>
      ) : null}

      {tab === 'trades' ? (
        <div className="tab-pane" key="trades">
          <TradeReplay trades={result.trades} equity={result.equity_curve} prices={result.price_series} />
          <TradeSpotlight trades={result.trades} />
          <StreakStrip trades={result.trades} />
          <div className="split">
            <TradeEquityPath
              trades={result.trades}
              initial={m.initial_capital ?? result.strategy.initial_capital}
            />
            <HoldDuration trades={result.trades} />
          </div>
          <div className="split">
            <ExitAttribution trades={result.trades} />
            <WeekdayPnl trades={result.trades} />
          </div>
          <ExcursionPanel trades={result.trades} prices={result.price_series} />
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
          <RegimeLab result={result} />
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

      {tab === 'lab' ? (
        <div className="tab-pane" key="lab">
          <ParamSurfaceLab result={result} />
        </div>
      ) : null}

      {tab === 'optimize' ? (
        <div className="tab-pane" key="optimize">
          <Optimizer result={result} />
        </div>
      ) : null}

      {tab === 'alpha' ? (
        <div className="tab-pane" key="alpha">
          <FactorAlphaLab
            result={result}
            factors={factors}
            multiFactors={multiFactors}
            factorsErr={factorsErr}
            factorBench={factorBench}
            onBenchChange={setFactorBench}
          />
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
            {result.total_funding ? (
              <KpiCard
                label="Funding / holding cost"
                value={money(result.total_funding)}
                hint={`${((result.strategy.funding_rate ?? 0) * 100).toFixed(1)}% a year on position value`}
              />
            ) : null}
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
