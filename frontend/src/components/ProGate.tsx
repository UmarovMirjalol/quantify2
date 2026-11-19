import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Entitlements } from '../services/billingApi';
import { canUse, readCachedEntitlements, refreshEntitlements } from '../utils/entitlements';

/** Soft UI gate — server still enforces 402. */
export function ProGate({
  feature,
  label = 'Pro',
  children,
}: {
  feature: keyof Entitlements['limits'];
  label?: string;
  children?: React.ReactNode;
}) {
  const [ent, setEnt] = useState<Entitlements | null>(() => readCachedEntitlements());

  useEffect(() => {
    void refreshEntitlements()
      .then(setEnt)
      .catch(() => undefined);
    const on = () => setEnt(readCachedEntitlements());
    window.addEventListener('quantify-entitlements', on);
    return () => window.removeEventListener('quantify-entitlements', on);
  }, []);

  if (canUse(ent, feature)) return children ? <>{children}</> : null;

  return (
    <div className="banner warn pro-gate">
      <strong>{label}</strong> — this desk needs Hosted Pro or a self-host license.{' '}
      <Link to="/pricing">Upgrade →</Link>
      {children ? <div style={{ marginTop: '0.75rem', opacity: 0.55, pointerEvents: 'none' }}>{children}</div> : null}
    </div>
  );
}
