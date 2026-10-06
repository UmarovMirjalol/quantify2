import { useMemo } from 'react';
import Plot from 'react-plotly.js';
import type { EquityPoint, Marker, PriceBar } from '../types';

const FONT = 'IBM Plex Sans, system-ui, sans-serif';
const MONO = 'IBM Plex Mono, ui-monospace, monospace';

const layoutBase = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: FONT, color: '#9098a3', size: 11 },
  margin: { t: 10, r: 12, b: 34, l: 50 },
  xaxis: {
    gridcolor: 'rgba(255,255,255,0.035)',
    zeroline: false,
    linecolor: 'rgba(255,255,255,0.05)',
    tickfont: { size: 10, family: MONO, color: '#5a6270' },
    showspikes: true,
    spikemode: 'across' as const,
    spikesnap: 'cursor' as const,
    spikecolor: 'rgba(104,217,164,0.3)',
    spikethickness: 1,
  },
  yaxis: {
    gridcolor: 'rgba(255,255,255,0.035)',
    zeroline: false,
    linecolor: 'rgba(255,255,255,0.05)',
    tickfont: { size: 10, family: MONO, color: '#5a6270' },
  },
  hovermode: 'x unified' as const,
  hoverlabel: {
    bgcolor: '#10141a',
    bordercolor: 'rgba(255,255,255,0.1)',
    font: { family: MONO, size: 11, color: '#f2f4f6' },
  },
};

export function EquityChart({ data }: { data: EquityPoint[] }) {
  return (
    <Plot
      data={[
        {
          x: data.map((d) => d.date),
          y: data.map((d) => d.equity),
          type: 'scatter',
          mode: 'lines',
          line: { color: '#68d9a4', width: 1.85 },
          fill: 'tozeroy',
          fillcolor: 'rgba(104,217,164,0.08)',
          name: 'Equity',
          hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
        },
      ]}
      layout={{
        ...layoutBase,
        yaxis: { ...layoutBase.yaxis, tickprefix: '$', tickformat: ',.0f' },
        height: 340,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  );
}

export function DrawdownChart({ data }: { data: EquityPoint[] }) {
  return (
    <Plot
      data={[
        {
          x: data.map((d) => d.date),
          y: data.map((d) => (d.drawdown ?? 0) * 100),
          type: 'scatter',
          mode: 'lines',
          line: { color: '#ff6b7a', width: 1.4 },
          fill: 'tozeroy',
          fillcolor: 'rgba(255,107,122,0.1)',
          name: 'Drawdown',
          hovertemplate: '%{x}<br>%{y:.2f}%<extra></extra>',
        },
      ]}
      layout={{
        ...layoutBase,
        yaxis: { ...layoutBase.yaxis, ticksuffix: '%', tickformat: '.1f' },
        height: 260,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  );
}

export function PriceTradeChart({
  prices,
  markers,
}: {
  prices: PriceBar[];
  markers: Marker[];
}) {
  const entries = markers.filter((m) => m.type === 'entry');
  const exits = markers.filter((m) => m.type === 'exit');

  return (
    <Plot
      data={[
        {
          x: prices.map((p) => p.date),
          y: prices.map((p) => p.close),
          type: 'scatter',
          mode: 'lines',
          line: { color: '#c8d0da', width: 1.35 },
          name: 'Close',
          hovertemplate: '%{x}<br>$%{y:.2f}<extra>Close</extra>',
        },
        {
          x: entries.map((m) => m.date),
          y: entries.map((m) => m.price),
          type: 'scatter',
          mode: 'markers',
          marker: { color: '#68d9a4', size: 9, symbol: 'triangle-up', line: { width: 0 } },
          name: 'Entry',
          hovertemplate: '%{x}<br>$%{y:.2f}<extra>Entry</extra>',
        },
        {
          x: exits.map((m) => m.date),
          y: exits.map((m) => m.price),
          type: 'scatter',
          mode: 'markers',
          marker: { color: '#ff6b7a', size: 9, symbol: 'triangle-down', line: { width: 0 } },
          name: 'Exit',
          hovertemplate: '%{x}<br>$%{y:.2f}<extra>Exit</extra>',
        },
      ]}
      layout={{
        ...layoutBase,
        height: 320,
        legend: {
          orientation: 'h',
          y: 1.12,
          x: 0,
          font: { size: 11, color: '#9aa3b2' },
        },
        yaxis: { ...layoutBase.yaxis, tickprefix: '$' },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  );
}

export function MonthlyReturnsChart({ data }: { data: EquityPoint[] }) {
  const monthly = useMemo(() => {
    if (data.length < 2) return { labels: [] as string[], values: [] as number[] };
    const byMonth = new Map<string, { first: number; last: number }>();
    for (const p of data) {
      const key = p.date.slice(0, 7);
      const cur = byMonth.get(key);
      if (!cur) byMonth.set(key, { first: p.equity, last: p.equity });
      else cur.last = p.equity;
    }
    const labels: string[] = [];
    const values: number[] = [];
    for (const [key, v] of byMonth) {
      if (v.first <= 0) continue;
      labels.push(key);
      values.push(((v.last - v.first) / v.first) * 100);
    }
    return { labels, values };
  }, [data]);

  if (!monthly.labels.length) {
    return <div className="empty-state">Not enough data for monthly returns.</div>;
  }

  return (
    <Plot
      data={[
        {
          x: monthly.labels,
          y: monthly.values,
          type: 'bar',
          marker: {
            color: monthly.values.map((v) => (v >= 0 ? 'rgba(104,217,164,0.75)' : 'rgba(255,107,122,0.75)')),
          },
          name: 'Monthly %',
          hovertemplate: '%{x}<br>%{y:.2f}%<extra></extra>',
        },
      ]}
      layout={{
        ...layoutBase,
        yaxis: { ...layoutBase.yaxis, ticksuffix: '%', tickformat: '.1f', zeroline: true, zerolinecolor: 'rgba(255,255,255,0.12)' },
        height: 260,
        bargap: 0.25,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  );
}

export function ReturnsDistributionChart({ data }: { data: EquityPoint[] }) {
  const returns = useMemo(() => {
    const out: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1].equity;
      if (prev > 0) out.push(((data[i].equity - prev) / prev) * 100);
    }
    return out;
  }, [data]);

  if (returns.length < 5) {
    return <div className="empty-state">Not enough observations for a return distribution.</div>;
  }

  return (
    <Plot
      data={[
        {
          x: returns,
          type: 'histogram',
          nbinsx: 40,
          marker: { color: 'rgba(104,217,164,0.55)', line: { color: 'rgba(104,217,164,0.2)', width: 0.5 } },
          name: 'Daily return %',
          hovertemplate: '%{x:.2f}%<br>count %{y}<extra></extra>',
        },
      ]}
      layout={{
        ...layoutBase,
        xaxis: { ...layoutBase.xaxis, ticksuffix: '%', title: { text: 'Daily return', font: { size: 11, color: '#565e69' } } },
        yaxis: { ...layoutBase.yaxis, title: { text: 'Count', font: { size: 11, color: '#565e69' } } },
        height: 260,
        bargap: 0.05,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  );
}

export function ExposureChart({ data }: { data: EquityPoint[] }) {
  const exposure = useMemo(
    () =>
      data.map((d) => {
        const invested = Math.max(0, d.equity - d.cash);
        return d.equity > 0 ? (invested / d.equity) * 100 : 0;
      }),
    [data],
  );

  return (
    <Plot
      data={[
        {
          x: data.map((d) => d.date),
          y: exposure,
          type: 'scatter',
          mode: 'lines',
          line: { color: '#7aa2ff', width: 1.4 },
          fill: 'tozeroy',
          fillcolor: 'rgba(122,162,255,0.08)',
          name: 'Exposure',
          hovertemplate: '%{x}<br>%{y:.1f}% invested<extra></extra>',
        },
      ]}
      layout={{
        ...layoutBase,
        yaxis: { ...layoutBase.yaxis, ticksuffix: '%', range: [0, 105], tickformat: '.0f' },
        height: 260,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  );
}
