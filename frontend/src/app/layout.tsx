import type { Metadata } from 'next';
import { Noto_Sans_Thai, Noto_Serif_Thai } from 'next/font/google';
import './globals.css';
import './frozen.css';
import { FrozenPageFrame } from '@/components/FrozenPageFrame';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/Navbar';
import { CookieConsent } from '@/components/CookieConsent';
import { Footer } from '@/components/Footer';
import ChatWidget from '@/components/ChatWidget';
import { CartDrawer } from '@/components/CartDrawer';
import { SnowParticles } from '@/components/SnowParticles';

const irisSans = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  variable: '--font-iris-sans',
  display: 'swap',
});

const irisDisplay = Noto_Serif_Thai({
  subsets: ['thai', 'latin'],
  variable: '--font-iris-display',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.iris-th.cloud'),
  title: {
    default: 'IRIS Thailand | HeartShop ARK Ecosystem',
    template: '%s | IRIS Thailand',
  },
  description: 'ศูนย์กลาง IRIS Thailand สำหรับร้านค้า ARK ตลาดผู้เล่น กระเป๋า IRIS Coin และการส่งสินค้าเข้าเกม',
  applicationName: 'IRIS Thailand',
  keywords: ['ARK Thailand', 'IRIS Thailand', 'ARK Server', 'ARK Marketplace', 'HeartShop'],
  openGraph: {
    type: 'website',
    locale: 'th_TH',
    siteName: 'IRIS Thailand',
    title: 'IRIS Thailand | HeartShop ARK Ecosystem',
    description: 'เว็บ เกม ร้านค้า และชุมชน IRIS ในระบบเดียว',
    images: [{ url: '/images/hero_background.png', width: 1024, height: 1024, alt: 'โลก ARK ของ IRIS Thailand' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IRIS Thailand | HeartShop ARK Ecosystem',
    description: 'เว็บ เกม ร้านค้า และชุมชน IRIS ในระบบเดียว',
    images: ['/images/hero_background.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={`${irisSans.variable} ${irisDisplay.variable} min-h-screen bg-iris-ink text-iris-pearl antialiased`}>
        <Providers>
          <SnowParticles count={18} />
          <a className="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
          <Navbar />
          <main id="main-content" className="min-h-[70vh] flex-1" tabIndex={-1}>
            <FrozenPageFrame>{children}</FrozenPageFrame>
          </main>
          <Footer />
          <CookieConsent />
          <ChatWidget />
          <CartDrawer />
        </Providers>
      </body>
    </html>
  );
}
