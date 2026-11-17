import { useEffect, useState } from 'react';

export type ToastTone = 'info' | 'ok' | 'warn' | 'error';

export type ToastItem = {
  id: number;
  title: string;
  body?: string;
  tone?: ToastTone;
};

type Listener = (t: Omit<ToastItem, 'id'>) => void;

const listeners = new Set<Listener>();
let seq = 0;

/** Fire a transient toast from anywhere. */
export function toast(title: string, opts?: { body?: string; tone?: ToastTone }) {
  const payload = { title, body: opts?.body, tone: opts?.tone ?? 'info' };
  listeners.forEach((fn) => fn(payload));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast: Listener = (payload) => {
      const id = ++seq;
      setItems((prev) => [...prev.slice(-4), { id, ...payload }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, []);

  if (!items.length) return null;

  return (
    <div className="toast-host" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone ?? 'info'}`} role="status">
          <strong>{t.title}</strong>
          {t.body ? <span>{t.body}</span> : null}
          <button type="button" className="toast__x" aria-label="Dismiss" onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
