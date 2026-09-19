import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  Clock3,
  Gamepad2,
  Headphones,
  MessageSquareWarning,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';

export type SupportTicketCategory = {
  value: string;
  label: string;
  sla: string;
  description: string;
  icon: LucideIcon;
};

export type SupportFaq = {
  question: string;
  answer: string;
  tags: string[];
};

export type SupportMetric = {
  label: string;
  value: string;
  caption: string;
};

export type SupportProcessStep = {
  title: string;
  body: string;
  icon: LucideIcon;
};

export const supportMetrics: SupportMetric[] = [
  { label: 'Median first response', value: '8 นาที', caption: 'สำหรับ ticket เติมเงินและส่งของเข้าเกม' },
  { label: 'Plugin delivery watch', value: '24/7', caption: 'ตรวจคิวส่งของและ heartbeat เซิร์ฟเวอร์' },
  { label: 'Critical escalation', value: '15 นาที', caption: 'กรณีจ่ายเงินแล้วไม่ได้รับ IC หรือ item' },
];

export const supportTicketCategories: SupportTicketCategory[] = [
  {
    value: 'payment',
    label: 'เติมเงิน / ชำระเงิน / IC ไม่เข้า',
    sla: 'ตอบกลับเร็วสุด 5-15 นาที',
    description: 'แนบเลขอ้างอิงหรือสลิปเพื่อให้ทีมตรวจ ledger ได้เร็วขึ้น',
    icon: Banknote,
  },
  {
    value: 'delivery',
    label: 'ซื้อสินค้าแล้วไม่ได้รับของ',
    sla: 'ตรวจคิวส่งของ 10-20 นาที',
    description: 'ใช้ Order ID, Steam ID และเซิร์ฟเวอร์ปลายทางเพื่อตรวจ plugin delivery',
    icon: PackageCheck,
  },
  {
    value: 'server',
    label: 'เซิร์ฟเวอร์ / บั๊ก / ตัวละคร',
    sla: 'ประเมินตามความรุนแรง',
    description: 'เหมาะกับปัญหา rollback, character stuck, หรือระบบ protection',
    icon: Wrench,
  },
  {
    value: 'account',
    label: 'IRIS ID / Discord / Steam Link',
    sla: 'ตอบกลับภายใน 30 นาที',
    description: 'ใช้สำหรับยืนยันตัวตน เชื่อมบัญชี หรือแก้ session ผิดปกติ',
    icon: ShieldCheck,
  },
  {
    value: 'market',
    label: 'Player Market / P2P / ข้อพิพาท',
    sla: 'ตรวจหลักฐานก่อนตัดสิน',
    description: 'สำหรับรายการซื้อขายผู้เล่นต่อผู้เล่น escrow หรือ dispute',
    icon: MessageSquareWarning,
  },
];

export const supportFaqs: SupportFaq[] = [
  {
    question: 'เติมเงินแล้วไม่ได้รับ IRIS Coins (IC) ต้องทำอย่างไร?',
    answer:
      'ส่ง ticket หมวดเติมเงิน พร้อมเวลาโอน ยอดเงิน ช่องทางชำระ และเลขอ้างอิง ระบบจะตรวจ ledger และสถานะ webhook ก่อนปรับยอดให้ถูกต้อง หากชำระสำเร็จแต่ callback ล่าช้า ทีมจะ reconcile ให้ตามหลักฐานหลังบ้าน',
    tags: ['Wallet', 'Auto Top-up', 'Ledger'],
  },
  {
    question: 'ซื้อ Blueprint หรือ Item แล้วของจะเข้าเกมอย่างไร?',
    answer:
      'หลัง checkout สำเร็จ Backend จะสร้าง order และส่งเข้าคิว plugin delivery ตามเซิร์ฟเวอร์ที่เลือก ผู้เล่นควรออนไลน์ด้วย Steam ID ที่ผูกไว้ หาก plugin ส่งไม่สำเร็จ ระบบจะ retry และแสดงสถานะในหน้า Orders',
    tags: ['Checkout', 'Plugin Delivery', 'Orders'],
  },
  {
    question: 'ทำไมราคาหน้า checkout อาจไม่เท่ากับราคาที่เห็นใน catalog?',
    answer:
      'ราคาสุดท้ายมาจาก Checkout Session ของ Backend เท่านั้น เพราะต้องตรวจ stock, promotion, wallet, สิทธิ์ผู้เล่น และเงื่อนไขเซิร์ฟเวอร์ก่อนตัดยอด หน้า frontend แสดงราคา catalog เพื่อช่วยตัดสินใจ ไม่ใช่ยอดสุดท้าย',
    tags: ['Backend Total', 'Promotion', 'Security'],
  },
  {
    question: 'New Player Protection ป้องกันอะไรบ้าง?',
    answer:
      'ระบบช่วยคุ้มครองผู้เล่นใหม่ตามกฎเซิร์ฟเวอร์ เช่น ลดความเสี่ยงจากการถูกโจมตีช่วงเริ่มต้น และช่วยให้ทีม support ตรวจประวัติเหตุการณ์ได้ง่ายขึ้น รายละเอียดจริงขึ้นกับกฎของแต่ละ cluster',
    tags: ['Protection', 'Server Rule', 'Player Safety'],
  },
  {
    question: 'หากซื้อผิดเซิร์ฟเวอร์หรือผิดสินค้า ขอคืนเงินได้ไหม?',
    answer:
      'ให้เปิด ticket พร้อม Order ID ทันที ทีมจะตรวจสถานะการส่งของ หากยังไม่ถูกส่งหรือเข้าเงื่อนไข refund ระบบหลังบ้านจะเป็นผู้อนุมัติและบันทึกรายการคืนยอด โดย frontend จะไม่ตัดสินยอดคืนเงินเอง',
    tags: ['Refund', 'Order ID', 'Audit Trail'],
  },
];

export const supportProcess: SupportProcessStep[] = [
  {
    title: 'รับเรื่องแบบมีบริบท',
    body: 'ฟอร์มบังคับข้อมูลที่จำเป็นต่อการตรวจ order, wallet และ server โดยไม่ให้ทีมต้องถามซ้ำหลายรอบ',
    icon: Headphones,
  },
  {
    title: 'ตรวจระบบที่เกี่ยวข้อง',
    body: 'แยก payment ledger, checkout session, plugin queue และ server heartbeat เพื่อหาต้นเหตุจริง',
    icon: Sparkles,
  },
  {
    title: 'ปิดงานพร้อมหลักฐาน',
    body: 'สรุปผลให้ผู้เล่น พร้อมสถานะต่อไป เช่น retry delivery, refund request หรือ escalation ไป admin',
    icon: Gamepad2,
  },
];

export const supportEscalation = [
  { label: 'Payment critical', value: 'IC ไม่เข้าหลังชำระสำเร็จ', time: '15 นาที' },
  { label: 'Delivery failed', value: 'Plugin ส่งของล้มเหลวหลายครั้ง', time: '20 นาที' },
  { label: 'Account risk', value: 'บัญชี/Steam link ผิดปกติ', time: '30 นาที' },
];

export const supportAvailability = [
  { label: 'Live monitor', value: 'เปิดตลอดเวลา', icon: Clock3 },
  { label: 'Discord handoff', value: 'ตอบกลับผ่าน IRIS ID', icon: Headphones },
  { label: 'Evidence first', value: 'ทุกเคสมี audit trail', icon: ShieldCheck },
];
