import { useState } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';

function NumField({
  label,
  value,
  onChange,
  step = 'any',
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  suffix?: string;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {suffix ? <small className="hint"> {suffix}</small> : null}
      </span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
    </label>
  );
}

function Out({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="tool-out">
      <span>{label}</span>
      <strong className={tone ?? ''}>{value}</strong>
    </div>
  );
}

const ok = (...vals: number[]) => vals.every((v) => Number.isFinite(v));
const money = (v: number) =>
  Number.isFinite(v) ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—';
const pctText = (v: number, d = 2) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');

function PositionSize() {
  const [account, setAccount] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(95);
  const [target, setTarget] = useState(110);

  const perShare = Math.abs(entry - stop);
  const dollarRisk = (account * riskPct) / 100;
  const units = ok(perShare, dollarRisk) && perShare > 0 ? dollarRisk / perShare : NaN;
  const value = units * entry;
  const r = ok(target) && perShare > 0 ? Math.abs(target - entry) / perShare : NaN;
  const short = stop > entry;

  return (
    <section className="panel tool-card">
      <h2>Position size</h2>
      <p className="note">How much to buy so that hitting the stop loses exactly your chosen share of the account.</p>
      <div className="tool-grid">
        <NumField label="Account" value={account} onChange={setAccount} suffix="$" />
        <NumField label="Risk per trade" value={riskPct} onChange={setRiskPct} suffix="%" />
        <NumField label="Entry price" value={entry} onChange={setEntry} />
        <NumField label="Stop price" value={stop} onChange={setStop} />
        <NumField label="Target price" value={target} onChange={setTarget} suffix="optional" />
      </div>
      <div className="tool-outs">
        <Out label={short ? 'Units to short' : 'Units to buy'} value={Number.isFinite(units) ? units.toFixed(units < 10 ? 4 : 0) : '—'} />
        <Out label="Position value" value={money(value)} />
        <Out label="Share of account" value={pctText(value / account, 1)} tone={value > account ? 'neg' : undefined} />
        <Out label="Loss at stop" value={money(dollarRisk)} tone="neg" />
        <Out label="Reward : risk" value={Number.isFinite(r) ? `${r.toFixed(2)} R` : '—'} />
        <Out label="Profit at target" value={money(units * Math.abs(target - entry))} tone="pos" />
      </div>
      {value > account ? <p className="note neg">The position is larger than the account: this needs leverage, or a wider risk budget is unrealistic.</p> : null}
    </section>
  );
}

function RiskReward() {
  const [r, setR] = useState(2);
  const [winRate, setWinRate] = useState(45);
  const breakeven = 1 / (1 + r);
  const w = winRate / 100;
  const expectancy = w * r - (1 - w);

  return (
    <section className="panel tool-card">
      <h2>Win rate vs reward : risk</h2>
      <p className="note">The win rate a strategy needs to break even, and what you make per unit of risk.</p>
      <div className="tool-grid">
        <NumField label="Reward : risk" value={r} onChange={setR} suffix="R" />
        <NumField label="Your win rate" value={winRate} onChange={setWinRate} suffix="%" />
      </div>
      <div className="tool-outs">
        <Out label="Break-even win rate" value={pctText(breakeven, 1)} />
        <Out label="Expectancy per trade" value={Number.isFinite(expectancy) ? `${expectancy >= 0 ? '+' : ''}${expectancy.toFixed(2)} R` : '—'} tone={expectancy >= 0 ? 'pos' : 'neg'} />
        <Out label="Over 100 trades at 1% risk" value={Number.isFinite(expectancy) ? `${expectancy >= 0 ? '+' : ''}${(expectancy * 100).toFixed(0)}%` : '—'} tone={expectancy >= 0 ? 'pos' : 'neg'} />
      </div>
    </section>
  );
}

function Kelly() {
  const [winRate, setWinRate] = useState(55);
  const [avgWin, setAvgWin] = useState(3);
  const [avgLoss, setAvgLoss] = useState(2);
  const w = winRate / 100;
  const b = avgWin / avgLoss;
  const kelly = w - (1 - w) / b;

  return (
    <section className="panel tool-card">
      <h2>Kelly fraction</h2>
      <p className="note">
        The bet size that maximizes long-run growth if your stats are exact. They never are, so most traders use half
        Kelly or less.
      </p>
      <div className="tool-grid">
        <NumField label="Win rate" value={winRate} onChange={setWinRate} suffix="%" />
        <NumField label="Average win" value={avgWin} onChange={setAvgWin} suffix="%" />
        <NumField label="Average loss" value={avgLoss} onChange={setAvgLoss} suffix="%" />
      </div>
      <div className="tool-outs">
        <Out label="Full Kelly" value={pctText(Math.max(0, kelly), 1)} tone={kelly > 0 ? 'pos' : 'neg'} />
        <Out label="Half Kelly" value={pctText(Math.max(0, kelly / 2), 1)} />
        <Out label="Payoff ratio" value={Number.isFinite(b) ? b.toFixed(2) : '—'} />
      </div>
      {kelly <= 0 && Number.isFinite(kelly) ? <p className="note neg">No edge: with these numbers the right size is zero.</p> : null}
    </section>
  );
}

function Compound() {
  const [start, setStart] = useState(10000);
  const [monthly, setMonthly] = useState(500);
  const [rate, setRate] = useState(10);
  const [years, setYears] = useState(20);

  const rows: { year: number; value: number; paid: number }[] = [];
  const m = Math.pow(1 + rate / 100, 1 / 12) - 1;
  let value = start;
  let paid = start;
  const span = Math.min(60, Math.max(0, Math.round(years)));
  for (let y = 1; y <= span; y += 1) {
    for (let k = 0; k < 12; k += 1) {
      value = value * (1 + m) + monthly;
      paid += monthly;
    }
    if (y % 5 === 0 || y === span) rows.push({ year: y, value, paid });
  }

  return (
    <section className="panel tool-card">
      <h2>Compound growth</h2>
      <p className="note">What a starting amount plus monthly contributions grows to at a steady yearly return.</p>
      <div className="tool-grid">
        <NumField label="Start" value={start} onChange={setStart} suffix="$" />
        <NumField label="Monthly contribution" value={monthly} onChange={setMonthly} suffix="$" />
        <NumField label="Yearly return" value={rate} onChange={setRate} suffix="%" />
        <NumField label="Years" value={years} onChange={setYears} step="1" />
      </div>
      <div className="tool-outs">
        <Out label="Final value" value={money(value)} tone="pos" />
        <Out label="You put in" value={money(paid)} />
        <Out label="Growth" value={money(value - paid)} tone="pos" />
      </div>
      {rows.length ? (
        <table className="data-table compact">
          <thead>
            <tr>
              <th>Year</th>
              <th>Value</th>
              <th>Put in</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year}>
                <td className="mono">{r.year}</td>
                <td className="mono">{money(r.value)}</td>
                <td className="mono">{money(r.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function Recovery() {
  const [loss, setLoss] = useState(30);
  const need = loss < 100 ? 1 / (1 - loss / 100) - 1 : NaN;
  const marks = [10, 20, 30, 50, 75, 90];

  return (
    <section className="panel tool-card">
      <h2>Drawdown recovery</h2>
      <p className="note">Losses compound against you: the gain needed to get back grows faster than the loss.</p>
      <div className="tool-grid">
        <NumField label="Drawdown" value={loss} onChange={setLoss} suffix="%" />
      </div>
      <div className="tool-outs">
        <Out label="Gain needed to recover" value={pctText(need, 1)} tone="neg" />
      </div>
      <div className="recovery-row">
        {marks.map((d) => (
          <span key={d} className="mono">
            −{d}% → +{((1 / (1 - d / 100) - 1) * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </section>
  );
}

export function ToolsPage() {
  usePageMeta(
    'Trading calculators — Quantify',
    'Free position size, reward-to-risk, Kelly, compound growth and drawdown recovery calculators.',
  );
  return (
    <div className="results tools">
      <div className="page-header">
        <div>
          <p className="eyebrow">Calculators</p>
          <h1>Tools</h1>
          <p className="lede">Position sizing and the arithmetic of risk, all computed in your browser.</p>
        </div>
      </div>
      <div className="tools-grid">
        <PositionSize />
        <RiskReward />
        <Kelly />
        <Recovery />
        <Compound />
      </div>
    </div>
  );
}
