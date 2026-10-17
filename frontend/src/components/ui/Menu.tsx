'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useEscapeKey, useOutsidePointer } from './overlay';

interface MenuContextValue {
  close: (restoreFocus?: boolean) => void;
}
const MenuContext = React.createContext<MenuContextValue | null>(null);

export interface MenuTriggerProps {
  ref: React.Ref<HTMLButtonElement>;
  id: string;
  type: 'button';
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}

export interface MenuProps {
  /** Render the trigger; spread the given props onto a <button>. */
  renderTrigger: (props: MenuTriggerProps, state: { open: boolean }) => React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end';
  /** Accessible name of the menu list. */
  label: string;
  className?: string;
  menuClassName?: string;
}

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

/**
 * Dropdown menu (account menu, "more" nav, table row actions).
 * Keyboard: Enter/Space/↓ opens and focuses the first item, ↑/↓/Home/End move,
 * Escape closes and returns focus to the trigger, Tab closes.
 */
export function Menu({ renderTrigger, children, align = 'start', label, className, menuClassName }: MenuProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const baseId = React.useId();
  const focusFirstOnOpen = React.useRef<'first' | 'last' | null>(null);

  const close = React.useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEscapeKey(open, () => close(true));
  useOutsidePointer([rootRef], open, () => close(false));

  React.useEffect(() => {
    if (!open || !focusFirstOnOpen.current) return;
    const items = listRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR);
    if (items && items.length) {
      (focusFirstOnOpen.current === 'last' ? items[items.length - 1] : items[0]).focus();
    }
    focusFirstOnOpen.current = null;
  }, [open]);

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      focusFirstOnOpen.current = 'first';
      setOpen(true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusFirstOnOpen.current = 'last';
      setOpen(true);
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'Tab') {
      close(false);
      return;
    }
    if (next >= 0) {
      event.preventDefault();
      items[next].focus();
    }
  };

  const triggerProps: MenuTriggerProps = {
    ref: triggerRef,
    id: `${baseId}-trigger`,
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': `${baseId}-menu`,
    onClick: () => setOpen((v) => !v),
    onKeyDown: onTriggerKeyDown,
  };

  return (
    <div ref={rootRef} className={cn('relative inline-flex', className)}>
      {renderTrigger(triggerProps, { open })}
      {open ? (
        <MenuContext.Provider value={{ close }}>
          <div
            ref={listRef}
            id={`${baseId}-menu`}
            role="menu"
            aria-label={label}
            aria-labelledby={`${baseId}-trigger`}
            onKeyDown={onListKeyDown}
            className={cn(
              'absolute top-[calc(100%+6px)] z-overlay min-w-[220px] rounded-card border border-line bg-surface p-1 shadow-overlay',
              align === 'end' ? 'right-0' : 'left-0',
              menuClassName
            )}
          >
            {children}
          </div>
        </MenuContext.Provider>
      ) : null}
    </div>
  );
}

export interface MenuItemProps {
  children: React.ReactNode;
  href?: string;
  onSelect?: () => void;
  icon?: React.ReactNode;
  /** Right-aligned hint (shortcut, count, mono value). */
  hint?: React.ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Mark the item as the current page. */
  current?: boolean;
  /** Open href in a new tab (external links). */
  external?: boolean;
}

export function MenuItem({ children, href, onSelect, icon, hint, tone = 'default', disabled, current, external }: MenuItemProps) {
  const ctx = React.useContext(MenuContext);
  const className = cn(
    'flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm outline-none transition-colors duration-fast',
    'focus-visible:bg-surface-2 hover:bg-surface-2',
    tone === 'danger' ? 'text-danger' : current ? 'text-fg' : 'text-fg-muted hover:text-fg focus-visible:text-fg',
    disabled && 'pointer-events-none opacity-45'
  );
  const content = (
    <>
      {icon ? (
        <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="shrink-0 text-xs text-fg-subtle">{hint}</span> : null}
    </>
  );
  const handle = () => {
    if (disabled) return;
    onSelect?.();
    ctx?.close(false);
  };

  if (href) {
    return (
      <Link
        href={href}
        role="menuitem"
        tabIndex={-1}
        aria-disabled={disabled || undefined}
        aria-current={current ? 'page' : undefined}
        className={className}
        onClick={handle}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      >
        {content}
      </Link>
    );
  }
  return (
    <button type="button" role="menuitem" tabIndex={-1} aria-disabled={disabled || undefined} className={className} onClick={handle}>
      {content}
    </button>
  );
}

export function MenuLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-2.5 pb-1.5 pt-2 text-xs text-fg-subtle', className)}>{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line" />;
}

export default Menu;
