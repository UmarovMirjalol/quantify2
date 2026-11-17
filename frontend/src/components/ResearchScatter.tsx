type Point = {
  id: string;
  x: number;
  y: number;
  label: string;
  tone?: 'pos' | 'neg' | 'muted';
  r?: number;
};

export function ResearchScatter({
  points,
  xLabel,
  yLabel,
  onSelect,
}: {
  points: Point[];
  xLabel: string;
  yLabel: string;
  onSelect?: (id: string) => void;
}) {
  if (points.length < 2) {
    return <p className="hint">Need at least two points for a scatter.</p>;
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0);
  const padX = (maxX - minX) * 0.08 || 0.1;
  const padY = (maxY - minY) * 0.08 || 0.1;
  const x0 = minX - padX;
  const x1 = maxX + padX;
  const y0 = minY - padY;
  const y1 = maxY + padY;
  const sx = (v: number) => ((v - x0) / (x1 - x0 || 1)) * 100;
  const sy = (v: number) => (1 - (v - y0) / (y1 - y0 || 1)) * 100;
  const zeroX = x0 < 0 && x1 > 0;
  const zeroY = y0 < 0 && y1 > 0;

  return (
    <div className="research-scatter">
      <svg viewBox="0 0 100 70" className="research-scatter__svg" role="img" aria-label={`${yLabel} vs ${xLabel}`}>
        {zeroY ? <line className="axis" x1="0" x2="100" y1={sy(0)} y2={sy(0)} /> : null}
        {zeroX ? <line className="axis" x1={sx(0)} x2={sx(0)} y1="0" y2="70" /> : null}
        {points.map((p) => (
          <circle
            key={p.id}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={p.r ?? 1.8}
            className={`dot ${p.tone ?? 'muted'}`}
            onClick={onSelect ? () => onSelect(p.id) : undefined}
            style={onSelect ? { cursor: 'pointer' } : undefined}
          >
            <title>
              {p.label}: {xLabel} {p.x.toFixed(2)} · {yLabel} {p.y.toFixed(2)}
            </title>
          </circle>
        ))}
      </svg>
      <div className="research-scatter__axis mono hint">
        <span>{xLabel}</span>
        <span>{yLabel}</span>
      </div>
    </div>
  );
}
