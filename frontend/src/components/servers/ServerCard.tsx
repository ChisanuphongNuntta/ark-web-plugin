'use client';
import { T } from '@/components/i18n/LanguageProvider';


import { memo, useId, useState } from 'react';
import Image from 'next/image';
import { ChevronDown, MapPin, Users, Wifi, Shield, Cpu } from 'lucide-react';
import { CopyButton } from './CopyButton';
import { JoinActions } from './JoinActions';
import { PlayerList } from './PlayerList';
import { connectAddress, type ServerView } from './serverFormat';
import { serverMapArtwork } from './serverMapArtwork';

function statusOf(view: ServerView): { text: string; dot: string; tone: string; badgeBg: string } {
  if (!view.server.available) return { text: 'ปิดปรับปรุง (Maintenance)', dot: 'bg-amber-400', tone: 'text-amber-300', badgeBg: 'bg-amber-950/60 border-amber-500/30' };
  if (view.online) return { text: 'ออนไลน์ (Online)', dot: 'bg-emerald-400', tone: 'text-emerald-300', badgeBg: 'bg-emerald-950/60 border-emerald-500/30' };
  return { text: 'ออฟไลน์ (Offline)', dot: 'bg-slate-500', tone: 'text-slate-400', badgeBg: 'bg-slate-900/60 border-slate-700/30' };
}

function humanMap(map: string | null): string {
  if (!map) return 'ไม่ระบุแมพ';
  const clean = map.replace(/_P$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return clean || 'The Island';
}

function mapTheme(mapName: string): {
  bgGradient: string;
  glowColor: string;
  badgeAccent: string;
  tag: string;
} {
  const lower = mapName.toLowerCase();
  if (lower.includes('scorched')) {
    return {
      bgGradient: 'from-amber-950/40 via-surface-1/85 to-surface-0',
      glowColor: 'rgba(245,158,11,0.2)',
      badgeAccent: 'text-amber-300 border-amber-500/30 bg-amber-950/50',
      tag: 'DESERT REALM',
    };
  }
  if (lower.includes('aberration')) {
    return {
      bgGradient: 'from-purple-950/40 via-surface-0/85 to-surface-0',
      glowColor: 'rgba(168,85,247,0.22)',
      badgeAccent: 'text-purple-300 border-purple-500/30 bg-purple-950/50',
      tag: 'UNDERGROUND BIO-DOME',
    };
  }
  if (lower.includes('extinction')) {
    return {
      bgGradient: 'from-rose-950/40 via-surface-1/85 to-surface-0',
      glowColor: 'rgba(244,63,94,0.2)',
      badgeAccent: 'text-rose-300 border-rose-500/30 bg-rose-950/50',
      tag: 'CORRUPTED WASTELAND',
    };
  }
  if (lower.includes('genesis')) {
    return {
      bgGradient: 'from-cyan-950/40 via-surface-1/85 to-surface-0',
      glowColor: 'rgba(6,182,212,0.25)',
      badgeAccent: 'text-cyan-300 border-cyan-500/30 bg-cyan-950/50',
      tag: 'SIMULATION GRID',
    };
  }
  if (lower.includes('fjordur')) {
    return {
      bgGradient: 'from-sky-950/40 via-surface-1/85 to-surface-0',
      glowColor: 'rgba(56,189,248,0.25)',
      badgeAccent: 'text-sky-300 border-sky-500/30 bg-sky-950/50',
      tag: 'NORDIC REALM',
    };
  }
  return {
    bgGradient: 'from-cyan-950/30 via-surface-1/85 to-surface-0',
    glowColor: 'rgba(56,189,248,0.2)',
    badgeAccent: 'text-cyan-300 border-cyan-500/30 bg-cyan-950/50',
    tag: 'ORIGINAL EXPEDITION',
  };
}

function ServerCardImpl({ view }: { view: ServerView }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { server, group } = view;
  const status = statusOf(view);
  const address = connectAddress(server);
  const mapName = humanMap(server.map);
  const theme = mapTheme(mapName);
  const mapImage = serverMapArtwork(server.map);

  const playersText =
    view.maxPlayers && view.maxPlayers > 0
      ? `${view.players.toLocaleString('th-TH')} / ${view.maxPlayers.toLocaleString('th-TH')}`
      : view.players.toLocaleString('th-TH');

  return (
    <li className="server-card group relative rounded-3xl border border-slate-700/50 bg-surface-1 overflow-hidden transition-all duration-300 hover:border-cyan-400/50 hover:shadow-[0_0_35px_rgba(56,189,248,0.18)]">
      {/* Background Mask & Atmosphere */}
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${theme.bgGradient} opacity-90 transition-opacity duration-300 group-hover:opacity-100`} />
      {mapImage && (
        <>
          <Image
            src={mapImage}
            alt=""
            aria-hidden="true"
            fill
            sizes="(max-width: 1023px) 100vw, 660px"
            className="pointer-events-none object-cover object-center"
            data-server-map={server.map ?? ''}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(100deg, rgba(3,12,22,.93) 0%, rgba(3,12,22,.68) 48%, rgba(3,12,22,.48) 100%), linear-gradient(0deg, rgba(3,12,22,.94), transparent 80%)' }}
          />
        </>
      )}
      
      {/* Ambient Radial Hover Light */}
      <div className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.15),transparent_70%)]" />

      <div className="relative z-10 flex flex-col gap-4 p-5 sm:p-6">
        {/* Top Bar: Map Badge & Status */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase font-mono ${theme.badgeAccent}`}>
              <MapPin className="h-3 w-3" />
              <span>{mapName}</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono tracking-widest uppercase hidden sm:inline">
              {theme.tag}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${status.badgeBg} ${status.tone}`}>
              <span className={`h-2 w-2 rounded-full ${status.dot} ${view.online ? 'shadow-[0_0_8px_#34d399]' : ''}`} aria-hidden="true" />
              <span><T text={status.text} /></span>
            </span>
          </div>
        </div>

        {/* Server Name & Details */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl sm:text-2xl font-black text-white tracking-wide group-hover:text-cyan-200 transition-colors">
              {server.displayName}
            </h3>
            <p className="mt-1 text-xs text-slate-300 flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-cyan-400">{server.cluster?.name ?? group.name}</span>
              {server.rates ? <span className="text-slate-400"><T text={"· เรตคูณ: "} />{server.rates}</span> : null}
              {server.isModded ? <span className="rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.2 text-[10px] font-bold">MODDED</span> : null}
            </p>
          </div>

          {/* Player Count Metric */}
          <div className="rounded-2xl border border-white/[0.08] bg-black/40 px-4 py-2 text-right shrink-0">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium"><T text={"ผู้เล่นออนไลน์"} /></span>
            <span className="inline-flex items-center gap-1.5 text-base font-bold tabular-nums text-white font-mono">
              <Users className="h-4 w-4 text-cyan-400" aria-hidden="true" />
              <span>{playersText}</span>
              <span className="text-xs text-slate-400 font-normal"><T text={"คน"} /></span>
            </span>
          </div>
        </div>

        {/* Address and Direct Connection */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 pt-1 border-t border-white/[0.06]">
          {address ? (
            <div className="flex items-center gap-2 flex-wrap">
              <code className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-xs text-cyan-200">
                {address}
              </code>
              <CopyButton text={address} ariaLabel={`คัดลอกที่อยู่ ${address}`} />
            </div>
          ) : (
            <span className="text-xs text-slate-400"><T text={"ยังไม่มีที่อยู่สาธารณะสำหรับเซิร์ฟเวอร์นี้"} /></span>
          )}
          {view.version ? <span className="text-[11px] text-slate-400 font-mono ml-auto">Ver. {view.version}</span> : null}
        </div>

        {/* Join Actions */}
        <JoinActions view={view} />
      </div>

      {/* Expandable Player List Toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="relative z-10 flex min-h-11 w-full items-center justify-between gap-3 border-t border-white/[0.08] bg-black/25 px-5 py-2.5 text-left text-xs font-semibold text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white"
      >
        <span className="inline-flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
          <span><T text={"รายชื่อผู้เล่นที่กำลังออนไลน์ (Online Players)"} /></span>
          <span className="rounded-full bg-cyan-950 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold text-cyan-300 tabular-nums">
            {view.players.toLocaleString('th-TH')}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open ? <div className="relative z-10 bg-surface-1"><PlayerList view={view} id={panelId} /></div> : null}
    </li>
  );
}

export const ServerCard = memo(ServerCardImpl);
