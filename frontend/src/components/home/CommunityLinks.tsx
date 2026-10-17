import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

const DISCORD_URL = 'https://discord.gg/iris-thailand';

const LINKS = [
  {
    label: 'Discord ของ IRIS Thailand',
    description: 'ประกาศ อัปเดตเซิร์ฟเวอร์ และช่องแจ้งปัญหากับทีมงาน',
    href: DISCORD_URL,
    external: true,
  },
  {
    label: 'กิจกรรม',
    description: 'กิจกรรมในเกมและประกาศจากทีมงาน พร้อมวันเวลาและเงื่อนไข',
    href: '/event',
    external: false,
  },
  {
    label: 'อันดับผู้เล่น',
    description: 'ตารางอันดับตามเวลาเล่น การฝึกสัตว์ และชนเผ่า',
    href: '/ranking',
    external: false,
  },
  {
    label: 'ศูนย์ช่วยเหลือ',
    description: 'คำถามที่พบบ่อยและวิธีแจ้งปัญหาให้ทีมงานตรวจสอบเร็วที่สุด',
    href: '/support',
    external: false,
  },
] as const;

/** Quiet list of community destinations (hairline rows, no icon tiles). */
export function CommunityLinks() {
  return (
    <section aria-labelledby="community-title" className="page-shell">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="eyebrow">ชุมชน</p>
          <h2 id="community-title" className="mt-2 text-2xl font-semibold tracking-[-0.015em] text-fg">
            เล่นด้วยกัน คุยกันได้ตลอด
          </h2>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {LINKS.map((link) => {
            const body = (
              <>
                <span className="min-w-0">
                  <span className="block text-base font-medium text-fg transition-colors duration-fast group-hover:text-accent">
                    {link.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-fg-muted">{link.description}</span>
                </span>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-fg-subtle transition-colors duration-fast group-hover:text-accent"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </>
            );
            const className = 'group flex items-center justify-between gap-6 py-4';
            return (
              <li key={link.href}>
                {link.external ? (
                  <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
                    {body}
                    <span className="sr-only">(เปิดในแท็บใหม่)</span>
                  </a>
                ) : (
                  <Link href={link.href} className={className}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default CommunityLinks;
