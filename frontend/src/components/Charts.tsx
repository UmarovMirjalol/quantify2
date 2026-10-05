import Plot from 'react-plotly.js';
import type { EquityPoint, Marker, PriceBar } from '../types';

const layoutBase = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'DM Sans, sans-serif', color: '#1a2332', size: 12 },
  margin: { t: 28, r: 24, b: 40, l: 56 },
  xaxis: { gridcolor: 'rgba(26,35,50,0.08)', zeroline: false },
  yaxis: { gridcolor: 'rgba(26,35,50,0.08)', zeroline: false },
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
          line: { color: '#0b6e4f', width: 2 },
          fill: 'tozeroy',
          fillcolor: 'rgba(11,110,79,0.08)',
          name: 'Equity',
        },
      ]}
      layout={{
        ...layoutBase,
        title: { text: 'Equity Curve', font: { size: 14 } },
        yaxis: { ...layoutBase.yaxis, tickprefix: '$', tickformat: ',.0f' },
        height: 320,
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
          line: { color: '#b23a48', width: 1.5 },
          fill: 'tozeroy',
          fillcolor: 'rgba(178,58,72,0.12)',
          name: 'Drawdown %',
        },
      ]}
      layout={{
        ...layoutBase,
        title: { text: 'Drawdown', font: { size: 14 } },
        yaxis: { ...layoutBase.yaxis, ticksuffix: '%', tickformat: '.1f' },
        height: 280,
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
          line: { color: '#1a2332', width: 1.5 },
          name: 'Close',
        },
        {
          x: entries.map((m) => m.date),
          y: entries.map((m) => m.price),
          type: 'scatter',
          mode: 'markers',
          marker: { color: '#0b6e4f', size: 10, symbol: 'triangle-up' },
          name: 'Entry',
        },
        {
          x: exits.map((m) => m.date),
          y: exits.map((m) => m.price),
          type: 'scatter',
          mode: 'markers',
          marker: { color: '#b23a48', size: 10, symbol: 'triangle-down' },
          name: 'Exit',
        },
      ]}
      layout={{
        ...layoutBase,
        title: { text: 'Price with Entry / Exit Markers', font: { size: 14 } },
        height: 360,
        legend: { orientation: 'h', y: 1.12 },
        yaxis: { ...layoutBase.yaxis, tickprefix: '$' },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  );
}
