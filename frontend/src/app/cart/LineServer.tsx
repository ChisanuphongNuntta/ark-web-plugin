'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Dialog, Skeleton, StatusDot } from '@/components/ui';
import { GameModeBadge, ServerPicker, deliveryBlockReason, serverStatusKind, serverStatusText } from '@/components/servers';
import type { ServerSummary } from '@/lib/contracts/types';

export interface LineServerProps {
  serverId: number;
  servers: ServerSummary[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Dino lines need servers that support dino delivery. */
  isDino: boolean;
  onChange: (toServerId: number) => void;
}

/** Why `server` cannot receive this line, or null. Backend flags only — never re-derived. */
export function lineBlockReason(server: ServerSummary | undefined, isDino: boolean): string | null {
  if (!server) return 'ไม่พบเซิร์ฟเวอร์นี้แล้ว เลือกเซิร์ฟเวอร์ใหม่';
  return (
    deliveryBlockReason(server) ??
    (isDino && server.supportsDinoDelivery === false ? 'เซิร์ฟเวอร์นี้ยังไม่รองรับการส่งสัตว์' : null)
  );
}

/**
 * "ส่งไปที่" row of a cart line: the chosen server, its status, and a dialog
 * with the shared <ServerPicker/> to change it.
 */
export function LineServer({ serverId, servers, loading, error, onRetry, isDino, onChange }: LineServerProps) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<number | null>(serverId);
  const server = servers.find((s) => s.id === serverId);
  const reason = loading || error ? null : lineBlockReason(server, isDino);

  const dinoReason = React.useCallback(
    (s: ServerSummary) => (isDino && s.supportsDinoDelivery === false ? 'เซิร์ฟเวอร์นี้ยังไม่รองรับการส่งสัตว์' : null),
    [isDino]
  );

  const openPicker = () => {
    setPending(serverId);
    setOpen(true);
  };

  const apply = () => {
    if (pending !== null && pending !== serverId) onChange(pending);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs text-fg-muted">ส่งไปที่</p>
        {loading ? (
          <Skeleton className="mt-1 h-5 w-48" />
        ) : server ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="truncate text-sm font-medium text-fg">{server.displayName}</span>
            <GameModeBadge mode={server.gameMode} />
            {server.cluster?.name ? <span className="text-xs text-fg-subtle">{server.cluster.name}</span> : null}
            <StatusDot status={serverStatusKind(server)} label={serverStatusText(server)} />
          </div>
        ) : (
          <p className="mt-1 font-mono text-sm text-fg-muted">เซิร์ฟเวอร์ #{serverId}</p>
        )}
        {reason ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-warning" role="alert">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {reason}
          </p>
        ) : server && !server.online && server.deliverable ? (
          <p className="mt-2 text-xs text-fg-subtle">เซิร์ฟเวอร์ออฟไลน์อยู่ ของจะเข้าคิวและส่งเมื่อเซิร์ฟเวอร์กลับมา</p>
        ) : null}
      </div>
      <Button variant="secondary" size="sm" onClick={openPicker} disabled={loading}>
        เปลี่ยนเซิร์ฟเวอร์
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="เลือกเซิร์ฟเวอร์ที่จะรับของ"
        description="ของจะถูกส่งเข้าตัวละครของคุณในเซิร์ฟเวอร์ที่เลือก"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={apply} disabled={pending === null}>
              ใช้เซิร์ฟเวอร์นี้
            </Button>
          </>
        }
      >
        <ServerPicker
          servers={servers}
          value={pending}
          onChange={(id) => setPending(id)}
          loading={loading}
          error={error ? 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง' : null}
          onRetry={onRetry}
          disabledReason={dinoReason}
          maxHeight={360}
        />
      </Dialog>
    </div>
  );
}
