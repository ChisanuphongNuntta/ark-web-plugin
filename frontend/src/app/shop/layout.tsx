import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ร้านค้า',
  description: 'ไอเทม สัตว์ และแพ็กเกจ ARK ราคาเป็น Iris Coin ส่งเข้าเซิร์ฟเวอร์ที่คุณเลือกโดยตรง',
  alternates: { canonical: '/shop' },
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
