import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { FOUNDER, PROJECT_ARCHIVE } from '../utils/projectArchive';

const TAG_LABEL: Record<(typeof PROJECT_ARCHIVE)[number]['tag'], string> = {
  founding: 'Founding',
  engine: 'Engine',
  research: 'Research',
  desk: 'Desk',
  release: 'Release',
};

export function ArchivePage() {
  usePageMeta(
    'Archive — Quantify since 2025',
    `Product archive of the Quantify research desk founded ${FOUNDER.foundedLabel} by ${FOUNDER.name}. Engine, research and ops milestones.`,
  );

  return (
    <article className="results research archive-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Archive · since 2025</p>
          <h1>Quantify product archive</h1>
          <p className="lede">
            Founded {FOUNDER.foundedLabel} by <strong>{FOUNDER.name}</strong> ({FOUNDER.role}). This is the public
            timeline of the research desk — not a launch week story.
          </p>
        </div>
        <div className="btn-row">
          <Link className="btn secondary" to="/about">
            About &amp; founder
          </Link>
          <Link className="btn primary" to="/matrix">
            Open matrix
          </Link>
        </div>
      </div>

      <section className="panel hold-verdict won">
        <p className="eyebrow">Founding</p>
        <p className="hold-verdict-line">
          {FOUNDER.name} · {FOUNDER.foundedLabel} · MIT-licensed research terminal
        </p>
        <p className="hint">
          Look-ahead-safe fills, out-of-sample grades, and a published study on whether backtest winners survive —
          the same mandate since day one.
        </p>
      </section>

      <ol className="archive-timeline">
        {PROJECT_ARCHIVE.map((e) => (
          <li key={e.date + e.title} className="archive-timeline__item panel">
            <div className="archive-timeline__meta">
              <time className="mono" dateTime={e.date}>
                {e.date}
              </time>
              <span className="chip tiny">{TAG_LABEL[e.tag]}</span>
            </div>
            <h2>{e.title}</h2>
            <p>{e.body}</p>
          </li>
        ))}
      </ol>

      <p className="hint">
        Need the methodology? <Link to="/research">Read the survival study</Link> ·{' '}
        <Link to="/about">Principles &amp; stack</Link>
      </p>
    </article>
  );
}
