import Link from 'next/link';
import { ArrowUpRight, ShieldCheck, Sparkles } from 'lucide-react';

const footerGroups = [
  { title: 'ซื้อขาย', links: [{ href: '/shop', label: 'ร้านค้าทางการ' }, { href: '/market', label: 'ตลาดผู้เล่น' }, { href: '/promotion', label: 'โปรโมชั่น' }, { href: '/packs', label: 'แพ็กเกจ' }] },
  { title: 'ผู้เล่น', links: [{ href: '/profile', label: 'IRIS ID' }, { href: '/orders', label: 'คำสั่งซื้อ' }, { href: '/topup', label: 'กระเป๋าและเติมเงิน' }, { href: '/ranking', label: 'อันดับผู้เล่น' }] },
  { title: 'ช่วยเหลือ', links: [{ href: '/support', label: 'ศูนย์ช่วยเหลือ' }, { href: '/privacy', label: 'ความเป็นส่วนตัว' }, { href: '/terms', label: 'ข้อกำหนดบริการ' }, { href: '/profile/data', label: 'จัดการข้อมูลส่วนบุคคล' }] },
];

export function Footer() {
  return (
    <footer className="relative mt-24 overflow-hidden border-t border-white/10 bg-[#04080d]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_top,rgba(55,229,210,.1),transparent_65%)]" />
      <div className="page-shell relative py-12 lg:py-16">
        <div className="grid gap-12 border-b border-white/[0.08] pb-12 lg:grid-cols-[1.3fr_2fr]">
          <div className="max-w-md">
            <div className="flex items-center gap-2 text-iris-gold"><Sparkles className="h-4 w-4" /><span className="eyebrow text-iris-gold">IRIS connected world</span></div>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight text-iris-pearl">โลกของผู้เล่น เชื่อมถึงกันโดยไม่สะดุด</h2>
            <p className="mt-4 text-sm leading-7 text-white/48">ร้านค้า ตลาดผู้เล่น กระเป๋า และการส่งของเข้าเกม อยู่ภายใต้ IRIS ID เดียวกัน</p>
            <Link href="/support" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-iris-cyan hover:text-white">ติดต่อศูนย์ช่วยเหลือ <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {footerGroups.map((group) => (
              <div key={group.title}>
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white/36">{group.title}</h3>
                <ul className="mt-4 space-y-3">
                  {group.links.map((link) => <li key={link.href}><Link href={link.href} className="text-sm text-white/62 transition hover:text-iris-cyan">{link.label}</Link></li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 pt-6 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} IRIS Thailand · HeartShop Ecosystem</p>
          <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-iris-cyan" /> ธุรกรรมสำคัญตรวจสอบสิทธิ์และบันทึกประวัติ</p>
        </div>
      </div>
    </footer>
  );
}
