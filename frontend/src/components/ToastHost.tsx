import { useEffect, useRef, useState } from 'react';

export type ToastTone = 'info' | 'ok' | 'warn' | 'error';

export type ToastItem = {
  id: number;
  title: string;
  body?: string;
  tone?: ToastTone;
  leaving?: boolean;
};

type Listener = (t: Omit<ToastItem, 'id' | 'leaving'>) => void;

const listeners = new Set<Listener>();
let seq = 0;

const TONE_LABEL: Record<ToastTone, string> = {
  info: 'INFO',
  ok: 'OK',
  warn: 'WARN',
  error: 'ERR',
};

/** Fire a transient toast from anywhere. */
export function toast(title: string, opts?: { body?: string; tone?: ToastTone }) {
  const payload = { title, body: opts?.body, tone: opts?.tone ?? 'info' };
  listeners.forEach((fn) => fn(payload));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const itemsRef = useRef<ToastItem[]>([]);
  const timers = useRef<Map<number, number>>(new Map());
  const paused = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  function dismiss(id: number) {
    const existing = timers.current.get(id);
    if (existing) window.clearTimeout(existing);
    timers.current.delete(id);
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 180);
  }

  function schedule(id: number) {
    const existing = timers.current.get(id);
    if (existing) window.clearTimeout(existing);
    if (paused.current) return;
    const t = window.setTimeout(() => dismiss(id), 4200);
    timers.current.set(id, t);
  }

  function pauseAll() {
    paused.current = true;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current.clear();
  }

  function resumeAll() {
    paused.current = false;
    itemsRef.current.filter((t) => !t.leaving).forEach((t) => schedule(t.id));
  }

  useEffect(() => {
    const onToast: Listener = (payload) => {
      const id = ++seq;
      setItems((prev) => [...prev.slice(-4), { id, ...payload }]);
      schedule(id);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!items.length) return null;

  return (
    <div
      className="toast-host"
      aria-live="polite"
      onMouseEnter={pauseAll}
      onMouseLeave={resumeAll}
      onFocusCapture={pauseAll}
      onBlurCapture={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        resumeAll();
      }}
    >
      {items.map((t) => {
        const tone = t.tone ?? 'info';
        return (
          <div
            key={t.id}
            className={`toast toast--${tone}${t.leaving ? ' toast--out' : ''}`}
            role="status"
          >
            <span className="toast__tone mono" aria-hidden>
              {TONE_LABEL[tone]}
            </span>
            <strong>{t.title}</strong>
            {t.body ? <span>{t.body}</span> : null}
            <button type="button" className="toast__x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
