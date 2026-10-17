'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Snowflake, ArrowUpRight } from 'lucide-react';

const links = [
  ['/shop', 'ร้านค้าทางการ'], ['/market', 'ตลาดผู้เล่น'], ['/packs', 'แพ็กเกจ'],
  ['/event', 'กิจกรรม'], ['/promotion', 'โปรโมชั่น'], ['/topup', 'กระเป๋าและเติมเงิน'],
  ['/orders', 'ติดตามคำสั่งซื้อ'], ['/support', 'ศูนย์ช่วยเหลือ'],
];
export function PalworldSidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-full p-4">
      <Snowflake className="text-iris-cyan mb-4" size={30} />
      <h2 className="font-display text-2xl">IRIS Thailand</h2>
      <p className="text-xs text-iris-muted mt-1 mb-8 tracking-widest">FROZEN EXPEDITION</p>
      <nav aria-label="เมนูร้านค้า ARK IRIS" className="space-y-2">
        {links.map(([href,label]) => <Link key={href} href={href} aria-current={pathname===href ? 'page' : undefined} className={`flex items-center justify-between min-h-11 rounded-lg px-3 text-sm ${pathname===href ? 'bg-iris-cyan/15 text-iris-cyan' : 'text-iris-pearl hover:bg-white/5'}`}>{label}<ArrowUpRight size={14} /></Link>)}
      </nav>
    </aside>
  );
}
