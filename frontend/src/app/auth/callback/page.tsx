'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import { Spinner } from '@/components/ui';

function CallbackStatus({ text }: { text: string }) {
  return (
    <div className="page-shell flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center" aria-busy="true">
      <Spinner label={text} />
      <p className="text-sm text-fg-muted" aria-hidden="true">
        {text}
      </p>
    </div>
  );
}

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const { setUser } = useAuthStore();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Run once even under StrictMode double-invocation.
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const handleCallback = async () => {
      if (searchParams.get('success') !== 'true') {
        window.location.href = '/login?error=auth_failed';
        return;
      }
      try {
        const { data } = await authApi.getMe();
        if (!data.user) {
          window.location.href = '/login?error=auth_failed';
          return;
        }
        setUser({ ...data.user, pointsBalance: Number(data.user.pointsBalance) });
        window.location.href = data.user.steamId ? '/' : '/profile?linkSteam=true';
      } catch (error) {
        console.error('Auth callback error:', error);
        window.location.href = '/login?error=auth_failed';
      }
    };

    void handleCallback();
  }, [searchParams, setUser]);

  return <CallbackStatus text="กำลังเข้าสู่ระบบ" />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackStatus text="กำลังโหลด" />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
