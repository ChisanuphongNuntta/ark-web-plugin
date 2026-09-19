'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, ShieldCheck, Sparkles, ShoppingBag, User, HelpCircle } from 'lucide-react';

const footerGroups = [
  {
    title: 'ซื้อขาย',
    icon: ShoppingBag,
    links: [
      { href: '/shop', label: 'ร้านค้าทางการ' },
      { href: '/market', label: 'ตลาดผู้เล่น' },
      { href: '/promotion', label: 'โปรโมชั่น' },
      { href: '/packs', label: 'แพ็กเกจ' },
    ],
  },
  {
    title: 'ผู้เล่น',
    icon: User,
    links: [
      { href: '/profile', label: 'IRIS ID' },
      { href: '/orders', label: 'คำสั่งซื้อ' },
      { href: '/topup', label: 'กระเป๋าและเติมเงิน' },
      { href: '/ranking', label: 'อันดับผู้เล่น' },
    ],
  },
  {
    title: 'ช่วยเหลือ',
    icon: HelpCircle,
    links: [
      { href: '/support', label: 'ศูนย์ช่วยเหลือ' },
      { href: '/privacy', label: 'ความเป็นส่วนตัว' },
      { href: '/terms', label: 'ข้อกำหนดบริการ' },
      { href: '/profile/data', label: 'จัดการข้อมูลส่วนบุคคล' },
    ],
  },
];

export function Footer() {
  const pathname = usePathname();

  // On the dedicated single-screen top-up page, suppress marketing footer to ensure zero scrolling
  if (pathname === '/topup') {
    return null;
  }

  return (
    <footer className="relative mt-20 overflow-hidden border-t border-cyan-500/20 bg-gradient-to-b from-[#081523] via-[#050e18] to-[#02070c] text-slate-300">
      {/* Aurora Ambient Frost Glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.14),transparent_70%)]" />
      
      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-12 pb-14">
        <div className="grid gap-10 border-b border-white/10 pb-12 lg:grid-cols-12 items-start">
          
          {/* Brand & Mission Column (6 cols) */}
          <div className="space-y-4 lg:col-span-6 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-950/60 px-3 py-1 text-xs font-semibold text-cyan-300 shadow-[0_0_12px_rgba(56,189,248,0.2)]">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>IRIS · Frozen Expedition</span>
            </div>

            <h2 className="font-serif text-2xl sm:text-3xl font-bold leading-snug text-white">
              โลกของผู้เล่น เชื่อมถึงกันโดยไม่สะดุด
            </h2>

            <p className="text-sm leading-relaxed text-slate-400 max-w-lg">
              ร้านค้า ตลาดผู้เล่น กระเป๋าเงิน การส่งของเข้าเกม และ Support อยู่ภายใต้ IRIS ID เดียวกัน
              ดูแลทุกขั้นตอนตั้งแต่เลือกซื้อจนถึงรับของในเกม
            </p>

            <div className="pt-2">
              <Link
                href="/support"
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-950/50 hover:bg-cyan-900/60 px-4 py-2.5 text-xs font-bold text-cyan-300 hover:text-cyan-200 transition-all shadow-[0_0_15px_rgba(56,189,248,0.15)]"
              >
                <span>ติดต่อศูนย์ช่วยเหลือ</span>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Navigation Links Columns (6 cols) */}
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:col-span-6">
            {footerGroups.map((group) => {
              const Icon = group.icon;
              return (
                <div key={group.title} className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-200/90 border-b border-white/5 pb-2 flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-cyan-400" />
                    <span>{group.title}</span>
                  </h3>
                  <ul className="space-y-2">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className="text-xs sm:text-sm text-slate-400 hover:text-cyan-300 transition-colors duration-150 inline-block py-0.5 hover:translate-x-0.5 transform"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Bar: Copyright & Security SLA */}
        <div className="flex flex-col gap-4 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-slate-300 font-medium">
              © {new Date().getFullYear()} IRIS Thailand · HeartShop Ecosystem. All rights reserved.
            </p>
            <p className="text-[11px] text-slate-500">
              ภาพ ARK: Studio Wildcard ·{' '}
              <a
                className="underline underline-offset-4 hover:text-cyan-300 transition-colors"
                href="https://ark.wiki.gg/"
                target="_blank"
                rel="noreferrer"
              >
                ARK Official Community Wiki
              </a>{' '}
              · คลังภาพ IRIS
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1.5 text-[11px] text-emerald-400 font-medium shadow-sm">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>ธุรกรรมสำคัญตรวจสอบสิทธิ์และบันทึกประวัติทุกขั้นตอน</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
