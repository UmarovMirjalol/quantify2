import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { DebugBar, IndicatorSeries, Marker, PriceBar } from '../types';

const UP = '#4fd6a0';
const DOWN = '#ff6b7a';
const MUTED = '#9098a3';
const GRID = 'rgba(255,255,255,0.04)';
const BORDER = 'rgba(255,255,255,0.06)';
const OVERLAY_COLORS = ['#7aa2ff', '#f0c14a', '#c084fc', '#38bdf8', '#fb923c', '#a3e635', '#f472b6', '#94a3b8'];
const PANE_COLORS = ['#c084fc', '#38bdf8', '#f0c14a', '#fb923c'];

function toChartTime(iso: string): Time {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    // Fall back to business-day string when parse fails.
    return iso.slice(0, 10) as Time;
  }
  // Daily bars at midnight stay as YYYY-MM-DD so the axis stays clean.
  const d = new Date(ms);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}` as Time;
  }
  return Math.floor(ms / 1000) as UTCTimestamp;
}

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

type LegendItem = { label: string; color: string; pane: 'overlay' | 'pane' };

export function TradingChart({
  prices,
  markers,
  indicators = [],
  debugBars = [],
}: {
  prices: PriceBar[];
  markers: Marker[];
  indicators?: IndicatorSeries[];
  debugBars?: DebugBar[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [hud, setHud] = useState<{ o: number; h: number; l: number; c: number; v?: number } | null>(null);
  const [debug, setDebug] = useState<DebugBar | null>(null);
  const [legend, setLegend] = useState<LegendItem[]>([]);

  const hasVolume = useMemo(() => prices.some((p) => (p.volume ?? 0) > 0), [prices]);
  const overlays = useMemo(() => indicators.filter((s) => s.pane === 'overlay'), [indicators]);
  const panes = useMemo(() => indicators.filter((s) => s.pane === 'pane'), [indicators]);
  const debugByTime = useMemo(() => {
    const map = new Map<string, DebugBar>();
    for (const row of debugBars) map.set(String(toChartTime(row.date)), row);
    return map;
  }, [debugBars]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || prices.length === 0) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: MUTED,
        fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(79,214,160,0.35)', width: 1, style: 2, labelBackgroundColor: '#1a222c' },
        horzLine: { color: 'rgba(79,214,160,0.35)', width: 1, style: 2, labelBackgroundColor: '#1a222c' },
      },
      rightPriceScale: {
        borderColor: BORDER,
        scaleMargins: { top: 0.08, bottom: hasVolume ? 0.22 : 0.06 },
      },
      timeScale: {
        borderColor: BORDER,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    candleRef.current = candles;

    const candleData = prices.map((p) => ({
      time: toChartTime(p.date),
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    candles.setData(candleData);

    if (hasVolume) {
      const volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      });
      chart.priceScale('vol').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
        borderVisible: false,
      });
      volume.setData(
        prices.map((p, i) => {
          const prev = i > 0 ? prices[i - 1].close : p.open;
          const up = p.close >= prev;
          return {
            time: toChartTime(p.date),
            value: p.volume ?? 0,
            color: up ? 'rgba(79,214,160,0.35)' : 'rgba(255,107,122,0.35)',
          };
        }),
      );
    }

    const nextLegend: LegendItem[] = [];
    overlays.forEach((series, i) => {
      const color = OVERLAY_COLORS[i % OVERLAY_COLORS.length];
      const line = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: series.label,
      });
      const data = series.values
        .map((v, idx) =>
          v == null || !Number.isFinite(v)
            ? null
            : { time: toChartTime(prices[idx].date), value: v },
        )
        .filter((x): x is { time: Time; value: number } => x != null);
      line.setData(data);
      nextLegend.push({ label: series.label, color, pane: 'overlay' });
    });

    if (panes.length) {
      const paneApi = chart.addPane(true);
      paneApi.setStretchFactor(0.35);
      panes.forEach((series, i) => {
        const color = PANE_COLORS[i % PANE_COLORS.length];
        const line = paneApi.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: series.label,
        });
        const data = series.values
          .map((v, idx) =>
            v == null || !Number.isFinite(v)
              ? null
              : { time: toChartTime(prices[idx].date), value: v },
          )
          .filter((x): x is { time: Time; value: number } => x != null);
        line.setData(data);
        nextLegend.push({ label: series.label, color, pane: 'pane' });
      });
    }

    const markerPayload: SeriesMarker<Time>[] = markers
      .map((m) => {
        const entry = m.type === 'entry';
        return {
          time: toChartTime(m.date),
          position: entry ? 'belowBar' : 'aboveBar',
          shape: entry ? 'arrowUp' : 'arrowDown',
          color: entry ? UP : DOWN,
          text: entry ? 'B' : 'S',
        } as SeriesMarker<Time>;
      })
      // Markers must be sorted by time ascending.
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));
    createSeriesMarkers(candles, markerPayload);

    setLegend(nextLegend);
    const last = prices[prices.length - 1];
    setHud({ o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume });
    setDebug(debugByTime.get(String(toChartTime(last.date))) ?? debugBars[debugBars.length - 1] ?? null);

    const onMove = (param: MouseEventParams) => {
      if (!param.time || !param.seriesData.size) return;
      const bar = param.seriesData.get(candles) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      if (!bar) return;
      const idx = prices.findIndex((p) => toChartTime(p.date) === param.time);
      setHud({
        o: bar.open,
        h: bar.high,
        l: bar.low,
        c: bar.close,
        v: idx >= 0 ? prices[idx].volume : undefined,
      });
      setDebug(debugByTime.get(String(param.time)) ?? null);
    };
    chart.subscribeCrosshairMove(onMove);

    chart.timeScale().fitContent();

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
    };
  }, [prices, markers, overlays, panes, hasVolume, debugByTime, debugBars]);

  if (!prices.length) {
    return <div className="empty-state">No price series for this run.</div>;
  }

  const height = panes.length ? 460 : 380;

  return (
    <div className="tv-chart">
      <div className="tv-chart__hud" aria-live="polite">
        {hud ? (
          <>
            <span>
              O <strong className="mono">{fmtPrice(hud.o)}</strong>
            </span>
            <span>
              H <strong className="mono">{fmtPrice(hud.h)}</strong>
            </span>
            <span>
              L <strong className="mono">{fmtPrice(hud.l)}</strong>
            </span>
            <span>
              C{' '}
              <strong className={`mono ${hud.c >= hud.o ? 'up' : 'down'}`}>{fmtPrice(hud.c)}</strong>
            </span>
            {hud.v != null && hud.v > 0 ? (
              <span>
                Vol <strong className="mono">{hud.v.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
              </span>
            ) : null}
          </>
        ) : null}
        {legend.length ? (
          <div className="tv-chart__legend">
            {legend.map((item) => (
              <span key={`${item.pane}-${item.label}`} className="tv-chart__legend-item">
                <i style={{ background: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="tv-chart__canvas" ref={wrapRef} style={{ height }} />
      {debug ? (
        <div className="tv-chart__debug" aria-live="polite">
          <div className="tv-chart__debug-flags">
            <span className={debug.entry ? 'on entry' : ''}>ENTRY {debug.entry ? '●' : '○'}</span>
            <span className={debug.exit ? 'on exit' : ''}>EXIT {debug.exit ? '●' : '○'}</span>
            {debug.note ? <span className="hint">{debug.note}</span> : null}
          </div>
          {Object.keys(debug.indicators).length ? (
            <dl className="tv-chart__debug-inds">
              {Object.entries(debug.indicators).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className="mono">{value == null ? '—' : fmtPrice(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="hint">Move the crosshair to inspect signals and indicator values on each bar.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
