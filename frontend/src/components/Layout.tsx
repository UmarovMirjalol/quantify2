import { Link, NavLink } from 'react-router-dom';
import type { HealthStatus } from '../types';

interface Props {
  health: HealthStatus | null;
}

export function Layout({ children, health }: React.PropsWithChildren<Props>) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">QL</span>
          <span className="brand-text">
            QuantLLM
            <small>Backtester</small>
          </span>
        </Link>
        <nav className="nav">
          <NavLink to="/" end>
            New Backtest
          </NavLink>
          <NavLink to="/history">History</NavLink>
        </nav>
        <div className="mode-badge" data-demo={health?.demo_mode ? 'true' : 'false'}>
          {health?.demo_mode ? 'Demo Mode' : `LLM · ${health?.llm_model ?? 'connected'}`}
        </div>
      </header>
      <main className="main">{children}</main>
      <footer className="footer">
        <span>Custom pandas/NumPy engine · Signal at close → execute next open</span>
        <span>Synthetic sample data is labeled — not live market data</span>
      </footer>
    </div>
  );
}
