import { useState } from 'react';

export type HistoryRange = '1y' | '5y' | '10y' | 'max';

const KEY = 'quantify_history_range';
const OPTIONS: { id: HistoryRange; label: string }[] = [
  { id: '1y', label: '1 year' },
  { id: '5y', label: '5 years' },
  { id: '10y', label: '10 years' },
  { id: 'max', label: 'All history' },
];

export function getHistoryRange(): HistoryRange {
  const saved = localStorage.getItem(KEY);
  return OPTIONS.some((o) => o.id === saved) ? (saved as HistoryRange) : '10y';
}

export function HistoryPicker({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = useState<HistoryRange>(getHistoryRange);
  return (
    <select
      className="history-select"
      aria-label="History to load"
      title="How much daily history to load for a ticker"
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value as HistoryRange;
        localStorage.setItem(KEY, next);
        setValue(next);
      }}
    >
      {OPTIONS.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
