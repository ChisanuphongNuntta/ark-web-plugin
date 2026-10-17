'use client';

import { CLAIM_COMMAND, withClaimCommand } from '@/components/ClaimCommand';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight, ChevronDown, Search } from 'lucide-react';
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  buttonVariants,
  useToast,
} from '@/components/ui';
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const DISCORD_URL = 'https://discord.gg/iris-thailand';

type Topic = 'topup' | 'delivery' | 'account' | 'server' | 'market' | 'pdpa';

const TOPICS: Array<{ value: Topic; label: string; evidence: readonly string[] }> = [
  { value: 'topup', label: 'เติมเงินและยอด IC', evidence: ['เวลาที่โอนและยอดเงิน', 'เลขอ้างอิงในสลิป', 'ชื่อ Discord ที่ใช้เข้าสู่ระบบ'] },
  { value: 'delivery', label: 'ของไม่เข้าเกม', evidence: ['เลขคำสั่งซื้อ', 'ชื่อเซิร์ฟเวอร์ที่เลือก', 'Steam ID และเวลาที่เข้าเกม'] },
  { value: 'account', label: 'บัญชีและการเชื่อม Steam', evidence: ['ชื่อ Discord', 'Steam ID', 'ข้อความผิดพลาดที่เห็น (ถ้ามี)'] },
  { value: 'server', label: 'ปัญหาในเซิร์ฟเวอร์', evidence: ['ชื่อเซิร์ฟเวอร์และแผนที่', 'คำสั่งที่พิมพ์', 'เวลาที่เกิดปัญหา'] },
  { value: 'market', label: 'ตลาดผู้เล่น', evidence: ['เลขประกาศขาย', 'ชื่อผู้ซื้อหรือผู้ขาย', 'เวลาที่เกิดปัญหา'] },
  { value: 'pdpa', label: 'ข้อมูลส่วนบุคคล (PDPA)', evidence: ['ชื่อ Discord', 'สิ่งที่ต้องการ: ขอสำเนา แก้ไข หรือลบข้อมูล'] },
];

const QUICK_LINKS = [
  { title: 'สถานะคำสั่งซื้อ', body: 'ดูว่าของถึงขั้นไหน ส่งเข้าเกมแล้วหรือยัง', href: '/orders' },
  { title: 'เติม IC', body: 'ช่องทางเติมเงินและประวัติการเติม', href: '/topup' },
  { title: 'บัญชีและ Steam', body: 'เชื่อม Steam และจัดการ IRIS ID', href: '/profile' },
] as const;

const FAQS = [
  {
    q: 'เติมเงินแล้วยอด IC ยังไม่เข้า ต้องทำอย่างไร',
    a: 'ตรวจประวัติการเติมที่หน้าเติม IC ก่อน ถ้ารายการยังรอตรวจเกินเวลาที่แจ้ง ให้แจ้งทีมงานพร้อมเวลาที่โอน ยอดเงิน และเลขอ้างอิงในสลิป ทีมงานจะตรวจกับรายการในระบบก่อนปรับยอดทุกครั้ง',
  },
  {
    q: 'ซื้อแล้ว ของจะเข้าเกมเมื่อไร',
    a: `หลังชำระเงินสำเร็จ ระบบส่งของเข้าเซิร์ฟเวอร์ที่คุณเลือกโดยอัตโนมัติ ถ้าตัวละครออฟไลน์อยู่ ของจะรอในคิว เข้าเกมแล้วพิมพ์ ${CLAIM_COMMAND} ในแชทเพื่อรับของที่ค้าง`,
  },
  {
    q: 'เลือกเซิร์ฟเวอร์ผิด ขอย้ายหรือคืนเงินได้ไหม',
    a: 'แจ้งทีมงานพร้อมเลขคำสั่งซื้อ ทีมงานจะตรวจสถานะการส่งของก่อน ถ้ายังไม่ได้ส่งเข้าเกมจะช่วยดำเนินการตามเงื่อนไขการใช้บริการ',
  },
  {
    q: 'ทำไมบางเซิร์ฟเวอร์เลือกไม่ได้ตอนซื้อ',
    a: 'ระบบให้เลือกได้เฉพาะเซิร์ฟเวอร์ที่เปิดรับของจากร้านค้าในตอนนั้น เซิร์ฟเวอร์ที่ปิดปรับปรุงหรือยังไม่เปิดรับของจะแสดงเหตุผลไว้ข้างชื่อ',
  },
  {
    q: 'ซื้อขายในตลาดผู้เล่นแล้วมีปัญหา',
    a: 'แจ้งเลขประกาศขาย ชื่อคู่ซื้อขาย และเวลาที่เกิดปัญหา เงินของผู้ซื้อถูกพักไว้ในระบบจนกว่าการส่งมอบจะสำเร็จ ทีมงานตรวจสอบสถานะได้จากเลขประกาศ',
  },
  {
    q: 'ทีมงานจะขอรหัสผ่านหรือรหัส OTP ไหม',
    a: 'ไม่เคย ทีมงาน IRIS ไม่ขอรหัสผ่าน รหัส OTP หรือข้อมูลบัตรผ่านช่องทางใดทั้งสิ้น ถ้ามีคนขอ ให้แจ้งทีมงานทันที',
  },
] as const;

function SupportContent() {
  const params = useSearchParams();
  const orderId = params.get('orderId');
  const subject = params.get('subject');

  return (
    <div className="page-shell pb-20">
      <PageHeader
        eyebrow="ช่วยเหลือ"
        title="ศูนย์ช่วยเหลือ"
        description="ค้นหาคำตอบได้ที่นี่ ถ้ายังแก้ไม่ได้ เตรียมข้อมูลด้านล่างแล้วแจ้งทีมงานทาง Discord"
        actions={
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'secondary' })}>
            เปิด Discord
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </a>
        }
      />

      <ul className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <li key={link.href} className="bg-surface">
            <Link href={link.href} className="group block h-full p-5 transition-colors duration-fast hover:bg-surface-2">
              <span className="block text-sm font-medium text-fg transition-colors duration-fast group-hover:text-accent">{link.title}</span>
              <span className="mt-1 block text-sm text-fg-muted">{link.body}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <Faq />
        <ReportComposer
          key={`${orderId ?? ''}|${subject ?? ''}`}
          initialTopic={orderId ? 'delivery' : 'topup'}
          initialReference={orderId ?? ''}
          initialMessage={subject ? `${subject} — ยังไม่ได้รับของในเกม รบกวนตรวจสอบการส่งของ` : ''}
        />
      </div>
    </div>
  );
}

function Faq() {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState<number | null>(0);
  const needle = query.trim().toLowerCase();
  const items = FAQS.map((f, index) => ({ ...f, index })).filter(
    (f) => !needle || `${f.q} ${f.a}`.toLowerCase().includes(needle)
  );

  return (
    <section aria-labelledby="faq-title" className="min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="faq-title" className="text-lg font-semibold text-fg">
          คำถามที่พบบ่อย
        </h2>
        <Input
          label="ค้นหาคำถาม"
          hideLabel
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหา เช่น เติมเงิน, claim"
          leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
          wrapperClassName="sm:w-64"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState className="mt-5" title="ไม่พบคำถามที่ตรงกับคำค้น" description="ลองใช้คำอื่น หรือแจ้งทีมงานด้วยแบบฟอร์มด้านข้าง" />
      ) : (
        <ul className="mt-5 divide-y divide-line border-y border-line">
          {items.map((f) => {
            const expanded = open === f.index;
            const panelId = `faq-panel-${f.index}`;
            return (
              <li key={f.q}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpen(expanded ? null : f.index)}
                    className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium text-fg transition-colors duration-fast hover:text-accent"
                  >
                    <span>{f.q}</span>
                    <ChevronDown
                      className={cn('h-4 w-4 shrink-0 text-fg-subtle', expanded && 'rotate-180')}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                {expanded ? (
                  <p id={panelId} className="pb-5 pr-8 text-sm text-fg-muted">
                    {withClaimCommand(f.a)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * There is no ticket API yet, so this does not pretend to submit anything:
 * it assembles a complete report the player copies into Discord.
 */
function ReportComposer({
  initialTopic,
  initialReference,
  initialMessage,
}: {
  initialTopic: Topic;
  initialReference: string;
  initialMessage: string;
}) {
  const toast = useToast();
  const user = useAuthStore((s) => s.user);
  const [topic, setTopic] = React.useState<Topic>(initialTopic);
  const [steamId, setSteamId] = React.useState('');
  const [reference, setReference] = React.useState(initialReference);
  const [message, setMessage] = React.useState(initialMessage);
  const [touched, setTouched] = React.useState(false);

  const active = TOPICS.find((t) => t.value === topic) ?? TOPICS[0];
  const effectiveSteam = steamId.trim() || user?.steamId || '';
  const messageError = touched && message.trim().length < 15 ? 'อธิบายปัญหาอย่างน้อย 15 ตัวอักษร' : undefined;

  const report = [
    `หัวข้อ: ${active.label}`,
    user?.discordUsername ? `Discord: ${user.discordUsername}` : null,
    effectiveSteam ? `Steam ID: ${effectiveSteam}` : null,
    reference.trim() ? `เลขอ้างอิง: ${reference.trim()}` : null,
    `รายละเอียด: ${message.trim()}`,
  ]
    .filter(Boolean)
    .join('\n');

  const copy = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (message.trim().length < 15) return;
    try {
      await navigator.clipboard.writeText(report);
      toast.success('คัดลอกข้อความแล้ว', 'วางในช่องแจ้งปัญหาของ Discord ได้เลย');
    } catch {
      toast.error('คัดลอกไม่สำเร็จ', 'เลือกข้อความในช่องตัวอย่างแล้วคัดลอกเอง');
    }
  };

  return (
    <section aria-labelledby="report-title" className="h-fit rounded-card border border-line bg-surface">
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <h2 id="report-title" className="text-base font-semibold text-fg">
          แจ้งปัญหากับทีมงาน
        </h2>
        <p className="mt-1 text-sm text-fg-muted">กรอกข้อมูล กดคัดลอก แล้ววางในช่องแจ้งปัญหาของ Discord</p>
      </div>

      <form onSubmit={copy} className="space-y-4 px-5 py-5 sm:px-6" noValidate>
        <Select
          label="หัวข้อ"
          value={topic}
          onChange={(e) => setTopic(e.target.value as Topic)}
          options={TOPICS.map((t) => ({ value: t.value, label: t.label }))}
        />

        <div className="rounded-control border border-line bg-surface-2 px-4 py-3">
          <p className="text-xs font-medium text-fg-muted">ข้อมูลที่ช่วยให้ตรวจได้เร็ว</p>
          <ul className="mt-2 space-y-1">
            {active.evidence.map((item) => (
              <li key={item} className="flex gap-2 text-xs text-fg-muted">
                <span className="mt-[0.6em] h-px w-2 shrink-0 bg-accent" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Steam ID"
            mono
            inputMode="numeric"
            value={steamId}
            onChange={(e) => setSteamId(e.target.value)}
            placeholder={user?.steamId ?? '7656119…'}
            helperText={user?.steamId && !steamId ? 'ใช้ Steam ID ที่เชื่อมไว้' : undefined}
          />
          <Input
            label="เลขคำสั่งซื้อหรืออ้างอิง"
            mono
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="ถ้ามี"
          />
        </div>

        <Textarea
          label="รายละเอียด"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onBlur={() => setTouched(true)}
          error={messageError}
          placeholder="เกิดอะไรขึ้น เมื่อไร บนเซิร์ฟเวอร์ไหน และเห็นข้อความอะไร"
        />

        <p className="text-xs text-fg-subtle">ห้ามใส่รหัสผ่านหรือรหัส OTP ทีมงานไม่เคยขอข้อมูลเหล่านี้</p>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit">คัดลอกข้อความ</Button>
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'secondary' })}>
            เปิด Discord
          </a>
        </div>
      </form>
    </section>
  );
}

export default function SupportPage() {
  return (
    <React.Suspense
      fallback={
        <div className="page-shell pb-20 pt-10" aria-busy="true">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-8 w-56" />
        </div>
      }
    >
      <SupportContent />
    </React.Suspense>
  );
}
