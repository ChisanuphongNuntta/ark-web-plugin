import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ข้อกำหนดการใช้บริการ',
  description: 'ข้อกำหนดและเงื่อนไขการใช้บริการร้านค้าและเซิร์ฟเวอร์ IRIS Thailand',
  alternates: { canonical: '/terms' },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
