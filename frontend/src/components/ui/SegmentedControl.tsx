'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Optional count, rendered in mono. */
  count?: number;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<SegmentedOption<T>>;
  'aria-label': string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

/**
 * Compact single-choice switcher (radiogroup). ←/→ move and select.
 * Selected segment = surface-2 fill + fg text; no glow.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  fullWidth = false,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const groupRef = React.useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const enabled = options.filter((o) => !o.disabled);
    const index = enabled.findIndex((o) => o.value === value);
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % enabled.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + enabled.length) % enabled.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    if (next >= 0) {
      event.preventDefault();
      onChange(enabled[next].value);
      const target = groupRef.current?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(enabled[next].value)}"]`);
      target?.focus();
    }
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex max-w-full gap-0.5 overflow-x-auto rounded-control border border-line bg-canvas p-0.5 no-scrollbar',
        fullWidth && 'flex w-full',
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-value={option.value}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] font-medium transition-colors duration-fast',
              'disabled:pointer-events-none disabled:opacity-45',
              // 40px touch target on mobile, compact from the sm breakpoint.
              size === 'sm' ? 'h-10 px-2.5 text-xs sm:h-7' : 'h-10 px-3 text-sm sm:h-8',
              fullWidth && 'flex-1',
              selected ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg'
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className={cn('font-mono text-xs', selected ? 'text-fg-muted' : 'text-fg-subtle')}>{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
