'use client';

/**
 * /admin/settings — site settings (admin | root): seasonal theme + site announcement.
 * GET /site/settings, PUT /admin/site/settings (audited 'site_settings_update').
 */
import * as React from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Save } from 'lucide-react';
import {
  AdminButton,
  AdminField,
  AdminNotice,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
  AdminSuspense,
  SegmentedTabs,
  StatusBadge,
  adminInputClass,
} from '@/components/admin';
import { AdminAccessGate } from '@/components/admin/console/ConsoleBits';
import { SEASON_SETTINGS, adminConsoleApi, apiErrorText, type SeasonSetting, type SiteSettings } from '@/lib/adminConsoleApi';

const KEY = 'admin-site-settings';
const MAX_TEXT = 280;

const SEASON_TH: Record<string, string> = {
  auto: 'อัตโนมัติตามวันที่',
  default: 'ปกติ',
  winter: 'ฤดูหนาว',
  christmas: 'คริสต์มาส',
  easter: 'อีสเตอร์',
};

function validHref(href: string): boolean {
  if (!href) return true;
  if (href.startsWith('/') && !href.startsWith('//')) return true;
  try {
    return new URL(href).protocol === 'https:';
  } catch {
    return false;
  }
}

function SettingsForm({ initial, onSaved }: { initial: SiteSettings; onSaved: (data: SiteSettings) => void }) {
  const queryClient = useQueryClient();
  const [season, setSeason] = useState<SeasonSetting>(initial.season);
  const [text, setText] = useState(initial.announcement?.text ?? '');
  const [href, setHref] = useState(initial.announcement?.href ?? '');

  const hrefError = validHref(href.trim()) ? undefined : 'ลิงก์ต้องขึ้นต้นด้วย https:// หรือ / (ลิงก์ภายในเว็บ)';
  const textError = text.trim().length > MAX_TEXT ? `ยาวได้ไม่เกิน ${MAX_TEXT} ตัวอักษร` : undefined;
  const hrefWithoutText = !text.trim() && href.trim() ? 'ใส่ข้อความประกาศก่อนใส่ลิงก์' : undefined;

  const save = useMutation({
    mutationFn: () =>
      adminConsoleApi.updateSiteSettings({
        season,
        announcement: text.trim() ? { text: text.trim(), ...(href.trim() ? { href: href.trim() } : {}) } : null,
      }),
    onSuccess: (data) => {
      onSaved(data);
      queryClient.setQueryData([KEY], data);
    },
  });

  const dirty =
    season !== initial.season || text.trim() !== (initial.announcement?.text ?? '') || href.trim() !== (initial.announcement?.href ?? '');

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!hrefError && !textError && !hrefWithoutText) save.mutate();
      }}
    >
      {save.isError && (
        <AdminNotice tone="danger" title="บันทึกไม่สำเร็จ">
          {apiErrorText(save.error, 'ลองใหม่อีกครั้ง')}
        </AdminNotice>
      )}

      <AdminPanel
        title="ธีมตามฤดูกาล"
        description="อัตโนมัติ = เลือกตามวันที่เวลาไทย (ฤดูหนาว 15 ต.ค.–30 พ.ย. และ 3 ม.ค.–ก.พ., คริสต์มาส 1 ธ.ค.–2 ม.ค., อีสเตอร์ตามปฏิทิน)"
        actions={
          <StatusBadge tone="info" dot>
            ใช้อยู่: {SEASON_TH[initial.activeSeason] ?? initial.activeSeason}
          </StatusBadge>
        }
      >
        <SegmentedTabs
          aria-label="ธีมตามฤดูกาล"
          value={season}
          onChange={(v) => setSeason((SEASON_SETTINGS as readonly string[]).includes(v) ? (v as SeasonSetting) : 'auto')}
          options={SEASON_SETTINGS.map((sn) => ({ value: sn, label: SEASON_TH[sn] }))}
        />
      </AdminPanel>

      <AdminPanel title="ประกาศบนเว็บไซต์" description="ข้อความสั้นที่แสดงให้ผู้เล่นทุกคนเห็น เว้นว่างเพื่อปิดประกาศ">
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <AdminField label={`ข้อความ (${text.trim().length}/${MAX_TEXT})`} error={textError}>
            {(field) => (
              <textarea
                {...field}
                rows={3}
                className={adminInputClass}
                value={text}
                maxLength={MAX_TEXT + 20}
                onChange={(e) => setText(e.target.value)}
                placeholder="เช่น กิจกรรมฤดูหนาวเริ่มแล้ว รับโบนัสเติมเหรียญ 20%"
              />
            )}
          </AdminField>
          <AdminField label="ลิงก์ (ไม่บังคับ)" hint="https://… หรือ /shop" error={hrefError ?? hrefWithoutText}>
            {(field) => (
              <input {...field} className={adminInputClass} value={href} onChange={(e) => setHref(e.target.value)} placeholder="/servers" />
            )}
          </AdminField>
        </div>
        {text.trim() && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-iris-cyan/20 bg-iris-cyan/[0.05] px-4 py-3 text-sm text-iris-pearl">
            <Megaphone className="h-4 w-4 shrink-0 text-iris-cyan" aria-hidden="true" />
            <span className="min-w-0 flex-1">{text.trim()}</span>
            {href.trim() && <span className="shrink-0 text-xs text-iris-cyan">ดูรายละเอียด</span>}
          </div>
        )}
      </AdminPanel>

      <div className="flex justify-end gap-2">
        <AdminButton
          type="button"
          variant="ghost"
          disabled={!dirty || save.isPending}
          onClick={() => {
            setSeason(initial.season);
            setText(initial.announcement?.text ?? '');
            setHref(initial.announcement?.href ?? '');
          }}
        >
          คืนค่าเดิม
        </AdminButton>
        <AdminButton type="submit" variant="primary" icon={<Save />} loading={save.isPending} disabled={!dirty}>
          บันทึกการตั้งค่า
        </AdminButton>
      </div>
    </form>
  );
}

function SettingsAdmin() {
  const settings = useQuery({
    queryKey: [KEY],
    queryFn: ({ signal }) => adminConsoleApi.getSiteSettings(signal),
    staleTime: 0,
  });
  const [saved, setSaved] = useState<SiteSettings | null>(null);

  return (
    <AdminPage className="pb-16">
      <AdminPageHeader
        eyebrow="SITE SETTINGS"
        title="ตั้งค่าเว็บไซต์"
        description="เลือกธีมตามฤดูกาลและประกาศที่แสดงบนเว็บ ทุกการแก้ไขถูกบันทึกไว้"
      />
      {saved && (
        <AdminNotice tone="success" title="บันทึกแล้ว" onDismiss={() => setSaved(null)}>
          ธีมที่ใช้ตอนนี้: {SEASON_TH[saved.activeSeason] ?? saved.activeSeason} · การเปลี่ยนแปลงถูกบันทึกในบันทึกการทำงาน
        </AdminNotice>
      )}
      {settings.isLoading ? (
        <AdminPanel>
          <p className="text-sm text-iris-muted">กำลังโหลดการตั้งค่า…</p>
        </AdminPanel>
      ) : settings.isError || !settings.data ? (
        <AdminNotice tone="danger" title="โหลดการตั้งค่าไม่สำเร็จ">
          {apiErrorText(settings.error, 'ลองรีเฟรชหน้านี้อีกครั้ง')}
        </AdminNotice>
      ) : (
        // Re-mount the form when the server copy changes (after save / refetch).
        <SettingsForm
          key={`${settings.data.season}|${settings.data.announcement?.text ?? ''}|${settings.data.announcement?.href ?? ''}`}
          initial={settings.data}
          onSaved={setSaved}
        />
      )}
    </AdminPage>
  );
}

export default function Page() {
  return (
    <AdminSuspense>
      <AdminAccessGate allow={['admin', 'root']}>
        <SettingsAdmin />
      </AdminAccessGate>
    </AdminSuspense>
  );
}
