import * as React from 'react';
import { Check, X } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui';
import type { OrderStatus, TimelineEvent, TimelineStatus } from '@/lib/contracts/types';
import { isOrderActive, statusOf } from '@/lib/orderStatus';
import { cn } from '@/lib/utils';

/* Presentation only — the backend owns the order state machine. */

const ORDER_TONE: Record<OrderStatus, { tone: BadgeTone; outline?: boolean }> = {
  draft: { tone: 'neutral' },
  pending_payment: { tone: 'warning' },
  paid: { tone: 'info' },
  queued: { tone: 'neutral' },
  delivering: { tone: 'info' },
  delivered: { tone: 'success' },
  failed: { tone: 'danger' },
  refunded: { tone: 'neutral', outline: true },
  cancelled: { tone: 'neutral', outline: true },
  pending: { tone: 'warning' },
};

export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = ORDER_TONE[status as OrderStatus] ?? { tone: 'neutral' as BadgeTone };
  return (
    <Badge tone={meta.tone} outline={meta.outline} className={className}>
      {statusOf(status).label}
    </Badge>
  );
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function shortId(id: string): string {
  return id.length <= 12 ? id : id.slice(0, 8);
}

/* ------------------------------------------------------------------------ */
/* Delivery timeline — fixed steps, filled in from backend events.          */
/* ------------------------------------------------------------------------ */

const STEP_LABEL: Record<TimelineStatus, { title: string; hint: string }> = {
  created: { title: 'สร้างคำสั่งซื้อ', hint: 'ระบบรับรายการแล้ว' },
  paid: { title: 'ชำระเงิน', hint: 'หักยอดจากกระเป๋าแล้ว' },
  queued: { title: 'เข้าคิวส่งของ', hint: 'รอเซิร์ฟเวอร์ปลายทางรับงาน' },
  delivering: { title: 'เซิร์ฟเวอร์รับงาน', hint: 'กำลังส่งเข้าตัวละครของคุณ' },
  delivered: { title: 'ส่งเข้าเกมแล้ว', hint: 'ของอยู่ในตัวละครแล้ว' },
  failed: { title: 'ส่งไม่สำเร็จ', hint: 'ระบบจะลองใหม่หรือให้ทีมงานตรวจสอบ' },
  refunded: { title: 'คืนเงินแล้ว', hint: 'ยอดคืนเข้ากระเป๋าส่วนเงินคืน' },
};

const CANONICAL: TimelineStatus[] = ['created', 'paid', 'queued', 'delivering', 'delivered'];

type StepState = 'done' | 'current' | 'upcoming' | 'error';

interface Step {
  key: TimelineStatus;
  state: StepState;
  at: string | null;
}

export function buildSteps(orderStatus: string, events: TimelineEvent[]): Step[] {
  const lastAt = new Map<TimelineStatus, string>();
  for (const e of events) lastAt.set(e.status, e.at);

  const failed = orderStatus === 'failed' || lastAt.has('failed');
  const refunded = orderStatus === 'refunded' || lastAt.has('refunded');
  const keys: TimelineStatus[] = CANONICAL.map((k) => (k === 'delivered' && failed && !lastAt.has('delivered') ? 'failed' : k));
  if (refunded) keys.push('refunded');

  // A step counts as done if it, or any later step, has an event.
  let furthest = -1;
  keys.forEach((k, i) => {
    if (lastAt.has(k)) furthest = i;
  });
  if (orderStatus === 'delivered') furthest = Math.max(furthest, keys.indexOf('delivered'));
  if (failed) furthest = Math.max(furthest, keys.indexOf('failed'));
  if (refunded) furthest = keys.length - 1;

  const active = isOrderActive(orderStatus) && orderStatus !== 'cancelled';
  return keys.map((key, i) => {
    let state: StepState = i <= furthest ? 'done' : 'upcoming';
    if (key === 'failed' && i <= furthest) state = 'error';
    if (active && i === furthest + 1) state = 'current';
    return { key, state, at: lastAt.get(key) ?? null };
  });
}

export function DeliveryTimeline({ orderStatus, events }: { orderStatus: string; events: TimelineEvent[] }) {
  const steps = buildSteps(orderStatus, events);
  return (
    <ol className="relative" aria-label="ขั้นตอนการส่งของ">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const label = STEP_LABEL[step.key];
        return (
          <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0" aria-current={step.state === 'current' ? 'step' : undefined}>
            {!isLast ? (
              <span
                className={cn('absolute left-[11px] top-7 h-[calc(100%-1.75rem)] w-px', step.state === 'done' ? 'bg-line-strong' : 'bg-line')}
                aria-hidden="true"
              />
            ) : null}
            <span
              className={cn(
                'relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px]',
                step.state === 'done' && 'border-line-strong bg-surface-2 text-fg',
                step.state === 'current' && 'border-accent text-accent',
                step.state === 'upcoming' && 'border-line text-fg-subtle',
                step.state === 'error' && 'border-danger/50 text-danger'
              )}
              aria-hidden="true"
            >
              {step.state === 'done' ? (
                <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
              ) : step.state === 'error' ? (
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              ) : (
                <span className="font-mono">{index + 1}</span>
              )}
            </span>
            <div className="min-w-0 flex-1 sm:flex sm:items-start sm:justify-between sm:gap-4">
              <div>
                <p
                  className={cn(
                    'text-sm font-medium',
                    step.state === 'upcoming' ? 'text-fg-subtle' : step.state === 'error' ? 'text-danger' : 'text-fg'
                  )}
                >
                  {label.title}
                  <span className="sr-only">
                    {step.state === 'done' ? ' (เสร็จแล้ว)' : step.state === 'current' ? ' (กำลังดำเนินการ)' : step.state === 'error' ? ' (ล้มเหลว)' : ''}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {step.state === 'current' ? `กำลังดำเนินการ · ${label.hint}` : label.hint}
                </p>
              </div>
              {step.at ? (
                <time dateTime={step.at} className="mt-1 block shrink-0 font-mono text-xs tabular-nums text-fg-muted sm:mt-0">
                  {formatDate(step.at)}
                </time>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Label/value row used in order summaries. */
export function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-2.5', className)}>
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-fg">{children}</dd>
    </div>
  );
}
