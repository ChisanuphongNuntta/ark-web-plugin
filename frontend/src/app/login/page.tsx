'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/store';
import { Loader2, Lock, ShieldCheck, ArrowRight } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const { user, isLoading } = useAuthStore();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (!isLoading && user && !hasRedirected.current) {
      hasRedirected.current = true;
      window.location.href = '/';
    }
  }, [user, isLoading]);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  if (isLoading) {
    return (
      <div className="page-shell flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-iris-cyan" />
      </div>
    );
  }

  return (
    <div className="page-shell max-w-md mx-auto py-16 sm:py-24 animate-slide-up">
      <GlassCard variant="default" hoverEffect="glow" className="p-8 sm:p-10 text-center space-y-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-iris-cyan/10 border border-iris-cyan/30 text-iris-cyan">
          <Lock className="h-7 w-7" />
        </div>

        <div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-iris-cyan animate-pulse" />
            <span className="text-[10px] font-black tracking-widest uppercase text-iris-cyan">
              WELCOME TO IRIS
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-iris-pearl">
            เข้าสู่ระบบสมาชิก
          </h1>
          <p className="mt-2 text-xs text-iris-muted leading-relaxed">
            เชื่อมต่อผ่านบัญชี Discord เพื่อจัดการกระเป๋าเหรียญ สั่งซื้อไดโนเสาร์ และรับไอเทมในเกม
          </p>
        </div>

        <a
          href={`${apiUrl}/auth/discord`}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] py-3.5 text-sm font-bold text-white transition shadow-lg shadow-indigo-500/20"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
          ดำเนินการต่อด้วย Discord
        </a>

        <div className="rounded-xl border border-white/5 bg-black/40 p-4 text-left text-xs text-iris-muted space-y-2">
          <div className="flex items-center gap-1.5 text-iris-cyan font-bold">
            <ShieldCheck className="h-4 w-4" />
            <span>เชื่อมบัญชีเกมของคุณ</span>
          </div>
          <p>
            • หลังจากเข้าสู่ระบบด้วย Discord คุณสามารถเชื่อมต่อ Steam ID ในหน้าบัญชีผู้ใช้เพื่อผูกกระเป๋ากับตัวละครในเกมได้ทันที
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
