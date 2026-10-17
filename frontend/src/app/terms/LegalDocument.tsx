'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { pdpaApi } from '@/lib/api';
import { Badge, PageHeader, Skeleton, RICH_TEXT_HTML } from '@/components/ui';

interface PolicyVersion {
  version: string;
  content: string;
  contentTh?: string | null;
  effectiveAt?: string | null;
}

export interface LegalSection {
  title: string;
  body?: string;
  items?: readonly React.ReactNode[];
}

export interface LegalDocumentProps {
  type: 'terms_of_service' | 'privacy_policy';
  title: string;
  description: string;
  /** Plain-language summary shown beside the document. */
  summary: readonly string[];
  /** Shown when no published policy version exists yet. */
  fallback: readonly LegalSection[];
  footer?: React.ReactNode;
}

/** Typography for admin-authored policy HTML (shared with CMS html blocks). */
const POLICY_HTML = RICH_TEXT_HTML;

const formatDate = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('th-TH', { dateStyle: 'long' });
};

/**
 * Shared layout for /terms and /privacy: PageHeader, a plain-language summary
 * column and the published policy (GET /pdpa/policy/:type). Falls back to the
 * built-in text when no version has been published.
 */
export function LegalDocument({ type, title, description, summary, fallback, footer }: LegalDocumentProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['policy', type],
    queryFn: () => pdpaApi.getPolicy(type).then((res) => res.data as { policy?: PolicyVersion | null }),
    retry: 1,
    staleTime: 5 * 60_000,
  });
  const policy = data?.policy ?? null;
  const effective = formatDate(policy?.effectiveAt);
  const html = policy ? policy.contentTh || policy.content : null;

  return (
    <div className="page-shell pb-20">
      <PageHeader eyebrow="เอกสารทางกฎหมาย" title={title} description={description} divided />

      <div className="grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-16">
        <aside className="lg:sticky lg:top-[calc(var(--header-h,64px)+24px)] lg:h-fit">
          <h2 className="text-xs font-medium text-fg-subtle">สาระสำคัญ</h2>
          <ol className="mt-3 space-y-3">
            {summary.map((item, index) => (
              <li key={item} className="flex gap-3 text-sm text-fg-muted">
                <span className="font-mono text-xs leading-[1.7rem] text-accent">{String(index + 1).padStart(2, '0')}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-fg-subtle">
            ข้อความในหัวข้อนี้เป็นสรุปเพื่ออ่านง่าย เนื้อหาฉบับเต็มอยู่ด้านขวา
          </p>
        </aside>

        <article className="min-w-0 max-w-prose" aria-busy={isLoading || undefined}>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-6 h-5 w-1/2" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
          ) : (
            <>
              <div className="mb-8 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                {policy ? (
                  <>
                    <Badge tone="neutral" mono>
                      ฉบับที่ {policy.version}
                    </Badge>
                    {effective ? <span>มีผลตั้งแต่ {effective}</span> : null}
                  </>
                ) : (
                  <span>ฉบับพื้นฐาน · ทีมงานจะเผยแพร่ฉบับเต็มในหน้านี้</span>
                )}
              </div>

              {html ? (
                <div className={POLICY_HTML} dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <div className="space-y-10">
                  {fallback.map((section, index) => (
                    <section key={section.title}>
                      <h2 className="text-base font-semibold text-fg">
                        <span className="mr-2 font-mono text-sm text-fg-subtle">{index + 1}.</span>
                        {section.title}
                      </h2>
                      {section.body ? <p className="mt-3 text-sm leading-[1.8] text-fg-muted">{section.body}</p> : null}
                      {section.items?.length ? (
                        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-[1.8] text-fg-muted">
                          {section.items.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                    </section>
                  ))}
                </div>
              )}

              {footer ? <div className="mt-12 border-t border-line pt-6">{footer}</div> : null}
              <p className="mt-12 text-xs text-fg-subtle">
                มีคำถามเกี่ยวกับเอกสารนี้ ติดต่อทีมงานได้ที่{' '}
                <Link href="/support" className="text-accent underline-offset-4 hover:underline">
                  ศูนย์ช่วยเหลือ
                </Link>
              </p>
            </>
          )}
        </article>
      </div>
    </div>
  );
}

export default LegalDocument;
