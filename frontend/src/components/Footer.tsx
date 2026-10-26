'use client';
import { T } from '@/components/i18n/LanguageProvider';


import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag, User, HelpCircle, Gamepad2 } from 'lucide-react';

const footerGroups = [
  {
    title: 'ซื้อขาย',
    subtitle: 'Commerce',
    icon: ShoppingBag,
    links: [
      { href: '/shop', label: 'ร้านค้าทางการ', sub: 'Official Store' },
      { href: '/market', label: 'ตลาดผู้เล่น', sub: 'Player Market' },
      { href: '/packs', label: 'แพ็กเกจพิเศษ', sub: 'Bundles' },
      { href: '/promotion', label: 'โปรโมชั่น', sub: 'Promotions' },
    ],
  },
  {
    title: 'ระบบเกมและกิจกรรม',
    subtitle: 'Features',
    icon: Gamepad2,
    links: [
      { href: '/servers', label: 'เซิร์ฟเวอร์', sub: 'Server Directory' },
      { href: '/event', label: 'กิจกรรมและปฏิทิน', sub: 'Event Calendar' },
      { href: '/pass', label: 'เควส & Iris Pass', sub: 'Missions & Pass' },
      { href: '/rewards', label: 'รับของรายวัน', sub: 'Daily Rewards' },
    ],
  },
  {
    title: 'ผู้เล่น',
    subtitle: 'Player ID',
    icon: User,
    links: [
      { href: '/profile', label: 'โปรไฟล์ IRIS', sub: 'Account Profile' },
      { href: '/orders', label: 'คำสั่งซื้อของฉัน', sub: 'Order History' },
      { href: '/topup', label: 'กระเป๋าและเติมเงิน', sub: 'Wallet & Topup' },
      { href: '/ranking', label: 'อันดับผู้เล่น', sub: 'Leaderboards' },
    ],
  },
  {
    title: 'ช่วยเหลือ',
    subtitle: 'Support',
    icon: HelpCircle,
    links: [
      { href: '/support', label: 'ศูนย์ช่วยเหลือ', sub: 'Help Center' },
      { href: '/privacy', label: 'นโยบายความเป็นส่วนตัว', sub: 'Privacy Policy' },
      { href: '/terms', label: 'ข้อกำหนดการให้บริการ', sub: 'Terms of Service' },
      { href: '/profile/data', label: 'จัดการข้อมูลส่วนบุคคล', sub: 'PDPA Management' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="tk-footer">
      <div className="tk-wrap">
        <div className="tk-footer-grid">
          <div>
            <Link href="/" aria-label="IRIS Thailand หน้าแรก" className="tk-brand">
              <Image src="/images/brand/iris-emblem-v1.webp" width={40} height={40} alt="" />
              <span><b>IRIS</b><small>TEK NETWORK</small></span>
            </Link>
            <p className="tk-muted" style={{ maxWidth: 340, marginTop: 16, fontSize: 14 }}>
              <T text={"ชุมชน ARK ของคนไทย ร้านค้า ตลาดผู้เล่น กระเป๋า IRIS Coin และการส่งของเข้าเกมที่ตรวจสอบย้อนหลังได้ทุกขั้นตอน"} />
            </p>
          </div>
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h4><T text={group.title} /></h4>
              {group.links.map((link) => (
                <Link key={link.href} href={link.href}><T text={link.label} /></Link>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="tk-legal">
        <div className="tk-wrap">
          <p style={{ margin: 0 }}>
            © {new Date().getFullYear()} IRIS Thailand · <T text={"ภาพสัตว์และไอเทม:"} />{' '}
            <a style={{ display: 'inline', padding: 0, textDecoration: 'underline' }} href="https://ark.wiki.gg/" target="_blank" rel="noreferrer">ark.wiki.gg</a>{' '}
            (CC BY-NC-SA) · ARK © Studio Wildcard · IRIS Thailand <T text={"ไม่ได้เป็นส่วนหนึ่งของ Studio Wildcard"} />
            <br /><T text="เพลง ARK IRIS Happy Xmas Remix · เพลงบรรเลงต้นฉบับโดย IRIS Thailand" en="ARK IRIS Happy Xmas Remix · Original instrumental by IRIS Thailand" />
          </p>
        </div>
      </div>
    </footer>
  );
}
