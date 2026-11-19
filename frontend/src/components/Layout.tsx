import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useDensity } from '../hooks/useDensity';
import { CommandHint, CommandPalette } from './CommandPalette';
import { ActivityFeed } from './ActivityFeed';
import { CompareStrip } from './CompareStrip';
import { FavoritesRail } from './FavoritesRail';
import { ToastHost } from './ToastHost';
import { getAccount } from '../services/session';
import type { HealthStatus } from '../types';
import { isPro, readCachedEntitlements, refreshEntitlements } from '../utils/entitlements';

interface Props {
  health: HealthStatus | null;
}

function Icon({ d }: { d: string }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV: { title: string; items: { to: string; label: string; icon: string }[] }[] = [
  {
    title: 'Build',
    items: [
      { to: '/app', label: 'New Backtest', icon: 'M12 3v18M5 10l7-7 7 7M5 21h14' },
      { to: '/code', label: 'Python', icon: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16' },
      { to: '/portfolio', label: 'Portfolio', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
      { to: '/history', label: 'Results', icon: 'M4 6h16M4 12h16M4 18h10' },
      { to: '/forward', label: 'Forward tests', icon: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
      { to: '/paper', label: 'Paper desk', icon: 'M4 4h16v4H4zM4 10h10v10H4zM16 14h4v6h-4z' },
      { to: '/desk', label: 'Morning desk', icon: 'M4 6h16M4 12h10M4 18h16M16 12h4' },
      { to: '/book', label: 'Research book', icon: 'M4 19h16M6 17V7l6-3 6 3v10' },
    ],
  },
  {
    title: 'Explore',
    items: [
      { to: '/check', label: 'Guru check', icon: 'M9 12l2 2 4-4M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z' },
      {
        to: '/leaderboard',
        label: 'Leaderboard',
        icon: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3',
      },
      {
        to: '/whatif',
        label: 'What if…',
        icon: 'M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.8c0 4.9 10 2.6 10 7.6 0 2.3-2.2 3.6-5 3.6s-5-1.2-5-3.2',
      },
      { to: '/screener', label: 'Screener', icon: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5' },
      { to: '/discover', label: 'Discover', icon: 'M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z' },
      {
        to: '/farm',
        label: 'Farm',
        icon: 'M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6',
      },
      {
        to: '/matrix',
        label: 'Matrix',
        icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
      },
      {
        to: '/data-health',
        label: 'Data health',
        icon: 'M4 19h16M6 16V9M10 16V5M14 16v-4M18 16V7',
      },
      { to: '/tools', label: 'Tools', icon: 'M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M8 15h2M12 15h2M16 11v6' },
    ],
  },
  {
    title: 'Learn',
    items: [
      { to: '/playbook', label: 'Playbook', icon: 'M4 5h16v14H4zM8 9h8M8 13h5' },
      { to: '/guide', label: 'Guide', icon: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h4' },
      {
        to: '/research',
        label: 'Research',
        icon: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 15h9',
      },
      { to: '/archive', label: 'Archive', icon: 'M4 7h16v12H4zM8 3h8v4H8z' },
      { to: '/pricing', label: 'Pricing', icon: 'M12 3v18M8 8h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7' },
      { to: '/about', label: 'About', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01' },
    ],
  },
  {
    title: 'You',
    items: [
      {
        to: '/settings',
        label: 'Settings',
        icon: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM4 12h2M18 12h2M12 4v2M12 18v2M6.5 6.5l1.4 1.4M16.1 16.1l1.4 1.4M6.5 17.5l1.4-1.4M16.1 7.9l1.4-1.4',
      },
      { to: '/account', label: 'Account', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
      { to: '/pricing', label: 'Upgrade', icon: 'M5 12h14M12 5l7 7-7 7' },
    ],
  },
];

export function Layout({ children, health }: React.PropsWithChildren<Props>) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const llmOn = Boolean(health?.llm_enabled);
  const [username, setUsername] = useState(() => getAccount()?.username ?? null);
  const [pro, setPro] = useState(() => isPro(readCachedEntitlements()));
  const { density, toggle: toggleDensity } = useDensity();

  useEffect(() => {
    const sync = () => setUsername(getAccount()?.username ?? null);
    window.addEventListener('quantify-account', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('quantify-account', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    const sync = () => setPro(isPro(readCachedEntitlements()));
    window.addEventListener('quantify-entitlements', sync);
    void refreshEntitlements()
      .then((e) => setPro(isPro(e)))
      .catch(() => undefined);
    return () => window.removeEventListener('quantify-entitlements', sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (isLanding) {
    return (
      <div className="app-shell landing-mode">
        {children}
        <CommandPalette />
        <ToastHost />
      </div>
    );
  }

  return (
    <div className="app-shell">
      {open ? <div className="backdrop" onClick={() => setOpen(false)} /> : null}

      <aside id="app-sidebar" className={`sidebar ${open ? 'open' : ''}`}>
        <button type="button" className="sidebar-close" aria-label="Close menu" onClick={() => setOpen(false)}>
          ×
        </button>
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark brand-mark-lg" aria-hidden="true">
            <img src="/logo.svg" width={28} height={28} alt="" />
          </span>
          <span className="brand-text">
            <span className="brand-name">
              Quantify
              {pro ? <span className="brand-pro">Pro</span> : null}
            </span>
            <span className="brand-tag">Quant research</span>
          </span>
        </Link>

        <div className="sidebar-cmd">
          <CommandHint />
        </div>
        <FavoritesRail />
        <ActivityFeed />

        <nav className="nav" onClick={() => setOpen(false)}>
          {NAV.map((group) => (
            <div className="nav-group" key={group.title}>
              <p className="nav-group-title">{group.title}</p>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/app'}>
                  <Icon d={item.icon} />
                  {item.to === '/account' ? (username ?? 'Sign in') : item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button type="button" className="density-toggle" onClick={toggleDensity} title="Toggle compact density">
            Density · {density === 'compact' ? 'compact' : 'comfy'}
          </button>
          <div className="mode-pill" data-llm={llmOn ? 'true' : 'false'}>
            <span className="mode-dot" />
            {llmOn ? `LLM · ${health?.llm_model}` : 'Built-in parser'}
          </div>
          <p className="sidebar-caption">Signal at close → next open</p>
        </div>
      </aside>

      <div className="app-stage">
        <div className="mobile-top">
          <button
            type="button"
            className="btn ghost"
            aria-expanded={open}
            aria-controls="app-sidebar"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
          <Link to="/" className="brand" style={{ padding: 0 }}>
            <span className="brand-mark brand-mark-lg" aria-hidden="true">
              <img src="/logo.svg" width={28} height={28} alt="" />
            </span>
            <span className="brand-name">Quantify</span>
          </Link>
          <CommandHint />
        </div>
        <CompareStrip />
        <main key={location.pathname} className="main main-page">
          {children}
        </main>
      </div>
      <CommandPalette />
      <ToastHost />
    </div>
  );
}
