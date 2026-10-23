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
  deliveries: 'การส่งของ',
  payments: 'การชำระเงิน',
  audit: 'บันทึกการทำงาน',
  settings: 'ตั้งค่าเว็บ',
  'plugin-keys': 'คีย์ปลั๊กอิน',
  vip: 'VIP',
  reconcile: 'ตรวจสอบยอดบัญชี',
  callback: 'เข้าสู่ระบบ',
  'link-steam': 'เชื่อม Steam',
};

/**
 * Every admin page, by role: [href, label, roles?]. roles limits who sees the link
 * (the page and the API still check). Keep in sync with the dashboard shortcuts
 * and ADMIN_ROUTES (lib/adminTransactionsMath.ts).
 */
const ADMIN_ONLY: UserRole[] = ['admin', 'root'];
const SERVER_STAFF: UserRole[] = ['server_admin', 'root'];
const ROOT_ONLY: UserRole[] = ['root'];
export const adminLinks: [string, string, UserRole[]?][] = [
  ['/admin', 'ภาพรวม'],
  ['/admin/orders', 'คำสั่งซื้อ', ADMIN_ONLY],
  ['/admin/deliveries', 'การส่งของ', ADMIN_ONLY],
  ['/admin/payments', 'การชำระเงิน', ADMIN_ONLY],
  ['/admin/transactions', 'ธุรกรรม', ADMIN_ONLY],
  ['/admin/vip', 'VIP', ADMIN_ONLY],
  ['/admin/market', 'ตลาดผู้เล่น', ADMIN_ONLY],
  ['/admin/products', 'สินค้า', ADMIN_ONLY],
  ['/admin/categories', 'หมวดหมู่', ADMIN_ONLY],
  ['/admin/content', 'เนื้อหา', ADMIN_ONLY],
  ['/admin/users', 'ผู้ใช้', SERVER_STAFF],
  ['/admin/protection', 'ความคุ้มครอง', ADMIN_ONLY],
  ['/admin/audit', 'บันทึกการทำงาน', ADMIN_ONLY],
  ['/admin/settings', 'ตั้งค่าเว็บ', ADMIN_ONLY],
  ['/admin/servers', 'เซิร์ฟเวอร์', ROOT_ONLY],
  ['/admin/chat-ranks', 'ยศแชท', ROOT_ONLY],
  ['/admin/api-keys', 'API Keys', SERVER_STAFF],
  ['/admin/plugin-keys', 'คีย์ปลั๊กอิน', ROOT_ONLY],
  ['/admin/system/api-key', 'ระบบ', ROOT_ONLY],
];

const accountLinks: [string, string][] = [
  ['/profile', 'บัญชีของฉัน'],
  ['/topup', 'เติมเหรียญ'],
  ['/vip', 'VIP'],
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
  const isAccount = ['profile', 'orders', 'topup', 'vip'].includes(section);
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
