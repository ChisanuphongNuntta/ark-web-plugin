'use client';

import Link from 'next/link';
import { LegalDocument, type LegalSection } from '../terms/LegalDocument';

const SUMMARY = [
  'เก็บ Discord และ Steam ID เพื่อยืนยันตัวตนและส่งของเข้าเกม',
  'ไม่ขายหรือเปิดเผยข้อมูลผู้เล่นให้บุคคลภายนอก',
  'ทุกรายการ IC มีบันทึกย้อนหลังตรวจสอบได้',
  'ขอสำเนาหรือขอลบข้อมูลได้ที่หน้าข้อมูลส่วนบุคคล',
] as const;

const SECTIONS: readonly LegalSection[] = [
  {
    title: 'ข้อมูลที่เราเก็บ',
    items: [
      'ข้อมูล Discord: Discord ID ชื่อผู้ใช้ และรูปโปรไฟล์',
      'ข้อมูล Steam: Steam ID เมื่อคุณเชื่อมบัญชี',
      'ข้อมูลการใช้งาน: ประวัติคำสั่งซื้อ ประวัติการเติม และยอด Iris Coin',
      'ข้อมูลทางเทคนิค: IP address, user agent และเซสชันการเข้าสู่ระบบ',
    ],
  },
  {
    title: 'วัตถุประสงค์ในการใช้ข้อมูล',
    items: [
      'ยืนยันตัวตนและรักษาความปลอดภัยของบัญชี',
      'ส่งสัตว์และไอเทมเข้าเกมตามคำสั่งซื้อ',
      'บันทึกและแสดงยอด Iris Coin ในกระเป๋าของคุณ',
      'แจ้งสถานะคำสั่งซื้อและช่วยเหลือเมื่อเกิดปัญหา',
    ],
  },
  {
    title: 'สิทธิของเจ้าของข้อมูล',
    body: 'ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล คุณมีสิทธิดังนี้',
    items: [
      'ขอเข้าถึงและขอรับสำเนาข้อมูล',
      'ขอแก้ไขข้อมูลให้ถูกต้อง',
      'ขอลบหรือทำลายข้อมูล',
      'ขอโอนย้ายข้อมูล',
      'เพิกถอนความยินยอม',
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      type="privacy_policy"
      title="นโยบายความเป็นส่วนตัว"
      description="ข้อมูลที่ IRIS Thailand เก็บ ใช้ทำอะไร และสิทธิของคุณตาม PDPA"
      summary={SUMMARY}
      fallback={SECTIONS}
      footer={
        <p className="text-sm text-fg-muted">
          ต้องการขอสำเนาหรือลบข้อมูล ไปที่{' '}
          <Link href="/profile/data" className="text-accent underline-offset-4 hover:underline">
            ข้อมูลส่วนบุคคล
          </Link>{' '}
          ในบัญชีของคุณ
        </p>
      }
    />
  );
}
