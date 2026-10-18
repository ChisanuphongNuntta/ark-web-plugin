'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, UserRound } from 'lucide-react';
import { displayPlayerName, formatDuration, isNamedPlayer, type ServerView } from './serverFormat';
import { useServerPlayersQuery } from './useServerDirectory';

function errorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

function useNow(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, active]);
  return now;
}

export interface PlayerListProps {
  view: ServerView;
  id: string;
}

/** Disclosure body: lazy-loads GET /servers/:id/players while open. */
export function PlayerList({ view, id }: PlayerListProps) {
  const enabled = view.online;
  const query = useServerPlayersQuery(view.server.id, enabled);
  const now = useNow(30_000, enabled && Boolean(query.data));

  const rows = useMemo(() => {
    if (!query.data) return [];
    const fetchedAt = Date.parse(query.data.fetchedAt);
    const elapsed = Number.isFinite(fetchedAt) ? Math.max(0, (now - fetchedAt) / 1000) : 0;
    return [...query.data.players]
      .map((p, index) => ({ key: `${index}:${p.name}`, name: p.name, durationSec: p.durationSec + elapsed }))
      .sort((a, b) => b.durationSec - a.durationSec);
  }, [query.data, now]);

  const fetchedLabel = query.data
    ? new Date(query.data.fetchedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  let body: React.ReactNode;
  if (!view.online) {
    body = <p className="text-sm text-iris-muted">เซิร์ฟเวอร์ออฟไลน์อยู่ จึงยังไม่มีรายชื่อผู้เล่น</p>;
  } else if (query.isLoading) {
    body = (
      <p className="flex items-center gap-2 text-sm text-iris-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> กำลังโหลดรายชื่อผู้เล่น…
      </p>
    );
  } else if (query.isError && !query.data) {
    const status = errorStatus(query.error);
    const message =
      status === 404 || status === 501
        ? 'เซิร์ฟเวอร์นี้ยังไม่รองรับการดูรายชื่อผู้เล่น'
        : status === 429
          ? 'เรียกดูถี่เกินไป โปรดรอสักครู่แล้วลองใหม่'
          : 'โหลดรายชื่อผู้เล่นไม่สำเร็จ';
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-iris-muted">{message}</p>
        {status !== 404 && status !== 501 ? (
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold text-iris-pearl transition-colors hover:border-iris-cyan/30 hover:bg-iris-cyan/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> ลองใหม่
          </button>
        ) : null}
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <p className="text-sm text-iris-muted">
        {view.players > 0
          ? `มีผู้เล่นออนไลน์ ${view.players.toLocaleString('th-TH')} คน แต่เซิร์ฟเวอร์ยังไม่ส่งรายชื่อ`
          : 'ยังไม่มีผู้เล่นออนไลน์ในขณะนี้'}
      </p>
    );
  } else {
    body = (
      <ol className="grid gap-1 sm:grid-cols-2" aria-label={`ผู้เล่นออนไลน์ ${rows.length} คน`}>
        {rows.map((row) => {
          const named = isNamedPlayer(row.name);
          return (
            <li key={row.key} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <UserRound className="h-3.5 w-3.5 shrink-0 text-iris-muted" aria-hidden="true" />
                <span className={named ? 'truncate text-sm text-iris-pearl' : 'truncate text-sm italic text-iris-muted'}>
                  {displayPlayerName(row.name)}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-iris-muted">
                <span className="sr-only">ออนไลน์มาแล้ว </span>
                {formatDuration(row.durationSec)}
              </span>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div id={id} className="border-t border-white/[0.07] px-4 pb-4 pt-3 sm:px-5" aria-busy={query.isFetching}>
      {body}
      {fetchedLabel && view.online ? (
        <p className="mt-3 text-[11px] text-iris-muted/80">
          อัปเดตล่าสุด {fetchedLabel} · รีเฟรชอัตโนมัติขณะเปิดรายการนี้
        </p>
      ) : null}
    </div>
  );
}
