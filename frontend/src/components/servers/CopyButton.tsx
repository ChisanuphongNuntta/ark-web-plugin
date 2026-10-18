'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path (http or denied permission)
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export interface CopyButtonProps {
  text: string;
  /** Visible label, e.g. 'คัดลอก'. */
  label?: string;
  /** Accessible name, e.g. 'คัดลอกที่อยู่ ark.iris-th.cloud:28014'. */
  ariaLabel: string;
  className?: string;
  compact?: boolean;
}

export function CopyButton({ text, label = 'คัดลอก', ariaLabel, className, compact = false }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const onCopy = async () => {
    const ok = await writeClipboard(text);
    setState(ok ? 'copied' : 'failed');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2000);
  };

  const shown = state === 'copied' ? 'คัดลอกแล้ว' : state === 'failed' ? 'คัดลอกไม่สำเร็จ' : label;

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={state === 'idle' ? ariaLabel : shown}
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan',
        state === 'copied'
          ? 'border-emerald-300/30 text-emerald-200'
          : state === 'failed'
            ? 'border-rose-300/30 text-rose-200'
            : 'border-white/10 text-iris-muted hover:border-iris-cyan/30 hover:bg-iris-cyan/[0.06] hover:text-iris-pearl',
        className,
      )}
    >
      {state === 'copied' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      <span className={compact && state === 'idle' ? 'sr-only' : undefined} aria-live="polite">
        {shown}
      </span>
    </button>
  );
}
