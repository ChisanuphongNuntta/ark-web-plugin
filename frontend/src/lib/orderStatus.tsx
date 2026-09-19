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
  glow: string;
  icon: React.ReactNode;
  terminal: boolean;
}

export const ORDER_STATUS: Record<OrderStatus, StatusPresentation> = {
  draft: {
    label: 'ร่างคำสั่งซื้อ',
    chip: 'text-gray-300 bg-gray-400/15',
    border: 'border-white/10',
    glow: 'bg-gray-500/20',
    icon: <FileText className="h-4 w-4" />,
    terminal: false,
  },
  pending_payment: {
    label: 'รอชำระเงิน',
    chip: 'text-amber-300 bg-amber-400/15',
    border: 'border-amber-500/30',
    glow: 'bg-amber-500/25',
    icon: <CreditCard className="h-4 w-4" />,
    terminal: false,
  },
  paid: {
    label: 'ชำระเงินแล้ว',
    chip: 'text-emerald-300 bg-emerald-400/15',
    border: 'border-emerald-500/25',
    glow: 'bg-emerald-500/20',
    icon: <CheckCircle2 className="h-4 w-4" />,
    terminal: false,
  },
  queued: {
    label: 'กำลังเตรียมจัดส่ง',
    chip: 'text-blue-300 bg-blue-400/15',
    border: 'border-blue-500/30',
    glow: 'bg-blue-500/25',
    icon: <PackageCheck className="h-4 w-4" />,
    terminal: false,
  },
  delivering: {
    label: 'กำลังจัดส่งเข้าเกม',
    chip: 'text-cyan-300 bg-cyan-400/15',
    border: 'border-cyan-500/30',
    glow: 'bg-cyan-500/25',
    icon: <Truck className="h-4 w-4" />,
    terminal: false,
  },
  delivered: {
    label: 'จัดส่งสำเร็จ',
    chip: 'text-green-300 bg-green-400/15',
    border: 'border-green-500/30',
    glow: 'bg-green-500/25',
    icon: <CheckCircle2 className="h-4 w-4" />,
    terminal: true,
  },
  failed: {
    label: 'จัดส่งล้มเหลว',
    chip: 'text-rose-300 bg-rose-400/15',
    border: 'border-rose-500/30',
    glow: 'bg-rose-500/25',
    icon: <XCircle className="h-4 w-4" />,
    terminal: true,
  },
  refunded: {
    label: 'คืนเงินแล้ว',
    chip: 'text-violet-300 bg-violet-400/15',
    border: 'border-violet-500/30',
    glow: 'bg-violet-500/25',
    icon: <RotateCcw className="h-4 w-4" />,
    terminal: true,
  },
  cancelled: {
    label: 'ยกเลิกแล้ว',
    chip: 'text-gray-400 bg-gray-500/15',
    border: 'border-white/10',
    glow: 'bg-gray-500/20',
    icon: <Ban className="h-4 w-4" />,
    terminal: true,
  },
  pending: {
    label: 'รอรับของ',
    chip: 'text-yellow-300 bg-yellow-400/15',
    border: 'border-yellow-500/30',
    glow: 'bg-yellow-500/25',
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
