'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

function LinkSteamContent() {
  const searchParams = useSearchParams();
  const { user, setUser } = useAuthStore();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const hasLinked = useRef(false);

  useEffect(() => {
    if (hasLinked.current) return;

    const steamId = searchParams.get('steamId');

    if (!steamId) {
      setStatus('error');
      setMessage('ไม่พบ Steam ID');
      return;
    }

    if (!user) {
      setStatus('error');
      setMessage('กรุณาเข้าสู่ระบบก่อน');
      return;
    }

    hasLinked.current = true;

    const linkSteam = async () => {
      try {
        const { data } = await authApi.linkSteam(steamId);

        if (data.success) {
          // Update user in store
          setUser({
            ...user,
            steamId: data.user.steamId,
          });
          setStatus('success');
          setMessage('เชื่อม Steam ID สำเร็จ!');

          // Redirect to profile after 2 seconds
          setTimeout(() => {
            window.location.href = '/profile';
          }, 2000);
        }
      } catch (error: any) {
        setStatus('error');
        setMessage(error.response?.data?.error || 'เกิดข้อผิดพลาดในการเชื่อม Steam');
      }
    };

    linkSteam();
  }, [searchParams, user, setUser]);

  return (
    <div className="max-w-md mx-auto mt-20">
      <div className="card p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-ark-accent mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">กำลังเชื่อม Steam</h1>
            <p className="text-gray-400">รอสักครู่...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2 text-green-400">สำเร็จ!</h1>
            <p className="text-gray-400">{message}</p>
            <p className="text-sm text-gray-500 mt-4">กำลังกลับไปหน้าโปรไฟล์...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2 text-red-400">เกิดข้อผิดพลาด</h1>
            <p className="text-gray-400">{message}</p>
            <a href="/profile" className="btn btn-primary mt-6 inline-block">
              กลับไปหน้าโปรไฟล์
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export default function LinkSteamPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto mt-20">
          <div className="card p-8 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-ark-accent mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">กำลังโหลด...</h1>
          </div>
        </div>
      }
    >
      <LinkSteamContent />
    </Suspense>
  );
}
