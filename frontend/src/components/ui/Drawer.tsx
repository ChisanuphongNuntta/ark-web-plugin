'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from './IconButton';
import { Portal, useEscapeKey, useFocusTrap, useScrollLock } from './overlay';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edge the sheet attaches to. */
  side?: 'right' | 'left' | 'bottom';
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Width for left/right sheets. */
  size?: 'sm' | 'md' | 'lg';
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  /** Accessible name when no visible title is rendered. */
  'aria-label'?: string;
}

const SIDE = {
  right: 'inset-y-0 right-0 h-full border-l',
  left: 'inset-y-0 left-0 h-full border-r',
  bottom: 'inset-x-0 bottom-0 max-h-[88dvh] w-full rounded-t-dialog border-t',
};
const WIDTH = { sm: 'w-[min(320px,88vw)]', md: 'w-[min(400px,92vw)]', lg: 'w-[min(560px,96vw)]' };

/** Side sheet (mobile nav, filters, cart, admin detail). Same a11y plumbing as Dialog. */
export function Drawer({
  open,
  onOpenChange,
  side = 'right',
  title,
  description,
  children,
  footer,
  size = 'md',
  initialFocusRef,
  className,
  'aria-label': ariaLabel,
}: DrawerProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const baseId = React.useId();
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  useScrollLock(open);
  useFocusTrap(panelRef, open, initialFocusRef);
  useEscapeKey(open, close);

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-overlay">
        <div className="absolute inset-0 bg-[rgb(var(--scrim)/0.72)]" aria-hidden="true" onClick={close} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? `${baseId}-title` : undefined}
          aria-label={title ? undefined : ariaLabel}
          aria-describedby={description ? `${baseId}-desc` : undefined}
          tabIndex={-1}
          className={cn(
            'absolute flex flex-col border-line bg-surface text-fg shadow-overlay outline-none',
            SIDE[side],
            side !== 'bottom' && WIDTH[size],
            className
          )}
        >
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              {title ? (
                <h2 id={`${baseId}-title`} className="text-base font-semibold text-fg">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p id={`${baseId}-desc`} className="mt-1 text-sm text-fg-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <IconButton aria-label="ปิด" size="sm" onClick={close} className="-mr-1.5">
              <X className="h-4 w-4" strokeWidth={1.5} />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer ? <div className="border-t border-line px-5 py-4">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

/** Alias — some teams call it a Sheet. */
export const Sheet = Drawer;

export default Drawer;
