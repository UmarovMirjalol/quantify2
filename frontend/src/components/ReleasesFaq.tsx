import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { getReleases } from '../services/api';
import type { ReleaseItem } from '../types';

const FALLBACK_RELEASES: ReleaseItem[] = [
  {
    version: '0.3',
    title: 'Live pulse & playbook',
    body: 'Public activity feed, strategy gallery, and live counters on the landing page.',
  },
  {
    version: '0.2',
    title: 'Production edge',
    body: 'Docker Compose deploy, optional access gate, rate limits, and smoke tests.',
  },
  {
    version: '0.1',
    title: 'Research core',
    body: 'Plain-English strategies, look-ahead-safe engine, risk sizing, metrics, SQLite history.',
  },
];

const FAQ = [
  {
    q: 'Do I need an API key?',
    a: 'No. The built-in parser runs offline. Add an OpenAI-compatible key only if you want broader natural-language coverage.',
  },
  {
    q: 'Is the sample data real market data?',
    a: 'No — sample_data.csv is synthetic for demos and tests. Upload your own OHLCV CSV for research.',
  },
  {
    q: 'How do you avoid look-ahead bias?',
    a: 'Signals form on the close; fills execute on the next open. Commission and slippage hit every trade before equity updates.',
  },
  {
    q: 'Who can see my runs?',
    a: 'Your full history stays scoped to this browser’s client id. The public pulse shows anonymized strategy snippets only.',
  },
] as const;

export function ReleasesFaq() {
  const reduced = usePrefersReducedMotion();
  const [releases, setReleases] = useState<ReleaseItem[]>(FALLBACK_RELEASES);
  const [open, setOpen] = useState(0);
  const [inView, setInView] = useState(reduced);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    getReleases()
      .then((data) => {
        if (data.items?.length) setReleases(data.items);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (reduced) {
      setInView(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { threshold: 0.12 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <section
      ref={ref}
      id="releases"
      className={`landing-section releases-faq-section ${inView ? 'in-view' : ''}`}
    >
      <div className="releases-faq-grid">
        <div>
          <div className="section-head">
            <p className="eyebrow">Releases</p>
            <h2>Version history.</h2>
            <p className="section-lede">
              Core engine, deploy stack, then the public research surface.
            </p>
          </div>
          <ol className="release-list">
            {releases.map((r, i) => (
              <li key={r.version} style={{ ['--i' as string]: i }}>
                <span className="release-ver mono">v{r.version}</span>
                <div>
                  <h3>{r.title}</h3>
                  <p>{r.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <div className="section-head">
            <p className="eyebrow">FAQ</p>
            <h2>FAQ</h2>
          </div>
          <div className="faq-list">
            {FAQ.map((item, i) => {
              const isOpen = open === i;
              return (
                <div key={item.q} className={`faq-item ${isOpen ? 'open' : ''}`} style={{ ['--i' as string]: i }}>
                  <button
                    type="button"
                    className="faq-q"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                  >
                    <span>{item.q}</span>
                    <span className="faq-icon mono" aria-hidden="true">
                      {isOpen ? '−' : '+'}
                    </span>
                  </button>
                  {isOpen ? <p className="faq-a">{item.a}</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
