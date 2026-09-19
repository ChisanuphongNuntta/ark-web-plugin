'use client';

import Link from 'next/link';
import Image from 'next/image';
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
import { FormEvent, MouseEvent, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  { href: '/packs', label: 'แพ็กเกจพิเศษ', caption: 'Curated Bundles' },
  { href: '/orders', label: 'ประวัติคำสั่งซื้อ', caption: 'Order Tracking' },
  { href: '/support', label: 'ศูนย์ช่วยเหลือ', caption: 'Support & FAQ' },
];

function IrisMark() {
  return (
    <span
      className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-950/90 via-[#07152b] to-[#0d0722] shadow-[0_0_20px_rgba(75,228,255,0.35)] transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_0_30px_rgba(75,228,255,0.65)] group-hover:border-cyan-300"
      aria-hidden="true"
    >
      <Image
        src="/images/brand/ark_iris_frozen_logo.jpg"
        alt="ARK IRIS Frozen Logo"
        width={44}
        height={44}
        className="h-full w-full object-cover"
        priority
      />
      <span className="absolute inset-0 rounded-2xl border border-white/20 pointer-events-none" />
      <span className="absolute inset-0 bg-gradient-to-t from-cyan-500/20 via-transparent to-transparent pointer-events-none" />
    </span>
  );
}

interface MagicBurst {
  id: number;
  x: number;
  y: number;
  size: number;
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
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [magicBursts, setMagicBursts] = useState<MagicBurst[]>([]);

  const accountRef = useRef<HTMLDivElement>(null);
  const exploreRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setExploreOpen(false);
    setAccountOpen(false);
    setSearchOpen(false);
    setNotificationOpen(false);
  }, [pathname]);

  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!accountRef.current?.contains(target)) setAccountOpen(false);
      if (!exploreRef.current?.contains(target)) setExploreOpen(false);
      if (!notificationRef.current?.contains(target)) setNotificationOpen(false);
    };
    document.addEventListener('pointerdown', closeMenus);
    return () => document.removeEventListener('pointerdown', closeMenus);
  }, []);

  const triggerMagic = (e: MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now() + Math.random();
    const size = Math.max(rect.width, rect.height) * 1.8;

    setMagicBursts((prev) => [...prev.slice(-4), { id, x, y, size }]);
    setTimeout(() => {
      setMagicBursts((prev) => prev.filter((b) => b.id !== id));
    }, 700);
  };

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
    <header className="sticky top-0 z-50 border-b border-cyan-400/20 bg-[#06111d]/90 backdrop-blur-2xl shadow-[0_10px_35px_rgba(0,0,0,0.5)] transition-all duration-300">
      {/* Bottom ambient aurora light beam */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

      <nav className="page-shell relative" aria-label="เมนูหลัก">
        <div className="flex min-h-[4.25rem] items-center gap-3 lg:gap-6 py-2">
          {/* Brand Logo & Title */}
          <Link
            href="/"
            onClick={triggerMagic}
            className="group relative flex shrink-0 items-center gap-3"
            aria-label="IRIS Thailand หน้าแรก"
          >
            <IrisMark />
            <span className="hidden leading-none sm:block">
              <span className="block font-display text-xl font-black tracking-[0.06em] bg-gradient-to-r from-white via-cyan-100 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(75,228,255,0.45)]">
                IRIS Thailand
              </span>
              <span className="mt-1 block text-[0.58rem] font-bold uppercase tracking-[0.24em] text-cyan-300/80">
                WINTER EXPEDITION
              </span>
            </span>
          </Link>

          {/* Center Modern Floating Pill Dock (Magical Theme) */}
          <div className="hidden items-center gap-1.5 rounded-full p-1.5 magic-nav-dock lg:flex">
            {primaryLinks.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={triggerMagic}
                  className={`group relative overflow-hidden flex flex-col items-center justify-center rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-300 ${
                    active ? 'text-white font-extrabold' : 'text-slate-300/85 hover:text-white'
                  }`}
                >
                  {/* Floating active pill with aurora crystal glow */}
                  {active && (
                    <motion.div
                      layoutId="magic-nav-pill"
                      className="absolute inset-0 rounded-full magic-active-pill"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}

                  {/* Sparkle and Label */}
                  <span className="relative z-10 flex items-center gap-1">
                    {active && <Sparkles className="h-3 w-3 text-cyan-300 animate-pulse" />}
                    {link.label}
                  </span>
                  <span className={`relative z-10 text-[0.56rem] font-medium tracking-wider uppercase transition-colors ${
                    active ? 'text-cyan-200' : 'text-slate-400/70 group-hover:text-cyan-300/80'
                  }`}>
                    {link.caption}
                  </span>

                  {/* Magic click ripple */}
                  {magicBursts.map((b) => (
                    <motion.span
                      key={b.id}
                      initial={{ scale: 0, opacity: 0.9 }}
                      animate={{ scale: 2.2, opacity: 0 }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      style={{ left: b.x, top: b.y, width: b.size, height: b.size }}
                      className="magic-ripple-ring pointer-events-none -translate-x-1/2 -translate-y-1/2"
                    />
                  ))}
                </Link>
              );
            })}

            {/* Explore Dropdown */}
            <div ref={exploreRef} className="relative">
              <button
                type="button"
                onClick={(e) => {
                  triggerMagic(e);
                  setExploreOpen((open) => !open);
                }}
                className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-all duration-300 ${
                  exploreOpen ? 'bg-cyan-500/15 text-white' : 'text-slate-300/85 hover:text-white hover:bg-white/[0.05]'
                }`}
                aria-expanded={exploreOpen}
                aria-haspopup="menu"
              >
                <span>สำรวจ</span>
                <ChevronDown className={`h-3 w-3 text-cyan-300 transition-transform duration-300 ${exploreOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {exploreOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 12, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="absolute left-0 top-[calc(100%+0.75rem)] z-[100] isolate w-72 overflow-hidden rounded-3xl border border-cyan-400/30 bg-[#071322]/95 p-2 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_30px_rgba(75,228,255,0.18)] ring-1 ring-white/10"
                    role="menu"
                  >
                    <div className="border-b border-white/[0.08] px-3.5 py-2 mb-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400/80 flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-cyan-300" /> บริการและระบบสำรวจ
                      </p>
                    </div>
                    {exploreLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={(e) => {
                          triggerMagic(e);
                          setExploreOpen(false);
                        }}
                        role="menuitem"
                        className="group flex items-center justify-between rounded-2xl px-3.5 py-2.5 transition hover:bg-cyan-500/15 text-slate-200 hover:text-white"
                      >
                        <div>
                          <span className="block text-xs font-bold text-white group-hover:text-cyan-200 transition-colors">
                            {link.label}
                          </span>
                          <span className="text-[10px] text-slate-400/80 group-hover:text-slate-300">
                            {link.caption}
                          </span>
                        </div>
                        <Sparkles className="h-3.5 w-3.5 text-cyan-300 opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right Action Cluster */}
          <div className="ml-auto flex items-center gap-2">
            {/* Search Capsule */}
            <form
              onSubmit={handleSearch}
              className={`${searchOpen ? 'flex' : 'hidden'} absolute inset-x-4 top-[calc(100%+.6rem)] z-[100] isolate rounded-full border border-cyan-400/30 bg-[#071322]/95 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] ring-1 ring-white/10 lg:static lg:flex lg:w-60 lg:border-cyan-500/20 lg:bg-black/30 lg:p-0 lg:shadow-none transition-all duration-300`}
              role="search"
            >
              <label htmlFor="global-search" className="sr-only">ค้นหาสินค้าและข้อมูลใน IRIS</label>
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-300/50" />
                <input
                  id="global-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-10 w-full rounded-full border border-white/10 bg-black/40 pl-9 pr-4 text-xs text-white placeholder:text-white/35 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/40 transition-all"
                  placeholder="ค้นหาใน IRIS..."
                />
              </div>
            </form>

            {/* Mobile Search Toggle */}
            <button
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
              className="grid h-10 w-10 place-items-center rounded-full text-white/70 transition hover:bg-white/[0.06] hover:text-white lg:hidden"
              aria-label="เปิดการค้นหา"
              aria-expanded={searchOpen}
            >
              <Search className="h-4 w-4 text-cyan-300" />
            </button>

            {/* User Session or Login Button */}
            {user ? (
              <>
                {/* Gold IC Wallet Pill */}
                <Link
                  href="/topup"
                  onClick={triggerMagic}
                  className="hidden min-h-10 items-center gap-2 rounded-full border border-amber-400/30 bg-gradient-to-r from-amber-400/10 to-yellow-500/5 px-4 text-xs font-bold text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.12)] transition hover:border-amber-400/50 hover:shadow-[0_0_22px_rgba(245,158,11,0.25)] hover:scale-[1.02] active:scale-[0.96] sm:flex"
                  aria-label={`กระเป๋า ${user.pointsBalance.toLocaleString()} Iris Coin`}
                >
                  <Coins className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                  <span>{user.pointsBalance.toLocaleString()}</span>
                  <span className="text-[0.6rem] tracking-wider text-amber-300/70">IC</span>
                </Link>

                {/* Cart Drawer Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    triggerMagic(e);
                    setDrawerOpen(true);
                  }}
                  className="relative grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/80 transition-all duration-300 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-white active:scale-95"
                  aria-label={`ตะกร้า ${cartCount} รายการ`}
                >
                  <ShoppingBag className="h-4 w-4 text-cyan-300" />
                  {cartCount > 0 ? (
                    <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-gradient-to-r from-cyan-400 to-sky-400 px-1 text-[0.55rem] font-black text-slate-950 shadow-[0_0_10px_rgba(56,189,248,0.8)]">
                      {cartCount > 99 ? '99+' : cartCount}
                    </span>
                  ) : null}
                </button>

                {/* Notification Bell */}
                <div ref={notificationRef} className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      triggerMagic(e);
                      setNotificationOpen((open) => !open)}
                    }
                    className="hidden h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition hover:border-cyan-400/30 hover:bg-white/[0.06] hover:text-white sm:grid"
                    aria-label="การแจ้งเตือน"
                    aria-expanded={notificationOpen}
                  >
                    <Bell className="h-4 w-4 text-slate-300" />
                  </button>

                  <AnimatePresence>
                    {notificationOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="absolute right-0 top-[calc(100%+0.75rem)] z-[100] isolate w-80 overflow-hidden rounded-3xl border border-cyan-400/30 bg-[#071322]/95 p-4 backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.95)] ring-1 ring-white/10"
                        role="region"
                        aria-label="กล่องข้อความแจ้งเตือน"
                      >
                        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-cyan-200">การแจ้งเตือน</span>
                          <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-400/20">0 รายการ</span>
                        </div>
                        <div className="py-6 text-center">
                          <Bell className="mx-auto h-8 w-8 text-cyan-300/30 mb-2 animate-bounce" />
                          <p className="text-xs font-semibold text-slate-200">ไม่มีการแจ้งเตือนใหม่</p>
                          <p className="mt-1 text-[11px] text-slate-400">ข้อความและอัปเดตระบบจะแสดงที่นี่</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Account Avatar Menu */}
                <div ref={accountRef} className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      triggerMagic(e);
                      setAccountOpen((open) => !open);
                    }}
                    className="flex h-10 items-center gap-2 rounded-full border border-cyan-400/30 bg-gradient-to-r from-cyan-950/40 to-[#071322] px-2.5 text-white/80 transition-all hover:border-cyan-400/60 hover:shadow-[0_0_15px_rgba(75,228,255,0.25)] hover:text-white"
                    aria-expanded={accountOpen}
                    aria-haspopup="menu"
                  >
                    <CircleUserRound className="h-5 w-5 text-cyan-300" />
                    <span className="hidden max-w-24 truncate text-xs font-semibold sm:block">
                      {user.discordUsername || 'บัญชีของฉัน'}
                    </span>
                  </button>

                  <AnimatePresence>
                    {accountOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="absolute right-0 top-[calc(100%+0.75rem)] z-[100] isolate w-64 overflow-hidden rounded-3xl border border-cyan-400/30 bg-[#071322]/95 p-2 backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.95)] ring-1 ring-white/10"
                        role="menu"
                      >
                        <div className="border-b border-white/[0.08] px-3.5 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400/70">IRIS ID</p>
                          <p className="truncate text-sm font-extrabold text-white">{user.discordUsername || user.discordId}</p>
                        </div>
                        <Link
                          href="/profile"
                          onClick={() => setAccountOpen(false)}
                          role="menuitem"
                          className="mt-1 flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-cyan-500/15 hover:text-white"
                        >
                          <CircleUserRound className="h-4 w-4 text-cyan-300" /> ศูนย์บัญชี
                        </Link>
                        <Link
                          href="/orders"
                          onClick={() => setAccountOpen(false)}
                          role="menuitem"
                          className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-cyan-500/15 hover:text-white"
                        >
                          <ShoppingBag className="h-4 w-4 text-cyan-300" /> ประวัติคำสั่งซื้อ
                        </Link>
                        {user.role && user.role !== 'user' ? (
                          <Link
                            href="/admin"
                            onClick={() => setAccountOpen(false)}
                            role="menuitem"
                            className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/15 hover:text-amber-200"
                          >
                            <Settings className="h-4 w-4 text-amber-400" /> Admin Portal
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          onClick={handleLogout}
                          role="menuitem"
                          className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-xs font-bold text-rose-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                        >
                          <LogOut className="h-4 w-4" /> ออกจากระบบ
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/discord`}
                className="btn-primary h-10 min-h-10 px-4 text-xs font-bold rounded-full shadow-[0_0_15px_rgba(160,224,244,0.3)] transition hover:scale-105 active:scale-95"
              >
                เข้าสู่ระบบ
              </a>
            )}

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/75 transition hover:bg-white/[0.08] hover:text-white lg:hidden"
              aria-label={mobileOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5 text-cyan-300" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="relative z-[100] border-t border-cyan-500/20 bg-[#071322]/95 px-4 py-4 shadow-2xl backdrop-blur-2xl lg:hidden overflow-hidden"
            >
              {user ? (
                <Link
                  href="/topup"
                  onClick={() => setMobileOpen(false)}
                  className="mb-3 flex items-center justify-between rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-amber-300 transition hover:bg-amber-400/15"
                >
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <Coins className="h-5 w-5 text-amber-400" /> เติมเงิน Iris Coin
                  </span>
                  <span className="text-xs font-black">{user.pointsBalance.toLocaleString()} IC</span>
                </Link>
              ) : (
                <Link
                  href="/topup"
                  onClick={() => setMobileOpen(false)}
                  className="mb-3 flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-300 transition hover:bg-amber-400/15"
                >
                  <Coins className="h-5 w-5 text-amber-400" /> เติมเงิน Iris Coin
                </Link>
              )}
              <div className="grid gap-1.5 sm:grid-cols-2">
                {[...primaryLinks, ...exploreLinks].map((link) => {
                  const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={`rounded-2xl px-4 py-3 transition ${
                        active
                          ? 'border border-cyan-400/40 bg-cyan-500/20 text-cyan-200'
                          : 'text-slate-200 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className="block text-sm font-extrabold">{link.label}</span>
                      <span className="text-[0.65rem] text-slate-400">{link.caption}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </header>
  );
}
