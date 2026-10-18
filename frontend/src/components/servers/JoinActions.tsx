'use client';

import { useId, useState } from 'react';
import { ChevronDown, ExternalLink, Info } from 'lucide-react';
import { CopyButton } from './CopyButton';
import { epicSearchName, steamConnectUrl, type ServerView } from './serverFormat';

/**
 * Join options.
 *
 * Steam: steam://connect/<host>:<queryPort> opens the Steam client, which
 * queries the server and launches ARK: Survival Evolved straight into it.
 *
 * Epic: the Epic build of ASE has no direct-connect / join URI, and the
 * Epic launcher app id for ASE could not be verified, so the site does not
 * pretend to launch or join. Epic players can only join servers that run with
 * crossplay enabled, by searching the session name in the in-game browser.
 */
export function JoinActions({ view }: { view: ServerView }) {
  const [epicOpen, setEpicOpen] = useState(false);
  const epicPanelId = useId();
  const steamUrl = steamConnectUrl(view.server);
  const searchName = epicSearchName(view);
  const serverLabel = view.server.displayName;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {steamUrl ? (
          <a
            href={steamUrl}
            className="btn-primary min-h-10 px-4 py-2 text-xs"
            aria-label={`เข้าเกม ${serverLabel} ผ่าน Steam`}
            title={view.online ? undefined : 'เซิร์ฟเวอร์ออฟไลน์อยู่ อาจเข้าไม่ได้ในตอนนี้'}
          >
            เข้าเกมผ่าน Steam
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : (
          <span className="inline-flex min-h-10 items-center rounded-full border border-white/10 px-4 text-xs text-iris-muted">
            ยังไม่มีที่อยู่สำหรับเข้าเกม
          </span>
        )}
        <button
          type="button"
          onClick={() => setEpicOpen((open) => !open)}
          aria-expanded={epicOpen}
          aria-controls={epicOpen ? epicPanelId : undefined}
          className="btn-secondary min-h-10 px-4 py-2 text-xs"
        >
          เล่นผ่าน Epic Games
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${epicOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {epicOpen ? (
        <div id={epicPanelId} className="rounded-xl border border-white/10 bg-black/20 p-3.5 text-xs leading-relaxed text-iris-muted">
          <p className="flex items-start gap-2 text-iris-pearl">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-iris-cyan" aria-hidden="true" />
            <span>เกมเวอร์ชัน Epic Games ไม่มีลิงก์สำหรับเข้าเซิร์ฟเวอร์โดยตรงจากเว็บ</span>
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-9">
            <li>เปิด ARK: Survival Evolved จาก Epic Games Launcher</li>
            <li>เลือก Join ARK แล้วตั้ง Session Filter เป็น Unofficial</li>
            <li>วางชื่อเซิร์ฟเวอร์ในช่องค้นหา แล้วกด Join</li>
          </ol>
          <p className="mt-2">
            ผู้เล่น Epic เข้าได้เฉพาะเซิร์ฟเวอร์ที่เปิด Crossplay เท่านั้น
            {view.server.isModded ? ' และเซิร์ฟเวอร์นี้ลงม็อด ซึ่งเวอร์ชัน Epic อาจโหลดม็อดไม่ได้' : ''} หากค้นหาไม่พบ แปลว่าเซิร์ฟเวอร์นี้ยังไม่รองรับ Epic
          </p>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
            <code className="min-w-0 max-w-full truncate rounded-md bg-white/[0.05] px-2 py-1.5 font-mono text-[12px] text-iris-pearl">
              {searchName}
            </code>
            <CopyButton text={searchName} label="คัดลอกชื่อเซิร์ฟเวอร์" ariaLabel={`คัดลอกชื่อเซิร์ฟเวอร์ ${searchName}`} />
          </div>
          {view.sessionName ? null : (
            <p className="mt-2">
              ชื่อนี้เป็นชื่อโดยประมาณ เพราะยังไม่ได้รับชื่อจริงจากเซิร์ฟเวอร์ ให้ดูโหมดและเรตของเซิร์ฟเวอร์ให้ตรงก่อนกด Join
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
