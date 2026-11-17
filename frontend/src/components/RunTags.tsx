import { useEffect, useState } from 'react';
import { addTag, getTags, removeTag } from '../utils/runTags';
import { toast } from './ToastHost';

const SUGGESTIONS = ['edge', 'fragile', 'size-up', 'retest', 'kill', 'intraday', 'swing'];

export function RunTags({ backtestId }: { backtestId: number }) {
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setTags(getTags(backtestId));
  }, [backtestId]);

  function refresh() {
    setTags(getTags(backtestId));
  }

  return (
    <section className="run-tags panel">
      <h2>Tags</h2>
      <div className="run-tags__chips">
        {tags.map((t) => (
          <button key={t} type="button" className="watch-chip" onClick={() => { removeTag(backtestId, t); refresh(); }}>
            {t} ×
          </button>
        ))}
        {!tags.length ? <span className="hint">Label this run for later filters.</span> : null}
      </div>
      <div className="btn-row">
        <input
          value={draft}
          placeholder="add tag…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              addTag(backtestId, draft);
              setDraft('');
              refresh();
              toast('Tag added', { tone: 'ok' });
            }
          }}
        />
        <button
          type="button"
          className="btn secondary small"
          onClick={() => {
            if (!draft.trim()) return;
            addTag(backtestId, draft);
            setDraft('');
            refresh();
          }}
        >
          Add
        </button>
      </div>
      <div className="run-tags__suggest">
        {SUGGESTIONS.filter((s) => !tags.includes(s)).map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            onClick={() => {
              addTag(backtestId, s);
              refresh();
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </section>
  );
}
