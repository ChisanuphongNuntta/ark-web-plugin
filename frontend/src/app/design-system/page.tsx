'use client';

import * as React from 'react';
import { Search, User, ShoppingBag, Send, HelpCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { PrismaticRiverGate } from '@/components/ui/PrismaticRiverGate';

export default function DesignSystemPage() {
  // Demo states for buttons/inputs
  const [btnLoading, setBtnLoading] = React.useState(false);
  const [btnSuccess, setBtnSuccess] = React.useState(false);
  const [btnError, setBtnError] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const [inputErr, setInputErr] = React.useState('');
  const [inputSuccess, setInputSuccess] = React.useState(false);

  const triggerLoading = () => {
    setBtnLoading(true);
    setBtnSuccess(false);
    setBtnError(false);
    setTimeout(() => {
      setBtnLoading(false);
      setBtnSuccess(true);
    }, 2000);
  };

  const triggerError = () => {
    setBtnLoading(true);
    setBtnSuccess(false);
    setBtnError(false);
    setTimeout(() => {
      setBtnLoading(false);
      setBtnError(true);
    }, 1500);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (val.length === 0) {
      setInputErr('กรุณากรอกข้อความ');
      setInputSuccess(false);
    } else if (val.length < 3) {
      setInputErr('ข้อความต้องยาวอย่างน้อย 3 ตัวอักษร');
      setInputSuccess(false);
    } else {
      setInputErr('');
      setInputSuccess(true);
    }
  };

  return (
    <div className="pb-24 bg-iris-ink text-iris-pearl min-h-screen">
      {/* Scroll-driven Hero Banner */}
      <PrismaticRiverGate />

      <div className="page-shell mt-16 space-y-20" id="visual-tokens">
        {/* SECTION 1: Brand Design Tokens */}
        <section aria-labelledby="colors-title">
          <div className="border-b border-white/10 pb-4 mb-8">
            <span className="eyebrow">Design Tokens</span>
            <h2 id="colors-title" className="display-title text-3xl mt-1 uppercase">จานสีและธีมทัศนศิลป์ (Color Palette & Theme)</h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 rounded-2xl bg-[#05070D] border border-white/10 flex flex-col justify-between h-36">
              <span className="font-mono text-xs text-white/50">#05070D</span>
              <div>
                <p className="font-bold text-sm">Obsidian Navy</p>
                <p className="text-xs text-iris-muted">สีพื้นหลัก / ราตรีนิล</p>
              </div>
            </div>
            
            <div className="p-4 rounded-2xl bg-[#071A24] border border-white/10 flex flex-col justify-between h-36">
              <span className="font-mono text-xs text-white/50">#071A24</span>
              <div>
                <p className="font-bold text-sm">Deep River</p>
                <p className="text-xs text-iris-muted">แผ่นน้ำลึก / ชลธารคราม</p>
              </div>
            </div>
            
            <div className="p-4 rounded-2xl bg-[#37E5D2] text-[#05070D] border border-white/10 flex flex-col justify-between h-36">
              <span className="font-mono text-xs text-[#05070D]/60">#37E5D2</span>
              <div>
                <p className="font-bold text-sm">Iris Cyan</p>
                <p className="text-xs text-[#05070D]/75">แสงสีฟ้าปริซึม / นิลบลู</p>
              </div>
            </div>
            
            <div className="p-4 rounded-2xl bg-[#A77BFF] text-white border border-white/10 flex flex-col justify-between h-36">
              <span className="font-mono text-xs text-white/60">#A77BFF</span>
              <div>
                <p className="font-bold text-sm">Royal Orchid</p>
                <p className="text-xs text-white/75">ม่วงกลีบกล้วยไม้หลวง</p>
              </div>
            </div>
            
            <div className="p-4 rounded-2xl bg-[#DDBB72] text-[#05070D] border border-white/10 flex flex-col justify-between h-36">
              <span className="font-mono text-xs text-[#05070D]/60">#DDBB72</span>
              <div>
                <p className="font-bold text-sm">Champagne Gold</p>
                <p className="text-xs text-[#05070D]/75">ทองนพคุณหรูหรา / สุวรรณรัตน์</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: Typography & Gradients */}
        <section aria-labelledby="typography-title">
          <div className="border-b border-white/10 pb-4 mb-8">
            <span className="eyebrow">Typography & Gradients</span>
            <h2 id="typography-title" className="display-title text-3xl mt-1 uppercase">การจัดวางตัวอักษรและสีไล่ระดับ</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <GlassCard className="p-8 space-y-6" variant="default">
              <h3 className="font-display text-xs font-bold text-iris-cyan tracking-[0.2em] uppercase">Fonts & Scale</h3>
              
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-iris-muted mb-1">Display Text (Noto Serif Thai - หัวข้อใหญ่)</p>
                  <p className="font-display text-4xl font-semibold text-iris-pearl leading-[1.1]">สยามปิรามิดเรืองรอง</p>
                </div>
                <div>
                  <p className="text-xs text-iris-muted mb-1">Body Text (Noto Sans Thai - เนื้อหาอ่านง่าย)</p>
                  <p className="font-sans text-base text-iris-pearl/80 leading-relaxed">
                    ระบบการค้า e-commerce ยุคใหม่สำหรับชุมชนผู้เล่นเกมสัญชาติไทย ออกแบบมาเพื่อให้แสดงผลได้อย่างลื่นไหล รวดเร็ว และผ่านการเข้าถึงตามหลักมาตรฐานสากล
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-8 space-y-6" variant="default">
              <h3 className="font-display text-xs font-bold text-iris-gold tracking-[0.2em] uppercase">Signature Gradients</h3>
              
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-iris-muted mb-1">Primary Gradient (.text-gradient-primary)</p>
                  <p className="text-3xl font-extrabold text-gradient-primary">
                    IRIS CYAN → ROYAL ORCHID
                  </p>
                </div>
                <div>
                  <p className="text-xs text-iris-muted mb-1">Luxury Gold Gradient (.text-gradient-gold)</p>
                  <p className="text-3xl font-extrabold text-gradient-gold">
                    CHAMPAGNE GOLD → AMBER GLOW
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        </section>

        {/* SECTION 3: Buttons Interactive States */}
        <section aria-labelledby="buttons-title">
          <div className="border-b border-white/10 pb-4 mb-8">
            <span className="eyebrow">Component System</span>
            <h2 id="buttons-title" className="display-title text-3xl mt-1 uppercase">ปุ่มและการตอบสนองสถานะ (Interactive Buttons)</h2>
          </div>

          <GlassCard className="p-8 space-y-8" variant="prism">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase text-iris-muted">ตัวนำการทดสอบ</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="cyan" onClick={triggerLoading}>
                    จำลองโหลด → สำเร็จ
                  </Button>
                  <Button size="sm" variant="gold" onClick={triggerError}>
                    จำลองโหลด → ล้มเหลว
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-sm font-bold text-iris-pearl uppercase tracking-wider">Variants & States Preview</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Column 1: Primary & Cyan */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-iris-muted font-mono">Primary (default / loading / success / error)</span>
                    <Button variant="primary" isLoading={btnLoading} isSuccess={btnSuccess} isError={btnError} successText="ทำรายการเสร็จสิ้น!" errorText="ล้มเหลว กรุณาลองใหม่">
                      ชำระเงินทันที
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-iris-muted font-mono">Cyan (default / disabled)</span>
                    <Button variant="cyan">
                      ส่งสินค้าเข้าเซิร์ฟเวอร์
                    </Button>
                    <Button variant="cyan" disabled>
                      ปิดรับระบบชั่วคราว
                    </Button>
                  </div>
                </div>

                {/* Column 2: Gold & Orchid */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-iris-muted font-mono">Gold Luxury Accent</span>
                    <Button variant="gold" rightIcon={<ArrowRight className="h-4 w-4" />}>
                      ซื้อเหรียญ VIP
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-iris-muted font-mono">Orchid Royal Accent</span>
                    <Button variant="orchid">
                      เปิดกล่องปริศนา
                    </Button>
                  </div>
                </div>

                {/* Column 3: Secondary & Ghost */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-iris-muted font-mono">Secondary Outline</span>
                    <Button variant="secondary">
                      กลับสู่หน้าหลัก
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-iris-muted font-mono">Ghost</span>
                    <Button variant="ghost">
                      ยกเลิกคำสั่งซื้อ
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </section>

        {/* SECTION 4: Badges & Tags */}
        <section aria-labelledby="badges-title">
          <div className="border-b border-white/10 pb-4 mb-8">
            <span className="eyebrow">Component System</span>
            <h2 id="badges-title" className="display-title text-3xl mt-1 uppercase">ป้ายกำกับและสถานะ (Badges & Tags)</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <GlassCard className="p-8 space-y-6" variant="default">
              <h3 className="text-sm font-bold text-iris-cyan uppercase tracking-wider">Solid Badges</h3>
              <div className="flex flex-wrap gap-2.5">
                <Badge variant="default">Default</Badge>
                <Badge variant="cyan">Creature</Badge>
                <Badge variant="orchid">VIP Pack</Badge>
                <Badge variant="gold">Rare Item</Badge>
                <Badge variant="hot">Hot Deal</Badge>
                <Badge variant="success">Paid</Badge>
                <Badge variant="error">Failed</Badge>
                <Badge variant="warning">Pending</Badge>
                <Badge variant="info">Info</Badge>
              </div>
            </GlassCard>

            <GlassCard className="p-8 space-y-6" variant="default">
              <h3 className="text-sm font-bold text-iris-gold uppercase tracking-wider">Outline Badges</h3>
              <div className="flex flex-wrap gap-2.5">
                <Badge variant="default" outline>Default</Badge>
                <Badge variant="cyan" outline>Creature</Badge>
                <Badge variant="orchid" outline>VIP Pack</Badge>
                <Badge variant="gold" outline>Rare Item</Badge>
                <Badge variant="success" outline>Delivered</Badge>
                <Badge variant="error" outline>Cancelled</Badge>
                <Badge variant="warning" outline>Refunding</Badge>
              </div>
            </GlassCard>
          </div>
        </section>

        {/* SECTION 5: Inputs & Select Forms */}
        <section aria-labelledby="forms-title">
          <div className="border-b border-white/10 pb-4 mb-8">
            <span className="eyebrow">Component System</span>
            <h2 id="forms-title" className="display-title text-3xl mt-1 uppercase">แบบฟอร์มและการรับค่า (Inputs & Selects)</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* TextInput Showcase */}
            <GlassCard className="p-8 space-y-6" variant="default">
              <h3 className="text-sm font-bold text-iris-pearl uppercase tracking-wider">Text Inputs</h3>
              
              <div className="space-y-4">
                <Input
                  label="ชื่อผู้ใช้ Steam / Discord"
                  placeholder="กรอกชื่อเพื่อเชื่อมต่อไอดี..."
                  helperText="ชื่อนี้จะถูกนำไปใช้สืบค้นตัวละครในเซิร์ฟเวอร์ ARK"
                  value={inputValue}
                  onChange={handleInputChange}
                  error={inputErr}
                  success={inputSuccess}
                  successText="ผ่านเกณฑ์การตรวจสอบแล้ว"
                />

                <Input
                  label="ค้นหาสินค้าในร้านค้า"
                  placeholder="ค้นหาไดโนเสาร์, ปืน, ไอเท็ม..."
                  leftIcon={<Search className="h-4 w-4" />}
                />

                <Input
                  label="สิทธิผู้ใช้งาน (Disabled)"
                  value="ไม่อนุญาตให้แก้ไขข้อมูลระดับบัญชี"
                  disabled
                />
              </div>
            </GlassCard>

            {/* Dropdown Select Showcase */}
            <GlassCard className="p-8 space-y-6" variant="default">
              <h3 className="text-sm font-bold text-iris-pearl uppercase tracking-wider">Select Dropdowns</h3>
              
              <div className="space-y-4">
                <Select
                  label="เลือกเซิร์ฟเวอร์เป้าหมาย"
                  helperText="เพื่อระบุตำแหน่งส่งของเข้าตัวละครของคุณ"
                >
                  <option value="pve-main">IRIS PVE Main Server (Ragnarok)</option>
                  <option value="pve-ext">IRIS PVE Cluster (Extinction)</option>
                  <option value="pvp-island">IRIS PVP Season 3 (The Island)</option>
                </Select>

                <Select
                  label="วิธีการชำระเงิน"
                  success
                  successText="ระบบความปลอดภัยเกตเวย์พร้อมใช้"
                >
                  <option value="promptpay">สแกน QR PromptPay (แนะนำ)</option>
                  <option value="truemoney">ทรูมันนี่วอลเล็ท (TrueMoney)</option>
                  <option value="iris-coin">ชำระด้วยเหรียญ IRIS Coin (Ledger)</option>
                </Select>

                <Select
                  label="หมวดสินค้าที่กำลังเลือกซื้อ"
                  error="หมวดสินค้านี้อยู่ระหว่างปิดปรับปรุงชั่วคราว"
                >
                  <option value="creatures">Creatures (ไดโนเสาร์)</option>
                  <option value="items">Items (ไอเท็มทั่วไป)</option>
                </Select>
              </div>
            </GlassCard>
          </div>
        </section>

        {/* SECTION 6: High Fidelity States (Skeleton, Empty, Error) */}
        <section aria-labelledby="states-title">
          <div className="border-b border-white/10 pb-4 mb-8">
            <span className="eyebrow">Enterprise UX States</span>
            <h2 id="states-title" className="display-title text-3xl mt-1 uppercase">สถานะจำลองการดาวน์โหลดและข้อผิดพลาด (UX States)</h2>
          </div>

          <div className="space-y-8">
            {/* Skeletal loading states */}
            <div>
              <h3 className="text-sm font-bold text-iris-cyan uppercase tracking-wider mb-4">Skeletal loading placeholders</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Dino Card Skeleton */}
                <GlassCard className="p-6 space-y-4" variant="flat">
                  <Skeleton variant="card" className="h-32" />
                  <Skeleton variant="glow" className="w-2/3 h-5" />
                  <div className="space-y-2">
                    <Skeleton className="w-full h-3" />
                    <Skeleton className="w-5/6 h-3" />
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <Skeleton className="w-16 h-4" />
                    <Skeleton className="w-24 h-8 rounded-full" />
                  </div>
                </GlassCard>

                {/* Profile Card Skeleton */}
                <GlassCard className="p-6 flex items-center gap-4" variant="default">
                  <Skeleton variant="circle" className="h-16 w-16 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="w-1/2 h-4" />
                    <Skeleton className="w-3/4 h-3" />
                  </div>
                </GlassCard>

                {/* Text Block Skeleton */}
                <GlassCard className="p-6 space-y-3" variant="default">
                  <Skeleton className="w-1/4 h-4" />
                  <Skeleton className="w-full h-3" />
                  <Skeleton className="w-full h-3" />
                  <Skeleton className="w-full h-3" />
                  <Skeleton className="w-5/6 h-3" />
                </GlassCard>
              </div>
            </div>

            {/* Empty, Error, and Message screens */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h3 className="text-sm font-bold text-iris-gold uppercase tracking-wider mb-4">Empty Dashboard State</h3>
                <EmptyState
                  title="ไม่มีรายการประวัติคำสั่งซื้อ"
                  description="คุณยังไม่ได้ซื้อสินค้าใดๆ ใน OFFICIAL STORE ประวัติทั้งหมดหลังจากชำระเงินสำเร็จจะแสดงขึ้นที่นี่"
                  actionText="ไปช้อปปิ้งกันเลย"
                  onAction={() => alert('นำทางไปยัง Official Store')}
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-rose-400 uppercase tracking-wider mb-4">Error alert and retry action</h3>
                <ErrorMessage
                  title="ระบบเชื่อมต่อกับ Steam API ขัดข้อง"
                  message="เกิดความผิดพลาดในการแลกเปลี่ยนข้อมูลโปรไฟล์ตัวละคร ไม่สามารถอ่านสถานะตัวละครในเซิร์ฟเวอร์ได้ชั่วคราว กรุณาตรวจสอบอินเทอร์เน็ตหรือรอกล่องเซิร์ฟเวอร์เปิดใหม่อีกครั้ง"
                  errorCode="ERR_STEAM_API_TIMEOUT"
                  onRetry={() => alert('กำลังพยายามดาวน์โหลดข้อมูลโปรไฟล์ใหม่อีกครั้ง...')}
                />

                <ErrorMessage
                  title="ชำระเงินไม่ผ่าน"
                  message="ไม่พบข้อมูลยอดธุรกรรมที่ตรงกับรหัสอ้างอิง PromptPay QR นี้ หรือเซสชันหมดอายุแล้ว"
                  errorCode="ERR_TRANSACTION_EXPIRED"
                />
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 7: Accessibility & Keyboard Navigation Guidance */}
        <section aria-labelledby="accessibility-title">
          <div className="border-b border-white/10 pb-4 mb-8">
            <span className="eyebrow">Accessibility / A11y</span>
            <h2 id="accessibility-title" className="display-title text-3xl mt-1 uppercase">ความเข้าถึงและการรับรองมาตรฐาน (A11y & Responsiveness)</h2>
          </div>

          <GlassCard className="p-8 space-y-6" variant="default" hasGrid>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-iris-cyan">การปฏิบัติตามข้อกำหนด WCAG 2.2 AA</h3>
                <ul className="space-y-2 text-sm text-iris-pearl/80 list-disc pl-5">
                  <li>
                    <strong className="text-white">Keyboard Navigation:</strong> สามารถกดปุ่ม <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">Tab</kbd> เพื่อสลับไปยังแบบฟอร์ม ปุ่ม และฟิลด์ต่างๆ ได้อย่างสมบูรณ์
                  </li>
                  <li>
                    <strong className="text-white">Visible Focus:</strong> ทุกองค์ประกอบมีเส้นขอบไฮไลต์ชัดเจนเมื่อโฟกัส เพื่อรองรับผู้ใช้ที่ไม่ใช้เมาส์
                  </li>
                  <li>
                    <strong className="text-white">Skip Links:</strong> มีลิงก์ข้ามเนื้อหา (<span className="underline">ข้ามไปยังเนื้อหาหลัก</span>) ซ่อนอยู่ที่หัวหน้า และจะปรากฏขึ้นทันทีเมื่อกด Tab เป็นปุ่มแรก
                  </li>
                  <li>
                    <strong className="text-white">ARIA labels:</strong> ทุกปุ่มโหลดมีสถานะ <code className="font-mono text-xs bg-black/40 text-iris-cyan px-1 rounded">aria-busy</code> แจ้งเตือนโปรแกรมอ่านหน้าจอ (Screen Reader)
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-iris-gold">การตอบสนองต่อทุกขนาดหน้าจอ (Responsive Breakpoints)</h3>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2 border border-white/5 bg-black/30 rounded">
                    <p className="font-bold text-iris-cyan">Mobile (360px+)</p>
                    <p className="text-iris-muted">เรียงแบบ Column เดี่ยว</p>
                  </div>
                  <div className="p-2 border border-white/5 bg-black/30 rounded">
                    <p className="font-bold text-iris-cyan">Tablet (768px+)</p>
                    <p className="text-iris-muted">ปรับเป็น Grid 2 คอลัมน์</p>
                  </div>
                  <div className="p-2 border border-white/5 bg-black/30 rounded">
                    <p className="font-bold text-iris-cyan">Desktop (1024px+)</p>
                    <p className="text-iris-muted">ขนาดฟอนต์อ่านใหญ่หรูหรา</p>
                  </div>
                  <div className="p-2 border border-white/5 bg-black/30 rounded">
                    <p className="font-bold text-iris-cyan">Ultrawide (1600px+)</p>
                    <p className="text-iris-muted">จำกัดขอบกว้างแบบหน้ากากแก้ว</p>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </section>
      </div>
    </div>
  );
}
