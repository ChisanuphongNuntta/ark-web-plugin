'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Snowflake } from 'lucide-react';
import { useAuthStore, type UserRole } from '@/lib/store';
import { LedgerMismatchBanner } from '@/components/admin/transactions/LedgerMismatchBanner';

const titles: Record<string, string> = {
  shop: 'ร้านค้า',
  market: 'ตลาดผู้เล่น',
  cart: 'ตะกร้าสินค้า',
  topup: 'เติมเหรียญ',
  orders: 'คำสั่งซื้อ',
  profile: 'บัญชีของฉัน',
  event: 'กิจกรรม',
  promotion: 'โปรโมชั่น',
  packs: 'แพ็กเกจ',
  ranking: 'อันดับผู้เล่น',
  support: 'ศูนย์ช่วยเหลือ',
  login: 'เข้าสู่ระบบ',
  privacy: 'ความเป็นส่วนตัว',
  terms: 'ข้อกำหนดบริการ',
  admin: 'จัดการร้านค้า',
  'design-system': 'รูปแบบเว็บไซต์',
  auth: 'เชื่อมบัญชี',
  p: 'บทความ',
  'my-listings': 'รายการขายของฉัน',
  'my-purchases': 'รายการซื้อของฉัน',
  data: 'ข้อมูลส่วนบุคคล',
  products: 'สินค้า',
  categories: 'หมวดหมู่',
  users: 'ผู้ใช้',
  servers: 'เซิร์ฟเวอร์',
  content: 'เนื้อหา',
  'chat-ranks': 'ยศในแชท',
  protection: 'ความคุ้มครอง',
  'api-keys': 'การเชื่อมต่อ',
  system: 'ระบบ',
  'api-key': 'API Key',
  transactions: 'ธุรกรรม',
  reconcile: 'ตรวจสอบยอดบัญชี',
  callback: 'เข้าสู่ระบบ',
  'link-steam': 'เชื่อม Steam',
};

/** [href, label, roles?] — roles limits who sees the link (the page itself still checks). */
const adminLinks: [string, string, UserRole[]?][] = [
  ['/admin', 'ภาพรวม'],
  ['/admin/transactions', 'ธุรกรรม', ['admin', 'root']],
  ['/admin/products', 'สินค้า'],
  ['/admin/categories', 'หมวดหมู่'],
  ['/admin/users', 'ผู้ใช้'],
  ['/admin/servers', 'เซิร์ฟเวอร์'],
  ['/admin/content', 'เนื้อหา'],
  ['/admin/chat-ranks', 'ยศแชท'],
  ['/admin/protection', 'ความคุ้มครอง'],
  ['/admin/api-keys', 'API Keys'],
  ['/admin/system/api-key', 'ระบบ'],
];

const accountLinks: [string, string][] = [
  ['/profile', 'บัญชีของฉัน'],
  ['/topup', 'เติมเหรียญ'],
  ['/orders', 'คำสั่งซื้อ'],
  ['/profile/data', 'ข้อมูลส่วนบุคคล'],
];

const marketLinks: [string, string][] = [
  ['/market', 'ตลาดทั้งหมด'],
  ['/market/my-listings', 'รายการขายของฉัน'],
  ['/market/my-purchases', 'รายการซื้อของฉัน'],
];

export function FrozenPageFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const parts = pathname.split('/').filter(Boolean);
  const section = parts[0] || 'home';
  const isAccount = ['profile', 'orders', 'topup'].includes(section);
  const role = useAuthStore((state) => state.user?.role ?? 'user');
  const links: [string, string][] =
    section === 'admin'
      ? adminLinks.filter(([, , roles]) => !roles || roles.includes(role)).map(([href, label]): [string, string] => [href, label])
      : isAccount
        ? accountLinks
        : section === 'market'
          ? marketLinks
          : [];

  // Custom breadcrumb segments for unified account section
  const breadcrumbSegments = (() => {
    if (section === 'topup') {
      return [
        { label: 'บัญชีของฉัน', href: '/profile', isCurrent: false },
        { label: 'เติมเหรียญ', href: '/topup', isCurrent: true },
      ];
    }
    if (section === 'orders' && parts.length === 1) {
      return [
        { label: 'บัญชีของฉัน', href: '/profile', isCurrent: false },
        { label: 'คำสั่งซื้อ', href: '/orders', isCurrent: true },
      ];
    }
    return parts.map((part, i) => ({
      label: titles[part] || 'รายละเอียด',
      href: '/' + parts.slice(0, i + 1).join('/'),
      isCurrent: i === parts.length - 1,
    }));
  })();

  return (
    <div className={`frozen-page frozen-page-${section}`} data-page={section}>
      {section !== 'home' && (
        <div className="page-shell frozen-wayfinding">
          <nav aria-label="เส้นทางหน้าปัจจุบัน" className="flex items-center gap-2 min-w-0 flex-wrap">
            <Link href="/" className="hover:text-white">
              IRIS
            </Link>
            {breadcrumbSegments.map((seg, i) => (
              <span key={i} className="inline-flex items-center gap-2">
                <ChevronRight size={12} />
                {seg.isCurrent ? (
                  <span aria-current="page">{seg.label}</span>
                ) : (
                  <Link href={seg.href} className="hover:text-white">
                    {seg.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
          <span className="hidden sm:inline-flex items-center gap-2 tracking-widest text-[10px]">
            <Snowflake size={12} /> FROZEN EXPEDITION
          </span>
        </div>
      )}
      {links.length > 0 && (
        <nav className="page-shell frozen-section-nav" aria-label="เมนูในส่วนนี้">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`)) ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      {section === 'admin' && <LedgerMismatchBanner />}
      {children}
    </div>
  );
}
