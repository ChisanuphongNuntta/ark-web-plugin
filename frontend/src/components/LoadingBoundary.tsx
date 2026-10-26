'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { PageLoading } from '@/components/PageLoading';

export function LoadingBoundary({ children }: { children: React.ReactNode }) {
  const pending = useAuthStore((state) => state.isLoading);
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (pending) return;
    setLeaving(true);
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280;
    const timer = window.setTimeout(() => setVisible(false), duration);
    return () => window.clearTimeout(timer);
  }, [pending]);

  // A stalled account request must never leave the whole site covered.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLeaving(true);
      setVisible(false);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <div ref={(node) => { if (node) node.inert = visible; }} aria-busy={visible}>
        {children}
      </div>
      {visible && (
        <div className="iris-loading-screen" data-leaving={leaving} data-testid="startup-loading">
          <PageLoading />
        </div>
      )}
      <noscript><style>{'.iris-loading-screen{display:none}'}</style></noscript>
    </>
  );
}
