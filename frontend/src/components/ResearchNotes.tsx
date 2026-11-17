import { useEffect, useState } from 'react';
import { getNote, setNote } from '../utils/researchNotes';
import { toast } from './ToastHost';

export function ResearchNotes({ backtestId }: { backtestId: number }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setText(getNote(backtestId));
    setSaved(false);
  }, [backtestId]);

  return (
    <section className="panel research-notes">
      <div className="page-header" style={{ marginBottom: '0.55rem' }}>
        <h2 style={{ margin: 0 }}>Research notes</h2>
        <button
          type="button"
          className="btn secondary small"
          onClick={() => {
            setNote(backtestId, text);
            setSaved(true);
            toast('Notes saved locally', { tone: 'ok' });
          }}
        >
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
      <textarea
        rows={4}
        value={text}
        placeholder="Hypothesis, worries, next tests… stays in this browser."
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
      />
    </section>
  );
}
