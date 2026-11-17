import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listActivity, type ActivityItem } from '../utils/activityLog';

function ago(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>(() => listActivity());

  useEffect(() => {
    const sync = () => setItems(listActivity());
    window.addEventListener('quantify-activity', sync);
    return () => window.removeEventListener('quantify-activity', sync);
  }, []);

  if (!items.length) return null;

  return (
    <div className="activity-feed">
      <p className="activity-feed__label">Lately</p>
      <ul>
        {items.slice(0, 6).map((a) => (
          <li key={a.id}>
            {a.href ? (
              <Link to={a.href}>{a.label}</Link>
            ) : (
              <span>{a.label}</span>
            )}
            <small className="mono">{ago(a.at)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
