import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
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

const LogoMark = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 12 L5.5 5 L9 9.5 L14 3"
      stroke="#00f5a0"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function Layout({ children, health }: React.PropsWithChildren<Props>) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const llmOn = Boolean(health?.llm_enabled);

  if (isLanding) {
    return <div className="app-shell landing-mode">{children}</div>;
  }

  return (
    <div className="app-shell">
      {open ? <div className="backdrop" onClick={() => setOpen(false)} /> : null}

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark">
            <LogoMark />
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
          <NavLink to="/history">
            <Icon d="M4 6h16M4 12h16M4 18h10" />
            Results
          </NavLink>
          <NavLink to="/settings">
            <Icon d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM4 12h2M18 12h2M12 4v2M12 18v2M6.5 6.5l1.4 1.4M16.1 16.1l1.4 1.4M6.5 17.5l1.4-1.4M16.1 7.9l1.4-1.4" />
            Settings
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
          <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
            Menu
          </button>
          <Link to="/" className="brand" style={{ padding: 0 }}>
            <span className="brand-mark">
              <LogoMark />
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
