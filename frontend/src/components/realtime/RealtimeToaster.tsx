'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToastStore, type Toast, type ToastTone } from '@/lib/realtime/toastStore';

const AUTO_DISMISS_MS = 6500;

const TONE: Record<ToastTone, { icon: React.ReactNode; border: string }> = {
  success: { icon: <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />, border: 'border-emerald-300/30' },
  info: { icon: <Info className="h-4 w-4 text-iris-cyan" aria-hidden="true" />, border: 'border-iris-cyan/30' },
  warning: { icon: <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden="true" />, border: 'border-amber-300/30' },
  error: { icon: <XCircle className="h-4 w-4 text-rose-300" aria-hidden="true" />, border: 'border-rose-300/30' },
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, dismiss]);

  const tone = TONE[toast.tone];
  const body = (
    <>
      <span className="mt-0.5 shrink-0">{tone.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-iris-pearl">{toast.title}</span>
        {toast.description ? <span className="mt-0.5 block text-xs text-iris-muted">{toast.description}</span> : null}
      </span>
    </>
  );

  return (
    <li
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border ${tone.border} bg-[#0d2335]/95 p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
    >
      {toast.href ? (
        <Link href={toast.href} onClick={() => dismiss(toast.id)} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan">
          {body}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-start gap-3">{body}</span>
      )}
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-iris-muted transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan"
        aria-label="ปิดการแจ้งเตือน"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/** Small Thai notifications for realtime events (bottom-left; chat sits bottom-right). */
export function RealtimeToaster() {
  const toasts = useToastStore((state) => state.toasts);
  return (
    <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[22rem]">
      <ol className="flex flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </ol>
    </div>
  );
}
