import type { Metadata } from 'next';
import { VipPage } from '@/components/vip/VipPage';

export const metadata: Metadata = {
  title: 'สมาชิก VIP',
  description: 'สมัคร VIP ของ IRIS Thailand ด้วยบัตรหรือโอนเงิน รับคำสั่งพิเศษในเกม กรอบรูปโปรไฟล์ และป้าย VIP ในแชทและตลาดผู้เล่น',
};

export default function Page() {
  return <VipPage />;
}
