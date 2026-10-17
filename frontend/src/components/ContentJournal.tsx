'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState, ErrorMessage, PageHeader, Skeleton, buttonVariants } from '@/components/ui';

interface PublicPage {
  id: number;
  slug: string;
  title: string;
  description?: string | null;
  pageType: string;
  ogImage?: string | null;
}

type JournalKind = 'event' | 'promotion';

const COPY: Record<
  JournalKind,
  {
    eyebrow: string;
    title: string;
    description: string;
    emptyTitle: string;
    emptyBody: string;
    asideTitle: string;
    aside: readonly string[];
  }
> = {
  event: {
    eyebrow: 'กิจกรรม',
    title: 'กิจกรรมและประกาศ',
    description: 'กิจกรรมในเกมจากทีม IRIS ตรวจวันเวลา เซิร์ฟเวอร์ที่ร่วม และเงื่อนไขก่อนเข้าร่วม',
    emptyTitle: 'ยังไม่มีกิจกรรมที่ประกาศ',
    emptyBody: 'เมื่อทีมงานเผยแพร่กิจกรรมใหม่ รายละเอียดจะแสดงที่นี่และใน Discord',
    asideTitle: 'ก่อนเข้าร่วม',
    aside: [
      'เชื่อมบัญชี Steam กับ IRIS ID ให้เรียบร้อย',
      'อ่านวันเวลาและเงื่อนไขในประกาศให้ครบ',
      'ตรวจว่าเซิร์ฟเวอร์ที่คุณเล่นร่วมกิจกรรมนี้',
    ],
  },
  promotion: {
    eyebrow: 'โปรโมชั่น',
    title: 'โปรโมชั่นและสิทธิพิเศษ',
    description: 'โปรโมชั่นที่ทีมงานประกาศ พร้อมระยะเวลาและเงื่อนไขการใช้สิทธิ์',
    emptyTitle: 'ยังไม่มีโปรโมชั่นในตอนนี้',
    emptyBody: 'เมื่อมีโปรโมชั่นใหม่ รายละเอียดจะแสดงที่นี่และใน Discord',
    asideTitle: 'การใช้สิทธิ์',
    aside: [
      'ส่วนลดที่เข้าเงื่อนไข ระบบคำนวณให้ในขั้นตอนตรวจยอด',
      'ยอดสุดท้ายยืนยันก่อนชำระเงินทุกครั้ง',
      'มีคำถามเรื่องสิทธิ์ ติดต่อทีมงานพร้อมเลขคำสั่งซื้อ',
    ],
  },
};

function matchesKind(page: PublicPage, kind: JournalKind) {
  return page.pageType === kind || page.pageType === `${kind}s` || page.slug.startsWith(`${kind}-`);
}

/**
 * Event / promotion listing from the CMS (GET /content/pages). Only shows
 * what the team actually published — no placeholder codes or schedules.
 */
export function ContentJournal({ kind }: { kind: JournalKind }) {
  const copy = COPY[kind];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['published-pages'],
    queryFn: () => api.get<{ pages: PublicPage[] }>('/content/pages').then((r) => r.data),
    staleTime: 60_000,
  });
  const pages = (data?.pages ?? []).filter((p) => matchesKind(p, kind));

  return (
    <div className="page-shell pb-20">
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="กำลังโหลดประกาศ">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="space-y-3 rounded-card border border-line bg-surface p-5">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-4/5" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <ErrorMessage title="โหลดประกาศไม่สำเร็จ" message="ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง" onRetry={() => void refetch()} />
          ) : pages.length === 0 ? (
            <EmptyState
              title={copy.emptyTitle}
              description={copy.emptyBody}
              action={
                <Link href="/shop" className={buttonVariants({ variant: 'secondary' })}>
                  ไปที่ร้านค้า
                </Link>
              }
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {pages.map((page) => (
                <li key={page.id} className="min-w-0">
                  <Link
                    href={`/p/${page.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface transition-colors duration-fast hover:border-line-strong"
                  >
                    {page.ogImage ? (
                      <span className="block aspect-[16/9] overflow-hidden border-b border-line bg-surface-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={page.ogImage} alt="" loading="lazy" className="h-full w-full object-cover saturate-[.8]" />
                      </span>
                    ) : null}
                    <span className="flex flex-1 flex-col p-5">
                      <span className="text-base font-semibold text-fg transition-colors duration-fast group-hover:text-accent">
                        {page.title}
                      </span>
                      {page.description ? (
                        <span className="mt-2 line-clamp-3 text-sm text-fg-muted">{page.description}</span>
                      ) : null}
                      <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm text-accent">
                        อ่านรายละเอียด
                        <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="h-fit rounded-card border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">{copy.asideTitle}</h2>
          <ol className="mt-4 space-y-3">
            {copy.aside.map((item, index) => (
              <li key={item} className="flex gap-3 text-sm text-fg-muted">
                <span className="font-mono text-xs leading-[1.7rem] text-accent">{String(index + 1).padStart(2, '0')}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
          <Link href="/support" className="mt-5 inline-block text-sm text-accent underline-offset-4 hover:underline">
            ติดต่อทีมงาน
          </Link>
        </aside>
      </div>
    </div>
  );
}

export default ContentJournal;
