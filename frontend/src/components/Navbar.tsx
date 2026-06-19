'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  ChevronDown,
  CircleUserRound,
  Coins,
  LogOut,
  Menu,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { authApi } from '@/lib/api';
import { useAuthStore, useCartStore } from '@/lib/store';

const primaryLinks = [
  { href: '/shop', label: 'ร้านค้า', caption: 'Official Store' },
  { href: '/market', label: 'ตลาดผู้เล่น', caption: 'Player Market' },
  { href: '/event', label: 'กิจกรรม', caption: 'Events' },
  { href: '/promotion', label: 'โปรโมชั่น', caption: 'Privileges' },
];

const exploreLinks = [
  { href: '/ranking', label: 'อันดับผู้เล่น', caption: 'Leaderboards' },
  { href: '/packs', label: 'แพ็กเกจพิเศษ', caption: 'Curated bundles' },
  { href: '/support', label: 'ศูนย์ช่วยเหลือ', caption: 'Support & FAQ' },
];

function IrisMark() {
  return (
    <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-[0.9rem] border border-iris-gold/35 bg-iris-river shadow-[0_0_30px_rgba(55,229,210,.16)]" aria-hidden="true">
      <span className="absolute inset-1 rotate-45 rounded-[0.45rem] border border-iris-cyan/40" />
      <span className="h-4 w-2 rotate-45 rounded-full bg-gradient-to-b from-iris-pearl via-iris-cyan to-iris-orchid shadow-[0_0_18px_rgba(55,229,210,.8)]" />
    </span>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const cartCount = useCartStore((state) => state.items.reduce((total, item) => total + item.quantity, 0));
  const setDrawerOpen = useCartStore((state) => state.setDrawerOpen);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const accountRef = useRef<HTMLDivElement>(null);
  const exploreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setExploreOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!accountRef.current?.contains(target)) setAccountOpen(false);
      if (!exploreRef.current?.contains(target)) setExploreOpen(false);
    };
    document.addEventListener('pointerdown', closeMenus);
    return () => document.removeEventListener('pointerdown', closeMenus);
  }, []);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    router.push(`/shop?search=${encodeURIComponent(value)}`);
    setSearchOpen(false);
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      logout();
      router.push('/');
      router.refresh();
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-iris-ink/88 backdrop-blur-2xl">
      <div className="border-b border-white/[0.06] bg-gradient-to-r from-iris-river/80 via-iris-midnight to-iris-river/80">
        <div className="page-shell flex min-h-8 items-center justify-between gap-4 text-[0.67rem] font-semibold tracking-[0.12em] text-white/55">
          <span className="flex items-center gap-2 uppercase"><Sparkles className="h-3 w-3 text-iris-gold" /> IRIS connected world</span>
          <span className="hidden text-right sm:block">บัญชีเดียว · กระเป๋าเดียว · ส่งตรงเข้าเกม</span>
        </div>
      </div>

      <nav className="page-shell" aria-label="เมนูหลัก">
        <div className="flex h-[4.6rem] items-center gap-3 lg:gap-6">
          <Link href="/" className="group flex shrink-0 items-center gap-3" aria-label="IRIS Thailand หน้าหลัก">
            <IrisMark />
            <span className="hidden leading-none sm:block">
              <span className="block font-display text-lg font-semibold tracking-[0.08em] text-iris-pearl">IRIS</span>
              <span className="mt-1 block text-[0.58rem] font-bold uppercase tracking-[0.24em] text-iris-gold/75">Thailand</span>
            </span>
          </Link>

          <div className="hidden items-stretch gap-1 lg:flex">
            {primaryLinks.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link key={link.href} href={link.href} className={`group relative rounded-xl px-3.5 py-2 text-sm font-semibold transition ${active ? 'bg-white/[0.065] text-white' : 'text-white/65 hover:bg-white/[0.04] hover:text-white'}`}>
                  {link.label}
                  <span className="block text-[0.55rem] font-medium uppercase tracking-[0.16em] text-white/30 group-hover:text-iris-cyan/70">{link.caption}</span>
                  {active ? <span className="absolute inset-x-4 -bottom-[0.9rem] h-px bg-gradient-to-r from-transparent via-iris-cyan to-transparent" /> : null}
                </Link>
              );
            })}

            <div ref={exploreRef} className="relative">
              <button type="button" onClick={() => setExploreOpen((open) => !open)} className="flex h-full items-center gap-1 rounded-xl px-3.5 py-2 text-sm font-semibold text-white/65 transition hover:bg-white/[0.04] hover:text-white" aria-expanded={exploreOpen} aria-haspopup="menu">
                สำรวจ <ChevronDown className={`h-3.5 w-3.5 transition ${exploreOpen ? 'rotate-180' : ''}`} />
              </button>
              {exploreOpen ? (
                <div className="absolute left-0 top-[calc(100%+1rem)] w-72 rounded-3xl border border-white/10 bg-[#08131c]/95 p-2 shadow-2xl backdrop-blur-2xl" role="menu">
                  {exploreLinks.map((link) => (
                    <Link key={link.href} href={link.href} role="menuitem" className="block rounded-2xl px-4 py-3 transition hover:bg-white/[0.055]">
                      <span className="block text-sm font-semibold text-white">{link.label}</span>
                      <span className="text-xs text-white/40">{link.caption}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <form onSubmit={handleSearch} className={`${searchOpen ? 'flex' : 'hidden'} absolute inset-x-4 top-[calc(100%+.6rem)] rounded-2xl border border-white/10 bg-[#08131c]/98 p-2 shadow-2xl lg:static lg:flex lg:w-56 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`} role="search">
              <label htmlFor="global-search" className="sr-only">ค้นหาสินค้าและข้อมูล IRIS</label>
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input id="global-search" value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-full border border-white/10 bg-white/[0.035] pl-9 pr-4 text-sm text-white placeholder:text-white/35 focus:border-iris-cyan/45 focus:outline-none" placeholder="ค้นหาใน IRIS" />
              </div>
            </form>
            <button type="button" onClick={() => setSearchOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-full text-white/65 transition hover:bg-white/[0.06] hover:text-white lg:hidden" aria-label="เปิดการค้นหา" aria-expanded={searchOpen}><Search className="h-[1.1rem] w-[1.1rem]" /></button>

            {user ? (
              <>
                <Link href="/topup" className="hidden min-h-10 items-center gap-2 rounded-full border border-iris-gold/20 bg-iris-gold/[0.06] px-3.5 text-sm font-bold text-iris-gold transition hover:bg-iris-gold/10 sm:flex" aria-label={`กระเป๋า ${user.pointsBalance.toLocaleString()} Iris Coin`}>
                  <Coins className="h-4 w-4" /> {user.pointsBalance.toLocaleString()} <span className="text-[0.6rem] tracking-wider">IC</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="relative grid h-10 w-10 place-items-center rounded-full text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                  aria-label={`ตะกร้า ${cartCount} รายการ`}
                >
                  <ShoppingBag className="h-[1.1rem] w-[1.1rem]" />
                  {cartCount > 0 ? <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-iris-cyan px-1 text-[0.58rem] font-black text-iris-ink">{cartCount > 99 ? '99+' : cartCount}</span> : null}
                </button>
                <button type="button" className="hidden h-10 w-10 place-items-center rounded-full text-white/60 transition hover:bg-white/[0.06] hover:text-white sm:grid" aria-label="การแจ้งเตือน"><Bell className="h-[1.1rem] w-[1.1rem]" /></button>
                <div ref={accountRef} className="relative">
                  <button type="button" onClick={() => setAccountOpen((open) => !open)} className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-2.5 text-white/75 transition hover:border-white/20 hover:text-white" aria-expanded={accountOpen} aria-haspopup="menu">
                    <CircleUserRound className="h-5 w-5 text-iris-cyan" /><span className="hidden max-w-24 truncate text-xs font-semibold sm:block">{user.discordUsername || 'บัญชีของฉัน'}</span>
                  </button>
                  {accountOpen ? (
                    <div className="absolute right-0 top-[calc(100%+1rem)] w-64 rounded-3xl border border-white/10 bg-[#08131c]/95 p-2 shadow-2xl backdrop-blur-2xl" role="menu">
                      <div className="border-b border-white/[0.07] px-3 py-3"><p className="text-xs text-white/40">IRIS ID</p><p className="truncate text-sm font-semibold text-white">{user.discordUsername || user.discordId}</p></div>
                      <Link href="/profile" role="menuitem" className="mt-2 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-white/70 hover:bg-white/[0.05] hover:text-white"><CircleUserRound className="h-4 w-4" /> ศูนย์บัญชี</Link>
                      {user.role && user.role !== 'user' ? <Link href="/admin" role="menuitem" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-white/70 hover:bg-white/[0.05] hover:text-white"><Settings className="h-4 w-4" /> Admin Portal</Link> : null}
                      <button type="button" onClick={handleLogout} role="menuitem" className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-red-300 hover:bg-red-400/10"><LogOut className="h-4 w-4" /> ออกจากระบบ</button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/discord`} className="btn-primary h-10 min-h-10 px-4 text-xs">เข้าสู่ระบบ</a>
            )}

            <button type="button" onClick={() => setMobileOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-full text-white/70 transition hover:bg-white/[0.06] hover:text-white lg:hidden" aria-label={mobileOpen ? 'ปิดเมนู' : 'เปิดเมนู'} aria-expanded={mobileOpen}>{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="border-t border-white/[0.07] py-4 lg:hidden">
            <div className="grid gap-1 sm:grid-cols-2">
              {[...primaryLinks, ...exploreLinks].map((link) => {
                const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
                return <Link key={link.href} href={link.href} className={`rounded-2xl px-4 py-3 ${active ? 'bg-iris-cyan/10 text-iris-cyan' : 'text-white/70 hover:bg-white/[0.05] hover:text-white'}`}><span className="block text-sm font-semibold">{link.label}</span><span className="text-[0.65rem] text-white/35">{link.caption}</span></Link>;
              })}
            </div>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
