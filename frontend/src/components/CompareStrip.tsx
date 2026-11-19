import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { clearCompareA, getCompareA } from '../utils/compareQueue';

/** Global “compare A waiting” chip — Linear/Notion-style ambient queue. */
export function CompareStrip() {
  const [id, setId] = useState<number | null>(() => getCompareA());

  useEffect(() => {
    const sync = () => setId(getCompareA());
    window.addEventListener('quantify-compare-queue', sync);
    return () => window.removeEventListener('quantify-compare-queue', sync);
  }, []);

  if (!id) return null;

  return (
    <div className="compare-strip" role="status">
      <span className="compare-strip__pulse" aria-hidden />
      <span className="mono">
        Compare · <strong>#{id}</strong> waiting
      </span>
      <span className="compare-strip__hint">Open another run → hit Compare</span>
      <Link className="btn ghost small" to={`/results/${id}`}>
        Open A
      </Link>
      <button type="button" className="btn ghost small" onClick={() => clearCompareA()}>
        Clear
      </button>
    </div>
  );
}
