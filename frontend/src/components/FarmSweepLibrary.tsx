import { useEffect, useState } from 'react';
import { listFarmJobs, type FarmJob, type FarmResult } from '../services/api';
import {
  getFarmArchive,
  listFarmArchive,
  removeFarmArchive,
  saveFarmArchive,
  type FarmArchiveEntry,
} from '../utils/farmArchive';
import { toast } from './ToastHost';

type Props = {
  activeJobId?: string | null;
  onOpenResult: (result: FarmResult, meta?: { id: string; label?: string }) => void;
  onResumeJob?: (job: FarmJob) => void;
};

function when(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 16);
  }
}

export function FarmSweepLibrary({ activeJobId, onOpenResult, onResumeJob }: Props) {
  const [serverJobs, setServerJobs] = useState<FarmJob[]>([]);
  const [archive, setArchive] = useState<FarmArchiveEntry[]>(() => listFarmArchive());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function refreshArchive() {
    setArchive(listFarmArchive());
  }

  async function refreshServer() {
    setBusy(true);
    setErr('');
    try {
      const jobs = await listFarmJobs();
      setServerJobs(jobs);
      // Persist finished jobs that have a result and aren't archived yet
      for (const j of jobs) {
        if (j.status === 'done' && j.result && !getFarmArchive(j.id)) {
          saveFarmArchive(j, j.result);
        }
      }
      refreshArchive();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not list farm jobs.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshServer();
    const onStorage = () => refreshArchive();
    window.addEventListener('quantify-farm-archive', onStorage);
    return () => window.removeEventListener('quantify-farm-archive', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeJobId) return;
    const t = window.setInterval(() => void refreshServer(), 4000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId]);

  return (
    <section className="panel farm-library">
      <div className="page-header" style={{ marginBottom: '0.65rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Sweep library</h2>
          <p className="hint" style={{ margin: '0.25rem 0 0' }}>
            Live server jobs (ephemeral) + local archive of finished sweeps you can reopen anytime.
          </p>
        </div>
        <button type="button" className="btn ghost small" disabled={busy} onClick={() => void refreshServer()}>
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {err ? <div className="banner warn">{err}</div> : null}

      <div className="farm-library__cols">
        <div>
          <h3 className="farm-library__h">Server · recent</h3>
          {!serverJobs.length ? (
            <p className="hint">No jobs in memory. Run a farm — they show up here while the API process lives.</p>
          ) : (
            <ul className="farm-library__list">
              {serverJobs.map((j) => (
                <li key={j.id} className={j.id === activeJobId ? 'active' : ''}>
                  <div className="farm-library__row">
                    <div>
                      <strong className="mono">
                        {j.mode || 'farm'} · {j.status}
                      </strong>
                      <span className="hint mono">
                        {j.done}/{j.total} · ok {j.ok_count ?? 0}
                        {j.id === activeJobId ? ' · live' : ''}
                      </span>
                    </div>
                    <div className="btn-row">
                      {j.status === 'running' || j.status === 'queued' ? (
                        <button
                          type="button"
                          className="btn secondary small"
                          onClick={() => onResumeJob?.(j)}
                        >
                          Attach
                        </button>
                      ) : null}
                      {j.result ? (
                        <button
                          type="button"
                          className="btn primary small"
                          onClick={() => {
                            saveFarmArchive(j, j.result!);
                            refreshArchive();
                            onOpenResult(j.result!, { id: j.id });
                            toast('Sweep opened', { tone: 'ok' });
                          }}
                        >
                          Open
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="farm-library__h">Archive · this browser</h3>
          {!archive.length ? (
            <p className="hint">Finished sweeps are saved here automatically so leaving the page does not wipe them.</p>
          ) : (
            <ul className="farm-library__list">
              {archive.map((e) => (
                <li key={e.id}>
                  <div className="farm-library__row">
                    <div>
                      <strong>{e.label}</strong>
                      <span className="hint mono">
                        {when(e.saved_at)} · ok {e.ok_count ?? e.result.ok} / {e.scanned ?? e.result.scanned}
                      </span>
                    </div>
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn primary small"
                        onClick={() => {
                          onOpenResult(e.result, { id: e.id, label: e.label });
                          toast('Archive restored', { tone: 'ok', body: e.label.slice(0, 48) });
                        }}
                      >
                        Reopen
                      </button>
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => {
                          removeFarmArchive(e.id);
                          refreshArchive();
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
