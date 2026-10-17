import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  FileText,
  FolderTree,
  KeyRound,
  LayoutDashboard,
  MessagesSquare,
  Package,
  Plug,
  ReceiptText,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Truck,
  Users,
} from 'lucide-react';

/**
 * Who may see a console entry. Mirrors the backend guards in
 * backend/src/routes/admin.routes.ts — the backend enforces, the UI only hides.
 *
 * - `console`  any console role (admin | server_admin | root)
 * - `website`  admin | root            (requireWebsiteAdmin / requireAdmin)
 * - `server`   server_admin | root     (requireServerAdminOrRoot)
 * - `root`     root only               (requireRoot)
 */
export type AdminAccess = 'console' | 'website' | 'server' | 'root';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  access: AdminAccess;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'ภาพรวม',
    items: [{ href: '/admin', label: 'ภาพรวม', icon: LayoutDashboard, access: 'console' }],
  },
  {
    label: 'การขาย',
    items: [
      { href: '/admin/orders', label: 'คำสั่งซื้อ', icon: ShoppingCart, access: 'website' },
      { href: '/admin/payments', label: 'การชำระเงินและสลิป', icon: ReceiptText, access: 'website' },
      { href: '/admin/deliveries', label: 'การส่งของ', icon: Truck, access: 'website' },
      { href: '/admin/promotions', label: 'โปรโมชั่น', icon: Tag, access: 'website' },
    ],
  },
  {
    label: 'แคตตาล็อก',
    items: [
      { href: '/admin/products', label: 'สินค้า', icon: Package, access: 'website' },
      { href: '/admin/categories', label: 'หมวดหมู่', icon: FolderTree, access: 'website' },
      { href: '/admin/content', label: 'เนื้อหา', icon: FileText, access: 'website' },
    ],
  },
  {
    label: 'ผู้เล่น',
    items: [
      { href: '/admin/users', label: 'ผู้ใช้', icon: Users, access: 'server' },
      { href: '/admin/market', label: 'ตลาด P2P', icon: ArrowLeftRight, access: 'website' },
      { href: '/admin/protection', label: 'การป้องกัน', icon: ShieldCheck, access: 'website' },
    ],
  },
  {
    label: 'ระบบ',
    items: [
      { href: '/admin/servers', label: 'เซิร์ฟเวอร์', icon: Server, access: 'root' },
      { href: '/admin/chat-ranks', label: 'แชทแรงก์', icon: MessagesSquare, access: 'root' },
      { href: '/admin/api-keys', label: 'คีย์ API', icon: KeyRound, access: 'server' },
      { href: '/admin/system/api-key', label: 'คีย์ระบบและปลั๊กอิน', icon: Plug, access: 'root' },
      { href: '/admin/settings', label: 'การตั้งค่า', icon: Settings, access: 'website' },
      { href: '/admin/audit', label: 'บันทึกการใช้งาน', icon: ScrollText, access: 'website' },
    ],
  },
];

export function canAccess(role: string | null | undefined, access: AdminAccess): boolean {
  switch (access) {
    case 'console':
      return role === 'admin' || role === 'server_admin' || role === 'root';
    case 'website':
      return role === 'admin' || role === 'root';
    case 'server':
      return role === 'server_admin' || role === 'root';
    case 'root':
      return role === 'root';
    default:
      return false;
  }
}

/** Navigation filtered to what `role` may open; empty groups are dropped. */
export function navForRole(role: string | null | undefined): AdminNavGroup[] {
  return ADMIN_NAV.map((group) => ({ ...group, items: group.items.filter((item) => canAccess(role, item.access)) })).filter(
    (group) => group.items.length > 0
  );
}

/** `/admin` matches exactly; every other entry also matches its sub-routes. */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin' || pathname === '/admin/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Extra breadcrumb labels for sub-route segments not in the nav. */
const SEGMENT_LABELS: Record<string, string> = {
  system: 'ระบบ',
  'api-key': 'คีย์ระบบและปลั๊กอิน',
  clusters: 'กลุ่มเซิร์ฟเวอร์',
  new: 'สร้างใหม่',
  edit: 'แก้ไข',
};

export interface AdminCrumb {
  label: string;
  href?: string;
}

/** Breadcrumbs for an admin path: คอนโซลผู้ดูแล › <section> › <detail>. */
export function adminBreadcrumbs(pathname: string): AdminCrumb[] {
  const crumbs: AdminCrumb[] = [{ label: 'คอนโซลผู้ดูแล', href: '/admin' }];
  const clean = pathname.replace(/\/+$/, '');
  if (clean === '/admin' || clean === '') {
    crumbs.push({ label: 'ภาพรวม' });
    return crumbs;
  }
  const allItems = ADMIN_NAV.flatMap((g) => g.items).filter((i) => i.href !== '/admin');
  // Longest matching nav entry wins (so /admin/system/api-key beats /admin/system).
  const match = allItems
    .filter((i) => clean === i.href || clean.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  if (match) {
    const rest = clean.slice(match.href.length).split('/').filter(Boolean);
    crumbs.push({ label: match.label, href: rest.length ? match.href : undefined });
    rest.forEach((segment, i) => {
      const label = SEGMENT_LABELS[segment] ?? (/^[0-9a-f-]{6,}$/i.test(segment) || /^\d+$/.test(segment) ? `#${segment.slice(0, 8)}` : segment);
      crumbs.push({ label, href: i < rest.length - 1 ? `${match.href}/${rest.slice(0, i + 1).join('/')}` : undefined });
    });
    return crumbs;
  }

  const segments = clean.split('/').filter(Boolean).slice(1);
  segments.forEach((segment, i) => {
    crumbs.push({
      label: SEGMENT_LABELS[segment] ?? segment,
      href: i < segments.length - 1 ? `/admin/${segments.slice(0, i + 1).join('/')}` : undefined,
    });
  });
  return crumbs;
}

export const ROLE_LABEL: Record<string, string> = {
  root: 'ผู้ดูแลสูงสุด',
  admin: 'ผู้ดูแลเว็บไซต์',
  server_admin: 'ผู้ดูแลเซิร์ฟเวอร์',
};
