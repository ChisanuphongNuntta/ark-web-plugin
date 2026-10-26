'use client';
import { useEffect, useRef, useState } from 'react';

const COLORS = ['#ff3d5a', '#e2c27a', '#3dffa0', '#3ff0ff'];

/** String lights under the top bar. Drawn after mount so SSR output never depends on width. */
export function TekLights() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.max(320, el.getBoundingClientRect().width));
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);

  const step = 46;
  const count = width ? Math.ceil(width / step) + 1 : 0;
  let wire = 'M0 4';
  for (let i = 0; i < count; i += 1) wire += ` Q${i * step + step / 2} 12 ${i * step + step} 4`;

  return (
    <div ref={ref} className="tk-lights" aria-hidden="true">
      {width > 0 && (
        <svg viewBox={`0 0 ${width} 22`} preserveAspectRatio="xMinYMin slice">
          <path d={wire} fill="none" stroke="#1b2733" strokeWidth="1.4" />
          {Array.from({ length: count }, (_, i) => {
            const bx = i * step + step / 2;
            const c = COLORS[i % COLORS.length];
            return (
              <g key={i} className="bulb">
                <circle cx={bx} cy={15} r={7} fill={c} opacity=".22" />
                <rect x={bx - 2} y={7} width={4} height={3} fill="#2a3440" />
                <ellipse cx={bx} cy={14} rx={3} ry={4.2} fill={c} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
