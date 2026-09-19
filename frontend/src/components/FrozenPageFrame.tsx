'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Snowflake } from 'lucide-react';

const titles: Record<string,string> = {
  shop:'ร้านค้า',market:'ตลาดผู้เล่น',cart:'ตะกร้าสินค้า',topup:'เติมเหรียญ',orders:'คำสั่งซื้อ',profile:'บัญชีของฉัน',event:'กิจกรรม',promotion:'โปรโมชั่น',packs:'แพ็กเกจ',ranking:'อันดับผู้เล่น',support:'ศูนย์ช่วยเหลือ',login:'เข้าสู่ระบบ',privacy:'ความเป็นส่วนตัว',terms:'ข้อกำหนดบริการ',admin:'จัดการร้านค้า','design-system':'รูปแบบเว็บไซต์',auth:'เชื่อมบัญชี',p:'บทความ',
  'my-listings':'รายการขายของฉัน','my-purchases':'รายการซื้อของฉัน',data:'ข้อมูลส่วนบุคคล',products:'สินค้า',categories:'หมวดหมู่',users:'ผู้ใช้',servers:'เซิร์ฟเวอร์',content:'เนื้อหา','chat-ranks':'ยศในแชท',protection:'ความคุ้มครอง','api-keys':'การเชื่อมต่อ',system:'ระบบ','api-key':'API Key','callback':'เข้าสู่ระบบ','link-steam':'เชื่อม Steam',
};
const adminLinks=[['/admin','ภาพรวม'],['/admin/products','สินค้า'],['/admin/categories','หมวดหมู่'],['/admin/users','ผู้ใช้'],['/admin/servers','เซิร์ฟเวอร์'],['/admin/content','เนื้อหา'],['/admin/chat-ranks','ยศแชท'],['/admin/protection','ความคุ้มครอง'],['/admin/api-keys','API Keys'],['/admin/system/api-key','ระบบ']];
const accountLinks=[['/profile','บัญชีของฉัน'],['/topup','เติมเหรียญ'],['/orders','คำสั่งซื้อ'],['/profile/data','ข้อมูลส่วนบุคคล']];
const marketLinks=[['/market','ตลาดทั้งหมด'],['/market/my-listings','รายการขายของฉัน'],['/market/my-purchases','รายการซื้อของฉัน']];
export function FrozenPageFrame({children}:{children:React.ReactNode}) {
  const pathname=usePathname();const parts=pathname.split('/').filter(Boolean);const section=parts[0] || 'home';
  const links=section==='admin'?adminLinks:['profile','orders'].includes(section)?accountLinks:section==='market'?marketLinks:[];
  return <div className={`frozen-page frozen-page-${section}`} data-page={section}>
    {section!=='home' && section!=='topup' && <div className="page-shell frozen-wayfinding"><nav aria-label="เส้นทางหน้าปัจจุบัน" className="flex items-center gap-2 min-w-0 flex-wrap"><Link href="/" className="hover:text-white">IRIS</Link>{parts.map((part,i)=><span key={i} className="inline-flex items-center gap-2"><ChevronRight size={12}/>{i===parts.length-1?<span aria-current="page">{titles[part] || 'รายละเอียด'}</span>:<Link href={'/'+parts.slice(0,i+1).join('/')}>{titles[part] || 'รายละเอียด'}</Link>}</span>)}</nav><span className="hidden sm:inline-flex items-center gap-2 tracking-widest text-[10px]"><Snowflake size={12}/> FROZEN EXPEDITION</span></div>}
    {links.length>0 && <nav className="page-shell frozen-section-nav" aria-label="เมนูในส่วนนี้">{links.map(([href,label])=><Link key={href} href={href} aria-current={pathname===href?'page':undefined}>{label}</Link>)}</nav>}
    {children}
  </div>;
}
