import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AccessGate } from './components/AccessGate';
import { Layout } from './components/Layout';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { ResultsLoader } from './pages/ResultsLoader';
import { SettingsPage } from './pages/SettingsPage';
import { getHealth, listDatasets } from './services/api';
import { clearAccessToken, getAccessToken } from './services/session';
import type { HealthStatus } from './types';
import './App.css';

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [authEpoch, setAuthEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const h = await getHealth();
        if (cancelled) return;
        setHealth(h);

        if (!h.auth_required) {
          setUnlocked(true);
          setBootstrapped(true);
          return;
        }

        const token = getAccessToken();
        if (!token) {
          setUnlocked(false);
          setBootstrapped(true);
          return;
        }

        // Validate stored token before unlocking the app
        try {
          await listDatasets();
          if (!cancelled) {
            setUnlocked(true);
            setBootstrapped(true);
          }
        } catch {
          clearAccessToken();
          if (!cancelled) {
            setUnlocked(false);
            setBootstrapped(true);
          }
        }
      } catch {
        if (!cancelled) {
          setHealth({
            status: 'unreachable',
            parser: 'builtin',
            llm_enabled: false,
            llm_model: '',
            auth_required: false,
          });
          setUnlocked(true);
          setBootstrapped(true);
        }
      }
    }

    bootstrap();
    const id = window.setInterval(() => {
      getHealth()
        .then((h) => {
          if (!cancelled) setHealth(h);
        })
        .catch(() => undefined);
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [authEpoch]);

  // Global 401 handler: force re-auth
  useEffect(() => {
    function onUnauthorized() {
      clearAccessToken();
      setUnlocked(false);
      setAuthEpoch((n) => n + 1);
    }
    window.addEventListener('quantllm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('quantllm:unauthorized', onUnauthorized);
  }, []);

  if (!bootstrapped) {
    return <div className="empty-state">Starting QuantLLM…</div>;
  }

  if (health?.auth_required && !unlocked) {
    return (
      <AccessGate
        onUnlocked={() => {
          setUnlocked(true);
          setAuthEpoch((n) => n + 1);
        }}
      />
    );
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
