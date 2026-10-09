import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCountUp } from '../hooks/useCountUp';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const ACCENT = '#4fd6a0';

type DemoStrategy = {
  id: string;
  label: string;
  text: string;
  asset: string;
  entry: string;
  exit: string;
  risk: string;
  equity: string;
  fill: string;
  ret: number;
  sharpe: number;
  dd: number;
  trades: number;
  win: number;
  blotter: { t: string; side: 'BUY' | 'SELL'; px: string; pnl: string }[];
};

const DEMOS: DemoStrategy[] = [
  {
    id: 'sma',
    label: 'SMA crossover',
    text: 'Buy SPY when the 20-day MA crosses above the 50-day. Risk 1% per trade; exit when RSI exceeds 70.',
    asset: 'SPY',
    entry: 'SMA(20) × SMA(50)',
    exit: 'RSI > 70',
    risk: '1.00% / trade',
    equity: 'M0 118 L40 112 L80 116 L120 96 L160 102 L200 78 L240 86 L280 62 L320 70 L360 44 L400 50 L440 28 L460 18',
    fill: '',
    ret: 12.4,
    sharpe: 1.38,
    dd: -8.2,
    trades: 48,
    win: 56,
    blotter: [
      { t: '2022-03-14', side: 'BUY', px: '417.22', pnl: '—' },
      { t: '2022-04-02', side: 'SELL', px: '428.91', pnl: '+2.80%' },
      { t: '2022-06-17', side: 'BUY', px: '366.48', pnl: '—' },
      { t: '2022-07-08', side: 'SELL', px: '389.12', pnl: '+6.18%' },
    ],
  },
  {
    id: 'rsi',
    label: 'RSI mean reversion',
    text: 'Buy when RSI falls below 30 and sell when RSI rises above 70. Risk 1% per trade on SPY.',
    asset: 'SPY',
    entry: 'RSI(14) < 30',
    exit: 'RSI(14) > 70',
    risk: '1.00% / trade',
    equity: 'M0 100 L40 108 L80 92 L120 104 L160 86 L200 98 L240 74 L280 88 L320 66 L360 78 L400 52 L440 60 L460 42',
    fill: '',
    ret: 8.7,
    sharpe: 1.12,
    dd: -6.4,
    trades: 62,
    win: 61,
    blotter: [
      { t: '2021-09-21', side: 'BUY', px: '433.10', pnl: '—' },
      { t: '2021-10-05', side: 'SELL', px: '441.88', pnl: '+2.03%' },
      { t: '2022-01-24', side: 'BUY', px: '422.53', pnl: '—' },
      { t: '2022-02-09', side: 'SELL', px: '447.01', pnl: '+5.79%' },
    ],
  },
  {
    id: 'ema',
    label: 'EMA + stops',
    text: 'Buy when 12-day EMA crosses above 26-day EMA. Exit on cross below, 2% stop, 5% take-profit.',
    asset: 'SPY',
    entry: 'EMA(12) × EMA(26)',
    exit: 'Cross / SL 2% / TP 5%',
    risk: 'stop-defined',
    equity: 'M0 122 L40 114 L80 118 L120 100 L160 88 L200 94 L240 70 L280 78 L320 54 L360 48 L400 58 L440 34 L460 22',
    fill: '',
    ret: 15.1,
    sharpe: 1.45,
    dd: -9.8,
    trades: 36,
    win: 52,
    blotter: [
      { t: '2021-11-03', side: 'BUY', px: '463.90', pnl: '—' },
      { t: '2021-11-18', side: 'SELL', px: '470.20', pnl: '+1.36%' },
      { t: '2022-08-12', side: 'BUY', px: '426.88', pnl: '—' },
      { t: '2022-08-26', side: 'SELL', px: '418.34', pnl: '−2.00%' },
    ],
  },
  {
    id: 'bb',
    label: 'Bollinger bounce',
    text: 'Buy when price closes below the lower Bollinger Band; sell when it crosses the middle band.',
    asset: 'SPY',
    entry: 'Close < BB lower',
    exit: 'Close > BB mid',
    risk: '1.00% / trade',
    equity: 'M0 110 L40 104 L80 112 L120 90 L160 98 L200 82 L240 90 L280 68 L320 76 L360 54 L400 62 L440 40 L460 32',
    fill: '',
    ret: 9.3,
    sharpe: 1.05,
    dd: -7.1,
    trades: 54,
    win: 58,
    blotter: [
      { t: '2022-05-12', side: 'BUY', px: '392.14', pnl: '—' },
      { t: '2022-05-27', side: 'SELL', px: '414.48', pnl: '+5.70%' },
      { t: '2022-09-26', side: 'BUY', px: '364.69', pnl: '—' },
      { t: '2022-10-13', side: 'SELL', px: '365.97', pnl: '+0.35%' },
    ],
  },
];

DEMOS.forEach((d) => {
  d.fill = `${d.equity} L460 150 L0 150 Z`;
});

type Phase = 'idle' | 'type' | 'parse' | 'spec' | 'sim' | 'done';

const FLOW = ['NL', 'Spec', 'Sim', 'Results'] as const;

function phaseFlow(phase: Phase): number {
  if (phase === 'idle' || phase === 'type') return -1;
  if (phase === 'parse') return 0;
  if (phase === 'spec') return 1;
  if (phase === 'sim') return 2;
  return 3;
}

export function LandingDemo() {
  const reduced = usePrefersReducedMotion();
  const [activeId, setActiveId] = useState(DEMOS[0].id);
  const [phase, setPhase] = useState<Phase>(reduced ? 'done' : 'idle');
  const [typed, setTyped] = useState(reduced ? DEMOS[0].text : '');
  const [cycle, setCycle] = useState(0);
  const [showChart, setShowChart] = useState(reduced);
  const [rows, setRows] = useState(reduced ? 4 : 0);
  const [blotterN, setBlotterN] = useState(reduced ? 4 : 0);
  const [auto, setAuto] = useState(!reduced);
  const [runToken, setRunToken] = useState(0);

  const demo = useMemo(
    () => DEMOS.find((d) => d.id === activeId) ?? DEMOS[0],
    [activeId],
  );

  const done = phase === 'done';
  const ret = useCountUp(demo.ret, { active: done || showChart, decimals: 1, duration: 1000, reduced });
  const sharpe = useCountUp(demo.sharpe, { active: done, decimals: 2, duration: 900, reduced });
  const trades = useCountUp(demo.trades, { active: done, duration: 900, reduced });
  const win = useCountUp(demo.win, { active: done, duration: 900, reduced });
  const flow = phaseFlow(phase);

  const startRun = useCallback(
    (id: string, fromUser = false) => {
      setActiveId(id);
      setAuto(!fromUser);
      setRunToken((t) => t + 1);
    },
    [],
  );

  useEffect(() => {
    if (reduced) {
      const d = DEMOS.find((x) => x.id === activeId) ?? DEMOS[0];
      setTyped(d.text);
      setShowChart(true);
      setRows(4);
      setBlotterN(4);
      setPhase('done');
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    const d = DEMOS.find((x) => x.id === activeId) ?? DEMOS[0];

    async function play() {
      setCycle((c) => c + 1);
      setPhase('idle');
      setTyped('');
      setShowChart(false);
      setRows(0);
      setBlotterN(0);
      await wait(280);

      setPhase('type');
      for (let i = 1; i <= d.text.length; i++) {
        if (cancelled) return;
        setTyped(d.text.slice(0, i));
        await wait(i < 10 ? 22 : 11);
      }
      await wait(260);

      setPhase('parse');
      await wait(520);
      setPhase('spec');
      for (let i = 1; i <= 4; i++) {
        if (cancelled) return;
        setRows(i);
        await wait(140);
      }
      await wait(360);

      setPhase('sim');
      setShowChart(true);
      await wait(1600);

      for (let i = 1; i <= d.blotter.length; i++) {
        if (cancelled) return;
        setBlotterN(i);
        await wait(220);
      }

      setPhase('done');
      await wait(3800);

      if (!cancelled && auto) {
        const idx = DEMOS.findIndex((x) => x.id === activeId);
        const next = DEMOS[(idx + 1) % DEMOS.length];
        setActiveId(next.id);
        setRunToken((t) => t + 1);
      }
    }

    play();
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [activeId, auto, reduced, runToken]);

  return (
    <section className="demo-lab in-view" id="demo">
      <div className="section-head demo-head">
        <p className="eyebrow">Live demo</p>
        <h2>Watch a strategy become a backtest.</h2>
        <p className="section-lede">
          Pick an example. Quantify types the idea, builds a validated spec, simulates fills with
          next-open execution, then surfaces equity, risk, and a sample blotter — no chat, no code
          sandbox.
        </p>
      </div>

      <div className="demo-chips" role="tablist" aria-label="Demo strategies">
        {DEMOS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={d.id === activeId}
            className={`chip demo-chip ${d.id === activeId ? 'active' : ''}`}
            onClick={() => startRun(d.id, true)}
          >
            {d.label}
          </button>
        ))}
        <button type="button" className="chip demo-chip ghost-chip" onClick={() => startRun(activeId, true)}>
          Replay
        </button>
      </div>

      <div className={`demo-console phase-${phase}`}>
        <div className="demo-console-top">
          <span className="mono">quantify · interactive demo</span>
          <span className="demo-status">
            <i />
            {phase === 'sim'
              ? 'simulating fills'
              : phase === 'parse' || phase === 'spec'
                ? 'building spec'
                : phase === 'type'
                  ? 'capturing intent'
                  : phase === 'done'
                    ? 'run complete'
                    : 'ready'}
          </span>
        </div>

        <div className="demo-console-grid">
          <div className="demo-left">
            <div className={`product-prompt ${phase === 'type' ? 'typing' : ''}`}>
              <span>Natural language</span>
              <p className="prompt-type">
                {typed}
                {(phase === 'type' || phase === 'idle') && <i className="caret" />}
              </p>
            </div>

            <div className="product-flow" aria-hidden="true">
              {FLOW.map((step, i) => (
                <span key={step} className="flow-cluster">
                  {i > 0 ? (
                    <span className={`flow-arrow ${flow >= i ? 'on' : ''} ${flow === i ? 'passing' : ''}`}>
                      →
                    </span>
                  ) : null}
                  <span
                    className={`flow-step ${flow >= i ? 'on' : ''} ${flow === i ? 'current' : ''}`}
                  >
                    {step}
                  </span>
                </span>
              ))}
            </div>

            <div className={`product-chart ${showChart ? 'drawn' : 'idle'}`}>
              <header>
                <div>
                  <small>Equity · sample_data.csv</small>
                  <strong>{showChart ? `+${ret.toFixed(1)}%` : '—'}</strong>
                </div>
                <div className="product-meta mono">
                  <span className={`meta-tick ${showChart ? 'on' : ''}`}>
                    Sharpe {done ? sharpe.toFixed(2) : '—'}
                  </span>
                  <span className={`meta-tick ${showChart ? 'on' : ''}`}>DD {demo.dd}%</span>
                </div>
              </header>
              <svg key={`${demo.id}-${cycle}`} viewBox="0 0 460 150" preserveAspectRatio="none">
                <defs>
                  <linearGradient id={`demoFill-${demo.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g className="chart-grid">
                  <line x1="0" y1="37" x2="460" y2="37" />
                  <line x1="0" y1="75" x2="460" y2="75" />
                  <line x1="0" y1="112" x2="460" y2="112" />
                </g>
                {showChart ? (
                  <>
                    <path className="fill" d={demo.fill} style={{ fill: `url(#demoFill-${demo.id})` }} />
                    <path className="line" id={`demoLine-${demo.id}-${cycle}`} d={demo.equity} />
                    <circle r="4.5" fill={ACCENT} className="chart-dot">
                      <animateMotion dur="5s" repeatCount="indefinite" rotate="auto">
                        <mpath href={`#demoLine-${demo.id}-${cycle}`} />
                      </animateMotion>
                    </circle>
                  </>
                ) : (
                  <g className="chart-waiting">
                    <line x1="20" y1="120" x2="440" y2="120" />
                    <text x="230" y="78" textAnchor="middle">
                      waiting for simulation…
                    </text>
                  </g>
                )}
              </svg>
            </div>
          </div>

          <aside className="demo-right">
            <div className="side-block">
              <small>Parsed specification</small>
              {[
                { label: 'Universe', value: demo.asset, need: 1 },
                { label: 'Entry', value: demo.entry, need: 2 },
                { label: 'Exit', value: demo.exit, need: 3 },
                { label: 'Risk', value: demo.risk, need: 4 },
                { label: 'Execution', value: 'Close signal → next open', need: 5 },
                { label: 'Costs', value: 'Commission 0.10% · Slip 0.05%', need: 5 },
              ].map((row, i) => {
                const visible =
                  (row.need <= 4 && rows >= row.need) ||
                  (row.need === 5 && (done || blotterN > 0));
                return (
                  <div
                    key={row.label}
                    className={`side-row ${visible ? 'in' : ''}`}
                    style={{ ['--i' as string]: i }}
                  >
                    <span>{row.label}</span>
                    <span>{row.value}</span>
                  </div>
                );
              })}
            </div>

            <div className="demo-kpi-row">
              <div className={done ? 'in' : ''}>
                <small>Return</small>
                <strong className="pos">+{ret.toFixed(1)}%</strong>
              </div>
              <div className={done ? 'in' : ''}>
                <small>Trades</small>
                <strong>{Math.round(trades)}</strong>
              </div>
              <div className={done ? 'in' : ''}>
                <small>Win</small>
                <strong>{Math.round(win)}%</strong>
              </div>
            </div>

            <div className="demo-blotter">
              <small>Sample blotter</small>
              <div className="blotter-head mono">
                <span>Date</span>
                <span>Side</span>
                <span>Price</span>
                <span>PnL</span>
              </div>
              {demo.blotter.map((row, i) => (
                <div
                  key={`${demo.id}-${row.t}-${row.side}`}
                  className={`blotter-row ${blotterN > i ? 'in' : ''}`}
                  style={{ ['--i' as string]: i }}
                >
                  <span className="mono">{row.t}</span>
                  <span className={row.side === 'BUY' ? 'pos' : 'neg'}>{row.side}</span>
                  <span className="mono">{row.px}</span>
                  <span className={`mono ${row.pnl.startsWith('+') ? 'pos' : row.pnl.startsWith('−') || row.pnl.startsWith('-') ? 'neg' : ''}`}>
                    {row.pnl}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className="demo-console-foot">
          <p className="mono">
            Deterministic engine · no arbitrary code execution · look-ahead safe
          </p>
          <Link className="btn primary" to="/app">
            Run this in workspace
          </Link>
        </div>
      </div>
    </section>
  );
}
