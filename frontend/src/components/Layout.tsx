import { Link, NavLink } from 'react-router-dom';
import type { HealthStatus } from '../types';

interface Props {
  health: HealthStatus | null;
}

export function Layout({ children, health }: React.PropsWithChildren<Props>) {
  const llmOn = Boolean(health?.llm_enabled);
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
          <NavLink to="/settings">LLM</NavLink>
        </nav>
        <div className="mode-badge" data-llm={llmOn ? 'true' : 'false'}>
          {llmOn ? `LLM · ${health?.llm_model}` : 'Built-in parser'}
        </div>
      </header>
      <main className="main">{children}</main>
      <footer className="footer">
        <span>LLM → StrategySpec → custom engine · Signal at close → execute next open</span>
        <span>
          {llmOn ? 'LLM parser active' : 'Connect an LLM key in Settings for freer NLP'}
        </span>
      </footer>
    </div>
  );
}
