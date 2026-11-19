import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listFavorites } from '../utils/favorites';
import { listRecentRuns } from '../utils/recentRuns';

type Cmd = { id: string; label: string; hint: string; to: string; group: string };

const COMMANDS: Cmd[] = [
  { id: 'backtest', label: 'New backtest', hint: 'Write a rule', to: '/app', group: 'Build' },
  { id: 'python', label: 'Python strategy', hint: 'Custom code', to: '/code', group: 'Build' },
  { id: 'portfolio', label: 'Portfolio', hint: 'Shared cash book', to: '/portfolio', group: 'Build' },
  { id: 'history', label: 'Results history', hint: 'Past runs', to: '/history', group: 'Build' },
  { id: 'forward', label: 'Forward tests', hint: 'Live tracking', to: '/forward', group: 'Build' },
  { id: 'paper', label: 'Paper desk', hint: 'Next-open signals', to: '/paper', group: 'Build' },
  { id: 'farm', label: 'Research farm', hint: 'Mass tests', to: '/farm', group: 'Explore' },
  { id: 'matrix', label: 'Playbook matrix', hint: 'Rule × market tower', to: '/matrix', group: 'Explore' },
  { id: 'desk', label: 'Morning command desk', hint: 'Ritual · gate · inbox', to: '/desk', group: 'Build' },
  { id: 'book', label: 'Research book', hint: 'Blend saved runs', to: '/book', group: 'Build' },
  { id: 'screener', label: 'Screener studio', hint: 'Universe scan', to: '/screener', group: 'Explore' },
  { id: 'discover', label: 'Discover studio', hint: '30 templates × one asset', to: '/discover', group: 'Explore' },
  { id: 'data-health', label: 'Data health', hint: 'Gaps & bars', to: '/data-health', group: 'Explore' },
  { id: 'leaderboard', label: 'Leaderboard', hint: 'Playbook ranks', to: '/leaderboard', group: 'Explore' },
  { id: 'check', label: 'Guru check', hint: 'Paste a claim', to: '/check', group: 'Explore' },
  { id: 'whatif', label: 'What if…', hint: 'Buy & hold math', to: '/whatif', group: 'Explore' },
  { id: 'tools', label: 'Tools', hint: 'Calculators', to: '/tools', group: 'Explore' },
  { id: 'compare', label: 'Compare', hint: 'Duel two runs · or pick in History', to: '/compare', group: 'Build' },
  { id: 'playbook', label: 'Playbook', hint: 'Rule library', to: '/playbook', group: 'Learn' },
  { id: 'guide', label: 'Guide', hint: 'How to research', to: '/guide', group: 'Learn' },
  { id: 'research', label: 'Research study', hint: 'Survival evidence', to: '/research', group: 'Learn' },
  { id: 'archive', label: 'Archive since 2025', hint: 'Founding timeline', to: '/archive', group: 'Learn' },
  { id: 'pricing', label: 'Pricing', hint: 'Free · Pro · self-host', to: '/pricing', group: 'You' },
  { id: 'about', label: 'About & founder', hint: 'Mirjalol Umarov · 2025', to: '/about', group: 'Learn' },
  { id: 'home', label: 'Landing', hint: 'Marketing + proof', to: '/', group: 'Learn' },
  { id: 'settings', label: 'Settings', hint: 'Secrets & density', to: '/settings', group: 'You' },
];

function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent('quantify-cmdk'));
}

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const open = () => setOpen(true);
    window.addEventListener('quantify-cmdk', open);
    return () => window.removeEventListener('quantify-cmdk', open);
  }, []);

  const filtered = useMemo(() => {
    const recent: Cmd[] = listRecentRuns().slice(0, 5).map((r) => ({
      id: `recent-${r.id}`,
      label: `#${r.id} ${r.title.slice(0, 42)}`,
      hint: 'Recent',
      to: `/results/${r.id}`,
      group: 'Recent',
    }));
    const favs: Cmd[] = listFavorites().slice(0, 5).map((f) => ({
      id: `fav-${f.id}`,
      label: `#${f.id} ${f.title.slice(0, 42)}`,
      hint: f.dataset,
      to: `/results/${f.id}`,
      group: 'Pinned',
    }));
    const all = [...recent, ...favs, ...COMMANDS];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (c) =>
        c.label.toLowerCase().includes(needle) ||
        c.hint.toLowerCase().includes(needle) ||
        c.group.toLowerCase().includes(needle) ||
        c.to.includes(needle),
    );
  }, [q, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[active];
        if (cmd) {
          setOpen(false);
          navigate(cmd.to);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, active, navigate]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setActive(0);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  if (!open) return null;

  return (
    <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
      <button type="button" className="cmdk__backdrop" aria-label="Close" onClick={() => setOpen(false)} />
      <div className="cmdk__panel">
        <div className="cmdk__search">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to… farm, paper, results, research"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmdk__kbd">esc</kbd>
        </div>
        <ul className="cmdk__list">
          {filtered.length === 0 ? (
            <li className="cmdk__empty">Nothing matches.</li>
          ) : (
            filtered.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`cmdk__item${i === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    setOpen(false);
                    navigate(c.to);
                  }}
                >
                  <span className="cmdk__group">{c.group}</span>
                  <span className="cmdk__label">{c.label}</span>
                  <span className="cmdk__hint">{c.hint}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="cmdk__foot">
          <kbd>{isMac() ? '⌘' : 'Ctrl'}</kbd>
          <kbd>K</kbd> anywhere · ↑↓ enter
        </p>
      </div>
    </div>
  );
}

export function CommandHint() {
  return (
    <button type="button" className="cmd-hint" title="Open command palette" onClick={() => openCommandPalette()}>
      <span>Search</span>
      <kbd>{isMac() ? '⌘K' : 'Ctrl+K'}</kbd>
    </button>
  );
}
