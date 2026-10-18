'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

const subscribeNothing = () => () => undefined;
/** true on the client after hydration, false during SSR — safe for portals. */
function useIsClient(): boolean {
  return React.useSyncExternalStore(subscribeNothing, () => true, () => false);
}

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null,
  );
}

export interface AdminDialogProps {
  open: boolean;
  /** Called on Escape, backdrop click and the close button (unless `busy`). */
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Buttons row (right-aligned). */
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** While true, Escape/backdrop/close are ignored (e.g. request in flight). */
  busy?: boolean;
  /** Element to focus when the dialog opens. Default: first focusable field. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** 'alertdialog' for confirmations. */
  role?: 'dialog' | 'alertdialog';
  /** 'center' (default) modal, or 'right' = full-height side drawer (row details). */
  placement?: 'center' | 'right';
  className?: string;
}

const sizeClass = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' } as const;
const drawerSizeClass = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' } as const;

/**
 * Themed modal: portal to <body>, Escape to close, focus trapped inside,
 * focus restored to the opener on close, page scroll locked while open.
 * Use for add/edit forms. For destructive confirmations use <ConfirmDialog>.
 */
export function AdminDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  busy = false,
  initialFocusRef,
  role = 'dialog',
  placement = 'center',
  className,
}: AdminDialogProps) {
  const drawer = placement === 'right';
  const isClient = useIsClient();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  // Latest values for the long-lived keydown listener, without re-subscribing.
  const latest = React.useRef({ onClose, busy });
  React.useEffect(() => {
    latest.current = { onClose, busy };
  });

  React.useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      // initialFocusRef > [data-autofocus] > first field in the body > the panel itself
      // (never the close button, so Enter cannot dismiss by accident).
      const body = bodyRef.current;
      const target =
        initialFocusRef?.current ??
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        (body ? focusableIn(body)[0] : undefined) ??
        panel;
      target.focus();
    };
    const raf = window.requestAnimationFrame(focusFirst);

    const onKeyDown = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (!latest.current.busy) latest.current.onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusableIn(panel);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, initialFocusRef]);

  if (!open || !isClient) return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[200] flex',
        drawer ? 'items-stretch justify-end' : 'items-center justify-center overflow-y-auto p-4',
      )}
    >
      <div
        className="fixed inset-0 bg-[#020c18b3] backdrop-blur-[5px]"
        aria-hidden="true"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex w-full flex-col overflow-hidden border border-[color:var(--line)] text-iris-pearl shadow-[0_24px_60px_rgba(0,0,0,0.45)] focus:outline-none',
          drawer
            ? 'h-[100dvh] max-h-[100dvh] rounded-none border-y-0 border-r-0 bg-[var(--surface-2)] sm:rounded-l-[20px]'
            : 'max-h-[calc(100dvh-2rem)] rounded-[20px] bg-[var(--surface-1)]',
          drawer ? drawerSizeClass[size] : sizeClass[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-4">
          <div className="min-w-0 space-y-1">
            <h2 id={titleId} className="text-lg font-semibold text-iris-pearl">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-sm text-iris-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="ปิดหน้าต่าง"
            className="-mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-iris-muted hover:bg-white/[0.06] hover:text-iris-pearl disabled:opacity-40"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children && <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5 text-sm">{children}</div>}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
