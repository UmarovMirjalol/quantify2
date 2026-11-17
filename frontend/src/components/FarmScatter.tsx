import Plot from 'react-plotly.js';
import type { FarmRow } from '../services/api';

const FONT = 'IBM Plex Sans, system-ui, sans-serif';
const MONO = 'IBM Plex Mono, ui-monospace, monospace';

export function FarmScatter({
  rows,
  onPick,
}: {
  rows: FarmRow[];
  onPick?: (row: FarmRow) => void;
}) {
  const pts = rows.filter((r) => r.sharpe_ratio != null && r.total_return != null);
  if (pts.length < 2) {
    return <p className="hint">Need at least two finished runs for the scatter.</p>;
  }

  const colors = pts.map((r) => {
    const a = r.alpha_vs_hold;
    if (a == null) return 'rgba(152,162,172,0.55)';
    return a >= 0 ? 'rgba(79,214,160,0.85)' : 'rgba(229,122,132,0.8)';
  });
  const sizes = pts.map((r) => {
    const dd = Math.abs(r.max_drawdown ?? 0.2);
    return Math.max(8, Math.min(22, 8 + dd * 40));
  });

  return (
    <div className="farm-scatter">
      <Plot
        data={[
          {
            x: pts.map((r) => (r.total_return ?? 0) * 100),
            y: pts.map((r) => r.sharpe_ratio),
            text: pts.map((r) => `${r.ticker}${r.title ? ` · ${r.title}` : ''}`),
            customdata: pts.map((r) => [
              r.alpha_vs_hold == null ? '—' : `${((r.alpha_vs_hold ?? 0) * 100).toFixed(1)}%`,
              r.max_drawdown == null ? '—' : `${((r.max_drawdown ?? 0) * 100).toFixed(1)}%`,
            ]),
            type: 'scatter',
            mode: 'markers',
            marker: {
              size: sizes,
              color: colors,
              line: { width: 0.5, color: 'rgba(255,255,255,0.15)' },
            },
            hovertemplate:
              '<b>%{text}</b><br>Return %{x:.1f}%<br>Sharpe %{y:.2f}<br>vs hold %{customdata[0]}<br>DD %{customdata[1]}<extra></extra>',
          },
        ]}
        layout={{
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { family: FONT, color: '#9098a3', size: 11 },
          margin: { t: 8, r: 12, b: 40, l: 48 },
          height: 320,
          xaxis: {
            title: { text: 'Total return %', font: { size: 11, color: '#565e69' } },
            gridcolor: 'rgba(255,255,255,0.035)',
            zeroline: true,
            zerolinecolor: 'rgba(255,255,255,0.12)',
            tickfont: { size: 10, family: MONO, color: '#5a6270' },
          },
          yaxis: {
            title: { text: 'Sharpe', font: { size: 11, color: '#565e69' } },
            gridcolor: 'rgba(255,255,255,0.035)',
            zeroline: true,
            zerolinecolor: 'rgba(255,255,255,0.12)',
            tickfont: { size: 10, family: MONO, color: '#5a6270' },
          },
          hoverlabel: {
            bgcolor: '#10141a',
            bordercolor: 'rgba(255,255,255,0.1)',
            font: { family: MONO, size: 11, color: '#f2f4f6' },
          },
        }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: '100%' }}
        useResizeHandler
        onClick={(ev) => {
          const i = ev.points?.[0]?.pointIndex;
          if (i == null || !onPick) return;
          onPick(pts[i]);
        }}
      />
      <p className="hint farm-scatter__legend">
        Green = beat buy &amp; hold · red = lagged · marker size ≈ drawdown. Click a point to pin the ticker.
      </p>
    </div>
  );
}
