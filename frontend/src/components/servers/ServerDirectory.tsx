'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, RotateCcw, Search, ServerOff } from 'lucide-react';
import { useSocketStatus } from '@/lib/socket';
import { ModeTabs, type ModeTabOption } from './ModeTabs';
import { ServerCard } from './ServerCard';
import { MODE_TABS, matchesSearch, parseModeTab, toServerView, type ModeTab, type ServerView } from './serverFormat';
import { useServerDirectoryQuery, useServerStatusQuery, useServersRoom } from './useServerDirectory';

const PANEL_ID = 'servers-tabpanel';

function LiveIndicator() {
  const status = useSocketStatus((state) => state.status);
  const live = status === 'connected';
  return (
    <span className="status-pill" role="status">
      <span className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-300' : 'bg-amber-300'}`} aria-hidden="true" />
      {live ? 'อัปเดตสถานะสด' : status === 'offline' ? 'ออฟไลน์ · จะอัปเดตเมื่อกลับมาออนไลน์' : 'กำลังเชื่อมต่อ · อัปเดตทุก 1 นาที'}
    </span>
  );
}

function LoadingList() {
  return (
    <ul className="grid gap-4 lg:grid-cols-2" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <li key={index} className="glass-card h-56 border border-white/5 bg-white/[0.02]" />
      ))}
    </ul>
  );
}

interface Section {
  key: string;
  name: string;
  description: string | null;
  views: ServerView[];
}

export function ServerDirectory() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  useServersRoom();

  const directory = useServerDirectoryQuery();
  const status = useServerStatusQuery();

  const [search, setSearch] = useState(() => params.get('q') ?? '');
  const modeParam = parseModeTab(params.get('mode'));

  // Keep ?q= in the URL (debounced) so a filtered list can be shared.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = params.get('q') ?? '';
      const next = search.trim();
      if (current === next) return;
      const sp = new URLSearchParams(params.toString());
      if (next) sp.set('q', next);
      else sp.delete('q');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, params, pathname, router]);

  const views = useMemo<ServerView[]>(() => {
    const byId = status.data?.byId ?? {};
    return (directory.data?.groups ?? []).flatMap((group) =>
      group.servers.map((server) => toServerView(server, group, byId[server.id])),
    );
  }, [directory.data, status.data]);

  const filtered = useMemo(() => views.filter((view) => matchesSearch(view, search)), [views, search]);

  const tabOptions = useMemo<ModeTabOption[]>(() => {
    return MODE_TABS.map((tab) => {
      const inTab = filtered.filter((v) => v.mode === tab.id);
      return {
        id: tab.id,
        label: tab.label,
        servers: inTab.length,
        online: inTab.filter((v) => v.online).length,
        players: inTab.reduce((sum, v) => sum + (v.online ? v.players : 0), 0),
      };
    }).filter((option) => option.id !== 'other' || option.servers > 0 || modeParam === 'other');
  }, [filtered, modeParam]);

  const fallbackMode: ModeTab = tabOptions.find((option) => option.servers > 0)?.id ?? 'pve';
  const mode: ModeTab = modeParam ?? fallbackMode;

  const setMode = useCallback(
    (next: ModeTab) => {
      const sp = new URLSearchParams(params.toString());
      sp.set('mode', next);
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const sections = useMemo<Section[]>(() => {
    const map = new Map<string, Section>();
    filtered
      .filter((view) => view.mode === mode)
      .forEach((view) => {
        const key = view.group.key;
        if (!map.has(key)) {
          map.set(key, {
            key,
            name: view.group.key === 'unassigned' ? 'เซิร์ฟเวอร์อื่นๆ' : view.group.name,
            description: view.group.description,
            views: [],
          });
        }
        map.get(key)!.views.push(view);
      });
    return [...map.values()];
  }, [filtered, mode]);

  const totals = useMemo(
    () => ({
      servers: views.length,
      online: views.filter((v) => v.online).length,
      players: views.reduce((sum, v) => sum + (v.online ? v.players : 0), 0),
    }),
    [views],
  );

  const activeTab = MODE_TABS.find((tab) => tab.id === mode) ?? MODE_TABS[0];

  return (
    <div className="page-shell pb-16">
      <header className="frozen-intro">
        <p className="eyebrow">SERVER DIRECTORY</p>
        <h1 className="text-iris-pearl">เซิร์ฟเวอร์ IRIS Thailand</h1>
        <p className="max-w-2xl text-sm text-iris-muted">
          ดูสถานะและรายชื่อผู้เล่นของทุกเซิร์ฟเวอร์แบบสด เลือกโหมดที่ชอบ แล้วกดเข้าเกมผ่าน Steam ได้ทันที
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <LiveIndicator />
          {directory.data ? (
            <span className="status-pill tabular-nums">
              ออนไลน์ {totals.online.toLocaleString('th-TH')}/{totals.servers.toLocaleString('th-TH')} เซิร์ฟเวอร์ · ผู้เล่น{' '}
              {totals.players.toLocaleString('th-TH')} คน
            </span>
          ) : null}
        </div>
      </header>

      <div className="frozen-toolbar" role="search">
        <label className="search-field">
          ค้นหาเซิร์ฟเวอร์
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-iris-muted" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ชื่อแผนที่ คลัสเตอร์ หรือที่อยู่"
              // `!` beats `.frozen-toolbar input { padding: 10px 14px }` (higher specificity) so
              // the text starts after the search icon.
              className="w-full !pl-10"
              autoComplete="off"
            />
          </span>
        </label>
      </div>

      <ModeTabs value={mode} onChange={setMode} options={tabOptions} panelId={PANEL_ID} />
      <p className="mb-5 mt-2 text-xs text-iris-muted">{activeTab.description}</p>

      <section id={PANEL_ID} role="tabpanel" aria-labelledby={`servers-tab-${mode}`} aria-busy={directory.isLoading}>
        {directory.isLoading ? (
          <LoadingList />
        ) : directory.isError ? (
          <div className="glass-card flex flex-col items-start gap-3 border border-rose-300/20 p-5 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <p className="flex items-start gap-2 text-sm text-rose-100">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
              โหลดรายชื่อเซิร์ฟเวอร์ไม่สำเร็จ โปรดลองใหม่อีกครั้ง
            </p>
            <button type="button" onClick={() => void directory.refetch()} className="btn-secondary min-h-10 px-4 py-2 text-xs">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> ลองใหม่
            </button>
          </div>
        ) : sections.length === 0 ? (
          <div className="glass-card flex flex-col items-center gap-3 border border-white/5 p-8 text-center">
            <ServerOff className="h-8 w-8 text-iris-muted" aria-hidden="true" />
            <p className="text-sm text-iris-pearl">
              {search.trim() ? `ไม่พบเซิร์ฟเวอร์ที่ตรงกับ “${search.trim()}” ในโหมดนี้` : 'ยังไม่มีเซิร์ฟเวอร์ในโหมดนี้'}
            </p>
            {search.trim() ? (
              <button type="button" onClick={() => setSearch('')} className="btn-secondary min-h-10 px-4 py-2 text-xs">
                ล้างคำค้นหา
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-8">
            {status.isError && !status.data ? (
              <p className="text-xs text-amber-200">ยังโหลดสถานะสดไม่ได้ ตัวเลขผู้เล่นอาจไม่เป็นปัจจุบัน</p>
            ) : null}
            {sections.map((section) => (
              <section key={section.key} aria-labelledby={`servers-group-${section.key}`}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.07] pb-2">
                  <h2 id={`servers-group-${section.key}`} className="font-display text-xl text-iris-pearl">
                    {section.name}
                  </h2>
                  <span className="text-xs tabular-nums text-iris-muted">
                    ออนไลน์ {section.views.filter((v) => v.online).length}/{section.views.length}
                  </span>
                </div>
                {section.description ? <p className="mb-3 text-xs text-iris-muted">{section.description}</p> : null}
                <ul className="grid gap-4 lg:grid-cols-2">
                  {section.views.map((view) => (
                    <ServerCard key={view.server.id} view={view} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      <aside className="mt-10 rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-xs leading-relaxed text-iris-muted sm:p-5">
        <p className="font-semibold text-iris-pearl">วิธีเข้าเกม</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            ปุ่ม “เข้าเกมผ่าน Steam” จะเปิดโปรแกรม Steam แล้วพาเข้าเซิร์ฟเวอร์ทันที ต้องติดตั้ง ARK: Survival Evolved บน Steam ไว้ก่อน
          </li>
          <li>หากปุ่มไม่ทำงาน ให้คัดลอกที่อยู่ไปเพิ่มใน Steam &gt; View &gt; Game Servers &gt; Favorites</li>
          <li>ผู้เล่น Epic Games เข้าได้เฉพาะเซิร์ฟเวอร์ที่เปิด Crossplay โดยค้นหาชื่อเซิร์ฟเวอร์ในเกม</li>
        </ul>
        <p className="mt-3">
          ต้องการรับของจากร้านค้า? เลือกเซิร์ฟเวอร์ปลายทางได้ที่{' '}
          <Link href="/shop" className="text-iris-cyan underline-offset-4 hover:underline">
            ร้านค้า
          </Link>
        </p>
      </aside>
    </div>
  );
}
