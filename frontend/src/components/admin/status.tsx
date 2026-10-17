import { Badge, type BadgeTone } from '@/components/ui';

/**
 * Status → label/tone maps for admin tables. Presentation only: the backend
 * owns every state transition and eligibility rule.
 */
interface StatusLook {
  label: string;
  tone: BadgeTone;
  outline?: boolean;
}

export const ORDER_STATUS_LOOK: Record<string, StatusLook> = {
  draft: { label: 'ร่าง', tone: 'neutral' },
  pending: { label: 'รอดำเนินการ', tone: 'neutral' },
  pending_payment: { label: 'รอชำระเงิน', tone: 'warning' },
  paid: { label: 'ชำระแล้ว', tone: 'info' },
  queued: { label: 'รอส่ง', tone: 'neutral' },
  delivering: { label: 'กำลังส่ง', tone: 'info' },
  delivered: { label: 'ส่งสำเร็จ', tone: 'success' },
  failed: { label: 'ส่งไม่สำเร็จ', tone: 'danger' },
  refunded: { label: 'คืนเงินแล้ว', tone: 'neutral', outline: true },
  cancelled: { label: 'ยกเลิก', tone: 'neutral', outline: true },
};

export const ORDER_STATUS_OPTIONS = [
  'pending_payment',
  'paid',
  'queued',
  'delivering',
  'delivered',
  'failed',
  'refunded',
  'cancelled',
  'pending',
  'draft',
].map((value) => ({ value, label: ORDER_STATUS_LOOK[value].label }));

export const DELIVERY_STATUS_LOOK: Record<string, StatusLook> = {
  pending: { label: 'รอในคิว', tone: 'neutral' },
  leased: { label: 'กำลังส่ง', tone: 'info' },
  completed: { label: 'สำเร็จ', tone: 'success' },
  failed: { label: 'ล้มเหลว', tone: 'danger' },
  dead_letter: { label: 'หยุดลองแล้ว', tone: 'danger', outline: true },
};

export const DELIVERY_STATUS_OPTIONS = ['failed', 'dead_letter', 'pending', 'leased', 'completed'].map((value) => ({
  value,
  label: DELIVERY_STATUS_LOOK[value].label,
}));

export const DELIVERY_TYPE_LABEL: Record<string, string> = {
  order: 'คำสั่งซื้อ',
  dino_catalog: 'สัตว์จากร้านค้า',
  dino_marketplace: 'สัตว์จากตลาด P2P',
};

export const LISTING_STATUS_LOOK: Record<string, StatusLook> = {
  listed: { label: 'กำลังขาย', tone: 'info' },
  sold: { label: 'ขายแล้ว', tone: 'success' },
  cancelled: { label: 'ยกเลิก', tone: 'neutral' },
  expired: { label: 'หมดอายุ', tone: 'neutral', outline: true },
};

export const LISTING_STATUS_OPTIONS = ['listed', 'sold', 'cancelled', 'expired'].map((value) => ({
  value,
  label: LISTING_STATUS_LOOK[value].label,
}));

export const AUDIT_STATUS_LOOK: Record<string, StatusLook> = {
  success: { label: 'สำเร็จ', tone: 'success' },
  failure: { label: 'ล้มเหลว', tone: 'danger' },
  failed: { label: 'ล้มเหลว', tone: 'danger' },
  denied: { label: 'ถูกปฏิเสธ', tone: 'warning' },
};

/** Thai labels for audit actions this console writes; unknown actions show their code. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  site_settings_update: 'แก้ไขการตั้งค่าเว็บไซต์',
  server_create: 'เพิ่มเซิร์ฟเวอร์',
  server_update: 'แก้ไขเซิร์ฟเวอร์',
  cluster_create: 'เพิ่มกลุ่มเซิร์ฟเวอร์',
  cluster_update: 'แก้ไขกลุ่มเซิร์ฟเวอร์',
  delivery_retry: 'ส่งของอีกครั้ง',
  payment_slip_approve: 'อนุมัติสลิป',
  payment_slip_reject: 'ปฏิเสธสลิป',
};

function lookFor(map: Record<string, StatusLook>, status: string | null | undefined): StatusLook {
  if (!status) return { label: '—', tone: 'neutral' };
  return map[status] ?? { label: status, tone: 'neutral' };
}

export function StatusBadge({
  kind,
  status,
}: {
  kind: 'order' | 'delivery' | 'listing' | 'audit';
  status: string | null | undefined;
}) {
  const map =
    kind === 'order'
      ? ORDER_STATUS_LOOK
      : kind === 'delivery'
        ? DELIVERY_STATUS_LOOK
        : kind === 'listing'
          ? LISTING_STATUS_LOOK
          : AUDIT_STATUS_LOOK;
  const look = lookFor(map, status);
  return (
    <Badge tone={look.tone} outline={look.outline}>
      {look.label}
    </Badge>
  );
}
