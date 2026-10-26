'use client';
import { useEffect, useRef } from 'react';

/** One persistent, non-interactive foreground layer for every route. */
export function ChristmasSnow({ count = 96 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, raf = 0, previous = 0;
    let flakes: Array<{ x: number; y: number; size: number; speed: number; phase: number }> = [];
    const draw = (delta: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const flake of flakes) {
        flake.y += flake.speed * delta;
        flake.x += (6 + Math.sin(flake.phase + flake.y / 120) * 12) * delta;
        if (flake.y > height + 8) { flake.y = -8; flake.x = Math.random() * width; }
        if (flake.x > width + 8) flake.x = -8;
        if (flake.x < -8) flake.x = width + 8;
        ctx.fillStyle = `rgba(245,249,255,${.28 + flake.size * .12})`;
        ctx.beginPath(); ctx.arc(flake.x, flake.y, flake.size, 0, Math.PI * 2); ctx.fill();
        if (flake.size > 2.5) {
          ctx.strokeStyle = 'rgba(255,245,229,.45)'; ctx.lineWidth = .6;
          ctx.beginPath(); ctx.moveTo(flake.x - 4, flake.y); ctx.lineTo(flake.x + 4, flake.y);
          ctx.moveTo(flake.x, flake.y - 4); ctx.lineTo(flake.x, flake.y + 4); ctx.stroke();
        }
      }
    };
    const frame = (now: number) => {
      if (document.hidden || reduced.matches) return;
      const elapsed = now - previous;
      if (elapsed >= 1000 / 30) { draw(previous ? Math.min(elapsed / 1000, .06) : 0); previous = now; }
      raf = requestAnimationFrame(frame);
    };
    const restart = () => {
      cancelAnimationFrame(raf); previous = 0;
      canvas.dataset.motion = reduced.matches ? 'still' : document.hidden ? 'paused' : 'animated';
      if (reduced.matches) draw(0);
      else if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const amount = Math.min(width < 641 ? 42 : 110, count);
      flakes = Array.from({ length: amount }, () => ({ x: Math.random() * width, y: Math.random() * height, size: .65 + Math.random() * 2.5, speed: 17 + Math.random() * 40, phase: Math.random() * Math.PI * 2 }));
      canvas.dataset.flakes = String(amount); draw(0); restart();
    };
    // Visitors can switch snowfall off (WCAG 2.2.2); the choice is shared with the music panel switch.
    const snowOn = () => { try { return window.localStorage.getItem('iris-snow-v1') !== 'off'; } catch { return true; } };
    const apply = (on: boolean) => { canvas.style.display = on ? '' : 'none'; cancelAnimationFrame(raf); previous = 0; if (on) restart(); };
    const onToggle = (event: Event) => apply(Boolean((event as CustomEvent<boolean>).detail));
    resize(); window.addEventListener('resize', resize);
    window.addEventListener('iris-snow-change', onToggle);
    apply(snowOn());
    document.addEventListener('visibilitychange', restart); reduced.addEventListener('change', restart);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('iris-snow-change', onToggle); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', restart); reduced.removeEventListener('change', restart); };
  }, [count]);
  return <canvas ref={ref} className="iris-snow-foreground" data-testid="christmas-snow" aria-hidden="true" />;
}
