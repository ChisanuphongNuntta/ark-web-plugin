import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

const COLUMNS: Array<{ title: string; links: Array<{ href: string; label: string; external?: boolean }> }> = [
  {
    title: 'ซื้อขาย',
    links: [
      { href: '/shop', label: 'ร้านค้า' },
      { href: '/market', label: 'ตลาดผู้เล่น' },
      { href: '/packs', label: 'แพ็กเกจ' },
      { href: '/promotion', label: 'โปรโมชั่น' },
    ],
  },
  {
    title: 'ผู้เล่น',
    links: [
      { href: '/servers', label: 'รายชื่อและสถานะเซิร์ฟเวอร์' },
      { href: '/profile', label: 'IRIS ID' },
      { href: '/orders', label: 'คำสั่งซื้อ' },
      { href: '/topup', label: 'เติมเหรียญ' },
      { href: '/ranking', label: 'อันดับผู้เล่น' },
    ],
  },
  {
    title: 'ช่วยเหลือและนโยบาย',
    links: [
      { href: '/support', label: 'ศูนย์ช่วยเหลือ' },
      { href: '/terms', label: 'ข้อกำหนดบริการ' },
      { href: '/privacy', label: 'นโยบายความเป็นส่วนตัว' },
      { href: '/profile/data', label: 'จัดการข้อมูลส่วนบุคคล' },
    ],
  },
];

const DISCORD_URL = 'https://discord.gg/iris-thailand';

/** Calm four-column footer: brand + three link groups, legal line. No effects. */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-24 border-t border-line bg-canvas">
      <div className="page-shell py-12 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-[17px] font-semibold tracking-[0.24em] text-fg">IRIS</span>
              <span className="text-2xs font-medium tracking-[0.3em] text-fg-subtle">THAILAND</span>
            </div>
            <p className="mt-4 text-sm text-fg-muted">
              ร้านค้า ตลาดผู้เล่น และเซิร์ฟเวอร์ ARK ของ IRIS ใช้งานผ่าน IRIS ID บัญชีเดียว ของที่ซื้อส่งเข้าเกมตามเซิร์ฟเวอร์ที่คุณเลือก
            </p>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link href="/servers" className="text-fg transition-colors duration-fast hover:text-accent">
                สถานะเซิร์ฟเวอร์
              </Link>
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-fg transition-colors duration-fast hover:text-accent"
              >
                Discord
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                <span className="sr-only">(เปิดในแท็บใหม่)</span>
              </a>
            </div>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-xs font-medium text-fg-subtle">{column.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-fg-muted transition-colors duration-fast hover:text-fg">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} IRIS Thailand สงวนลิขสิทธิ์</p>
          <p>
            ARK: Survival Evolved เป็นเครื่องหมายการค้าของ Studio Wildcard · IRIS ไม่ได้เป็นส่วนหนึ่งของ Studio Wildcard
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
