import type { Metadata } from 'next';
import { HomeExperience } from '@/components/home/HomeExperience';

export const metadata: Metadata = {
  title: 'IRIS Thailand — โลกที่เว็บและเกมเป็นหนึ่งเดียว',
  description: 'เข้าสู่ IRIS Thailand: ร้านค้า ARK ตลาดผู้เล่น กิจกรรม กระเป๋า IRIS Coin และการส่งสินค้าเข้าเกมในระบบเดียว',
  alternates: { canonical: '/' },
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'IRIS Thailand',
  url: 'https://www.iris-th.cloud',
  description: 'ชุมชนและระบบการค้า ARK ของ IRIS Thailand',
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <HomeExperience />
    </>
  );
}
