'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Portal, useEscapeKey, useFocusTrap, useScrollLock } from './overlay';

export interface DialogProps {
  /** Controlled open state (`open` or legacy `isOpen`). */
  open?: boolean;
  /** @deprecated use `open`. */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  /** Title in the built-in header. Omit to compose with <DialogHeader>/<DialogTitle>. */
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Custom footer (buttons). Overrides the built-in confirm/cancel footer. */
  footer?: React.ReactNode;
  /** Built-in confirm footer: shown when `onConfirm` is set. */
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  /** Tone of the header icon and confirm button. */
  variant?: 'default' | 'danger' | 'warning' | 'success';
  /** Disables closing and shows a spinner on the confirm button. */
  loading?: boolean;
  /** Hide the cancel button in the built-in footer. */
  singleButton?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Element to focus on open (defaults to the first focusable). */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Hide the × close button. */
  hideClose?: boolean;
  /** Prevent closing on backdrop click (forms with unsaved input). */
  dismissible?: boolean;
  className?: string;
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

const TONE_ICON = {
  default: null,
  success: <CheckCircle2 className="h-[18px] w-[18px] text-success" strokeWidth={1.5} aria-hidden="true" />,
  warning: <AlertTriangle className="h-[18px] w-[18px] text-warning" strokeWidth={1.5} aria-hidden="true" />,
  danger: <AlertTriangle className="h-[18px] w-[18px] text-danger" strokeWidth={1.5} aria-hidden="true" />,
};

interface DialogContextValue {
  titleId: string;
  descriptionId: string;
  close: () => void;
}
const DialogContext = React.createContext<DialogContextValue | null>(null);

/**
 * Modal dialog: portal, focus trap + restore, Escape, scroll lock, 14px radius,
 * solid scrim (no blur). Two ways to use it:
 *
 *   <Dialog open={o} onOpenChange={setO} title="ลบสินค้า" description="…"
 *           onConfirm={del} confirmText="ลบ" variant="danger" />
 *
 *   <Dialog open={o} onOpenChange={setO}>
 *     <DialogHeader><DialogTitle>…</DialogTitle></DialogHeader>
 *     <DialogBody>…</DialogBody>
 *     <DialogFooter>…</DialogFooter>
 *   </Dialog>
 */
export function Dialog({
  open,
  isOpen,
  onOpenChange,
  onClose,
  title,
  description,
  children,
  footer,
  onConfirm,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  variant = 'default',
  loading = false,
  singleButton = false,
  size = 'md',
  initialFocusRef,
  hideClose = false,
  dismissible = true,
  className,
}: DialogProps) {
  const visible = open ?? isOpen ?? false;
  const panelRef = React.useRef<HTMLDivElement>(null);
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-desc`;

  const close = React.useCallback(() => {
    if (loading) return;
    onClose?.();
    onOpenChange?.(false);
  }, [loading, onClose, onOpenChange]);

  useScrollLock(visible);
  useFocusTrap(panelRef, visible, initialFocusRef);
  useEscapeKey(visible, close);

  const ctx = React.useMemo(() => ({ titleId, descriptionId, close }), [titleId, descriptionId, close]);

  if (!visible) return null;

  const showBuiltInFooter = !footer && !!onConfirm;

  return (
    <Portal>
      <div className="fixed inset-0 z-overlay flex items-end justify-center p-0 sm:items-center sm:p-6">
        <div
          className="absolute inset-0 bg-[rgb(var(--scrim)/0.72)]"
          aria-hidden="true"
          onClick={dismissible ? close : undefined}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(
            'relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-line bg-surface text-fg shadow-overlay outline-none',
            'rounded-t-dialog sm:rounded-dialog',
            SIZES[size],
            className
          )}
        >
          <DialogContext.Provider value={ctx}>
            {title ? (
              <div className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
                {TONE_ICON[variant] ? <span className="mt-1">{TONE_ICON[variant]}</span> : null}
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="text-base font-semibold leading-snug text-fg">
                    {title}
                  </h2>
                  {description ? (
                    <p id={descriptionId} className="mt-1 text-sm text-fg-muted">
                      {description}
                    </p>
                  ) : null}
                </div>
                {!hideClose ? (
                  <IconButton aria-label="ปิดหน้าต่าง" size="sm" onClick={close} disabled={loading} className="-mr-1.5">
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </IconButton>
                ) : null}
              </div>
            ) : !hideClose ? (
              <IconButton
                aria-label="ปิดหน้าต่าง"
                size="sm"
                onClick={close}
                disabled={loading}
                className="absolute right-3 top-3 z-10"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </IconButton>
            ) : null}

            {children !== undefined && children !== null ? (
              title ? <DialogBody>{children}</DialogBody> : <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
            ) : null}

            {footer ? <DialogFooter>{footer}</DialogFooter> : null}
            {showBuiltInFooter ? (
              <DialogFooter>
                {!singleButton ? (
                  <Button variant="secondary" onClick={close} disabled={loading}>
                    {cancelText}
                  </Button>
                ) : null}
                <Button variant={variant === 'danger' ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
                  {confirmText}
                </Button>
              </DialogFooter>
            ) : null}
          </DialogContext.Provider>
        </div>
      </div>
    </Portal>
  );
}

/** Access the surrounding dialog (ids + close) from custom content. */
export function useDialog() {
  return React.useContext(DialogContext);
}

/** True inside the legacy <DialogContent> wrapper (which already pads). */
const InsideContentContext = React.createContext(false);

/** Header block for composed dialogs. */
export function DialogHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  const inside = React.useContext(InsideContentContext);
  return (
    <div className={cn(inside ? 'border-b border-line pb-3 pr-8' : 'border-b border-line px-5 py-4 pr-14 sm:px-6', className)}>
      {children}
    </div>
  );
}

export function DialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  const ctx = React.useContext(DialogContext);
  return (
    <h2 id={ctx?.titleId} className={cn('text-base font-semibold leading-snug text-fg', className)}>
      {children}
    </h2>
  );
}

export function DialogDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  const ctx = React.useContext(DialogContext);
  return (
    <p id={ctx?.descriptionId} className={cn('mt-1 text-sm text-fg-muted', className)}>
      {children}
    </p>
  );
}

/** Scrollable body with standard padding. */
export function DialogBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-5 text-sm text-fg sm:px-6', className)}>{children}</div>;
}

/** @deprecated legacy name; renders a padded body. Prefer DialogBody. */
export function DialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <InsideContentContext.Provider value={true}>
      <div className={cn('flex w-full flex-col gap-4 overflow-y-auto px-5 py-5 text-sm sm:px-6', className)}>{children}</div>
    </InsideContentContext.Provider>
  );
}

/** Footer row: right-aligned actions, stacked full-width on mobile. */
export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6',
        '[&>*]:w-full sm:[&>*]:w-auto',
        className
      )}
    >
      {children}
    </div>
  );
}

export default Dialog;
