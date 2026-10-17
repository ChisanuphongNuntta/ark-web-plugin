import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatusKind = 'online' | 'offline' | 'degraded' | 'maintenance' | 'unknown';

const COLOR: Record<StatusKind, string> = {
  online: 'bg-success',
  offline: 'bg-fg-subtle/60',
  degraded: 'bg-warning',
  maintenance: 'bg-info',
  unknown: 'border border-fg-subtle bg-transparent',
};

export const STATUS_LABEL: Record<StatusKind, string> = {
  online: 'ออนไลน์',
  offline: 'ออฟไลน์',
  degraded: 'มีปัญหา',
  maintenance: 'ปิดปรับปรุง',
  unknown: 'ไม่ทราบสถานะ',
};

export interface StatusDotProps {
  status: StatusKind;
  /** Visible label. `true` uses the default Thai label. Omit for dot-only (label still read by screen readers). */
  label?: ReactNode | true;
  className?: string;
}

/** 8px status dot — static, never pulsing or glowing. */
export function StatusDot({ status, label, className }: StatusDotProps) {
  const text = label === true ? STATUS_LABEL[status] : label;
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs text-fg-muted', className)}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', COLOR[status])} aria-hidden="true" />
      {text ? <span>{text}</span> : <span className="sr-only">{STATUS_LABEL[status]}</span>}
    </span>
  );
}

export default StatusDot;
