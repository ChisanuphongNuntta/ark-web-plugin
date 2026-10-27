'use client';
import { T, useLanguage } from '@/components/i18n/LanguageProvider';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  CircleUserRound,
  Crown,
  LogOut,
  Menu,
  Minus,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Ticket,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { authApi } from '@/lib/api';
import { useAuthStore, useCartStore } from '@/lib/store';
import { VipAvatar } from '@/components/vip/VipAvatar';
import { useVipBadges } from '@/hooks/useVipBadges';
import { TekLights } from '@/components/tek/TekLights';
import { IrisCoin } from '@/components/ui/IrisCoin';

const primaryLinks = [
  { href: '/shop', label: 'ร้านค้า', caption: 'Official Store' },
  { href: '/market', label: 'ตลาดผู้เล่น', caption: 'Player Market' },
  { href: '/servers', label: 'เซิร์ฟเวอร์', caption: 'Servers' },
  { href: '/event', label: 'กิจกรรม', caption: 'Events & Calendar' },
  { href: '/pass', label: 'ไอริสพาส', caption: 'Iris Pass & Quests' },
];

const exploreLinks = [
  { href: '/rewards', label: 'รับของรายวัน', caption: 'Daily Login Claim' },
  { href: '/ranking', label: 'อันดับผู้เล่น', caption: 'Leaderboards' },
  { href: '/promotion', label: 'โปรโมชั่น', caption: 'Privileges' },
  { href: '/packs', label: 'แพ็กเกจพิเศษ', caption: 'Curated Bundles' },
  { href: '/vip', label: 'สมาชิก VIP', caption: 'VIP Membership' },
  { href: '/perks', label: 'สิทธิ์พิเศษในเกม', caption: 'Perks & Tokens' },
  { href: '/orders', label: 'ประวัติคำสั่งซื้อ', caption: 'Order Tracking' },
  { href: '/support', label: 'ศูนย์ช่วยเหลือ', caption: 'Support & FAQ' },
];

export function Navbar() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading: isAuthLoading, logout } = useAuthStore();
  const cartCount = useCartStore((state) => state.items.reduce((total, item) => total + item.quantity, 0));
  const setDrawerOpen = useCartStore((state) => state.setDrawerOpen);
  // VIP frame: from /auth/me (store), else the public badge lookup (backend may not embed it in /me).
  const fetchedBadges = useVipBadges([user?.vip === undefined ? user?.id : null]);
  const vipBadge = user ? (user.vip ?? fetchedBadges.get(user.id) ?? null) : null;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [query, setQuery] = useState('');

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

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    router.push(`/shop?search=${encodeURIComponent(value)}`);
    setSearchOpen(false);
    setMobileOpen(false);
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

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="tk-top">
      <nav className="tk-wrap" aria-label="เมนูหลัก">
        <div className="tk-top-in">
          <Link href="/" className="tk-brand" aria-label="IRIS Thailand หน้าแรก">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/brand/iris-emblem-v1.webp" alt="" width={40} height={40} />
            <span>
              <b>IRIS</b>
              <small>TEK NETWORK</small>
            </span>
          </Link>

          <div className="tk-nav site-menu">
            <Link href="/" className={pathname === '/' ? 'active' : undefined} aria-current={pathname === '/' ? 'page' : undefined}>
              {t('หน้าแรก', 'Home')}
            </Link>
            {primaryLinks.map((link) => (
              <Link key={link.href} href={link.href} className={isActive(link.href) ? 'active' : undefined} aria-current={isActive(link.href) ? 'page' : undefined}>
                {t(link.label, link.caption)}
              </Link>
            ))}
            <div ref={exploreRef} style={{ position: 'relative' }}>
              <button type="button" onClick={() => setExploreOpen((open) => !open)} aria-expanded={exploreOpen} aria-haspopup="menu" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <T text="สำรวจ" />
                {exploreOpen ? <Minus size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
              </button>
              {exploreOpen && (
                <div className="tk-menu" role="menu" style={{ left: 0 }}>
                  {exploreLinks.map((link) => (
                    <Link key={link.href} href={link.href} role="menuitem" onClick={() => setExploreOpen(false)}>
                      {t(link.label, link.caption)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="tk-hud">
            <form onSubmit={handleSearch} role="search" className="tk-search" style={searchOpen ? { display: 'flex', position: 'absolute', left: 16, right: 16, top: 'calc(100% + 10px)', width: 'auto', zIndex: 100, background: '#07101a' } : undefined}>
              <label htmlFor="global-search" className="tk-sr"><T text="ค้นหาสินค้าและข้อมูลใน IRIS" /></label>
              <Search size={15} aria-hidden="true" />
              <input id="global-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหาใน IRIS', 'Search IRIS')} />
            </form>
            <button type="button" className="tk-ib" style={{ display: 'none' }} data-mobile-search onClick={() => setSearchOpen((open) => !open)} aria-label="เปิดการค้นหา" aria-expanded={searchOpen}>
              <Search size={17} aria-hidden="true" />
            </button>
            <LanguageSwitcher />

            {isAuthLoading ? (
              <span role="status" aria-label="กำลังตรวจสอบสถานะบัญชี" className="tk-wallet" style={{ minWidth: 96 }}>
                <span className="tk-dot" aria-hidden="true" />
              </span>
            ) : user ? (
              <>
                <Link href="/topup" className="tk-wallet" aria-label={`กระเป๋า ${user.pointsBalance.toLocaleString()} Iris Coin`}>
                  <IrisCoin size={26} /><span className="tk-sr">IC</span>
                  <span className="tk-mono">{user.pointsBalance.toLocaleString()}</span>
                </Link>
                <button type="button" className="tk-ib" onClick={() => setDrawerOpen(true)} aria-label={`ตะกร้า ${cartCount} รายการ`}>
                  <ShoppingCart size={17} aria-hidden="true" />
                  {cartCount > 0 ? <span className="cnt">{cartCount > 99 ? '99+' : cartCount}</span> : null}
                </button>
                <div ref={notificationRef} style={{ position: 'relative' }} className="tk-bell">
                  <button type="button" className="tk-ib" onClick={() => setNotificationOpen((open) => !open)} aria-label="การแจ้งเตือน" aria-expanded={notificationOpen}>
                    <Bell size={17} aria-hidden="true" />
                  </button>
                  {notificationOpen && (
                    <div className="tk-menu" role="region" aria-label="กล่องข้อความแจ้งเตือน" style={{ right: 0, minWidth: 300 }}>
                      <div className="head"><small><T text="การแจ้งเตือน" /></small></div>
                      <div style={{ padding: '22px 14px', textAlign: 'center' }}>
                        <p style={{ margin: 0, fontWeight: 700, color: 'rgb(var(--ink))' }}><T text="ไม่มีการแจ้งเตือนใหม่" /></p>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--tk-muted)' }}><T text="ข้อความและอัปเดตระบบจะแสดงที่นี่" /></p>
                      </div>
                    </div>
                  )}
                </div>
                <div ref={accountRef} style={{ position: 'relative' }}>
                  <button type="button" className="tk-av" onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen} aria-haspopup="menu" aria-label={user.discordUsername || t('บัญชีของฉัน', 'My account')}>
                    {user.discordAvatar || vipBadge ? (
                      <VipAvatar size={28} src={user.discordAvatar} name={user.discordUsername} vip={vipBadge} showLabel={false} fallback={<CircleUserRound size={18} aria-hidden="true" />} />
                    ) : (
                      <CircleUserRound size={20} aria-hidden="true" />
                    )}
                  </button>
                  {accountOpen && (
                    <div className="tk-menu" role="menu" style={{ right: 0 }}>
                      <div className="head">
                        <small>IRIS ID</small>
                        <b style={{ display: 'block', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.discordUsername || user.discordId}</b>
                        {vipBadge && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12, fontWeight: 600, color: 'var(--tk-gold)' }}>
                            <Crown size={14} aria-hidden="true" /><T text="สมาชิก" /> {vipBadge.label}
                          </span>
                        )}
                      </div>
                      <Link href="/profile" role="menuitem" onClick={() => setAccountOpen(false)}><CircleUserRound size={16} aria-hidden="true" /><T text="ศูนย์บัญชี" /></Link>
                      <Link href="/orders" role="menuitem" onClick={() => setAccountOpen(false)}><ShoppingBag size={16} aria-hidden="true" /><T text="ประวัติคำสั่งซื้อ" /></Link>
                      <Link href="/vip" role="menuitem" onClick={() => setAccountOpen(false)}><Crown size={16} aria-hidden="true" /><T text={vipBadge ? 'สถานะ VIP' : 'สมัคร VIP'} /></Link>
                      <Link href="/perks" role="menuitem" onClick={() => setAccountOpen(false)}><Ticket size={16} aria-hidden="true" /><T text="สิทธิ์พิเศษและ Token" /></Link>
                      {user.role && user.role !== 'user' ? (
                        <Link href="/admin" role="menuitem" onClick={() => setAccountOpen(false)} style={{ color: 'var(--tk-gold)' }}><Settings size={16} aria-hidden="true" />Admin Portal</Link>
                      ) : null}
                      <button type="button" role="menuitem" onClick={handleLogout} style={{ color: 'rgb(var(--acc-300))' }}><LogOut size={16} aria-hidden="true" /><T text="ออกจากระบบ" /></button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <a href={`${process.env.NEXT_PUBLIC_API_URL || '/api'}/auth/discord`} className="tk-btn sm"><T text="เข้าสู่ระบบ" /></a>
            )}

            <button type="button" className="tk-ib tk-burger" onClick={() => setMobileOpen((open) => !open)} aria-label={t(mobileOpen ? 'ปิดเมนู' : 'เปิดเมนู')} aria-expanded={mobileOpen}>
              {mobileOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="tk-drawer">
            {user ? (
              <Link href="/topup" onClick={() => setMobileOpen(false)}>
                <span><T text="กระเป๋า IC" /></span>
                <span className="tk-mono inline-flex items-center gap-1">{user.pointsBalance.toLocaleString()}<IrisCoin size={20} /><span className="tk-sr">IC</span></span>
              </Link>
            ) : null}
            <Link href="/" className={pathname === '/' ? 'active' : undefined} onClick={() => setMobileOpen(false)}>{t('หน้าแรก', 'Home')}</Link>
            {primaryLinks.map((link) => (
              <Link key={link.href} href={link.href} className={isActive(link.href) ? 'active' : undefined} aria-current={isActive(link.href) ? 'page' : undefined} onClick={() => setMobileOpen(false)}>
                {t(link.label, link.caption)}
              </Link>
            ))}
            <button type="button" aria-expanded={exploreOpen} onClick={() => setExploreOpen((open) => !open)}>
              <T text="สำรวจ" />{exploreOpen ? <Minus size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            </button>
            {exploreOpen && (
              <div style={{ marginLeft: 16, borderLeft: '1px solid var(--tk-line)' }} aria-label={t('สำรวจ', 'Explore')}>
                {exploreLinks.map((link) => <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>{t(link.label, link.caption)}</Link>)}
              </div>
            )}
          </div>
        )}
      </nav>
      <TekLights />
    </header>
  );
}
