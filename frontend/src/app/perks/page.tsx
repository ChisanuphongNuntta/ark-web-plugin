import type { Metadata } from 'next';
import { PerksPage } from '@/components/perks/PerksPage';

export const metadata: Metadata = {
  title: 'สิทธิ์พิเศษในเกม',
  description: 'แพ็กเกจรายเดือน Perk Token และโปรโมชั่นสำหรับคำสั่งพิเศษในเกม IRIS Thailand ตรวจสิทธิ์จากเว็บแบบเรียลไทม์ทุกเซิร์ฟเวอร์',
};

export default function Page() {
  return <PerksPage />;
}
