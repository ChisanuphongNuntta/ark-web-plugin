'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import { Loader2 } from 'lucide-react';

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const { setUser } = useAuthStore();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent multiple executions
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const handleCallback = async () => {
      const success = searchParams.get('success');

      if (success === 'true') {
        try {
          const { data } = await authApi.getMe();
          if (data.user) {
            setUser({
              ...data.user,
              pointsBalance: Number(data.user.pointsBalance),
            });

            // Check if Steam is linked
            if (!data.user.steamId) {
              window.location.href = '/profile?linkSteam=true';
            } else {
              window.location.href = '/';
            }
          } else {
            window.location.href = '/login?error=auth_failed';
          }
        } catch (error) {
          console.error('Auth callback error:', error);
          window.location.href = '/login?error=auth_failed';
        }
      } else {
        window.location.href = '/login?error=auth_failed';
      }
    };

    handleCallback();
  }, [searchParams, setUser]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <Loader2 className="h-12 w-12 animate-spin text-iris-cyan mb-4" />
      <p className="text-gray-400">กำลังเข้าสู่ระบบ...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="h-12 w-12 animate-spin text-iris-cyan mb-4" />
          <p className="text-gray-400">กำลังโหลด...</p>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
