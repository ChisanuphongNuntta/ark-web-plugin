'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Package,
  Search,
  ShoppingBag,
  Store,
  Wallet,
  X,
} from 'lucide-react';
import { authApi } from '@/lib/api';
import { config } from '@/lib/config';
import { useAuthStore, useCartStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Drawer } from '@/components/ui/Drawer';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu';
import { formatAmount } from '@/components/ui/Amount';
import { useIsClient } from '@/components/ui/overlay';

interface NavLinkDef {
  href: string;
  label: string;
}

const PRIMARY: NavLinkDef[] = [
  { href: '/shop', label: 'ร้านค้า' },
  { href: '/market', label: 'ตลาดผู้เล่น' },
  { href: '/servers', label: 'เซิร์ฟเวอร์' },
  { href: '/event', label: 'กิจกรรม' },
  { href: '/promotion', label: 'โปรโมชั่น' },
];

const MORE: NavLinkDef[] = [
  { href: '/packs', label: 'แพ็กเกจ' },
  { href: '/ranking', label: 'อันดับผู้เล่น' },
  { href: '/topup', label: 'เติมเหรียญ' },
  { href: '/support', label: 'ศูนย์ช่วยเหลือ' },
];

const ACCOUNT: Array<NavLinkDef & { icon: React.ReactNode }> = [
  { href: '/profile', label: 'บัญชีของฉัน', icon: <CircleUserRound strokeWidth={1.5} /> },
  { href: '/orders', label: 'คำสั่งซื้อ', icon: <Package strokeWidth={1.5} /> },
  { href: '/topup', label: 'เติมเหรียญ', icon: <Wallet strokeWidth={1.5} /> },
  { href: '/market/my-listings', label: 'รายการขายของฉัน', icon: <Store strokeWidth={1.5} /> },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Wordmark() {
  return (
    <Link href="/" className="group flex shrink-0 items-baseline gap-2 py-2" aria-label="IRIS Thailand หน้าแรก">
      <span className="text-[17px] font-semibold tracking-[0.24em] text-fg">IRIS</span>
      <span className="hidden text-2xs font-medium tracking-[0.3em] text-fg-subtle transition-colors duration-fast group-hover:text-fg-muted sm:inline">
        THAILAND
      </span>
    </Link>
  );
}

function SearchForm({ id, onDone, className, autoFocus }: { id: string; onDone?: () => void; className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    router.push(`/shop?search=${encodeURIComponent(value)}`);
    onDone?.();
  };
  return (
    <form onSubmit={submit} role="search" className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        ค้นหาสินค้า
      </label>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" strokeWidth={1.5} aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ค้นหาสินค้า"
        className="h-9 w-full rounded-control border border-line bg-surface pl-8 pr-3 text-sm text-fg placeholder:text-fg-subtle transition-colors duration-fast hover:border-line-strong focus:border-accent focus:outline-none"
      />
    </form>
  );
}

export function Navbar() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const isClient = useIsClient();
  const storeUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const storeCartCount = useCartStore((s) => s.items.reduce((n, item) => n + item.quantity, 0));
  const setDrawerOpen = useCartStore((s) => s.setDrawerOpen);
  const { canSeeAdminConsole } = usePermissions();

  // Persisted stores hydrate on the client only; render the signed-out shell on the server.
  const user = isClient ? storeUser : null;
  const cartCount = isClient ? storeCartCount : 0;
  const showAdmin = isClient && canSeeAdminConsole;

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Close transient UI on navigation.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setMobileOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* session may already be gone */
    } finally {
      logout();
      router.push('/');
      router.refresh();
    }
  };

  const loginHref = `${config.apiUrl}/auth/discord`;
  const moreActive = MORE.some((l) => isActive(pathname, l.href));

  return (
    <header className="sticky top-0 z-header border-b border-line bg-canvas">
      <div className="page-shell flex h-16 items-center gap-4 lg:gap-8">
        <Wordmark />

        <nav aria-label="เมนูหลัก" className="hidden h-full items-center gap-5 lg:flex">
          {PRIMARY.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative inline-flex h-full items-center whitespace-nowrap text-sm transition-colors duration-fast',
                  active
                    ? 'text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-accent'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <Menu
            label="เมนูเพิ่มเติม"
            className="h-full"
            renderTrigger={(props, { open }) => (
              <button
                {...props}
                className={cn(
                  'relative inline-flex h-full items-center gap-1 whitespace-nowrap text-sm transition-colors duration-fast',
                  open || moreActive ? 'text-fg' : 'text-fg-muted hover:text-fg',
                  moreActive && 'after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-accent'
                )}
              >
                เพิ่มเติม
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-fast', open && 'rotate-180')} strokeWidth={1.5} aria-hidden="true" />
              </button>
            )}
          >
            {MORE.map((link) => (
              <MenuItem key={link.href} href={link.href} current={isActive(pathname, link.href)}>
                {link.label}
              </MenuItem>
            ))}
          </Menu>
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <SearchForm id="global-search" className="hidden w-56 xl:block" />
          <IconButton
            aria-label={searchOpen ? 'ปิดช่องค้นหา' : 'ค้นหาสินค้า'}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
            className="xl:hidden"
          >
            {searchOpen ? <X className="h-[18px] w-[18px]" strokeWidth={1.5} /> : <Search className="h-[18px] w-[18px]" strokeWidth={1.5} />}
          </IconButton>

          {user ? (
            <Link
              href="/topup"
              className="hidden h-9 items-center gap-1.5 rounded-control border border-line px-2.5 text-fg transition-colors duration-fast hover:border-line-strong sm:inline-flex"
              aria-label={`ยอดเหรียญ ${formatAmount(user.pointsBalance)} IC — เติมเหรียญ`}
            >
              <Wallet className="h-4 w-4 text-fg-subtle" strokeWidth={1.5} aria-hidden="true" />
              <span className="font-mono text-[13px] tabular-nums">{formatAmount(user.pointsBalance)}</span>
              <span className="text-2xs text-fg-subtle">IC</span>
            </Link>
          ) : null}

          <IconButton aria-label={`ตะกร้าสินค้า ${cartCount} ชิ้น`} onClick={() => setDrawerOpen(true)}>
            <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.5} />
            {cartCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[10px] font-medium leading-none text-on-accent"
              >
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            ) : null}
          </IconButton>

          {user ? (
            <Menu
              label="เมนูบัญชี"
              align="end"
              className="hidden lg:inline-flex"
              renderTrigger={(props) => (
                <button
                  {...props}
                  className="inline-flex h-9 items-center gap-2 rounded-control px-2 text-sm text-fg-muted transition-colors duration-fast hover:bg-surface-2 hover:text-fg"
                  aria-label="เมนูบัญชี"
                >
                  <CircleUserRound className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
                  <span className="hidden max-w-[120px] truncate xl:inline">{user.discordUsername || 'บัญชีของฉัน'}</span>
                  <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                </button>
              )}
            >
              <MenuLabel>
                <span className="block text-2xs tracking-[0.12em] text-fg-subtle">IRIS ID</span>
                <span className="block truncate text-sm text-fg">{user.discordUsername || user.discordId}</span>
              </MenuLabel>
              <MenuSeparator />
              {ACCOUNT.map((item) => (
                <MenuItem key={item.href} href={item.href} icon={item.icon} current={isActive(pathname, item.href)}>
                  {item.label}
                </MenuItem>
              ))}
              {showAdmin ? (
                <>
                  <MenuSeparator />
                  <MenuItem href="/admin" icon={<LayoutDashboard strokeWidth={1.5} />} current={isActive(pathname, '/admin')}>
                    คอนโซลผู้ดูแล
                  </MenuItem>
                </>
              ) : null}
              <MenuSeparator />
              <MenuItem onSelect={handleLogout} icon={<LogOut strokeWidth={1.5} />} tone="danger">
                ออกจากระบบ
              </MenuItem>
            </Menu>
          ) : (
            <a href={loginHref} className={buttonVariants({ size: 'sm', className: 'ml-1 hidden sm:inline-flex' })}>
              เข้าสู่ระบบ
            </a>
          )}

          <IconButton aria-label="เปิดเมนู" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="lg:hidden">
            <MenuIcon className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </IconButton>
        </div>
      </div>

      {searchOpen ? (
        <div className="border-t border-line xl:hidden">
          <div className="page-shell py-2.5">
            <SearchForm id="global-search-compact" autoFocus onDone={() => setSearchOpen(false)} />
          </div>
        </div>
      ) : null}

      <Drawer open={mobileOpen} onOpenChange={setMobileOpen} side="left" size="sm" aria-label="เมนูหลัก" title="เมนู">
        <nav aria-label="เมนูหลัก (มือถือ)" className="flex flex-col py-2">
          {user ? (
            <Link
              href="/topup"
              className="mx-4 mb-3 mt-2 flex items-center justify-between rounded-card border border-line px-4 py-3 transition-colors duration-fast hover:border-line-strong"
            >
              <span className="text-sm text-fg-muted">ยอดเหรียญ</span>
              <span className="inline-flex items-baseline gap-1">
                <span className="font-mono text-base text-fg">{formatAmount(user.pointsBalance)}</span>
                <span className="text-2xs text-fg-subtle">IC</span>
              </span>
            </Link>
          ) : (
            <a href={loginHref} className={buttonVariants({ className: 'mx-4 mb-3 mt-2' })}>
              เข้าสู่ระบบด้วย Discord
            </a>
          )}
          <DrawerSection title="เลือกซื้อ" links={[...PRIMARY, ...MORE]} pathname={pathname} />
          {user ? (
            <>
              <DrawerSection title="บัญชี" links={ACCOUNT} pathname={pathname} />
              {showAdmin ? <DrawerSection title="ผู้ดูแล" links={[{ href: '/admin', label: 'คอนโซลผู้ดูแล' }]} pathname={pathname} /> : null}
              <div className="mt-2 border-t border-line px-4 pt-3">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex h-10 w-full items-center gap-2 rounded-control px-2 text-sm text-danger transition-colors duration-fast hover:bg-surface-2"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  ออกจากระบบ
                </button>
              </div>
            </>
          ) : null}
        </nav>
      </Drawer>
    </header>
  );
}

function DrawerSection({ title, links, pathname }: { title: string; links: NavLinkDef[]; pathname: string }) {
  return (
    <div className="px-2 py-2">
      <p className="px-3 pb-1 pt-2 text-xs text-fg-subtle">{title}</p>
      <ul>
        {links.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-10 items-center rounded-control px-3 text-sm transition-colors duration-fast',
                  active
                    ? 'bg-surface-2 text-fg before:absolute before:inset-y-2 before:left-0 before:w-px before:bg-accent'
                    : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default Navbar;
