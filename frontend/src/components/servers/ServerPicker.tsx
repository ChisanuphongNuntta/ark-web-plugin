'use client';

import * as React from 'react';
import { Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GameMode, ServerSummary } from '@/lib/contracts/types';
import { readStorage, writeStorage } from '@/hooks/useLocalStorage';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { StatusDot } from '@/components/ui/StatusDot';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { EmptyState } from '@/components/ui/EmptyState';
import { GAME_MODE_LABEL, GAME_MODE_ORDER, deliveryBlockReason, serverStatusKind } from './serverMeta';

export const LAST_SERVER_STORAGE_KEY = 'iris.server.last.v1';

export interface ServerPickerProps {
  /** All candidate servers (e.g. from useServers()). Non-deliverable ones render disabled with a reason. */
  servers: ServerSummary[];
  value: number | null;
  onChange: (serverId: number, server: ServerSummary) => void;
  loading?: boolean;
  /** Error message when the server list failed to load. */
  error?: string | null;
  onRetry?: () => void;
  /** Extra eligibility rule (e.g. dino delivery support). Return a Thai reason to disable. */
  disabledReason?: (server: ServerSummary) => string | null;
  /** localStorage key to remember the last choice; `false` disables. */
  rememberKey?: string | false;
  /** Visible label for the list. */
  label?: string;
  /** Max height of the scroll area in px. */
  maxHeight?: number;
  className?: string;
}

interface Group {
  key: string;
  title: string;
  meta: string | null;
  servers: ServerSummary[];
}

function groupServers(list: ServerSummary[], withModePrefix: boolean): Group[] {
  const groups = new Map<string, Group>();
  for (const s of list) {
    const key = s.cluster?.key ?? `mode-${s.gameMode}`;
    let g = groups.get(key);
    if (!g) {
      const base = s.cluster?.name ?? GAME_MODE_LABEL[s.gameMode];
      const meta = [s.rates, s.isModded ? 'Mod' : null].filter(Boolean).join(' · ') || null;
      g = { key, title: withModePrefix && s.cluster ? `${GAME_MODE_LABEL[s.gameMode]} · ${base}` : base, meta, servers: [] };
      groups.set(key, g);
    }
    g.servers.push(s);
  }
  for (const g of groups.values()) {
    g.servers.sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName));
  }
  return [...groups.values()];
}

function matches(s: ServerSummary, q: string): boolean {
  const hay = `${s.displayName} ${s.name} ${s.map ?? ''} ${s.cluster?.name ?? ''} ${GAME_MODE_LABEL[s.gameMode]}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => hay.includes(part));
}

/**
 * Server chooser for buy/checkout flows.
 * - Game-mode tabs (PvE / PvE Mod / PvPvE) with deliverable counts
 * - cluster sub-headings (sticky), search across all modes
 * - only deliverable servers are selectable; disabled rows explain why
 * - remembers the last choice; auto-selects when exactly one server qualifies
 * - listbox keyboard model: ↑/↓/Home/End move, Enter/Space select
 */
export function ServerPicker({
  servers,
  value,
  onChange,
  loading = false,
  error = null,
  onRetry,
  disabledReason,
  rememberKey = LAST_SERVER_STORAGE_KEY,
  label = 'เลือกเซิร์ฟเวอร์ที่จะรับของ',
  maxHeight = 320,
  className,
}: ServerPickerProps) {
  const baseId = React.useId();
  const listRef = React.useRef<HTMLDivElement>(null);
  const [modeChoice, setModeChoice] = React.useState<GameMode | null>(null);
  const [query, setQuery] = React.useState('');
  const [activeId, setActiveId] = React.useState<number | null>(null);

  const reasonFor = React.useCallback(
    (s: ServerSummary) => deliveryBlockReason(s) ?? disabledReason?.(s) ?? null,
    [disabledReason]
  );

  const enabledServers = React.useMemo(() => servers.filter((s) => !reasonFor(s)), [servers, reasonFor]);
  const modes = React.useMemo(() => GAME_MODE_ORDER.filter((m) => servers.some((s) => s.gameMode === m)), [servers]);
  const selected = servers.find((s) => s.id === value) ?? null;

  const defaultMode: GameMode | null =
    selected?.gameMode ??
    modes.find((m) => enabledServers.some((s) => s.gameMode === m)) ??
    modes[0] ??
    null;
  const mode = modeChoice && modes.includes(modeChoice) ? modeChoice : defaultMode;

  // Restore the remembered server, or auto-pick when exactly one qualifies.
  const restored = React.useRef(false);
  React.useEffect(() => {
    if (restored.current || loading || value !== null || enabledServers.length === 0) return;
    restored.current = true;
    const rememberedId = rememberKey ? readStorage<number | null>(rememberKey, null) : null;
    const remembered = enabledServers.find((s) => s.id === rememberedId);
    const pick = remembered ?? (enabledServers.length === 1 ? enabledServers[0] : null);
    if (pick) onChange(pick.id, pick);
  }, [loading, value, enabledServers, rememberKey, onChange]);

  const select = (s: ServerSummary) => {
    if (reasonFor(s)) return;
    onChange(s.id, s);
    setActiveId(s.id);
    if (rememberKey) writeStorage(rememberKey, s.id);
  };

  const q = query.trim();
  const visible = React.useMemo(
    () => (q ? servers.filter((s) => matches(s, q)) : servers.filter((s) => s.gameMode === mode)),
    [servers, q, mode]
  );
  const groups = React.useMemo(() => groupServers(visible, !!q), [visible, q]);
  const orderedEnabled = React.useMemo(
    () => groups.flatMap((g) => g.servers).filter((s) => !reasonFor(s)),
    [groups, reasonFor]
  );

  React.useEffect(() => {
    if (activeId === null) return;
    document.getElementById(`${baseId}-opt-${activeId}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeId, baseId]);

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!orderedEnabled.length) return;
    const index = orderedEnabled.findIndex((s) => s.id === activeId);
    let next = -1;
    if (event.key === 'ArrowDown') next = index < 0 ? 0 : Math.min(orderedEnabled.length - 1, index + 1);
    else if (event.key === 'ArrowUp') next = index < 0 ? 0 : Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = orderedEnabled.length - 1;
    else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
      event.preventDefault();
      select(orderedEnabled[index]);
      return;
    }
    if (next >= 0) {
      event.preventDefault();
      setActiveId(orderedEnabled[next].id);
    }
  };

  const onListFocus = () => {
    if (activeId !== null && orderedEnabled.some((s) => s.id === activeId)) return;
    setActiveId(orderedEnabled.find((s) => s.id === value)?.id ?? orderedEnabled[0]?.id ?? null);
  };

  /* ------------------------------ states ------------------------------ */

  if (error) {
    return (
      <div className={className}>
        <p className="mb-2 text-xs font-medium text-fg-muted">{label}</p>
        <ErrorMessage title="โหลดรายชื่อเซิร์ฟเวอร์ไม่สำเร็จ" message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={className} aria-busy="true">
        <p className="mb-2 text-xs font-medium text-fg-muted">{label}</p>
        <div className="space-y-2 rounded-card border border-line p-3">
          <Skeleton className="h-8 w-56" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
    );
  }

  if (enabledServers.length === 0) {
    return (
      <div className={className}>
        <p className="mb-2 text-xs font-medium text-fg-muted">{label}</p>
        <EmptyState
          title="ยังไม่มีเซิร์ฟเวอร์ที่รับของได้ตอนนี้"
          description="ระบบส่งของปิดรับชั่วคราว ลองใหม่อีกครั้งภายหลัง หรือดูสถานะที่หน้ารายชื่อเซิร์ฟเวอร์"
          className="py-8"
        />
      </div>
    );
  }

  const deliverableCount = (m: GameMode) => enabledServers.filter((s) => s.gameMode === m).length;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p id={`${baseId}-label`} className="text-xs font-medium text-fg-muted">
          {label}
        </p>
        <p className="text-xs text-fg-subtle">
          รับของได้ <span className="font-mono text-fg-muted">{enabledServers.length}</span> /{' '}
          <span className="font-mono">{servers.length}</span>
        </p>
      </div>

      <div className="rounded-card border border-line bg-surface">
        <div className="flex flex-col gap-2 border-b border-line p-2 sm:flex-row sm:items-center">
          {modes.length > 1 && mode ? (
            <SegmentedControl
              aria-label="โหมดเกม"
              size="sm"
              value={mode}
              onChange={(m) => {
                setModeChoice(m);
                setQuery('');
              }}
              options={modes.map((m) => ({ value: m, label: GAME_MODE_LABEL[m], count: deliverableCount(m) }))}
              className={cn(q && 'opacity-60')}
            />
          ) : null}
          <label className="relative flex min-w-0 flex-1 items-center">
            <span className="sr-only">ค้นหาเซิร์ฟเวอร์</span>
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-fg-subtle" strokeWidth={1.5} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาแผนที่หรือกลุ่ม"
              className="h-8 w-full rounded-control border border-line bg-canvas pl-8 pr-2.5 text-xs text-fg placeholder:text-fg-subtle transition-colors duration-fast focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        <div
          ref={listRef}
          role="listbox"
          tabIndex={0}
          aria-labelledby={`${baseId}-label`}
          aria-activedescendant={activeId !== null ? `${baseId}-opt-${activeId}` : undefined}
          onKeyDown={onListKeyDown}
          onFocus={onListFocus}
          className="overflow-y-auto overscroll-contain focus-visible:outline-offset-[-2px]"
          style={{ maxHeight }}
        >
          {groups.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-muted">
              ไม่พบเซิร์ฟเวอร์ที่ตรงกับ <span className="text-fg">“{q}”</span>
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.key} role="group" aria-label={group.title}>
                <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-1.5">
                  <span className="truncate text-xs font-medium text-fg-muted">{group.title}</span>
                  {group.meta ? <span className="shrink-0 font-mono text-2xs text-fg-subtle">{group.meta}</span> : null}
                </div>
                {group.servers.map((s) => {
                  const reason = reasonFor(s);
                  const isSelected = s.id === value;
                  const isActive = s.id === activeId;
                  return (
                    <div
                      key={s.id}
                      id={`${baseId}-opt-${s.id}`}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={reason ? true : undefined}
                      onClick={() => select(s)}
                      onMouseEnter={() => !reason && setActiveId(s.id)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-fast',
                        reason ? 'cursor-not-allowed' : 'cursor-pointer',
                        isSelected ? 'bg-surface-2' : isActive && !reason ? 'bg-surface-2/60' : undefined
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid h-4 w-4 shrink-0 place-items-center rounded-full border',
                          isSelected ? 'border-accent' : 'border-line-strong',
                          reason && 'opacity-40'
                        )}
                      >
                        {isSelected ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate', reason ? 'text-fg-subtle' : 'text-fg')}>{s.displayName}</span>
                        {reason ? (
                          <span className="block truncate text-xs text-fg-subtle">{reason}</span>
                        ) : !s.online ? (
                          <span className="block truncate text-xs text-fg-subtle">ออฟไลน์ ของจะเข้าคิวรอส่งเมื่อเซิร์ฟเวอร์กลับมา</span>
                        ) : null}
                      </span>
                      <StatusDot status={serverStatusKind(s)} />
                      <span
                        className="inline-flex w-12 shrink-0 items-center justify-end gap-1 font-mono text-xs text-fg-muted"
                        aria-label={`ผู้เล่น ${s.playerCount} คน`}
                      >
                        <Users className="h-3 w-3 text-fg-subtle" strokeWidth={1.5} aria-hidden="true" />
                        {s.online ? s.playerCount : '–'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default ServerPicker;
