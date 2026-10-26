'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-shell max-w-2xl mx-auto py-24 text-center space-y-4 animate-slide-up">
      <GlassCard className="p-12 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-rose-400 mb-3" />
        <h1 className="text-2xl font-bold text-iris-pearl">เกิดข้อผิดพลาด</h1>
        <p className="text-xs text-iris-muted mt-1">ไม่สามารถแสดงหน้านี้ได้ในขณะนี้ กรุณาลองอีกครั้ง</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="primary" onClick={reset}>
            ลองอีกครั้ง
          </Button>
          <Link href="/">
            <Button variant="secondary">กลับหน้าแรก</Button>
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
