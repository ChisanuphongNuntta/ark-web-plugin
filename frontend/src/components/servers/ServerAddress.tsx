'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

export interface ServerAddressProps {
  host: string | null | undefined;
  port: number | null | undefined;
  /** Show the "เข้าเกมผ่าน Steam" steam://connect link. Default true. */
  showConnect?: boolean;
  className?: string;
}

/**
 * host:port in mono with copy (confirms "คัดลอกแล้ว") and a steam://connect link.
 * Renders a muted note when the server has no public address.
 */
export function ServerAddress({ host, port, showConnect = true, className }: ServerAddressProps) {
  const { copied, copy } = useCopyToClipboard();
  if (!host || !port) {
    return <span className={cn('text-xs text-fg-subtle', className)}>ยังไม่มีที่อยู่สำหรับเชื่อมต่อ</span>;
  }
  const address = `${host}:${port}`;
  return (
    <span className={cn('inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1', className)}>
      <span className="inline-flex min-w-0 items-center gap-1">
        <code className="truncate font-mono text-[13px] text-fg">{address}</code>
        <button
          type="button"
          onClick={() => void copy(address)}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1 rounded-control px-1.5 text-xs transition-colors duration-fast',
            copied ? 'text-success' : 'text-fg-subtle hover:bg-surface-2 hover:text-fg'
          )}
          aria-label={copied ? 'คัดลอกแล้ว' : `คัดลอกที่อยู่ ${address}`}
        >
          {copied ? <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />}
          <span aria-live="polite" className={copied ? '' : 'sr-only'}>
            {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
          </span>
        </button>
      </span>
      {showConnect ? (
        <a
          href={`steam://connect/${address}`}
          className="inline-flex items-center gap-1 text-xs text-fg-muted underline-offset-4 transition-colors duration-fast hover:text-fg hover:underline"
        >
          เข้าเกมผ่าน Steam
          <ExternalLink className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
        </a>
      ) : null}
    </span>
  );
}

export default ServerAddress;
