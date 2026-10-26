import type { Metadata } from 'next';
import { Chakra_Petch, IBM_Plex_Sans_Thai } from 'next/font/google';
import './globals.css';
import './frozen.css';
import './tek.css';
import './tek-theme.css';
import './vip-frames.css';
import './christmas-theme.css';
import './iris-ui.css';
import './iris-contrast.css';
import { FrozenPageFrame } from '@/components/FrozenPageFrame';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/Navbar';
import { TekTabBar } from '@/components/tek/TekTabBar';
import { TekMusic } from '@/components/tek/TekMusic';
import { CookieConsent } from '@/components/CookieConsent';
import { Footer } from '@/components/Footer';
import ChatWidget from '@/components/ChatWidget';
import { CartDrawer } from '@/components/CartDrawer';
import { ChristmasSnow } from '@/components/ChristmasSnow';
import { SITE_URL } from '@/lib/site';

const irisSans = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-iris-sans',
  display: 'swap',
});

const irisDisplay = Chakra_Petch({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-iris-display',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'IRIS Thailand | HeartShop ARK Ecosystem',
    template: '%s | IRIS Thailand',
  },
  description: 'ศูนย์กลาง IRIS Thailand สำหรับร้านค้า ARK ตลาดผู้เล่น กระเป๋า IRIS Coin และการส่งสินค้าเข้าเกม',
  applicationName: 'IRIS Thailand',
  icons: { icon: '/images/brand/iris-icon-v1.png', apple: '/images/brand/iris-apple-icon-v1.png' },
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
      <body className={`${irisSans.variable} ${irisDisplay.variable} iris-xmas min-h-screen bg-iris-ink text-iris-pearl antialiased`}>
        <Providers>
          <ChristmasSnow count={96} />
          <a className="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
          <Navbar />
          <main id="main-content" className="min-h-[70vh] flex-1" tabIndex={-1}>
            <FrozenPageFrame>{children}</FrozenPageFrame>
          </main>
          <Footer />
          <TekTabBar />
          <TekMusic />
          <CookieConsent />
          <ChatWidget />
          <CartDrawer />
        </Providers>
      </body>
    </html>
  );
}
