import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

/**
 * Lightweight canvas atmosphere — perspective data-floor + drifting lanes.
 * Inspired by 2026 fintech heroes (restrained WebGL moment) without Three.js.
 */
export function HeroDepthCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduced) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const lanes: { x: number; speed: number; width: number; alpha: number }[] = [];
    const dots: { x: number; y: number; z: number; vz: number; a: number }[] = [];

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      w = parent.clientWidth;
      h = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      lanes.length = 0;
      for (let i = 0; i < 12; i++) {
        lanes.push({
          x: (i / 11) * 1.35 - 0.18,
          speed: 0.08 + (i % 5) * 0.02,
          width: 1 + (i % 3),
          alpha: 0.07 + (i % 4) * 0.025,
        });
      }
      dots.length = 0;
      for (let i = 0; i < 36; i++) {
        dots.push({
          x: Math.random() * 2 - 1,
          y: Math.random(),
          z: Math.random(),
          vz: 0.0015 + Math.random() * 0.003,
          a: 0.22 + Math.random() * 0.45,
        });
      }
    };

    const drawFloor = (t: number) => {
      const horizon = h * 0.42;
      const vanishX = w * 0.72;
      // fog plate
      const g = ctx.createLinearGradient(0, horizon - 40, 0, h);
      g.addColorStop(0, 'rgba(10, 12, 15, 0)');
      g.addColorStop(0.25, 'rgba(12, 18, 22, 0.35)');
      g.addColorStop(1, 'rgba(7, 10, 12, 0.85)');
      ctx.fillStyle = g;
      ctx.fillRect(0, horizon - 40, w, h - horizon + 40);

      // perspective grid
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, horizon, w, h - horizon);
      ctx.clip();

      const rows = 18;
      for (let i = 0; i <= rows; i++) {
        const p = i / rows;
        const ease = p * p;
        const y = horizon + (h - horizon) * ease;
        const alpha = 0.04 + (1 - p) * 0.1;
        ctx.strokeStyle = `rgba(79, 214, 160, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const cols = 16;
      for (let i = 0; i <= cols; i++) {
        const nx = i / cols;
        const xBottom = w * (nx * 1.35 - 0.175);
        ctx.strokeStyle = `rgba(79, 214, 160, ${0.05 + (Math.abs(nx - 0.55) < 0.08 ? 0.08 : 0)})`;
        ctx.beginPath();
        ctx.moveTo(vanishX, horizon);
        ctx.lineTo(xBottom, h);
        ctx.stroke();
      }

      // flowing data lanes toward camera
      for (const lane of lanes) {
        const xBottom = w * (lane.x * 0.9 + 0.05);
        const pulse = (Math.sin(t * lane.speed + lane.x * 8) + 1) * 0.5;
        const grad = ctx.createLinearGradient(vanishX, horizon, xBottom, h);
        grad.addColorStop(0, `rgba(79, 214, 160, 0)`);
        grad.addColorStop(0.45, `rgba(79, 214, 160, ${lane.alpha * pulse})`);
        grad.addColorStop(1, `rgba(79, 214, 160, ${0.02 + pulse * 0.12})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = lane.width;
        ctx.beginPath();
        ctx.moveTo(vanishX + (lane.x - 0.5) * 30, horizon);
        ctx.lineTo(xBottom, h + 10);
        ctx.stroke();
      }
      ctx.restore();

      // soft horizon glow
      const hg = ctx.createRadialGradient(vanishX, horizon, 10, vanishX, horizon, w * 0.35);
      hg.addColorStop(0, 'rgba(79, 214, 160, 0.22)');
      hg.addColorStop(0.4, 'rgba(79, 214, 160, 0.07)');
      hg.addColorStop(1, 'rgba(79, 214, 160, 0)');
      ctx.fillStyle = hg;
      ctx.fillRect(vanishX - w * 0.35, horizon - 80, w * 0.7, 160);
    };

    const drawDots = (t: number) => {
      for (const d of dots) {
        d.z += d.vz;
        if (d.z > 1) {
          d.z = 0;
          d.x = Math.random() * 2 - 1;
          d.y = Math.random() * 0.55;
        }
        const perspective = 0.35 + d.z * 1.4;
        const x = w * 0.72 + d.x * w * 0.22 * perspective;
        const y = h * 0.18 + d.y * h * 0.28 * (1 - d.z * 0.35) + Math.sin(t * 0.8 + d.x) * 4;
        const r = 0.6 + d.z * 2.2;
        ctx.beginPath();
        ctx.fillStyle = `rgba(79, 214, 160, ${d.a * (0.25 + d.z * 0.75)})`;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (now: number) => {
      if (!running) return;
      const t = now * 0.001;
      ctx.clearRect(0, 0, w, h);
      // upper volume fog
      const top = ctx.createRadialGradient(w * 0.78, h * 0.18, 20, w * 0.78, h * 0.18, w * 0.42);
      top.addColorStop(0, 'rgba(79, 214, 160, 0.09)');
      top.addColorStop(0.45, 'rgba(79, 214, 160, 0.03)');
      top.addColorStop(1, 'rgba(79, 214, 160, 0)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, w, h * 0.55);
      drawDots(t);
      drawFloor(t);
      raf = requestAnimationFrame(loop);
    };

    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        raf = requestAnimationFrame(loop);
      }
    };

    resize();
    raf = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reduced]);

  if (reduced) return null;
  return <canvas className="hero-depth-canvas" ref={canvasRef} aria-hidden="true" />;
}
