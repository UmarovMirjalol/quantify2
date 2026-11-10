import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { getAccount } from '../services/session';
import type { HealthStatus } from '../types';

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

export function Layout({ children, health }: React.PropsWithChildren<Props>) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const llmOn = Boolean(health?.llm_enabled);
  const [username, setUsername] = useState(() => getAccount()?.username ?? null);

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
    return <div className="app-shell landing-mode">{children}</div>;
  }

  return (
    <div className="app-shell">
      {open ? <div className="backdrop" onClick={() => setOpen(false)} /> : null}

      <aside id="app-sidebar" className={`sidebar ${open ? 'open' : ''}`}>
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark brand-mark-lg" aria-hidden="true">
            <img src="/logo.svg" width={28} height={28} alt="" />
          </span>
          <span className="brand-text">
            <span className="brand-name">Quantify</span>
            <span className="brand-tag">Quant research</span>
          </span>
        </Link>

        <nav className="nav" onClick={() => setOpen(false)}>
          <NavLink to="/app" end>
            <Icon d="M12 3v18M5 10l7-7 7 7M5 21h14" />
            New Backtest
          </NavLink>
          <NavLink to="/code">
            <Icon d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
            Python
          </NavLink>
          <NavLink to="/portfolio">
            <Icon d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
            Portfolio
          </NavLink>
          <NavLink to="/screener">
            <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5" />
            Screener
          </NavLink>
          <NavLink to="/discover">
            <Icon d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z" />
            Discover
          </NavLink>
          <NavLink to="/forward">
            <Icon d="M3 17l6-6 4 4 8-8M15 7h6v6" />
            Forward tests
          </NavLink>
          <NavLink to="/tools">
            <Icon d="M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M8 15h2M12 15h2M16 11v6" />
            Tools
          </NavLink>
          <NavLink to="/research">
            <Icon d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 15h9" />
            Research
          </NavLink>
          <NavLink to="/playbook">
            <Icon d="M4 5h16v14H4zM8 9h8M8 13h5" />
            Playbook
          </NavLink>
          <NavLink to="/guide">
            <Icon d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4" />
            Guide
          </NavLink>
          <NavLink to="/history">
            <Icon d="M4 6h16M4 12h16M4 18h10" />
            Results
          </NavLink>
          <NavLink to="/about">
            <Icon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01" />
            About
          </NavLink>
          <NavLink to="/settings">
            <Icon d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM4 12h2M18 12h2M12 4v2M12 18v2M6.5 6.5l1.4 1.4M16.1 16.1l1.4 1.4M6.5 17.5l1.4-1.4M16.1 7.9l1.4-1.4" />
            Settings
          </NavLink>
          <NavLink to="/account">
            <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />
            {username ?? 'Sign in'}
          </NavLink>
        </nav>

        <div className="sidebar-foot">
          <div className="mode-pill" data-llm={llmOn ? 'true' : 'false'}>
            <span className="mode-dot" />
            {llmOn ? `LLM · ${health?.llm_model}` : 'Built-in parser'}
          </div>
          <p className="sidebar-caption">Signal at close → next open</p>
        </div>
      </aside>

      <div>
        <div className="mobile-top">
          <button
            type="button"
            className="btn ghost"
            aria-expanded={open}
            aria-controls="app-sidebar"
            onClick={() => setOpen(true)}
          >
            Menu
          </button>
          <Link to="/" className="brand" style={{ padding: 0 }}>
            <span className="brand-mark brand-mark-lg" aria-hidden="true">
              <img src="/logo.svg" width={28} height={28} alt="" />
            </span>
            <span className="brand-name">Quantify</span>
          </Link>
          <span style={{ width: 52 }} />
        </div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
