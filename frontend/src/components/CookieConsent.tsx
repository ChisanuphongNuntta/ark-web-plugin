'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Dialog, Switch, useIsClient } from '@/components/ui';

const COOKIE_CONSENT_KEY = 'cookie-consent';

interface CookiePreferences {
  necessary: boolean; // always true
  analytics: boolean;
  marketing: boolean;
}

const NECESSARY_ONLY: CookiePreferences = { necessary: true, analytics: false, marketing: false };
const ALL_ACCEPTED: CookiePreferences = { necessary: true, analytics: true, marketing: true };

function readStoredConsent(): CookiePreferences | null {
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookiePreferences>;
    return {
      necessary: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
    };
  } catch {
    return null;
  }
}

/**
 * Small, calm consent notice. Sits bottom-left and leaves room for the chat button on mobile.
 * Storage key and the `cookie-consent-changed` event are unchanged so existing listeners keep working.
 */
export function CookieConsent() {
  const isClient = useIsClient();
  // Read once on the client; the server render and first client render both show nothing.
  const stored = useMemo(() => (isClient ? readStoredConsent() : null), [isClient]);
  const [decided, setDecided] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<CookiePreferences | null>(null);
  const preferences = draft ?? stored ?? NECESSARY_ONLY;
  const setPreferences = (update: (p: CookiePreferences) => CookiePreferences) => setDraft(update(preferences));
  const showBanner = isClient && !stored && !decided;

  const savePreferences = (prefs: CookiePreferences) => {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(prefs));
    } catch {
      // storage blocked: keep the choice for this visit only
    }
    setDraft(prefs);
    setDecided(true);
    setShowSettings(false);
    window.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: prefs }));
  };

  if (!showBanner) return null;

  return (
    <>
      {!showSettings && (
        <section
          role="region"
          aria-label="การใช้คุกกี้"
          className="fixed bottom-4 left-4 right-20 z-overlay max-w-sm rounded-card border border-line-strong bg-surface p-4 shadow-overlay sm:right-auto"
        >
          <h2 className="text-sm font-semibold text-fg">เว็บไซต์นี้ใช้คุกกี้</h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            คุกกี้ที่จำเป็นใช้สำหรับการเข้าสู่ระบบและความปลอดภัย ส่วนคุกกี้อื่นเลือกเปิดได้เอง{' '}
            <Link
              href="/privacy"
              className="text-accent underline underline-offset-2 transition-colors duration-fast hover:text-accent-hover"
            >
              นโยบายความเป็นส่วนตัว
            </Link>
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowSettings(true)}>
              ตั้งค่า
            </Button>
            <Button size="sm" variant="secondary" onClick={() => savePreferences(NECESSARY_ONLY)}>
              เฉพาะที่จำเป็น
            </Button>
            <Button size="sm" onClick={() => savePreferences(ALL_ACCEPTED)}>
              ยอมรับทั้งหมด
            </Button>
          </div>
        </section>
      )}

      <Dialog
        open={showSettings}
        onOpenChange={setShowSettings}
        title="ตั้งค่าคุกกี้"
        description="เลือกประเภทคุกกี้ที่อนุญาต เปลี่ยนได้ทุกเมื่อจากหน้านโยบายความเป็นส่วนตัว"
        footer={
          <>
            <Button variant="ghost" onClick={() => savePreferences(NECESSARY_ONLY)}>
              เฉพาะที่จำเป็น
            </Button>
            <Button onClick={() => savePreferences(preferences)}>บันทึกการตั้งค่า</Button>
          </>
        }
      >
        <div className="divide-y divide-line">
          <div className="flex items-start justify-between gap-4 pb-4">
            <div>
              <p className="text-sm font-medium text-fg">คุกกี้ที่จำเป็น</p>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                ใช้สำหรับการเข้าสู่ระบบ ตะกร้า และความปลอดภัย ปิดไม่ได้
              </p>
            </div>
            <span className="shrink-0 text-xs text-fg-subtle">เปิดเสมอ</span>
          </div>
          <div className="py-4">
            <Switch
              checked={preferences.analytics}
              onCheckedChange={(checked) => setPreferences((p) => ({ ...p, analytics: checked }))}
              label="คุกกี้วิเคราะห์"
              description="ช่วยให้เรารู้ว่าหน้าไหนใช้งานยาก เพื่อปรับปรุงเว็บไซต์"
            />
          </div>
          <div className="pt-4">
            <Switch
              checked={preferences.marketing}
              onCheckedChange={(checked) => setPreferences((p) => ({ ...p, marketing: checked }))}
              label="คุกกี้การตลาด"
              description="ใช้แสดงโปรโมชันที่เกี่ยวกับคุณ"
            />
          </div>
        </div>
        <p className="mt-4 text-xs text-fg-subtle">
          <Link href="/privacy" className="underline-offset-2 hover:text-fg hover:underline">
            นโยบายความเป็นส่วนตัว
          </Link>
          <span aria-hidden="true"> · </span>
          <Link href="/terms" className="underline-offset-2 hover:text-fg hover:underline">
            ข้อกำหนดการใช้บริการ
          </Link>
        </p>
      </Dialog>
    </>
  );
}

export default CookieConsent;
