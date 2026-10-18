'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import type { ModeTab } from './serverFormat';

export interface ModeTabOption {
  id: ModeTab;
  label: string;
  servers: number;
  online: number;
  players: number;
}

export interface ModeTabsProps {
  value: ModeTab;
  onChange: (value: ModeTab) => void;
  options: readonly ModeTabOption[];
  panelId: string;
}

/** Game-mode tabs (WAI-ARIA tabs, arrow keys / Home / End) with live counts. */
export function ModeTabs({ value, onChange, options, panelId }: ModeTabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (index: number) => {
    const count = options.length;
    if (!count) return;
    const next = ((index % count) + count) % count;
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(index + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      move(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      move(options.length - 1);
    }
  };

  return (
    <div role="tablist" aria-label="เลือกโหมดเซิร์ฟเวอร์" className="flex max-w-full gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {options.map((option, index) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={`servers-tab-${option.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'flex min-h-12 shrink-0 flex-col items-start justify-center rounded-lg border px-3.5 py-1.5 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan',
              active
                ? 'border-iris-cyan/30 bg-iris-cyan/[0.08] text-iris-pearl'
                : 'border-transparent text-iris-muted hover:bg-white/[0.04] hover:text-iris-pearl',
            )}
          >
            <span className="text-sm font-semibold">
              {option.label}
              <span className={cn('ml-2 rounded-full px-2 text-xs tabular-nums', active ? 'bg-iris-cyan/[0.12]' : 'bg-white/[0.06]')}>
                {option.servers.toLocaleString('th-TH')}
              </span>
            </span>
            <span className="text-[11px] tabular-nums text-iris-muted">
              ออนไลน์ {option.online.toLocaleString('th-TH')} · ผู้เล่น {option.players.toLocaleString('th-TH')} คน
            </span>
          </button>
        );
      })}
    </div>
  );
}
