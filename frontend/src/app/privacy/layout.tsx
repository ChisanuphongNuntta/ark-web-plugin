import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'นโยบายความเป็นส่วนตัว',
  description: 'วิธีที่ IRIS Thailand เก็บ ใช้ และคุ้มครองข้อมูลส่วนบุคคลของผู้เล่นตาม PDPA',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
