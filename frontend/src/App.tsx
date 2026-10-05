import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { ResultsLoader } from './pages/ResultsLoader';
import { SettingsPage } from './pages/SettingsPage';
import { getHealth } from './services/api';
import type { HealthStatus } from './types';
import './App.css';

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    const load = () =>
      getHealth()
        .then(setHealth)
        .catch(() =>
          setHealth({
            status: 'unreachable',
            parser: 'builtin',
            llm_enabled: false,
            llm_model: '',
          }),
        );
    load();
    const id = window.setInterval(load, 15000);
    return () => window.clearInterval(id);
  }, []);

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
