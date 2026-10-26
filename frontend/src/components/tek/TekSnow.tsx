'use client';
import { useEffect, useRef } from 'react';

/** Light canvas snow laid over a hero. Pointer-parallax, paused for reduced motion / hidden tabs. */
export function TekSnow({ density = 150 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let t = 0;
    let mx = 0;
    let raf = 0;
    const flakes = Array.from({ length: density }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), s: Math.random() * 6.28 }));

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width - 0.5;
    };
    const frame = () => {
      t += 1 / 60;
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.y += 0.0006 + f.z * 0.0016;
        f.x += Math.sin(t + f.s) * 0.0003 + 0.0001;
        if (f.y > 1.02) {
          f.y = -0.02;
          f.x = Math.random();
        }
        const x = (f.x + mx * f.z * 0.04) * w;
        const y = f.y * h;
        ctx.fillStyle = `rgba(230,245,255,${0.25 + f.z * 0.55})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + f.z * f.z * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!reduce && !document.hidden) raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener('resize', resize);
    canvas.parentElement?.addEventListener('pointermove', onMove);
    document.addEventListener('visibilitychange', onVisibility);
    frame();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.parentElement?.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [density]);

  return <canvas ref={ref} className="tk-snow" aria-hidden="true" />;
}
