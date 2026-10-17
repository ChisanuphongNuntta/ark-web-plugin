'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ArrowUpRight, CalendarDays, Gift, Copy, Check, Tag, Sparkles, Clock, Flame } from 'lucide-react';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Skeleton } from '@/components/ui/Skeleton';

interface Page {
  id: number;
  slug: string;
  title: string;
  description?: string;
  pageType: string;
}

export function FrozenJournal({ kind }: { kind: 'event' | 'promotion' }) {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['published-pages'],
    queryFn: () => api.get<{ pages: Page[] }>('/content/pages').then((r) => r.data),
  });

  const pages = (data?.pages || []).filter(
    (p) => p.pageType === kind || p.pageType === `${kind}s` || p.slug.startsWith(kind + '-')
  );

  const Icon = kind === 'event' ? CalendarDays : Gift;

  return (
    <div className="page-shell pb-16">
      <header className="frozen-intro">
        <p className="eyebrow">{kind === 'event' ? 'THE WINTER JOURNAL' : 'IRIS PRIVILEGES'}</p>
        <h1 className="font-display text-4xl sm:text-5xl">
          {kind === 'event' ? 'กิจกรรมที่เชื่อมรางวัล' : 'สิทธิพิเศษสำหรับการเดินทาง'}
        </h1>
        <p>
          {kind === 'event'
            ? 'พบกิจกรรมและประกาศจากทีม IRIS ตรวจวันเวลาและเงื่อนไขก่อนเข้าร่วม'
            : 'รวมโปรโมชั่นที่ทีมงานประกาศ พร้อมรายละเอียดและเงื่อนไขการใช้สิทธิ์'}
        </p>
      </header>

      {/* Promotions: Discount Vouchers Block */}
      {kind === 'promotion' && (
        <section className="mb-12 frozen-editorial-card space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl text-iris-pearl flex items-center gap-2">
                <Tag className="h-6 w-6 text-iris-gold" />
                <span>บัตรกำนัลและโค้ดส่วนลดพิเศษ (Active Promo Codes)</span>
              </h2>
              <p className="text-xs text-iris-muted mt-1">
                คลิกเพื่อคัดลอกโค้ดส่วนลดและนำไปกรอกในหน้าสั่งซื้อหรือเติมเงินเพื่อรับสิทธิพิเศษทันที
              </p>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 border border-amber-500/30">
              <Sparkles className="h-3.5 w-3.5" />
              Verified & Active
            </span>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                code: 'IRISFROST10',
                discount: 'ลด 10% สินค้าทุกหมวด',
                desc: 'ใช้ได้กับไดโนเสาร์และแพ็กเกจยุทโธปกรณ์',
                expiry: 'สิ้นสุดสิ้นเดือนนี้',
              },
              {
                code: 'WELCOME2026',
                discount: 'รับโบนัส +500 IC',
                desc: 'เมื่อเติมเงินครั้งแรกตั้งแต่ 1,000 THB ขึ้นไป',
                expiry: 'สิทธิ์ผู้เล่นใหม่',
              },
              {
                code: 'CRYSTALVIP',
                discount: 'ฟรี บัฟ EXP x2 ในเกม',
                desc: 'กดรับที่ช่องแชทเกม /claim หลังเปิดใช้งาน',
                expiry: 'จำกัด 1 ครั้ง/บัญชี',
              },
            ].map((voucher) => (
              <div
                key={voucher.code}
                className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3 relative overflow-hidden group hover:border-iris-gold/40 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-iris-gold bg-iris-gold/15 border border-iris-gold/30 px-2 py-0.5 rounded-md">
                    {voucher.code}
                  </span>
                  <span className="text-[10px] text-iris-muted">{voucher.expiry}</span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-iris-pearl">{voucher.discount}</h3>
                  <p className="text-xs text-iris-muted mt-0.5">{voucher.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(voucher.code);
                    setCopiedCode(voucher.code);
                    setTimeout(() => setCopiedCode(null), 2000);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-iris-pearl hover:bg-iris-gold/20 hover:border-iris-gold/50 transition cursor-pointer"
                >
                  {copiedCode === voucher.code ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-300 font-bold">คัดลอกโค้ดแล้ว!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-iris-gold" />
                      <span>คัดลอกโค้ดส่วนลด</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Events: Live Event Banner & Weekly Timetable */}
      {kind === 'event' && (
        <>
          <section className="mb-8 frozen-editorial-card overflow-hidden">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="font-display text-2xl text-iris-pearl">กำลังดำเนินการ</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Now
              </span>
            </div>
            <div className="relative mb-6 overflow-hidden rounded-xl border border-white/10">
              <img
                src="/images/event_banner.png"
                alt="กิจกรรมที่เชื่อมรางวัล"
                className="w-full max-h-80 object-cover"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-lg text-white">IRIS Winter Expedition 2026</p>
                <p className="text-sm text-iris-muted">สะสมคะแนนภารกิจขั้วโลก แลกรับฉายาและไอเท็มลิมิเต็ด</p>
              </div>
              <button type="button" className="btn-primary shrink-0">
                เข้าร่วมกิจกรรม
              </button>
            </div>
          </section>

          <section className="mb-12 frozen-editorial-card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl text-iris-pearl flex items-center gap-2">
                <Clock className="h-5 w-5 text-iris-cyan" />
                <span>ตารางกิจกรรมเซิร์ฟเวอร์ประจำสัปดาห์ (Weekly Timetable)</span>
              </h2>
              <span className="text-xs font-mono text-iris-cyan">Auto Cluster Synced</span>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2">
                <span className="text-[10px] font-bold text-iris-cyan uppercase tracking-wider block">จันทร์ - พุธ</span>
                <h3 className="font-bold text-sm text-iris-pearl">2x Taming & Breeding Rush</h3>
                <p className="text-xs text-iris-muted">เพิ่มความเร็วในการจับไดโนเสาร์และฟักไข่ x2 ทั่วทั้งคลัสเตอร์</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2">
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">พฤหัสบดี - ศุกร์</span>
                <h3 className="font-bold text-sm text-iris-pearl">Glacial Cave Expedition</h3>
                <p className="text-xs text-iris-muted">โอกาสดรอปพิมพ์เขียวระดับ Ascendant ในถ้ำน้ำแข็งเพิ่มขึ้น 50%</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">เสาร์ - อาทิตย์</span>
                <h3 className="font-bold text-sm text-iris-pearl">3x Harvest & Boss Raid</h3>
                <p className="text-xs text-iris-muted">ฟาร์มทรัพยากร x3 และเปิดสังเวียนบอสขั้วโลก ชิงฉายาประจำสัปดาห์</p>
              </div>
            </div>
          </section>
        </>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-8">
        <div>
          {isLoading ? (
            <Skeleton className="h-64 rounded-2xl" />
          ) : isError ? (
            <ErrorMessage
              title="โหลดประกาศไม่สำเร็จ"
              message="กรุณาลองอีกครั้งในอีกสักครู่"
              onRetry={refetch}
            />
          ) : pages.length ? (
            <div className="grid sm:grid-cols-2 gap-5">
              {pages.map((p) => (
                <Link key={p.id} href={'/p/' + p.slug} className="frozen-editorial-card block">
                  <Icon className="text-iris-cyan mb-6" />
                  <h2 className="text-xl mb-3">{p.title}</h2>
                  <p className="text-sm text-iris-muted">{p.description}</p>
                  <span className="inline-flex mt-6 items-center gap-2 text-sm text-iris-cyan">
                    อ่านรายละเอียด
                    <ArrowUpRight size={16} />
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="frozen-editorial-card py-16 text-center">
              <Icon size={36} className="mx-auto text-iris-cyan mb-5" />
              <h2 className="text-2xl">ยังไม่มีประกาศใหม่เพิ่มเติม</h2>
              <p className="text-iris-muted mt-3 text-sm">
                เมื่อทีมงานเผยแพร่รายละเอียด คุณจะพบข้อมูลได้ที่นี่
              </p>
              <Link href="/shop" className="btn-primary mt-7 inline-block">
                สำรวจร้านค้า
              </Link>
            </div>
          )}
        </div>

        <aside className="frozen-editorial-card h-fit">
          <p className="eyebrow">BEFORE YOU GO</p>
          <h2 className="text-xl mt-3 mb-5">เตรียมพร้อมก่อนร่วมสนุก</h2>
          <ol className="space-y-5 text-sm text-iris-muted">
            <li>01 · เชื่อมบัญชีเกมกับ IRIS</li>
            <li>02 · อ่านรายละเอียดและเงื่อนไข</li>
            <li>03 · ตรวจสอบเซิร์ฟเวอร์ที่เข้าร่วม</li>
          </ol>
          <Link href="/support" className="inline-block mt-7 text-sm text-iris-cyan">
            ติดต่อทีมงาน ↗
          </Link>
        </aside>
      </div>
    </div>
  );
}
