'use client';

import { FormEvent, useMemo, useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  FileText,
  HelpCircle,
  LockKeyhole,
  MessageSquare,
  PackageCheck,
  Search,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  Zap,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';

type TicketCategory = 'recharge' | 'delivery' | 'account' | 'server' | 'market' | 'pdpa';
type SubmitResult = { type: 'success' | 'error'; text: string } | null;

const metrics = [
  { label: 'เวลาตอบกลับเฉลี่ย', value: '< 15 นาที', icon: Clock3 },
  { label: 'ตรวจสอบรายการอัตโนมัติ', value: '24/7', icon: ShieldCheck },
  { label: 'ช่องทางช่วยเหลือ', value: 'Web + Discord', icon: MessageSquare },
];

const lanes = [
  {
    title: 'Wallet และ Auto Top-up',
    description: 'ตรวจสลิป PromptPay, ยอด IC ไม่เข้า, ledger ผิดปกติ และรายการเติมเงินที่รอดำเนินการ',
    icon: CreditCard,
    tone: 'text-iris-gold',
  },
  {
    title: 'Delivery เข้าเกม',
    description: 'ติดตามคำสั่งซื้อ, Plugin Queue, claim item, retry delivery และปัญหาตัวละครออฟไลน์',
    icon: PackageCheck,
    tone: 'text-iris-cyan',
  },
  {
    title: 'บัญชีและความปลอดภัย',
    description: 'IRIS ID, Steam Link, Discord, สิทธิ์ Admin/User และคำขอข้อมูลส่วนบุคคล',
    icon: LockKeyhole,
    tone: 'text-iris-orchid',
  },
];

const categories: Array<{ value: TicketCategory; label: string; hint: string; sla: string; icon: JSX.Element }> = [
  { value: 'recharge', label: 'Recharge / Wallet', hint: 'ยอดเติมเงิน, IC, Auto Top-up', sla: '15 นาที', icon: <CreditCard className="h-4 w-4" /> },
  { value: 'delivery', label: 'Item Delivery', hint: 'ของไม่เข้าเกม, claim, order queue', sla: '20 นาที', icon: <PackageCheck className="h-4 w-4" /> },
  { value: 'account', label: 'Account & Identity', hint: 'Steam, Discord, IRIS ID, สิทธิ์บัญชี', sla: '30 นาที', icon: <LockKeyhole className="h-4 w-4" /> },
  { value: 'server', label: 'Server / Plugin Bug', hint: 'คำสั่ง plugin, crash, server issue', sla: '45 นาที', icon: <Zap className="h-4 w-4" /> },
  { value: 'market', label: 'P2P Marketplace', hint: 'listing, escrow, trade dispute', sla: '30 นาที', icon: <TicketCheck className="h-4 w-4" /> },
  { value: 'pdpa', label: 'PDPA / Data Request', hint: 'ขอข้อมูล, ลบข้อมูล, privacy', sla: '1 วันทำการ', icon: <FileText className="h-4 w-4" /> },
];

const evidence: Record<TicketCategory, string[]> = {
  recharge: ['เลขอ้างอิงสลิป / เวลาโอน', 'ยอดที่เติม', 'บัญชี IRIS ID หรือ Discord'],
  delivery: ['Order ID', 'ชื่อเซิร์ฟเวอร์', 'Steam ID และเวลาที่กด claim'],
  account: ['Discord / Steam ID', 'อีเมลที่ใช้สมัคร', 'ภาพ error ถ้ามี'],
  server: ['ชื่อเซิร์ฟเวอร์', 'คำสั่งที่ใช้', 'เวลาเกิดเหตุและภาพหน้าจอ'],
  market: ['Listing ID / Trade ID', 'ชื่อคู่ซื้อขาย', 'รายละเอียด dispute'],
  pdpa: ['IRIS ID', 'ประเภทคำขอข้อมูล', 'ช่องทางติดต่อกลับ'],
};

const faqs = [
  {
    question: 'เติมเงินแล้วไม่ได้รับ IRIS Coins ต้องทำอย่างไร?',
    answer:
      'ส่ง Ticket หมวด Recharge / Wallet พร้อมเลขอ้างอิงสลิป ยอดเงิน และเวลาทำรายการ ทีมงานจะตรวจสอบกับ backend ledger ก่อนปรับยอดทุกครั้ง',
  },
  {
    question: 'ซื้อสินค้าแล้วของจะเข้าเกมเมื่อไร?',
    answer:
      'หลัง Checkout สำเร็จ ระบบจะสร้างคิว delivery เข้า plugin เกม หากตัวละครออฟไลน์ ระบบจะแสดงสถานะรอส่งหรือ retry ในหน้า Orders',
  },
  {
    question: 'ขอคืนเงินได้หรือไม่ถ้าซื้อผิดเซิร์ฟเวอร์?',
    answer:
      'ระบบหน้าเว็บไม่ตัดสิน refund เอง ให้เปิด Ticket พร้อม Order ID ทีมงานจะตรวจสอบ policy, payment, delivery state และ backend contract ก่อนดำเนินการ',
  },
  {
    question: 'P2P Marketplace มีปัญหาการซื้อขายต้องแจ้งอะไร?',
    answer:
      'แนบ Listing ID หรือ Trade ID, ชื่อคู่ซื้อขาย, เวลาเกิดเหตุ และหลักฐานประกอบ เพื่อให้ทีมงานตรวจสอบ escrow และสถานะรายการได้เร็วขึ้น',
  },
  {
    question: 'ข้อมูลที่ส่งใน Ticket ปลอดภัยหรือไม่?',
    answer:
      'Ticket mock นี้เป็น frontend state ระหว่างรอ API จริง ห้ามใส่รหัสผ่านหรือ secret ใด ๆ ข้อมูล production ต้องถูกส่งผ่าน backend ticket service เท่านั้น',
  },
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function inputClass(extra = '') {
  return `w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-iris-pearl outline-none transition placeholder:text-white/30 focus:border-iris-cyan/55 focus:ring-2 focus:ring-iris-cyan/15 ${extra}`;
}

function SupportContent() {
  const searchParams = useSearchParams();
  const orderIdParam = searchParams.get('orderId');
  const subjectParam = searchParams.get('subject');

  const [openFaq, setOpenFaq] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TicketCategory>(orderIdParam ? 'delivery' : 'recharge');
  const [discord, setDiscord] = useState('');
  const [steamId, setSteamId] = useState('');
  const [reference, setReference] = useState(orderIdParam || '');
  const [message, setMessage] = useState(
    subjectParam ? `${subjectParam} - ต้องการให้ทีมงานช่วยตรวจสอบสถานะการนำจ่ายไอเท็มในเกม` : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult>(null);

  useEffect(() => {
    if (orderIdParam) {
      setCategory('delivery');
      setReference(orderIdParam);
      if (subjectParam) {
        setMessage(`${subjectParam} - ต้องการให้ทีมงานช่วยตรวจสอบสถานะการนำจ่ายไอเท็มในเกม`);
      }
    }
  }, [orderIdParam, subjectParam]);

  const activeCategory = categories.find((item) => item.value === category) ?? categories[0];
  const filteredFaq = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return faqs;
    return faqs.filter((faq) => normalize(`${faq.question} ${faq.answer}`).includes(needle));
  }, [query]);

  const canSubmit = discord.trim().length >= 3 && message.trim().length >= 20 && !isSubmitting;

  function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    if (!canSubmit) {
      setResult({
        type: 'error',
        text: 'กรุณากรอก Discord username และรายละเอียดปัญหาอย่างน้อย 20 ตัวอักษร',
      });
      return;
    }

    setIsSubmitting(true);
    window.setTimeout(() => {
      const ticketId = `TK-2026-${Math.floor(100000 + Math.random() * 900000)}`;
      setIsSubmitting(false);
      setResult({
        type: 'success',
        text: `สร้าง Ticket สำเร็จ: #${ticketId} (${activeCategory.label}) — บอท Discord และทีมงาน IRIS Support ได้รับข้อมูลแล้ว เจ้าหน้าที่จะติดต่อกลับผ่าน Discord ภายใน ${activeCategory.sla}`,
      });
      setDiscord('');
      setSteamId('');
      setReference('');
      setMessage('');
    }, 700);
  }

  return (
    <main className="page-shell space-y-10 py-8 lg:py-12">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-iris-river/65 shadow-[0_30px_120px_rgba(0,0,0,.38)]">
        <img
          src="/images/generated/support-command-center.svg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-35"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-iris-ink via-iris-ink/86 to-iris-ink/45" />
        <div className="absolute inset-0 thai-lattice opacity-25" />

        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:p-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-iris-gold/25 bg-iris-gold/10 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-iris-gold">
              <Sparkles className="h-4 w-4" />
              IRIS Support Command Center
            </div>
            <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.04] text-iris-pearl sm:text-5xl lg:text-6xl">
              ศูนย์ช่วยเหลือที่เชื่อมเว็บ
            </h1>
            <p className="mt-2 text-lg text-iris-cyan">มีอะไรให้เราช่วยไหม?</p>
            <p className="mt-5 max-w-2xl text-base leading-8 text-white/68">
              ออกแบบใหม่ให้เป็น Enterprise Support Hub สำหรับผู้เล่น: ค้นคำตอบ ส่ง Ticket พร้อมหลักฐานครบ
              และเตรียมต่อ API จริงโดยไม่ให้ frontend ตัดสินราคา wallet refund หรือสิทธิ์ผู้ใช้เอง
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#submit-ticket" className="btn-primary">
                ส่ง Ticket <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#faq" className="btn-secondary">
                ดูคำถามยอดนิยม
              </a>
            </div>
          </div>

          <div className="grid gap-3 self-end">
            {metrics.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-3xl border border-white/10 bg-black/35 p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-white/45">{label}</p>
                    <p className="mt-1 font-display text-2xl text-iris-pearl">{value}</p>
                  </div>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-iris-cyan/10 text-iris-cyan">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="หมวดช่วยเหลือหลัก">
        {lanes.map(({ title, description, icon: Icon, tone }) => (
          <GlassCard key={title} className="p-5" hoverEffect="lift">
            <div className="flex items-start gap-4">
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[.035] ${tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-xl text-iris-pearl">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-white/55">{description}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </section>

      <section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_540px]">
        <div id="faq" className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Knowledge base</p>
              <h2 className="mt-2 font-display text-3xl text-iris-pearl">คำถามที่พบบ่อย</h2>
            </div>
            <label className="relative block w-full sm:max-w-sm">
              <span className="sr-only">ค้นหาคำถาม</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={inputClass('pl-11')}
                placeholder="ค้นหา เติมเงิน, order, plugin..."
              />
            </label>
          </div>

          <div className="space-y-3">
            {filteredFaq.length ? (
              filteredFaq.map((faq, index) => {
                const isOpen = openFaq === index;
                return (
                  <GlassCard key={faq.question} className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? -1 : index)}
                      className="flex w-full items-center justify-between gap-4 p-5 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-iris-cyan/20 bg-iris-cyan/10 text-iris-cyan">
                          <HelpCircle className="h-5 w-5" />
                        </span>
                        <span className="font-display text-base font-bold text-iris-pearl">{faq.question}</span>
                      </span>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-iris-muted transition ${isOpen ? 'rotate-180 text-iris-cyan' : ''}`} />
                    </button>
                    {isOpen ? (
                      <div className="border-t border-white/5 px-5 pb-5 pt-4 text-sm leading-7 text-iris-muted">
                        {faq.answer}
                      </div>
                    ) : null}
                  </GlassCard>
                );
              })
            ) : (
              <GlassCard className="p-8 text-center">
                <HelpCircle className="mx-auto h-8 w-8 text-iris-muted" />
                <p className="mt-3 font-bold text-iris-pearl">ไม่พบคำถามที่ตรงกับคำค้น</p>
                <p className="mt-1 text-sm text-iris-muted">ส่ง Ticket พร้อมรายละเอียดปัญหาแทนได้ทันที</p>
              </GlassCard>
            )}
          </div>
        </div>

        <div id="submit-ticket" className="space-y-5">
          <div>
            <p className="eyebrow text-iris-gold">Submit a ticket</p>
            <h2 className="mt-2 font-display text-3xl text-iris-pearl">ส่งคำร้องให้ Operator</h2>
          </div>

          <GlassCard variant="prism" hasLattice className="p-5 sm:p-6">
            <form onSubmit={submitTicket} className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {categories.map((item) => {
                  const active = item.value === category;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setCategory(item.value)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        active
                          ? 'border-iris-cyan/55 bg-iris-cyan/10 text-iris-pearl shadow-[0_0_24px_rgba(55,229,210,.12)]'
                          : 'border-white/10 bg-black/20 text-iris-muted hover:border-white/20 hover:text-iris-pearl'
                      }`}
                      aria-pressed={active}
                    >
                      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em]">
                        <span className={active ? 'text-iris-cyan' : 'text-iris-muted'}>{item.icon}</span>
                        {item.label}
                      </span>
                      <span className="mt-2 block text-[11px] leading-5 opacity-75">{item.hint}</span>
                      <span className="mt-3 inline-flex rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]">
                        SLA {item.sla}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-iris-gold/20 bg-iris-gold/[0.06] p-4">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-iris-gold">
                  <FileText className="h-4 w-4" />
                  หลักฐานที่ควรแนบสำหรับ {activeCategory.label}
                </p>
                <ul className="mt-3 grid gap-2 text-xs text-iris-muted sm:grid-cols-2">
                  {evidence[category].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-iris-gold" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-iris-pearl/80">Discord username</span>
                  <input className={inputClass()} placeholder="Survivor#1234" value={discord} onChange={(event) => setDiscord(event.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-iris-pearl/80">Steam ID / Epic ID</span>
                  <input className={inputClass()} placeholder="76561198xxxxxxxx" value={steamId} onChange={(event) => setSteamId(event.target.value)} />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-iris-pearl/80">Order / Listing / Payment reference</span>
                <input className={inputClass()} placeholder="order-iris-0001 หรือ ref promptpay" value={reference} onChange={(event) => setReference(event.target.value)} />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-iris-pearl/80">รายละเอียดปัญหา</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={6}
                  className={inputClass('min-h-36 resize-y leading-7')}
                  placeholder="อธิบายปัญหาแบบเป็นลำดับ: เกิดเมื่อไร, ทำอะไรอยู่, เลข order/ref, เซิร์ฟเวอร์, error ที่เห็น..."
                />
              </label>

              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-6 text-iris-muted">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-iris-cyan" />
                <span>
                  Frontend ใช้ mock state เฉพาะการแสดงผล ระหว่างรอ Ticket API จริง ห้ามคำนวณราคา wallet refund หรือสิทธิ์สุดท้ายในหน้านี้
                </span>
              </div>

              {result ? (
                <div
                  role={result.type === 'error' ? 'alert' : 'status'}
                  className={`rounded-2xl border p-4 text-sm ${
                    result.type === 'error'
                      ? 'border-rose-500/25 bg-rose-500/10 text-rose-200'
                      : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {result.type === 'error' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    {result.text}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button type="submit" variant="cyan" isLoading={isSubmitting} disabled={!canSubmit} rightIcon={<ArrowRight className="h-4 w-4" />}>
                  ส่ง Ticket ให้ Operator
                </Button>
                <p className="text-xs text-iris-muted">Priority จะจัดตามหมวดและหลักฐานที่แนบ</p>
              </div>
            </form>
          </GlassCard>
        </div>
      </section>
    </main>
  );
}

export default function SupportPage() {
  return (
    <Suspense
      fallback={
        <div className="page-shell flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-iris-cyan" />
        </div>
      }
    >
      <SupportContent />
    </Suspense>
  );
}
