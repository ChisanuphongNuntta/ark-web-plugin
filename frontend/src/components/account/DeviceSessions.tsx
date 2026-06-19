'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Monitor, Smartphone, ShieldAlert, MapPin, Clock, Loader2 } from 'lucide-react';
import { identityApi } from '@/lib/contracts/client';
import type { SessionWithRisk, SessionRiskReason } from '@/lib/contracts/types';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

const SESSIONS_KEY = ['account', 'sessions'];

const RISK_LABEL: Record<SessionRiskReason, string> = {
  new_ip: 'IP ใหม่',
  new_device: 'อุปกรณ์ใหม่',
};

function isMobileAgent(ua?: string | null): boolean {
  if (!ua) return false;
  return /iphone|android|mobile|ipad/i.test(ua);
}

function deviceLabel(ua?: string | null): string {
  if (!ua) return 'อุปกรณ์ไม่ทราบชนิด';
  if (/iphone/i.test(ua)) return 'iPhone';
  if (/ipad/i.test(ua)) return 'iPad';
  if (/android/i.test(ua)) return 'Android';
  if (/windows/i.test(ua)) return 'Windows';
  if (/mac os|macintosh/i.test(ua)) return 'macOS';
  return 'เบราว์เซอร์';
}

export function DeviceSessions() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => identityApi.listSessions(),
  });

  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const revokeMutation = useMutation({
    mutationFn: (id: string) => identityApi.revokeSession(id),
    onMutate: (id) => {
      setActionError(null);
      setRevokingId(id);
    },
    onSuccess: (_res, id) => {
      // Optimistically drop the revoked session from the cached list.
      queryClient.setQueryData<SessionWithRisk[]>(SESSIONS_KEY, (prev) =>
        (prev ?? []).filter((s) => s.id !== id)
      );
    },
    onError: () => setActionError('เพิกถอนเซสชันไม่สำเร็จ กรุณาลองใหม่'),
    onSettled: () => setRevokingId(null),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <GlassCard key={i} className="p-5 flex items-center gap-4">
            <Skeleton variant="circle" className="h-10 w-10" />
            <div className="flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56 mt-2" />
            </div>
            <Skeleton className="h-8 w-20" />
          </GlassCard>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorMessage
        title="ไม่สามารถโหลดเซสชันอุปกรณ์ได้"
        message="ระบบดึงรายการอุปกรณ์ที่เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
        onRetry={refetch}
      />
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="ไม่มีเซสชันที่ใช้งานอยู่"
        description="ขณะนี้ไม่มีอุปกรณ์อื่นที่เข้าสู่ระบบด้วยบัญชีของคุณ"
      />
    );
  }

  const flaggedCount = data.filter((s) => s.riskFlag).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="eyebrow">Active Device Sessions</span>
          <h3 className="text-sm font-bold text-iris-pearl mt-0.5 uppercase tracking-wide">อุปกรณ์ที่เข้าสู่ระบบ</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} leftIcon={<Clock className="h-3.5 w-3.5" />}>
          รีเฟรช
        </Button>
      </div>

      {flaggedCount > 0 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl text-[11px] flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>พบ {flaggedCount} เซสชันที่มีความเสี่ยง หากไม่ใช่คุณ โปรดเพิกถอนทันที</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-[11px]">{actionError}</div>
      )}

      <ul className="space-y-3">
        {data.map((session) => {
          const mobile = isMobileAgent(session.userAgent);
          const Icon = mobile ? Smartphone : Monitor;
          return (
            <li key={session.id}>
              <GlassCard
                className={`p-5 flex flex-col sm:flex-row sm:items-center gap-4 border ${
                  session.riskFlag ? 'border-amber-500/30' : 'border-white/5'
                }`}
              >
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                    session.isCurrent ? 'bg-iris-cyan/10 text-iris-cyan' : 'bg-white/5 text-iris-muted'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-iris-pearl">{deviceLabel(session.userAgent)}</span>
                    {session.isCurrent && <Badge variant="cyan">อุปกรณ์นี้</Badge>}
                    {session.riskFlag &&
                      session.riskReasons.map((r) => (
                        <Badge key={r} variant="warning">{RISK_LABEL[r] ?? r}</Badge>
                      ))}
                  </div>
                  <p className="text-[10px] text-iris-muted flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" /> {session.ipAddress ?? 'ไม่ทราบ IP'}
                  </p>
                  <p className="text-[10px] text-iris-muted flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    ใช้งานล่าสุด {session.lastUsedAt ? new Date(session.lastUsedAt).toLocaleString('th-TH') : '—'}
                  </p>
                  <p className="font-mono text-[9px] text-iris-muted/70 truncate" title={session.userAgent ?? ''}>
                    {session.userAgent}
                  </p>
                </div>

                <div className="shrink-0">
                  {session.isCurrent ? (
                    <span className="text-[10px] text-iris-muted font-bold uppercase">เซสชันปัจจุบัน</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-400"
                      isLoading={revokingId === session.id}
                      onClick={() => revokeMutation.mutate(session.id)}
                    >
                      {revokingId === session.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'เพิกถอน'}
                    </Button>
                  )}
                </div>
              </GlassCard>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
