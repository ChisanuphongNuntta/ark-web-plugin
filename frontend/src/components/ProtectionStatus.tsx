'use client';

import { useQuery } from '@tanstack/react-query';
import { protectionApi } from '@/lib/api';
import { Badge, Card, Skeleton } from '@/components/ui';

interface ProtectionData {
  hasProtection: boolean;
  player: {
    protectionStartAt: string;
    protectionEndAt: string;
    protectionDays: number;
    protectionType: string;
    isActive: boolean;
    remainingDays: number;
    remainingHours: number;
  } | null;
  tribe: {
    tribeId: string;
    tribeName: string;
    serverId: number;
    protectionEndAt: string;
    isActive: boolean;
  } | null;
}

const TYPE_LABEL: Record<string, string> = {
  new_player: 'ผู้เล่นใหม่',
  admin_granted: 'ทีมงานมอบให้',
};

function formatTimeRemaining(hours: number): string {
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return days > 0 ? `${days} วัน ${rest} ชม.` : `${rest} ชม.`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

export default function ProtectionStatus() {
  const { data, isLoading, error } = useQuery<ProtectionData>({
    queryKey: ['protection-status'],
    queryFn: () => protectionApi.getMyProtection().then((res) => res.data),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Card padding="lg" aria-busy>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-3 w-64" />
      </Card>
    );
  }

  // Protection is informational; hide the card rather than alarm the player on error.
  if (error) return null;

  if (!data?.hasProtection) {
    return (
      <Card padding="lg">
        <h3 className="text-base font-semibold text-fg">การป้องกันผู้เล่นใหม่</h3>
        <p className="mt-1 text-sm text-fg-muted">ตอนนี้บัญชีของคุณไม่มีการป้องกันที่ใช้งานอยู่</p>
      </Card>
    );
  }

  const { player, tribe } = data;
  const endingSoon = Boolean(player && player.remainingDays <= 1);

  return (
    <Card padding="none">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-5">
        <div>
          <h3 className="text-base font-semibold text-fg">การป้องกันผู้เล่นใหม่</h3>
          <p className="mt-1 text-sm text-fg-muted">ผู้เล่นอื่นโจมตีตัวละคร สิ่งก่อสร้าง และสัตว์เลี้ยงของคุณไม่ได้</p>
        </div>
        {player && <Badge tone="success">{TYPE_LABEL[player.protectionType] ?? player.protectionType}</Badge>}
      </div>

      <dl className="divide-y divide-line">
        {player && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div>
              <dt className="text-sm text-fg">ตัวละคร</dt>
              <dd className="text-xs text-fg-subtle">
                {formatDate(player.protectionStartAt)} – {formatDate(player.protectionEndAt)}
              </dd>
            </div>
            <dd className="text-right">
              <span className="font-mono text-base tabular-nums text-fg">{formatTimeRemaining(player.remainingHours)}</span>
              <span className="block text-xs text-fg-subtle">คงเหลือ</span>
            </dd>
          </div>
        )}
        {tribe && tribe.isActive && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div>
              <dt className="text-sm text-fg">ชนเผ่า {tribe.tribeName || tribe.tribeId}</dt>
              <dd className="text-xs text-fg-subtle">
                เซิร์ฟเวอร์ <span className="font-mono">{tribe.serverId}</span>
              </dd>
            </div>
            <dd className="text-right text-xs text-fg-subtle">หมด {formatDate(tribe.protectionEndAt)}</dd>
          </div>
        )}
      </dl>

      {endingSoon && (
        <p role="status" className="border-t border-warning/25 bg-warning/10 px-6 py-3 text-sm text-fg">
          การป้องกันจะหมดภายในหนึ่งวัน เตรียมฐานให้พร้อม
        </p>
      )}
    </Card>
  );
}
