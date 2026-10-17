'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs';

/** Thai labels for URL segments (breadcrumb trail). */
const SEGMENT_LABELS: Record<string, string> = {
  shop: 'ร้านค้า',
  market: 'ตลาดผู้เล่น',
  servers: 'เซิร์ฟเวอร์',
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
  admin: 'คอนโซลผู้ดูแล',
  'design-system': 'ระบบดีไซน์',
  auth: 'เชื่อมบัญชี',
  p: 'บทความ',
  'my-listings': 'รายการขายของฉัน',
  'my-purchases': 'รายการซื้อของฉัน',
  data: 'ข้อมูลส่วนบุคคล',
  products: 'สินค้า',
  categories: 'หมวดหมู่',
  users: 'ผู้ใช้',
  clusters: 'กลุ่มเซิร์ฟเวอร์',
  deliveries: 'การส่งของ',
  audit: 'บันทึกการใช้งาน',
  'audit-logs': 'บันทึกการใช้งาน',
  listings: 'รายการในตลาด',
  settings: 'ตั้งค่าเว็บไซต์',
  content: 'เนื้อหา',
  'chat-ranks': 'ยศในแชท',
  protection: 'ความคุ้มครอง',
  'api-keys': 'การเชื่อมต่อ',
  system: 'ระบบ',
  'api-key': 'API Key',
  callback: 'เข้าสู่ระบบ',
  'link-steam': 'เชื่อม Steam',
};

type SectionLink = readonly [href: string, label: string];

/**
 * In-section secondary navigation. The admin section is intentionally NOT
 * here: the admin console owns its own shell (app/admin/layout.tsx).
 */
const SECTION_NAV: Record<string, readonly SectionLink[]> = {
  account: [
    ['/profile', 'บัญชีของฉัน'],
    ['/topup', 'เติมเหรียญ'],
    ['/orders', 'คำสั่งซื้อ'],
    ['/profile/data', 'ข้อมูลส่วนบุคคล'],
  ],
  market: [
    ['/market', 'ตลาดทั้งหมด'],
    ['/market/my-listings', 'รายการขายของฉัน'],
    ['/market/my-purchases', 'รายการซื้อของฉัน'],
  ],
};

/** Sections that render no frame at all (they own their chrome). */
const FRAMELESS = new Set(['home', 'admin', 'login', 'auth']);

function buildTrail(parts: string[]): BreadcrumbItem[] {
  const section = parts[0];
  const trail: BreadcrumbItem[] = [{ label: 'หน้าแรก', href: '/' }];
  if ((section === 'topup' || section === 'orders') && parts.length === 1) {
    trail.push({ label: 'บัญชีของฉัน', href: '/profile' });
  }
  parts.forEach((part, i) => {
    const href = '/' + parts.slice(0, i + 1).join('/');
    trail.push({
      label: SEGMENT_LABELS[part] ?? 'รายละเอียด',
      href: i === parts.length - 1 ? undefined : href,
    });
  });
  return trail;
}

/**
 * Neutral page frame: breadcrumb trail + optional in-section tabs.
 * No decoration. Pages render their own <PageHeader/> below it.
 */
export function PageFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const parts = pathname.split('/').filter(Boolean);
  const section = parts[0] ?? 'home';
  const navKey = ['profile', 'orders', 'topup'].includes(section) ? 'account' : section;
  const links = SECTION_NAV[navKey] ?? [];

  if (FRAMELESS.has(section)) {
    return (
      <div className="min-w-0" data-page={section}>
        {children}
      </div>
    );
  }

  return (
    <div className="min-w-0" data-page={section}>
      <div className="page-shell pt-5">
        <Breadcrumbs items={buildTrail(parts)} />
      </div>
      {links.length > 0 ? (
        <nav className="page-shell mt-4" aria-label="เมนูในส่วนนี้">
          <ul className="no-scrollbar flex gap-6 overflow-x-auto border-b border-line">
            {links.map(([href, label]) => {
              const active = pathname === href;
              return (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      '-mb-px inline-flex h-10 items-center border-b text-sm transition-colors duration-fast',
                      active ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'
                    )}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
      {children}
    </div>
  );
}

export default PageFrame;
