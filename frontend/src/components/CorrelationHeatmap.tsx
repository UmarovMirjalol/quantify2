import Plot from 'react-plotly.js';

const FONT = 'IBM Plex Sans, system-ui, sans-serif';
const MONO = 'IBM Plex Mono, ui-monospace, monospace';

export function CorrelationHeatmap({
  assets,
  matrix,
}: {
  assets: string[];
  matrix: number[][];
}) {
  if (assets.length < 2) return null;

  return (
    <Plot
      data={[
        {
          z: matrix,
          x: assets,
          y: assets,
          type: 'heatmap',
          colorscale: [
            [0, 'rgb(229,122,132)'],
            [0.5, 'rgb(24,28,34)'],
            [1, 'rgb(79,214,160)'],
          ],
          zmin: -1,
          zmax: 1,
          hovertemplate: '%{y} × %{x}<br>ρ %{z:.2f}<extra></extra>',
          colorbar: {
            thickness: 10,
            tickfont: { size: 10, family: MONO, color: '#5a6270' },
            outlinewidth: 0,
          },
        },
      ]}
      layout={{
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: FONT, color: '#9098a3', size: 11 },
        margin: { t: 8, r: 48, b: 48, l: 64 },
        height: Math.max(260, 40 + assets.length * 36),
        xaxis: {
          tickfont: { size: 10, family: MONO, color: '#9098a3' },
          side: 'bottom',
        },
        yaxis: {
          tickfont: { size: 10, family: MONO, color: '#9098a3' },
          autorange: 'reversed',
        },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  );
}
