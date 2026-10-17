/**
 * Presentation helpers for the backend-owned order state machine.
 *
 * This file only maps contract status values to labels, colors and icons.
 * It never decides transitions, prices, refund eligibility amounts, or wallet
 * movement. Backend remains authoritative for those rules.
 */
import * as React from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  PackageCheck,
  RotateCcw,
  Truck,
  XCircle,
} from 'lucide-react';
import type { OrderStatus, TimelineStatus } from './contracts/types';

export interface StatusPresentation {
  label: string;
  chip: string;
  border: string;
  icon: React.ReactNode;
  terminal: boolean;
}

export const ORDER_STATUS: Record<OrderStatus, StatusPresentation> = {
  draft: {
    label: 'ร่างคำสั่งซื้อ',
    chip: 'text-fg-muted bg-surface-2',
    border: 'border-line',
    icon: <FileText className="h-4 w-4" />,
    terminal: false,
  },
  pending_payment: {
    label: 'รอชำระเงิน',
    chip: 'text-warning bg-warning/10',
    border: 'border-warning/30',
    icon: <CreditCard className="h-4 w-4" />,
    terminal: false,
  },
  paid: {
    label: 'ชำระเงินแล้ว',
    chip: 'text-success bg-success/10',
    border: 'border-success/30',
    icon: <CheckCircle2 className="h-4 w-4" />,
    terminal: false,
  },
  queued: {
    label: 'กำลังเตรียมจัดส่ง',
    chip: 'text-info bg-info/10',
    border: 'border-info/30',
    icon: <PackageCheck className="h-4 w-4" />,
    terminal: false,
  },
  delivering: {
    label: 'กำลังจัดส่งเข้าเกม',
    chip: 'text-info bg-info/10',
    border: 'border-info/30',
    icon: <Truck className="h-4 w-4" />,
    terminal: false,
  },
  delivered: {
    label: 'จัดส่งสำเร็จ',
    chip: 'text-success bg-success/10',
    border: 'border-success/30',
    icon: <CheckCircle2 className="h-4 w-4" />,
    terminal: true,
  },
  failed: {
    label: 'จัดส่งล้มเหลว',
    chip: 'text-danger bg-danger/10',
    border: 'border-danger/30',
    icon: <XCircle className="h-4 w-4" />,
    terminal: true,
  },
  refunded: {
    label: 'คืนเงินแล้ว',
    chip: 'text-accent bg-accent/10',
    border: 'border-accent/30',
    icon: <RotateCcw className="h-4 w-4" />,
    terminal: true,
  },
  cancelled: {
    label: 'ยกเลิกแล้ว',
    chip: 'text-fg-muted bg-surface-2',
    border: 'border-line',
    icon: <Ban className="h-4 w-4" />,
    terminal: true,
  },
  pending: {
    label: 'รอรับของ',
    chip: 'text-warning bg-warning/10',
    border: 'border-warning/30',
    icon: <Clock className="h-4 w-4" />,
    terminal: false,
  },
};

export function statusOf(status: string): StatusPresentation {
  return ORDER_STATUS[status as OrderStatus] ?? ORDER_STATUS.pending;
}

export function isOrderActive(status: string): boolean {
  const presentation = ORDER_STATUS[status as OrderStatus];
  return presentation ? !presentation.terminal : true;
}

/**
 * UI affordance only. Backend enforces the real refund rule and returns 409
 * when a request is rejected.
 */
export function isRefundable(status: string): boolean {
  return status === 'delivered' || status === 'failed';
}

export interface TimelineStepMeta {
  label: string;
  hint: string;
  icon: React.ReactNode;
  tone: 'neutral' | 'good' | 'bad';
}

export const TIMELINE_STEP: Record<TimelineStatus, TimelineStepMeta> = {
  created: {
    label: 'สร้างคำสั่งซื้อ',
    hint: 'Order created',
    icon: <FileText className="h-3.5 w-3.5" />,
    tone: 'neutral',
  },
  paid: {
    label: 'ยืนยันการชำระเงิน',
    hint: 'Payment confirmed',
    icon: <CreditCard className="h-3.5 w-3.5" />,
    tone: 'good',
  },
  queued: {
    label: 'เตรียมสินค้า',
    hint: 'Preparing',
    icon: <PackageCheck className="h-3.5 w-3.5" />,
    tone: 'neutral',
  },
  delivering: {
    label: 'เซิร์ฟเวอร์รับงานจัดส่ง',
    hint: 'Server claimed',
    icon: <Truck className="h-3.5 w-3.5" />,
    tone: 'neutral',
  },
  delivered: {
    label: 'จัดส่งเข้าเกมสำเร็จ',
    hint: 'Delivered',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    tone: 'good',
  },
  failed: {
    label: 'จัดส่งล้มเหลว',
    hint: 'Delivery failed',
    icon: <XCircle className="h-3.5 w-3.5" />,
    tone: 'bad',
  },
  refunded: {
    label: 'คืนเงินเข้ากระเป๋า',
    hint: 'Refunded to wallet',
    icon: <RotateCcw className="h-3.5 w-3.5" />,
    tone: 'good',
  },
};

export function timelineStepOf(status: string): TimelineStepMeta {
  return (
    TIMELINE_STEP[status as TimelineStatus] ?? {
      label: status,
      hint: status,
      icon: <Clock className="h-3.5 w-3.5" />,
      tone: 'neutral',
    }
  );
}
