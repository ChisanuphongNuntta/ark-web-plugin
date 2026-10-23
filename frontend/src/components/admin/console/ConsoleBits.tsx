'use client';

/**
 * Small shared pieces for the admin console pages (orders, deliveries, audit,
 * market, settings, plugin keys, VIP). Built on the admin kit look.
 */
import * as React from 'react';
import { Check, Copy, Loader2, XCircle } from 'lucide-react';
import { AdminNotice, AdminPanel, StatusBadge, type StatusTone } from '@/components/admin';
import { useAuthStore, type UserRole } from '@/lib/store';
import { cn } from '@/lib/utils';

const ROLE_TEXT: Record<string, string> = {
  root: 'ผู้ดูแลสูงสุด (Root)',
  admin: 'ผู้ดูแลระบบ (Admin)',
  server_admin: 'ผู้ดูแลเซิร์ฟเวอร์',
};

/**
 * Role gate for a page: spinner while auth loads, a Thai notice when the role
 * may not open the page. The backend still enforces every endpoint.
 */
export function AdminAccessGate({ allow, children }: { allow: readonly UserRole[]; children: React.ReactNode }) {
  const authLoading = useAuthStore((st) => st.isLoading);
  const user = useAuthStore((st) => st.user);
  if (authLoading && !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-iris-muted" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-iris-cyan" aria-hidden="true" />
        <span className="text-sm">กำลังตรวจสอบสิทธิ์…</span>
      </div>
    );
  }
  if (!user || !allow.includes(user.role)) {
    return (
      <AdminPanel className="text-center">
        <div className="py-8">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-rose-200" aria-hidden="true" />
          <p className="text-base font-semibold text-iris-pearl">
            {user
              ? `หน้านี้สำหรับ${allow.map((r) => ROLE_TEXT[r] ?? r).join(' และ ')}เท่านั้น`
              : 'กรุณาเข้าสู่ระบบ'}
          </p>
        </div>
      </AdminPanel>
    );
  }
  return <>{children}</>;
}

/** Label / value pair for detail drawers. */
export function DetailField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-iris-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-iris-pearl">{children}</dd>
    </div>
  );
}

/** Copy-to-clipboard icon button (shows "คัดลอกแล้ว" briefly). */
export function CopyValueButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          },
          () => undefined,
        );
      }}
      aria-label={label}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-iris-muted hover:bg-white/[0.06] hover:text-iris-pearl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan/40',
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? 'คัดลอกแล้ว' : null}
    </button>
  );
}

/** Pretty JSON (audit old/new/metadata). Secrets are redacted by the caller. */
export function JsonBlock({ value, label }: { value: unknown; label: string }) {
  if (value === null || value === undefined || value === '') return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs text-iris-muted">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 font-mono text-[11px] leading-5 text-iris-pearl">
        {text}
      </pre>
    </div>
  );
}

/** Notice shown when an older backend ignored a filter (rows that do not match came back). */
export function IgnoredFiltersNotice({ names, labels }: { names: readonly string[]; labels: Record<string, string> }) {
  if (!names.length) return null;
  return (
    <div className="px-5 pt-4">
      <AdminNotice tone="warning" title="ระบบหลังบ้านยังไม่รองรับตัวกรองบางรายการ">
        ตัวกรอง {names.map((n) => labels[n] ?? n).join(', ')} ยังไม่ถูกใช้ในฝั่งเซิร์ฟเวอร์ รายการด้านล่างอาจไม่ตรงกับตัวกรอง
      </AdminNotice>
    </div>
  );
}

/* ---------- status tones ---------- */

export const DELIVERY_STATUS_TH: Record<string, string> = {
  pending: 'รอส่ง',
  leased: 'กำลังส่ง',
  completed: 'ส่งสำเร็จ',
  failed: 'ส่งไม่สำเร็จ (จะลองใหม่)',
  dead_letter: 'ล้มเหลวถาวร',
};

export function deliveryTone(status: string): StatusTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'leased':
      return 'info';
    case 'pending':
      return 'warning';
    case 'failed':
    case 'dead_letter':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function DeliveryStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={deliveryTone(status)} dot>
      {DELIVERY_STATUS_TH[status] ?? status}
    </StatusBadge>
  );
}

export const DELIVERY_TYPE_TH: Record<string, string> = {
  order: 'คำสั่งซื้อ',
  dino_catalog: 'ไดโนร้านค้า',
  dino_marketplace: 'ไดโนตลาดผู้เล่น',
  permission_grant: 'เพิ่มสิทธิ์ VIP',
  permission_revoke: 'ถอนสิทธิ์ VIP',
};

export function orderTone(status: string): StatusTone {
  switch (status) {
    case 'delivered':
      return 'success';
    case 'paid':
    case 'queued':
    case 'delivering':
      return 'info';
    case 'pending':
    case 'pending_payment':
      return 'warning';
    case 'failed':
      return 'danger';
    default:
      return 'neutral';
  }
}

export const LISTING_STATUS_TH: Record<string, string> = {
  listed: 'วางขายอยู่',
  sold: 'ขายแล้ว',
  cancelled: 'ยกเลิก',
  expired: 'หมดอายุ',
};

export function listingTone(status: string): StatusTone {
  switch (status) {
    case 'listed':
      return 'info';
    case 'sold':
      return 'success';
    case 'expired':
      return 'warning';
    default:
      return 'neutral';
  }
}
