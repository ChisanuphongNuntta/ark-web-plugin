'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Check } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import { Card, Spinner, buttonVariants } from '@/components/ui';

type Status = 'loading' | 'success' | 'error';

function errorText(error: unknown): string {
  const maybe = error as { response?: { data?: { error?: unknown } } };
  const msg = maybe?.response?.data?.error;
  return typeof msg === 'string' && msg ? msg : 'เชื่อม Steam ไม่สำเร็จ ลองอีกครั้งจากหน้าบัญชี';
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-shell flex min-h-[60vh] items-center justify-center py-16">
      <Card padding="lg" className="w-full max-w-sm text-center">
        {children}
      </Card>
    </div>
  );
}

function LinkSteamContent() {
  const searchParams = useSearchParams();
  const { user, setUser, isLoading } = useAuthStore();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const hasLinked = useRef(false);

  const steamId = searchParams.get('steamId');
  // Derived precondition errors — no effect needed.
  const precondition = !steamId
    ? 'ไม่พบ Steam ID ในลิงก์นี้'
    : !isLoading && !user
      ? 'เข้าสู่ระบบก่อนเชื่อม Steam'
      : null;

  useEffect(() => {
    if (hasLinked.current || precondition || !steamId || !user) return;
    hasLinked.current = true;

    const linkSteam = async () => {
      try {
        const { data } = await authApi.linkSteam(steamId);
        if (data.success) {
          setUser({ ...user, steamId: data.user.steamId });
          setStatus('success');
          setMessage('เชื่อม Steam เรียบร้อยแล้ว');
          setTimeout(() => {
            window.location.href = '/profile';
          }, 2000);
        } else {
          setStatus('error');
          setMessage('เชื่อม Steam ไม่สำเร็จ ลองอีกครั้งจากหน้าบัญชี');
        }
      } catch (error) {
        setStatus('error');
        setMessage(errorText(error));
      }
    };

    void linkSteam();
  }, [precondition, steamId, user, setUser]);

  const shown: Status = precondition ? 'error' : status;
  const shownMessage = precondition ?? message;

  if (shown === 'loading') {
    return (
      <Frame>
        <Spinner size={20} label="กำลังเชื่อม Steam" />
        <h1 className="mt-4 text-lg font-semibold text-fg">กำลังเชื่อม Steam</h1>
        <p className="mt-1 text-sm text-fg-muted">ใช้เวลาไม่กี่วินาที</p>
      </Frame>
    );
  }

  if (shown === 'success') {
    return (
      <Frame>
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-success/30 text-success">
          <Check className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-fg">{shownMessage}</h1>
        <p className="mt-1 text-sm text-fg-muted" role="status">
          กำลังกลับไปหน้าบัญชี
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-danger/30 text-danger">
        <AlertTriangle className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-fg">เชื่อม Steam ไม่สำเร็จ</h1>
      <p className="mt-1 text-sm text-fg-muted" role="alert">
        {shownMessage}
      </p>
      <Link href={user ? '/profile' : '/login'} className={buttonVariants({ variant: 'secondary', className: 'mt-6' })}>
        {user ? 'กลับไปหน้าบัญชี' : 'เข้าสู่ระบบ'}
      </Link>
    </Frame>
  );
}

export default function LinkSteamPage() {
  return (
    <Suspense
      fallback={
        <Frame>
          <Spinner size={20} label="กำลังโหลด" />
        </Frame>
      }
    >
      <LinkSteamContent />
    </Suspense>
  );
}
