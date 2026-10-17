import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'แพ็กเกจ',
  description: 'แพ็กเกจรวมไอเทมและสัตว์ ARK ซื้อครั้งเดียว ส่งเข้าเซิร์ฟเวอร์ที่คุณเลือก',
  alternates: { canonical: '/packs' },
};

export default function PacksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
