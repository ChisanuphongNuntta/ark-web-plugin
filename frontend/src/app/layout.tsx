import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { SeasonProvider } from '@/components/season/SeasonProvider';
import { SeasonRibbon } from '@/components/season/SeasonRibbon';
import { SEASON_BOOTSTRAP_SCRIPT } from '@/components/season/seasons';
import { PageFrame } from '@/components/ui/PageFrame';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { CookieConsent } from '@/components/CookieConsent';
import ChatWidget from '@/components/ChatWidget';
import { CartDrawer } from '@/components/CartDrawer';

const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-thai',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.iris-th.cloud'),
  title: {
    default: 'IRIS Thailand — ร้านค้าและชุมชน ARK',
    template: '%s | IRIS Thailand',
  },
  description: 'IRIS Thailand ร้านค้า ARK ตลาดผู้เล่น กระเป๋า IRIS Coin รายชื่อเซิร์ฟเวอร์ และการส่งของเข้าเกม',
  applicationName: 'IRIS Thailand',
  keywords: ['ARK Thailand', 'IRIS Thailand', 'ARK Server', 'ARK PvE', 'ARK PvPvE', 'ARK Marketplace'],
  openGraph: {
    type: 'website',
    locale: 'th_TH',
    siteName: 'IRIS Thailand',
    title: 'IRIS Thailand — ร้านค้าและชุมชน ARK',
    description: 'ร้านค้า ตลาดผู้เล่น และเซิร์ฟเวอร์ ARK ของ IRIS ในบัญชีเดียว',
    images: [{ url: '/images/hero_background.png', width: 1024, height: 1024, alt: 'IRIS Thailand' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IRIS Thailand — ร้านค้าและชุมชน ARK',
    description: 'ร้านค้า ตลาดผู้เล่น และเซิร์ฟเวอร์ ARK ของ IRIS ในบัญชีเดียว',
    images: ['/images/hero_background.png'],
  },
};

export const viewport: Viewport = {
  // Default canvas; the season bootstrap script and SeasonProvider re-point it per season.
  themeColor: '#0B0C0E',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning className={`${plexThai.variable} ${plexMono.variable}`}>
      <head>
        {/* Applies data-season before first paint (cached setting or date rule). */}
        <script dangerouslySetInnerHTML={{ __html: SEASON_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-fg antialiased">
        <Providers>
          <SeasonProvider>
            <a className="skip-link" href="#main-content">
              ข้ามไปยังเนื้อหาหลัก
            </a>
            <SeasonRibbon />
            <Navbar />
            <main id="main-content" className="min-h-[70vh] focus:outline-none" tabIndex={-1}>
              <PageFrame>{children}</PageFrame>
            </main>
            <Footer />
            <CookieConsent />
            <ChatWidget />
            <CartDrawer />
          </SeasonProvider>
        </Providers>
      </body>
    </html>
  );
}
