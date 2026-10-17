'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import {
  Badge,
  Button,
  ErrorMessage,
  Input,
  PageHeader,
  Panel,
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { ADMIN_QUERY_OPTIONS, AdminNoAccess, errorText } from '@/components/admin';
import {
  SEASON_COPY,
  SEASON_SETTINGS,
  SEASON_SETTING_LABELS,
  SITE_SETTINGS_QUERY_KEY,
  SeasonGlyph,
  bangkokDate,
  easterSunday,
  resolveSeason,
  useSeason,
  type Season,
  type SeasonSetting,
} from '@/components/season';
import { usePermissions } from '@/hooks/usePermissions';
import { adminConsoleApi, siteApi } from '@/lib/contracts/console';
import type { SiteSettings } from '@/lib/contracts/types';
import { cn } from '@/lib/utils';

/**
 * Palette preview chips (RGB triplets copied from globals.css). Rendered as
 * inline swatches only — components never use these values directly.
 */
const SWATCHES: Record<Season, { name: string; rgb: string }[]> = {
  default: [
    { name: 'พื้นหลัง', rgb: '11 12 14' },
    { name: 'พื้นผิว', rgb: '24 25 29' },
    { name: 'สีหลัก', rgb: '200 169 106' },
    { name: 'ตัวอักษร', rgb: '236 232 225' },
  ],
  winter: [
    { name: 'พื้นหลัง', rgb: '10 14 18' },
    { name: 'พื้นผิว', rgb: '22 30 38' },
    { name: 'สีหลัก', rgb: '169 211 227' },
    { name: 'สีประจำฤดู', rgb: '200 169 106' },
  ],
  christmas: [
    { name: 'พื้นหลัง', rgb: '12 14 12' },
    { name: 'พื้นผิว', rgb: '26 30 26' },
    { name: 'สีหลัก', rgb: '201 169 106' },
    { name: 'แดงเข้ม', rgb: '158 43 43' },
    { name: 'เขียวสน', rgb: '46 79 62' },
  ],
  easter: [
    { name: 'พื้นหลัง', rgb: '14 13 16' },
    { name: 'พื้นผิว', rgb: '28 26 33' },
    { name: 'สีหลัก', rgb: '198 182 230' },
    { name: 'เขียวเสจ', rgb: '169 191 160' },
  ],
};

const DAY_MS = 86_400_000;
const UTC_DATE = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Next (or current) Easter window in Bangkok calendar terms, for the rule description. */
function easterWindow(now: Date): string {
  const { year, month, day } = bangkokDate(now);
  const today = Date.UTC(year, month - 1, day);
  for (const y of [year, year + 1]) {
    const e = easterSunday(y);
    const sunday = Date.UTC(y, e.month - 1, e.day);
    if (today <= sunday + 7 * DAY_MS) {
      return `${UTC_DATE.format(new Date(sunday - 14 * DAY_MS))} – ${UTC_DATE.format(new Date(sunday + 7 * DAY_MS))}`;
    }
  }
  return '';
}

interface Draft {
  season: SeasonSetting;
  announce: boolean;
  text: string;
  href: string;
}

function toDraft(s: SiteSettings): Draft {
  return {
    season: s.season,
    announce: !!s.announcement,
    text: s.announcement?.text ?? '',
    href: s.announcement?.href ?? '',
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  if (a.season !== b.season || a.announce !== b.announce) return false;
  if (!a.announce) return true;
  return a.text.trim() === b.text.trim() && a.href.trim() === b.href.trim();
}

function validateHref(href: string): string | null {
  const v = href.trim();
  if (!v) return null;
  if (/^https:\/\/[^\s]+$/i.test(v)) return null;
  if (/^\/(?!\/)[^\s]*$/.test(v)) return null;
  return 'ใช้ลิงก์ https:// หรือเส้นทางในเว็บที่ขึ้นต้นด้วย / เช่น /shop';
}

export default function AdminSettingsPage() {
  const { canManageSiteSettings } = usePermissions();
  if (!canManageSiteSettings) return <AdminNoAccess />;
  return <SettingsScreen />;
}

function SettingsScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { setPreviewSeason, previewSeason } = useSeason();
  const [now] = React.useState(() => new Date());

  const settings = useQuery({
    queryKey: SITE_SETTINGS_QUERY_KEY,
    queryFn: siteApi.getSettings,
    ...ADMIN_QUERY_OPTIONS,
  });

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [errors, setErrors] = React.useState<{ text?: string; href?: string }>({});
  const base = settings.data ? toDraft(settings.data) : null;
  const form = draft ?? base;
  const dirty = !!draft && !!base && !sameDraft(draft, base);

  // Leaving the page always drops the local preview.
  React.useEffect(() => () => setPreviewSeason(null), [setPreviewSeason]);

  const update = (patch: Partial<Draft>) => {
    if (!form) return;
    setDraft({ ...form, ...patch });
  };

  const chooseSeason = (season: SeasonSetting) => {
    update({ season });
    setPreviewSeason(resolveSeason(season, now));
  };

  const save = useMutation({
    mutationFn: (d: Draft) =>
      adminConsoleApi.updateSiteSettings({
        season: d.season,
        announcement: d.announce ? { text: d.text.trim(), ...(d.href.trim() ? { href: d.href.trim() } : {}) } : null,
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(SITE_SETTINGS_QUERY_KEY, res);
      void queryClient.invalidateQueries({ queryKey: SITE_SETTINGS_QUERY_KEY });
      setDraft(null);
      setPreviewSeason(null);
      toast.success('บันทึกแล้ว', `ทั้งเว็บใช้ธีม${SEASON_COPY[res.activeSeason].label}`);
    },
    onError: (err) => toast.error('บันทึกไม่สำเร็จ', errorText(err)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const next: typeof errors = {};
    if (form.announce) {
      const len = form.text.trim().length;
      if (len < 1) next.text = 'ใส่ข้อความประกาศ หรือปิดการแสดงประกาศ';
      else if (len > 280) next.text = 'ข้อความยาวได้ไม่เกิน 280 ตัวอักษร';
      const hrefErr = validateHref(form.href);
      if (hrefErr) next.href = hrefErr;
    }
    setErrors(next);
    if (next.text || next.href) return;
    save.mutate(form);
  };

  const reset = () => {
    setDraft(null);
    setErrors({});
    setPreviewSeason(null);
  };

  if (settings.isLoading) {
    return (
      <div aria-busy="true">
        <PageHeader title="การตั้งค่า" description="ธีมตามฤดูกาลและแถบประกาศบนทุกหน้า" />
        <Skeleton className="h-72 rounded-card" />
        <Skeleton className="mt-6 h-56 rounded-card" />
      </div>
    );
  }

  if (settings.isError || !form || !settings.data) {
    return (
      <div>
        <PageHeader title="การตั้งค่า" description="ธีมตามฤดูกาลและแถบประกาศบนทุกหน้า" />
        <ErrorMessage message={errorText(settings.error, 'โหลดการตั้งค่าไม่สำเร็จ')} onRetry={() => void settings.refetch()} />
      </div>
    );
  }

  const resolved = resolveSeason(form.season, now);
  const autoNow = resolveSeason('auto', now);
  const ribbonText = form.announce ? form.text.trim() || 'ข้อความประกาศ' : SEASON_COPY[resolved].ribbon;

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        title="การตั้งค่า"
        description="ธีมตามฤดูกาลและแถบประกาศบนทุกหน้า การเปลี่ยนแปลงมีผลกับผู้เล่นทุกคนหลังบันทึก"
        actions={
          <>
            <Button variant="ghost" onClick={reset} disabled={!dirty || save.isPending}>
              คืนค่าเดิม
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!dirty}>
              บันทึก
            </Button>
          </>
        }
      />

      {previewSeason ? (
        <div
          role="status"
          className="mb-6 flex flex-col gap-2 rounded-card border border-info/30 bg-info/[0.06] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="inline-flex items-center gap-2 text-fg">
            <Eye className="h-4 w-4 text-info" strokeWidth={1.5} aria-hidden="true" />
            กำลังแสดงตัวอย่างธีม{SEASON_COPY[previewSeason].label} เห็นเฉพาะคุณ ยังไม่บันทึก
          </span>
          <Button variant="ghost" size="sm" onClick={() => setPreviewSeason(null)}>
            หยุดแสดงตัวอย่าง
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        <Panel
          title="ธีมตามฤดูกาล"
          description={
            <>
              ตอนนี้เว็บใช้ธีม <span className="text-fg">{SEASON_COPY[settings.data.activeSeason].label}</span>
              {settings.data.season === 'auto' ? ' (เลือกอัตโนมัติ)' : ' (ตั้งค่าเอง)'}
            </>
          }
        >
          <fieldset>
            <legend className="sr-only">เลือกธีม</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {SEASON_SETTINGS.map((option) => {
                const season = resolveSeason(option, now);
                const checked = form.season === option;
                return (
                  <label
                    key={option}
                    className={cn(
                      'relative flex cursor-pointer flex-col gap-3 rounded-card border p-4 transition-colors duration-fast',
                      'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                      checked ? 'border-accent bg-surface-2' : 'border-line hover:border-line-strong'
                    )}
                  >
                    <input
                      type="radio"
                      name="season"
                      value={option}
                      checked={checked}
                      onChange={() => chooseSeason(option)}
                      className="sr-only"
                    />
                    <span className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-fg">
                        <SeasonGlyph season={season} className={checked ? 'text-accent' : 'text-fg-subtle'} />
                        {SEASON_SETTING_LABELS[option]}
                      </span>
                      {settings.data.season === option ? <Badge tone="neutral">ใช้อยู่</Badge> : null}
                    </span>
                    <span className="flex gap-1.5" aria-hidden="true">
                      {SWATCHES[season].map((sw) => (
                        <span
                          key={sw.name}
                          title={sw.name}
                          className="h-6 flex-1 rounded-[4px] border border-line"
                          style={{ backgroundColor: `rgb(${sw.rgb})` }}
                        />
                      ))}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {option === 'auto'
                        ? `ตอนนี้จะได้ธีม${SEASON_COPY[autoNow].label}`
                        : (SEASON_COPY[season].ribbon ?? 'ไม่มีแถบประจำฤดู')}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 rounded-card border border-line bg-canvas px-4 py-3 text-xs leading-relaxed text-fg-muted">
            <p className="mb-1 text-fg">กติกาโหมดอัตโนมัติ (เวลาประเทศไทย)</p>
            <p>คริสต์มาส 1 ธ.ค. – 2 ม.ค. · ฤดูหนาว 15 ต.ค. – 30 พ.ย. และ 3 ม.ค. – สิ้นเดือน ก.พ.</p>
            <p>อีสเตอร์ 14 วันก่อนถึง 7 วันหลังวันอาทิตย์อีสเตอร์ รอบถัดไป {easterWindow(now)} · นอกนั้นใช้ธีมปกติ</p>
          </div>
        </Panel>

        <Panel title="แถบประกาศ" description="ข้อความสั้นบนสุดของทุกหน้า แทนข้อความประจำฤดู ผู้เล่นปิดได้">
          <div className="flex flex-col gap-5">
            <Switch
              checked={form.announce}
              onCheckedChange={(v) => {
                update({ announce: v });
                setErrors({});
              }}
              label="แสดงประกาศ"
              description={form.announce ? 'ประกาศจะแทนข้อความประจำฤดู' : 'ตอนนี้แสดงข้อความประจำฤดูแทน'}
            />
            {form.announce ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                <Textarea
                  label="ข้อความ"
                  required
                  rows={2}
                  maxLength={280}
                  value={form.text}
                  error={errors.text}
                  helperText={`${form.text.trim().length}/280 ตัวอักษร`}
                  onChange={(e) => {
                    update({ text: e.target.value });
                    if (errors.text) setErrors((x) => ({ ...x, text: undefined }));
                  }}
                  wrapperClassName="lg:col-span-3"
                />
                <Input
                  label="ลิงก์ (ไม่บังคับ)"
                  mono
                  placeholder="/shop หรือ https://…"
                  value={form.href}
                  error={errors.href}
                  helperText="เส้นทางในเว็บ หรือ https:// เท่านั้น"
                  onChange={(e) => {
                    update({ href: e.target.value });
                    if (errors.href) setErrors((x) => ({ ...x, href: undefined }));
                  }}
                  wrapperClassName="lg:col-span-2"
                />
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-xs text-fg-muted">ตัวอย่างแถบ</p>
              <div className="overflow-hidden rounded-card border border-line">
                {ribbonText ? (
                  <div className="relative bg-surface" aria-hidden="true">
                    <div className="absolute inset-x-0 top-0 flex h-[2px]">
                      <span className="h-full flex-1 bg-seasonal" />
                      {resolved === 'christmas' ? <span className="h-full flex-1 bg-seasonal-2" /> : null}
                    </div>
                    <div className="flex min-h-9 items-center gap-3 px-4 py-1.5">
                      <SeasonGlyph season={resolved} className="text-accent" />
                      <p className="min-w-0 flex-1 truncate text-xs text-fg-muted sm:text-[13px]">
                        {ribbonText}
                        {form.announce && form.href.trim() ? <span className="ml-2 text-fg">ดูรายละเอียด</span> : null}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="bg-surface px-4 py-2 text-center text-xs text-fg-subtle">ไม่มีแถบประกาศในธีมนี้</p>
                )}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </form>
  );
}
