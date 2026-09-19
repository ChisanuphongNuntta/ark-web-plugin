'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ArrowUpRight, CalendarDays, Gift } from 'lucide-react';
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

      {kind === 'event' && (
        <section className="mb-12 frozen-editorial-card overflow-hidden">
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
