'use client';
import { T } from '@/components/i18n/LanguageProvider';

import * as React from 'react';
import { CircleAlert } from 'lucide-react';
import type { GameMode, ServerStatus } from '@/lib/contracts/types';

type ModeTab = GameMode | 'OTHER';

const MODE_TABS: { key: ModeTab; label: string }[] = [
  { key: 'PVE', label: 'PvE' },
  { key: 'PVE_MOD', label: 'PvE Mod' },
  { key: 'PVPVE', label: 'PvPvE' },
  { key: 'OTHER', label: 'อื่นๆ' },
];

const modeOf = (server: ServerStatus): ModeTab => server.gameMode ?? 'OTHER';

const PREFERRED_KEY = 'iris_preferred_server';

/** The server the player picked last time, if it is still online (null otherwise). */
export function readPreferredServerId(servers: ServerStatus[]): number | null {
  try {
    const saved = Number(localStorage.getItem(PREFERRED_KEY));
    return saved && servers.some((s) => s.id === saved && s.isOnline) ? saved : null;
  } catch {
    return null;
  }
}

export function rememberPreferredServer(id: number) {
  try { localStorage.setItem(PREFERRED_KEY, String(id)); } catch { /* storage may be blocked */ }
}

interface ServerPickerProps {
  servers: ServerStatus[];
  isLoading: boolean;
  isError: boolean;
  selectedServerId: number | null;
  /** Show the "recommended" tag on the selected server (it was chosen for the player, not by them). */
  autoSelected?: boolean;
  onSelect: (serverId: number) => void;
}

/** Server grid with game-mode tabs, shared by the buy popup and the cart page. */
export function ServerPicker({ servers, isLoading, isError, selectedServerId, autoSelected = false, onSelect }: ServerPickerProps) {
  const [modeTab, setModeTab] = React.useState<ModeTab | null>(null);
  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const modeTabs = MODE_TABS.filter((tab) => servers.some((s) => modeOf(s) === tab.key));
  const activeTab =
    modeTab && modeTabs.some((t) => t.key === modeTab)
      ? modeTab
      : selectedServer
      ? modeOf(selectedServer)
      : modeTabs[0]?.key ?? null;
  const visibleServers = activeTab ? servers.filter((s) => modeOf(s) === activeTab) : servers;
  const unavailable = isError || (!isLoading && servers.length === 0);

  if (isLoading) return <div className="h-10 w-full animate-pulse rounded-xl bg-slate-800" />;
  if (unavailable) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
        <CircleAlert className="h-4 w-4 shrink-0 text-amber-400" />
        <span><T text={"ไม่พบเซิร์ฟเวอร์ที่พร้อมรับสินค้า กรุณาลองใหม่อีกครั้ง"} /></span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {modeTabs.length > 1 && (
        <div role="tablist" aria-label="โหมดเซิร์ฟเวอร์" className="flex flex-wrap gap-1.5">
          {modeTabs.map((tab) => {
            const count = servers.filter((s) => modeOf(s) === tab.key).length;
            const selected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setModeTab(tab.key)}
                className={`tk-chip sm${selected ? ' on' : ''}`}
              >
                {tab.label} <span className="font-mono text-[10px]">{count}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {visibleServers.map((server: ServerStatus) => {
          const isSelected = selectedServerId === server.id;
          return (
            <button
              key={server.id}
              type="button"
              disabled={!server.isOnline}
              aria-pressed={isSelected}
              onClick={() => onSelect(server.id)}
              className={`flex min-h-[56px] items-center justify-between rounded-md border p-3 text-left transition ${
                isSelected
                  ? 'border-iris-cyan bg-iris-cyan/10 text-white ring-1 ring-iris-cyan/60'
                  : server.isOnline
                  ? 'border-slate-700/50 bg-surface-3 text-slate-300 hover:border-slate-600 hover:text-white'
                  : 'border-slate-700/60 bg-surface-2 text-slate-300 cursor-not-allowed'
              }`}
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold truncate">{server.displayName || server.name}</p>
                  {isSelected && autoSelected && (
                    <span className="inline-flex items-center rounded bg-cyan-400/20 px-1 py-0.2 text-[9px] font-bold text-cyan-300 uppercase tracking-wider"><T text={"แนะนำ"} /></span>
                  )}
                </div>
                <p className="text-[10px] text-iris-muted truncate">{server.cluster?.name ?? server.map}</p>
              </div>
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  server.isOnline ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-600'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
