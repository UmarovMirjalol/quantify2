/** Shareable 1080×1350 PNG result card (X, TikTok photo posts, Telegram), drawn on a canvas. */

export type CardLine = { values: number[]; color: string; dashed?: boolean };
export type CardStat = { label: string; value: string; sub?: string; color: string };

export type CardInput = {
  eyebrow: string;
  title: string;
  meta: string;
  stats: CardStat[];
  verdict: string;
  verdictColor: string;
  lines: CardLine[];
};

const W = 1080;
const H = 1350;
const BG = '#0a0c0f';
const TEXT = '#eef1f3';
const MUTED = '#98a2ac';
const ACCENT = '#4fd6a0';
const SANS = "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', Consolas, ui-monospace, monospace";
const BOLT: [number, number][] = [[19, 5], [10, 16.5], [15.4, 16.5], [13, 27], [23.2, 14.2], [17.6, 14.2]];

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > width && last.length) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

function brand(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const s = 1.6;
  ctx.fillStyle = '#12171c';
  ctx.beginPath();
  ctx.roundRect(x, y, 32 * s, 32 * s, 8 * s);
  ctx.fill();
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  BOLT.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * s, y + py * s) : ctx.moveTo(x + px * s, y + py * s)));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = TEXT;
  ctx.font = `600 34px ${SANS}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Quantify', x + 32 * s + 18, y + 16 * s);
}

function chart(ctx: CanvasRenderingContext2D, lines: CardLine[], x: number, y: number, w: number, h: number) {
  const all = lines.flatMap((l) => l.values).filter(Number.isFinite);
  if (!all.length) return;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 3; i += 1) {
    const gy = y + (h * i) / 3;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }
  for (const line of lines) {
    const n = line.values.length;
    if (n < 2) continue;
    const step = Math.max(1, Math.floor(n / 600));
    ctx.strokeStyle = line.color;
    ctx.lineWidth = line.dashed ? 4 : 6;
    ctx.setLineDash(line.dashed ? [14, 12] : []);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i += step) {
      const px = x + (w * i) / (n - 1);
      const py = y + h - ((line.values[i] - lo) / span) * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(x + w, y + h - ((line.values[n - 1] - lo) / span) * h);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

export async function renderCard(input: CardInput): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 700);
  glow.addColorStop(0, 'rgba(79,214,160,0.14)');
  glow.addColorStop(1, 'rgba(79,214,160,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const pad = 80;
  brand(ctx, pad, 70);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ACCENT;
  ctx.font = `600 26px ${MONO}`;
  ctx.fillText(input.eyebrow.toUpperCase(), pad, 230);

  ctx.fillStyle = TEXT;
  ctx.font = `600 50px ${SANS}`;
  const titleLines = wrap(ctx, input.title, W - pad * 2, 3);
  titleLines.forEach((line, i) => ctx.fillText(line, pad, 300 + i * 62));
  let y = 300 + titleLines.length * 62;

  ctx.fillStyle = MUTED;
  ctx.font = `400 28px ${MONO}`;
  ctx.fillText(input.meta, pad, y + 10);
  y += 90;

  const colW = (W - pad * 2) / Math.max(1, input.stats.length);
  input.stats.forEach((s, i) => {
    const sx = pad + i * colW;
    ctx.fillStyle = s.color;
    ctx.font = `600 28px ${SANS}`;
    ctx.fillText(s.label, sx, y);
    ctx.fillStyle = TEXT;
    ctx.font = `700 ${input.stats.length > 2 ? 52 : 68}px ${MONO}`;
    ctx.fillText(s.value, sx, y + 78);
    if (s.sub) {
      ctx.fillStyle = s.color;
      ctx.font = `600 32px ${MONO}`;
      ctx.fillText(s.sub, sx, y + 126);
    }
  });
  y += 200;

  ctx.fillStyle = input.verdictColor;
  ctx.font = `700 40px ${SANS}`;
  wrap(ctx, input.verdict, W - pad * 2, 2).forEach((line, i) => ctx.fillText(line, pad, y + i * 50));
  y += 90;

  const chartBottom = H - 190;
  chart(ctx, input.lines, pad, y, W - pad * 2, Math.max(160, chartBottom - y));

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(pad, H - 140, W - pad * 2, 2);
  ctx.fillStyle = MUTED;
  ctx.font = `400 28px ${SANS}`;
  ctx.fillText('Tested on Quantify. Free, no signup.', pad, H - 80);
  ctx.fillStyle = ACCENT;
  ctx.font = `700 30px ${MONO}`;
  const url = 'quantifylab.xyz';
  ctx.fillText(url, W - pad - ctx.measureText(url).width, H - 80);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render the card.'))), 'image/png'),
  );
}

/** Native share sheet with the PNG when the device supports it, otherwise a download. */
export async function shareCard(input: CardInput, filename: string): Promise<'shared' | 'downloaded'> {
  const blob = await renderCard(input);
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] }) && window.matchMedia('(pointer: coarse)').matches) {
    try {
      await nav.share({ files: [file], text: 'Tested on Quantify → https://quantifylab.xyz' });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

export const money = (v: number) =>
  `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export const signedPct = (r: number) => {
  const p = Math.abs(r * 100);
  const text = p >= 100 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p.toFixed(1);
  return `${r >= 0 ? '+' : '−'}${text}%`;
};
