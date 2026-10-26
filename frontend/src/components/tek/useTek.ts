'use client';
import { useEffect, useRef, type PointerEvent } from 'react';

/** Pointer-driven 3D tilt for .tk-tilt elements: spread the returned handlers onto the element. */
export function useTilt() {
  const reduce = useRef(false);
  useEffect(() => {
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
  return {
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (reduce.current || event.pointerType === 'touch') return;
      const el = event.currentTarget;
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      el.style.setProperty('--rx', `${((0.5 - y) * 8).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((x - 0.5) * 10).toFixed(2)}deg`);
      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    },
    onPointerLeave(event: PointerEvent<HTMLElement>) {
      event.currentTarget.style.setProperty('--rx', '0deg');
      event.currentTarget.style.setProperty('--ry', '0deg');
    },
  };
}

/** Adds .in to .tk-rv elements as they scroll into view. */
export function useReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('.tk-rv:not(.in)'));
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  });
}
