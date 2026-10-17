'use client';

import { Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { Card, ErrorMessage, Spinner, buttonVariants } from '@/components/ui';
import { DiscordMark, discordLoginUrl } from '@/components/account/DiscordMark';

const ERROR_TEXT: Record<string, string> = {
  auth_failed: 'เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง หากยังไม่ได้ให้ติดต่อทีมงานใน Discord',
  banned: 'บัญชีนี้ถูกระงับการใช้งาน ติดต่อทีมงานเพื่อสอบถามรายละเอียด',
};

function LoginContent() {
  const { user, isLoading } = useAuthStore();
  const searchParams = useSearchParams();
  const hasRedirected = useRef(false);
  const errorKey = searchParams.get('error');
  const errorText = errorKey ? (ERROR_TEXT[errorKey] ?? ERROR_TEXT.auth_failed) : null;

  useEffect(() => {
    if (!isLoading && user && !hasRedirected.current) {
      hasRedirected.current = true;
      window.location.href = '/';
    }
  }, [user, isLoading]);

  if (isLoading || user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
        <Spinner label="กำลังตรวจสอบการเข้าสู่ระบบ" />
      </div>
    );
  }

  return (
    <div className="page-shell flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <p className="eyebrow mb-3 text-center">IRIS ID</p>
        <h1 className="text-center text-2xl font-semibold tracking-[-0.015em] text-fg sm:text-3xl">เข้าสู่ระบบ</h1>
        <p className="mt-2 text-center text-sm text-fg-muted">
          ใช้บัญชี Discord เพื่อเข้าถึงกระเป๋า Iris Coin คำสั่งซื้อ และตลาดผู้เล่น
        </p>

        <Card padding="lg" className="mt-8 space-y-5">
          {errorText ? <ErrorMessage variant="inline" message={errorText} /> : null}

          <a href={discordLoginUrl()} className={buttonVariants({ size: 'lg', fullWidth: true })}>
            <DiscordMark className="h-[18px] w-[18px]" />
            เข้าสู่ระบบด้วย Discord
          </a>

          <ol className="space-y-3 border-t border-line pt-5 text-sm text-fg-muted">
            <li className="flex gap-3">
              <span className="font-mono text-xs leading-6 text-fg-subtle">01</span>
              <span>ยืนยันตัวตนกับ Discord ระบบจะไม่เห็นรหัสผ่านของคุณ</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs leading-6 text-fg-subtle">02</span>
              <span>เชื่อม Steam ในหน้าบัญชี เพื่อให้ของที่ซื้อส่งถึงตัวละครในเกม</span>
            </li>
          </ol>
        </Card>

        <p className="mt-6 text-center text-xs text-fg-subtle">
          การเข้าสู่ระบบถือว่ายอมรับ{' '}
          <Link href="/terms" className="text-fg-muted underline underline-offset-4 hover:text-fg">
            ข้อตกลงการใช้งาน
          </Link>{' '}
          และ{' '}
          <Link href="/privacy" className="text-fg-muted underline underline-offset-4 hover:text-fg">
            นโยบายความเป็นส่วนตัว
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
          <Spinner label="กำลังโหลด" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
