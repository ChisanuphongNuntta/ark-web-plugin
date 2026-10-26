'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleUserRound, Gift, Home, MessageCircle, Store } from 'lucide-react';
import { useAuthStore } from '@/lib/store';

/** Phone-only bottom navigation (hidden above 820px by CSS). */
export function TekTabBar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
  const items = [
    { href: '/', label: 'หน้าแรก', Icon: Home, on: pathname === '/' },
    { href: '/shop', label: 'ร้านค้า', Icon: Store, on: pathname.startsWith('/shop') },
    { href: '/event', label: 'กิจกรรม', Icon: Gift, on: pathname.startsWith('/event') || pathname.startsWith('/pass') },
    { href: '/market', label: 'ตลาด', Icon: MessageCircle, on: pathname.startsWith('/market') },
  ];
  return (
    <nav className="tk-tabbar" aria-label="เมนูด่วน">
      {items.map(({ href, label, Icon, on }) => (
        <Link key={href} href={href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>
          <Icon aria-hidden="true" />{label}
        </Link>
      ))}
      {user ? (
        <Link href="/profile" className={pathname.startsWith('/profile') ? 'on' : undefined}><CircleUserRound aria-hidden="true" />บัญชี</Link>
      ) : (
        <a href={`${apiBase}/auth/discord`}><CircleUserRound aria-hidden="true" />เข้าสู่ระบบ</a>
      )}
    </nav>
  );
}
