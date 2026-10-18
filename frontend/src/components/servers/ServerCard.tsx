'use client';

import { memo, useId, useState } from 'react';
import { ChevronDown, MapPin, Users } from 'lucide-react';
import { CopyButton } from './CopyButton';
import { JoinActions } from './JoinActions';
import { PlayerList } from './PlayerList';
import { connectAddress, type ServerView } from './serverFormat';

function statusOf(view: ServerView): { text: string; dot: string; tone: string } {
  if (!view.server.available) return { text: 'ปิดปรับปรุง', dot: 'bg-amber-300', tone: 'text-amber-200' };
  if (view.online) return { text: 'ออนไลน์', dot: 'bg-emerald-300', tone: 'text-emerald-200' };
  return { text: 'ออฟไลน์', dot: 'bg-slate-500', tone: 'text-iris-muted' };
}

function humanMap(map: string | null): string | null {
  if (!map) return null;
  return map.replace(/_P$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function ServerCardImpl({ view }: { view: ServerView }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { server, group } = view;
  const status = statusOf(view);
  const address = connectAddress(server);
  const map = humanMap(server.map);
  const playersText =
    view.maxPlayers && view.maxPlayers > 0
      ? `${view.players.toLocaleString('th-TH')}/${view.maxPlayers.toLocaleString('th-TH')}`
      : view.players.toLocaleString('th-TH');

  return (
    <li className="glass-card prism-border overflow-hidden border border-transparent">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-semibold text-iris-pearl [overflow-wrap:anywhere]">{server.displayName}</h3>
            <p className="mt-0.5 text-xs text-iris-muted [overflow-wrap:anywhere]">
              {server.cluster?.name ?? group.name}
              {server.rates ? ` · ${server.rates}` : ''}
              {server.isModded ? ' · ลงม็อด' : ''}
            </p>
            {map && map !== server.displayName ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-iris-muted">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                <span>แผนที่ {map}</span>
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-right">
            <span className={`inline-flex items-center gap-2 text-xs font-semibold ${status.tone}`}>
              <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
              {status.text}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-iris-pearl">
              <Users className="h-3.5 w-3.5 text-iris-muted" aria-hidden="true" />
              <span>
                <span className="sr-only">ผู้เล่น </span>
                {playersText}
                <span className="ml-1 text-xs text-iris-muted">คน</span>
              </span>
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {address ? (
            <>
              <code className="min-w-0 max-w-full truncate rounded-md bg-black/25 px-2.5 py-1.5 font-mono text-[13px] text-iris-pearl">{address}</code>
              <CopyButton text={address} ariaLabel={`คัดลอกที่อยู่ ${address}`} />
            </>
          ) : (
            <span className="text-xs text-iris-muted">ยังไม่มีที่อยู่สาธารณะสำหรับเซิร์ฟเวอร์นี้</span>
          )}
          {view.version ? <span className="text-[11px] text-iris-muted">เวอร์ชัน {view.version}</span> : null}
        </div>

        <JoinActions view={view} />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-white/[0.07] px-4 text-left text-sm text-iris-pearl transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-iris-cyan sm:px-5"
      >
        <span className="inline-flex items-center gap-2">
          <Users className="h-4 w-4 text-iris-cyan" aria-hidden="true" />
          รายชื่อผู้เล่น
          <span className="rounded-full bg-white/[0.06] px-2 text-xs tabular-nums text-iris-muted">{view.players.toLocaleString('th-TH')}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-iris-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? <PlayerList view={view} id={panelId} /> : null}
    </li>
  );
}

export const ServerCard = memo(ServerCardImpl);
