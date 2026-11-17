import type { BarsMeta, StrategySpec } from '../types';

export function SessionBadge({
  strategy,
  bars,
}: {
  strategy: StrategySpec;
  bars?: BarsMeta;
}) {
  const session = bars?.session || strategy.session || 'all';
  const tf = strategy.timeframe || bars?.timeframe || '1d';
  const filtered = Boolean(bars?.session_filtered);
  const parts: string[] = [String(tf)];
  if (session === 'rth') parts.push(filtered ? 'RTH filtered' : 'RTH');
  else parts.push('all hours');
  if (bars?.source_bars && bars?.result_bars && bars.source_bars !== bars.result_bars) {
    parts.push(`${bars.source_bars}→${bars.result_bars} bars`);
  } else if (bars?.session_bars) {
    parts.push(`${bars.session_bars} bars`);
  }

  return (
    <span className={`session-badge${session === 'rth' ? ' session-badge--rth' : ''}`} title="Execution session / timeframe">
      {parts.join(' · ')}
    </span>
  );
}
