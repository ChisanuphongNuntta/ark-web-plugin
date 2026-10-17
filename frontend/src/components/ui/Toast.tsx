'use client';

import * as React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Portal } from './overlay';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface ToastOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  tone?: ToastTone;
  /** ms before auto-dismiss; 0 keeps it until dismissed. Default 5000 (8000 for danger). */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
}

type ToastFn = ((options: ToastOptions) => number) & {
  success: (title: React.ReactNode, description?: React.ReactNode) => number;
  error: (title: React.ReactNode, description?: React.ReactNode) => number;
  info: (title: React.ReactNode, description?: React.ReactNode) => number;
  dismiss: (id: number) => void;
};

const ToastContext = React.createContext<ToastFn | null>(null);

const ICON: Record<ToastTone, React.ReactNode> = {
  neutral: null,
  success: <CheckCircle2 className="h-[18px] w-[18px] text-success" strokeWidth={1.5} aria-hidden="true" />,
  warning: <AlertTriangle className="h-[18px] w-[18px] text-warning" strokeWidth={1.5} aria-hidden="true" />,
  danger: <AlertCircle className="h-[18px] w-[18px] text-danger" strokeWidth={1.5} aria-hidden="true" />,
  info: <Info className="h-[18px] w-[18px] text-info" strokeWidth={1.5} aria-hidden="true" />,
};

/** Mount once (in Providers). Toasts render in a portal, bottom-right (bottom on mobile). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);
  const timers = React.useRef(new Map<number, number>());

  const dismiss = React.useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = React.useMemo<ToastFn>(() => {
    const show = (options: ToastOptions) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { ...options, id }]);
      const duration = options.duration ?? (options.tone === 'danger' ? 8000 : 5000);
      if (duration > 0) {
        timers.current.set(id, window.setTimeout(() => dismiss(id), duration));
      }
      return id;
    };
    const fn = show as ToastFn;
    fn.success = (title, description) => show({ title, description, tone: 'success' });
    fn.error = (title, description) => show({ title, description, tone: 'danger' });
    fn.info = (title, description) => show({ title, description, tone: 'info' });
    fn.dismiss = dismiss;
    return fn;
  }, [dismiss]);

  React.useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => window.clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Portal>
        <div
          aria-live="polite"
          aria-relevant="additions"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-toast flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end sm:p-6"
        >
          {items.map((t) => (
            <div
              key={t.id}
              role={t.tone === 'danger' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border bg-surface-2 px-4 py-3 shadow-overlay',
                t.tone === 'danger' ? 'border-danger/40' : 'border-line-strong'
              )}
            >
              {ICON[t.tone ?? 'neutral'] ? <span className="mt-0.5 shrink-0">{ICON[t.tone ?? 'neutral']}</span> : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{t.title}</p>
                {t.description ? <p className="mt-0.5 text-sm text-fg-muted">{t.description}</p> : null}
                {t.action ? (
                  <button
                    type="button"
                    className="mt-2 text-sm font-medium text-accent underline-offset-4 hover:underline"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-control text-fg-subtle transition-colors duration-fast hover:bg-surface-3 hover:text-fg"
                aria-label="ปิดการแจ้งเตือน"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      </Portal>
    </ToastContext.Provider>
  );
}

/**
 * const toast = useToast();
 * toast.success('เพิ่มลงตะกร้าแล้ว');
 * toast({ title: 'ลองใหม่ไม่สำเร็จ', description: err.message, tone: 'danger' });
 */
export function useToast(): ToastFn {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast() must be used inside <ToastProvider>');
  return ctx;
}
