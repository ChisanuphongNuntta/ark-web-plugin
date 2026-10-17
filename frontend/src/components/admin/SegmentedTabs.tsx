'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatCount } from './paginationMath';

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: string;
  /** Optional count shown next to the label (e.g. servers per game mode). */
  count?: number | null;
}

export interface SegmentedTabsProps<V extends string = string> {
  value: V;
  onChange: (value: V) => void;
  options: readonly SegmentedOption<V>[];
  /** Thai accessible name, e.g. 'กรองตามโหมดเกม'. */
  'aria-label': string;
  className?: string;
  disabled?: boolean;
}

/**
 * Single-choice filter row styled like the admin section nav. Implemented as a
 * radiogroup with a roving tabindex: Tab enters/leaves the group, arrow keys
 * and Home/End move the selection.
 */
export function SegmentedTabs<V extends string = string>({
  value,
  onChange,
  options,
  className,
  disabled = false,
  ...aria
}: SegmentedTabsProps<V>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const move = (index: number) => {
    const count = options.length;
    if (count === 0) return;
    const next = ((index % count) + count) % count;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        move(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        move(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        move(0);
        break;
      case 'End':
        e.preventDefault();
        move(options.length - 1);
        break;
      default:
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={aria['aria-label']}
      aria-disabled={disabled || undefined}
      className={cn('flex max-w-full gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]', className)}
    >
      {options.map((option, index) => {
        const active = index === selectedIndex;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 text-sm transition-colors',
              'disabled:pointer-events-none disabled:opacity-50',
              active
                ? 'border-iris-cyan/30 bg-iris-cyan/[0.08] text-iris-pearl'
                : 'border-transparent text-iris-muted hover:bg-white/[0.04] hover:text-iris-pearl',
            )}
          >
            {option.label}
            {option.count !== undefined && option.count !== null && (
              <span
                className={cn(
                  'rounded-full px-2 text-xs tabular-nums',
                  active ? 'bg-iris-cyan/[0.12] text-iris-pearl' : 'bg-white/[0.06] text-iris-muted',
                )}
              >
                {formatCount(option.count)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
