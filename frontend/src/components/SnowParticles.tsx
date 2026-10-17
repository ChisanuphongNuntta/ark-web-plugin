import type { CSSProperties } from 'react';

/** Deterministic CSS animation with no hydration randomness. */
export function SnowParticles({ count = 18 }: { count?: number }) {
  return (
    <div className="winter-snow" aria-hidden="true">
      {Array.from({ length: Math.min(count, 24) }, (_, index) => (
        <i key={index} style={{
          left: `${(index * 43.7) % 100}%`,
          '--fall-duration': `${18 + index % 9}s`,
          '--fall-delay': `${-(index * 3.1)}s`,
          width: index % 3 === 0 ? 3 : 2,
          height: index % 3 === 0 ? 3 : 2,
        } as CSSProperties} />
      ))}
    </div>
  );
}
