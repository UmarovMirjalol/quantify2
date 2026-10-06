import { useEffect, useRef, useState } from 'react';

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'positive' | 'negative';
}

export function KpiCard({ label, value, hint, tone = 'neutral' }: KpiCardProps) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlash(true);
      const id = window.setTimeout(() => setFlash(false), 700);
      return () => window.clearTimeout(id);
    }
  }, [value]);

  return (
    <div className={`kpi-card tone-${tone}${flash ? ' flash' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </div>
  );
}
