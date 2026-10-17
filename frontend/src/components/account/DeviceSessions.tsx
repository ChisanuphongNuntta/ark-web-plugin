'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor, RefreshCw, Smartphone } from 'lucide-react';
import { identityApi } from '@/lib/contracts/client';
import type { SessionRiskReason, SessionWithRisk } from '@/lib/contracts/types';
import { Badge, Button, Card, EmptyState, ErrorMessage, Skeleton, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';

const SESSIONS_KEY = ['account', 'sessions'];

const RISK_LABEL: Record<SessionRiskReason, string> = {
  new_ip: 'IP ใหม่',
  new_device: 'อุปกรณ์ใหม่',
};

function isMobileAgent(ua?: string | null): boolean {
  return Boolean(ua && /iphone|android|mobile|ipad/i.test(ua));
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

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function DeviceSessions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [revokingId, setRevokingId] = React.useState<string | null>(null);

  const sessions = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => identityApi.listSessions(),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => identityApi.revokeSession(id),
    onMutate: (id) => setRevokingId(id),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<SessionWithRisk[]>(SESSIONS_KEY, (prev) => (prev ?? []).filter((s) => s.id !== id));
      toast.success('ออกจากระบบอุปกรณ์นั้นแล้ว');
    },
    onError: () => toast.error('ออกจากระบบอุปกรณ์ไม่สำเร็จ', 'ลองอีกครั้ง'),
    onSettled: () => setRevokingId(null),
  });

  const data = sessions.data ?? [];
  const flaggedCount = data.filter((s) => s.riskFlag).length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.015em] text-fg">อุปกรณ์ที่เข้าสู่ระบบ</h2>
          <p className="mt-1 text-sm text-fg-muted">ถ้าเห็นอุปกรณ์ที่ไม่ใช่ของคุณ ให้กดออกจากระบบทันที</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void sessions.refetch()}
          loading={sessions.isFetching && !sessions.isLoading}
          leftIcon={<RefreshCw className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
        >
          รีเฟรช
        </Button>
      </div>

      {sessions.isLoading ? (
        <Card padding="none" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-4 border-b border-line p-5 last:border-b-0">
              <Skeleton className="h-9 w-9" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))}
        </Card>
      ) : sessions.isError ? (
        <ErrorMessage
          title="โหลดรายการอุปกรณ์ไม่สำเร็จ"
          message="ลองอีกครั้งในอีกสักครู่"
          onRetry={() => void sessions.refetch()}
        />
      ) : data.length === 0 ? (
        <EmptyState title="ไม่มีอุปกรณ์อื่นที่เข้าสู่ระบบ" description="อุปกรณ์ที่ใช้บัญชีนี้จะแสดงที่นี่" />
      ) : (
        <>
          {flaggedCount > 0 && (
            <p role="status" className="rounded-card border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-fg">
              มี <span className="font-mono">{flaggedCount}</span> อุปกรณ์ที่เข้าจาก IP หรืออุปกรณ์ใหม่ ตรวจสอบว่าเป็นคุณ
            </p>
          )}
          <Card padding="none">
            <ul>
              {data.map((session) => {
                const Icon = isMobileAgent(session.userAgent) ? Smartphone : Monitor;
                return (
                  <li
                    key={session.id}
                    className={cn(
                      'flex flex-col gap-4 border-b border-line p-5 last:border-b-0 sm:flex-row sm:items-center',
                      session.riskFlag && 'bg-warning/5'
                    )}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line bg-surface-2 text-fg-muted">
                      <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-fg">{deviceLabel(session.userAgent)}</span>
                        {session.isCurrent && <Badge tone="accent">อุปกรณ์นี้</Badge>}
                        {session.riskFlag &&
                          session.riskReasons.map((r) => (
                            <Badge key={r} tone="warning">
                              {RISK_LABEL[r] ?? r}
                            </Badge>
                          ))}
                      </div>
                      <p className="text-xs text-fg-muted">
                        <span className="font-mono">{session.ipAddress ?? 'ไม่ทราบ IP'}</span>
                        <span aria-hidden> · </span>
                        ใช้งานล่าสุด {formatDate(session.lastUsedAt)}
                      </p>
                      {session.userAgent && (
                        <p className="truncate font-mono text-xs text-fg-subtle" title={session.userAgent}>
                          {session.userAgent}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {session.isCurrent ? (
                        <span className="text-xs text-fg-subtle">กำลังใช้งาน</span>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={revokingId === session.id}
                          disabled={revokingId !== null && revokingId !== session.id}
                          onClick={() => revoke.mutate(session.id)}
                        >
                          ออกจากระบบ
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </section>
  );
}
