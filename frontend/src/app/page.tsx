import type { Metadata } from 'next';
import { TekHome } from '@/components/tek/TekHome';

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
      {/* The hero is a CSS background, so the browser would only find it after the stylesheet; hint it early. */}
      <link rel="preload" as="image" href="/images/seasonal/christmas-depot-v2-mobile.webp" media="(max-width: 640px)" fetchPriority="high" />
      <link rel="preload" as="image" href="/images/seasonal/christmas-depot-v2.webp" media="(min-width: 641px)" fetchPriority="high" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <TekHome />
    </>
  );
}
