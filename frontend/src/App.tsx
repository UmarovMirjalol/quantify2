import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AccessGate } from './components/AccessGate';
import { Layout } from './components/Layout';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { ResultsLoader } from './pages/ResultsLoader';
import { SettingsPage } from './pages/SettingsPage';
import { getHealth } from './services/api';
import { getAccessToken } from './services/session';
import type { HealthStatus } from './types';
import './App.css';

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    const load = () =>
      getHealth()
        .then((h) => {
          setHealth(h);
          if (!h.auth_required) {
            setUnlocked(true);
          } else if (getAccessToken()) {
            setUnlocked(true);
          }
          setBootstrapped(true);
        })
        .catch(() => {
          setHealth({
            status: 'unreachable',
            parser: 'builtin',
            llm_enabled: false,
            llm_model: '',
            auth_required: false,
          });
          setUnlocked(true);
          setBootstrapped(true);
        });
    load();
    const id = window.setInterval(load, 15000);
    return () => window.clearInterval(id);
  }, []);

  if (!bootstrapped) {
    return <div className="empty-state">Starting QuantLLM…</div>;
  }

  if (health?.auth_required && !unlocked) {
    return <AccessGate onUnlocked={() => setUnlocked(true)} />;
  }

  return (
    <Layout health={health}>
      <Routes>
        <Route path="/" element={<HomePage health={health} />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/results/:id" element={<ResultsLoader />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
