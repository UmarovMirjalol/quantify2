import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AccessGate } from './components/AccessGate';
import { Layout } from './components/Layout';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { PlaybookPage } from './pages/PlaybookPage';
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
  const [apiDown, setApiDown] = useState(false);
  const [authEpoch, setAuthEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setApiDown(false);
      try {
        const h = await Promise.race([
          getHealth(),
          new Promise<never>((_, reject) =>
            window.setTimeout(() => reject(new Error('health timeout')), 8000),
          ),
        ]);
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
          setUnlocked(false);
          setApiDown(true);
          setBootstrapped(true);
        }
      }
    }

    bootstrap();
    const id = window.setInterval(() => {
      getHealth()
        .then((h) => {
          if (cancelled) return;
          setHealth(h);
          setApiDown(false);
          if (h.auth_required && !getAccessToken()) {
            setUnlocked(false);
          }
        })
        .catch(() => {
          if (!cancelled) setApiDown(true);
        });
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [authEpoch]);

  useEffect(() => {
    function onUnauthorized() {
      clearAccessToken();
      setUnlocked(false);
      setAuthEpoch((n) => n + 1);
    }
    window.addEventListener('quantify:unauthorized', onUnauthorized);
    window.addEventListener('quantllm:unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('quantify:unauthorized', onUnauthorized);
      window.removeEventListener('quantllm:unauthorized', onUnauthorized);
    };
  }, []);

  if (!bootstrapped) {
    return (
      <div className="empty-state" style={{ margin: '2rem auto', maxWidth: 420 }}>
        <div className="skeleton-line" style={{ width: '48%', margin: '0 auto 0.85rem' }} />
        Starting Quantify…
      </div>
    );
  }

  if (apiDown) {
    return (
      <div className="empty-state" style={{ margin: '2rem auto', maxWidth: 460 }}>
        <p className="eyebrow">API unreachable</p>
        <h1 style={{ fontSize: '1.35rem' }}>Can’t reach the Quantify backend</h1>
        <p className="lede" style={{ margin: '0.75rem auto' }}>
          Start the API on port 8765, then retry. Local tip:{' '}
          <code className="mono">uvicorn app.main:app --port 8765</code>
        </p>
        <button
          type="button"
          className="btn primary"
          style={{ marginTop: '1rem' }}
          onClick={() => {
            setBootstrapped(false);
            setAuthEpoch((n) => n + 1);
          }}
        >
          Retry connection
        </button>
      </div>
    );
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
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<HomePage health={health} />} />
        <Route path="/playbook" element={<PlaybookPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/results/:id" element={<ResultsLoader />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
