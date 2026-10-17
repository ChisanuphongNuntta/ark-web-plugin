import type { Metadata } from 'next';
import { HomeExperience } from '@/components/home/HomeExperience';

export const metadata: Metadata = {
  title: { absolute: 'IRIS Thailand — ร้านค้าและชุมชน ARK' },
  description:
    'ร้านค้า ARK ของ IRIS Thailand: เลือกของ เลือกเซิร์ฟเวอร์ PvE, PvE Mod หรือ PvPvE แล้วรับในเกม พร้อมตลาดผู้เล่นและกระเป๋า Iris Coin',
  alternates: { canonical: '/' },
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'IRIS Thailand',
  url: 'https://www.iris-th.cloud',
  description: 'ชุมชนและร้านค้า ARK: Survival Evolved ของ IRIS Thailand',
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <HomeExperience />
    </>
  );
}
