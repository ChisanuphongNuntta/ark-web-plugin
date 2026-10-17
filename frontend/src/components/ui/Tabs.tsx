'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
}
const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('Tabs components must be used inside <Tabs>');
  return ctx;
}

const safeId = (v: string) => v.replace(/[^a-zA-Z0-9_-]/g, '_');

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern, automatic activation).
 * Active tab = fg text + 1px accent underline. ←/→/Home/End move between tabs.
 *
 *   <Tabs value={tab} onValueChange={setTab}>
 *     <TabsList aria-label="ส่วนของบัญชี">
 *       <TabsTrigger value="wallet">กระเป๋า</TabsTrigger>
 *     </TabsList>
 *     <TabsPanel value="wallet">…</TabsPanel>
 *   </Tabs>
 */
export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  const baseId = React.useId();
  const ctx = React.useMemo(() => ({ value, setValue: onValueChange, baseId }), [value, onValueChange, baseId]);
  return (
    <TabsContext.Provider value={ctx}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  children,
  className,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  'aria-label': string;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? []
    );
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next >= 0) {
      event.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('no-scrollbar flex gap-6 overflow-x-auto border-b border-line', className)}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  disabled,
  count,
  className,
}: {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  /** Optional count shown in mono after the label. */
  count?: number;
  className?: string;
}) {
  const ctx = useTabs();
  const selected = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.baseId}-tab-${safeId(value)}`}
      aria-selected={selected}
      aria-controls={`${ctx.baseId}-panel-${safeId(value)}`}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => ctx.setValue(value)}
      className={cn(
        'relative -mb-px inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap border-b text-sm transition-colors duration-fast',
        'disabled:pointer-events-none disabled:opacity-45',
        selected ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg',
        className
      )}
    >
      {children}
      {count !== undefined ? <span className="font-mono text-xs text-fg-subtle">{count}</span> : null}
    </button>
  );
}

export function TabsPanel({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const ctx = useTabs();
  if (ctx.value !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${ctx.baseId}-panel-${safeId(value)}`}
      aria-labelledby={`${ctx.baseId}-tab-${safeId(value)}`}
      tabIndex={0}
      className={cn('pt-6 focus-visible:outline-offset-4', className)}
    >
      {children}
    </div>
  );
}

export default Tabs;
