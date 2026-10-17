'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { contentApi, productApi } from '@/lib/api';
import { ProductCard } from '@/components/ProductCard';
import { cn } from '@/lib/utils';
import {
  Card,
  EmptyState,
  ErrorMessage,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsPanel,
  buttonVariants,
  RICH_TEXT_HTML,
} from '@/components/ui';

// CMS block payloads are admin-authored JSON.
interface ContentBlock {
  id: number;
  blockType: string;
  content: any;
  settings: any;
  sortOrder: number;
  isVisible: boolean;
}

interface DynamicPage {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  pageType: string;
  layout: string;
  settings: any;
  blocks: ContentBlock[];
}

const ALIGN: Record<string, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };
const alignClass = (align?: string) => ALIGN[align || 'left'] ?? 'text-left';

/** Internal links stay client-side; anything else opens as a normal external anchor. */
function SmartLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function DynamicPageRenderer() {
  const params = useParams();
  const slug = params.slug as string;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['public-page', slug],
    queryFn: () => contentApi.getPublicPageBySlug(slug).then((res) => res.data),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="page-shell space-y-4 py-12" aria-busy="true">
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-5/6 max-w-xl" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }

  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  if (error && status !== 404) {
    return (
      <div className="page-shell py-16">
        <ErrorMessage message="โหลดหน้านี้ไม่สำเร็จ ลองใหม่อีกครั้ง" onRetry={() => refetch()} />
      </div>
    );
  }

  if (!data?.page) {
    return (
      <div className="page-shell py-16">
        <EmptyState
          title="ไม่พบหน้าที่ต้องการ"
          description="หน้านี้อาจถูกลบไปแล้วหรือยังไม่เผยแพร่"
          action={
            <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
              กลับหน้าแรก
            </Link>
          }
        />
      </div>
    );
  }

  const page: DynamicPage = data.page;
  const blocks = [...(page.blocks ?? [])]
    .filter((b) => b.isVisible !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <div className={`${page.layout === 'full-width' ? 'w-full px-4 sm:px-6' : 'page-shell'} space-y-10 py-10 pb-16 sm:py-12`}>
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}

function BlockRenderer({ block }: { block: ContentBlock }) {
  const { blockType, content } = block;
  switch (blockType) {
    case 'heading':
      return <HeadingBlock content={content} />;
    case 'text':
      return <TextBlock content={content} />;
    case 'image':
      return <ImageBlock content={content} />;
    case 'gallery':
      return <GalleryBlock content={content} />;
    case 'banner':
      return <BannerBlock content={content} />;
    case 'button':
      return <ButtonBlock content={content} />;
    case 'divider':
      return <hr className="border-line" />;
    case 'spacer':
      return <SpacerBlock content={content} />;
    case 'html':
      return <HtmlBlock content={content} />;
    case 'products':
      return <ProductListBlock content={content} />;
    case 'countdown':
      return <CountdownBlock content={content} />;
    case 'video':
      return <VideoBlock content={content} />;
    case 'accordion':
      return <AccordionBlock content={content} />;
    case 'tabs':
      return <TabsBlock content={content} />;
    default:
      return null;
  }
}

function HeadingBlock({ content }: { content: { text: string; level?: number; align?: string } }) {
  // A legacy `gradient` flag may exist in stored content; headings are always solid text now.
  const base = `font-semibold tracking-[-0.015em] text-fg ${alignClass(content.align)}`;
  switch (content.level) {
    case 1:
      return <h1 className={`text-3xl sm:text-4xl ${base}`}>{content.text}</h1>;
    case 3:
      return <h3 className={`text-lg ${base}`}>{content.text}</h3>;
    default:
      return <h2 className={`text-2xl ${base}`}>{content.text}</h2>;
  }
}

function TextBlock({ content }: { content: { text: string; align?: string } }) {
  return (
    <div
      className={`max-w-3xl whitespace-pre-wrap text-base leading-[1.7] text-fg-muted ${
        content.align === 'center' ? 'mx-auto' : content.align === 'right' ? 'ml-auto' : ''
      } ${alignClass(content.align)}`}
    >
      {content.text}
    </div>
  );
}

function ImageBlock({ content }: { content: { url: string; alt?: string; caption?: string } }) {
  return (
    <figure className="space-y-2">
      <div className="overflow-hidden rounded-card border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={content.url} alt={content.alt || ''} className="h-auto w-full object-cover" />
      </div>
      {content.caption && <figcaption className="text-center text-xs text-fg-subtle">{content.caption}</figcaption>}
    </figure>
  );
}

function GalleryBlock({ content }: { content: { images: Array<{ url: string; alt?: string }> } }) {
  if (!content.images?.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {content.images.map((img, i) => (
        <div key={i} className="aspect-square overflow-hidden rounded-card border border-line bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt={img.alt || ''} className="h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}

function BannerBlock({
  content,
}: {
  content: { imageUrl?: string; title?: string; subtitle?: string; buttonText?: string; buttonLink?: string };
}) {
  return (
    <section className="relative overflow-hidden rounded-card border border-line bg-surface">
      {content.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={content.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
      )}
      <div className="relative flex min-h-[280px] flex-col justify-end gap-3 p-6 sm:min-h-[360px] sm:p-10">
        {content.title && (
          <h2 className="max-w-2xl text-2xl font-semibold tracking-[-0.015em] text-fg sm:text-4xl">{content.title}</h2>
        )}
        {content.subtitle && <p className="max-w-xl text-base text-fg-muted">{content.subtitle}</p>}
        {content.buttonText && content.buttonLink && (
          <div className="pt-2">
            <SmartLink href={content.buttonLink} className={buttonVariants({ size: 'lg' })}>
              {content.buttonText}
            </SmartLink>
          </div>
        )}
      </div>
    </section>
  );
}

function ButtonBlock({ content }: { content: { text: string; link?: string; style?: string } }) {
  const variant = content.style === 'secondary' || content.style === 'outline' ? 'secondary' : 'primary';
  if (!content.link) return <span className={buttonVariants({ variant })}>{content.text}</span>;
  return (
    <SmartLink href={content.link} className={buttonVariants({ variant })}>
      {content.text}
    </SmartLink>
  );
}

function SpacerBlock({ content }: { content: { height?: number } }) {
  return <div aria-hidden="true" style={{ height: Math.min(Math.max(content.height || 40, 0), 240) }} />;
}

function HtmlBlock({ content }: { content: { html?: string } }) {
  if (!content.html) return null;
  // Admin-authored CMS HTML; behaviour unchanged from the previous page (not sanitized client-side).
  return (
    <div
      className={cn(RICH_TEXT_HTML, 'max-w-3xl')}
      dangerouslySetInnerHTML={{ __html: content.html }}
    />
  );
}

function ProductListBlock({ content }: { content: { limit?: number; featured?: boolean; categoryId?: number } }) {
  const limit = content.limit || 8;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['products-block', content],
    queryFn: () =>
      content.featured
        ? productApi.getFeatured().then((res) => res.data)
        : productApi.getAll({ categoryId: content.categoryId, limit }).then((res) => res.data),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorMessage message="โหลดรายการสินค้าไม่สำเร็จ" onRetry={() => refetch()} />;
  }

  const products: any[] = data?.products || [];
  if (products.length === 0) {
    return <EmptyState title="ยังไม่มีสินค้าในส่วนนี้" description="ดูสินค้าทั้งหมดได้ที่ร้านค้า" />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {products.slice(0, limit).map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

function CountdownBlock({ content }: { content: { title?: string; endDate?: string } }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (!content.endDate) return;
    const calculateTime = () => {
      const diff = new Date(content.endDate!).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      setTimeLeft({
        days: Math.floor(diff / 86_400_000),
        hours: Math.floor((diff % 86_400_000) / 3_600_000),
        minutes: Math.floor((diff % 3_600_000) / 60_000),
        seconds: Math.floor((diff % 60_000) / 1000),
      });
    };
    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [content.endDate]);

  const units = [
    { label: 'วัน', value: timeLeft.days },
    { label: 'ชั่วโมง', value: timeLeft.hours },
    { label: 'นาที', value: timeLeft.minutes },
    { label: 'วินาที', value: timeLeft.seconds },
  ];

  return (
    <Card padding="lg" className="text-center">
      {content.title && <h3 className="text-lg font-semibold text-fg">{content.title}</h3>}
      <div className="mt-6 grid grid-cols-4 gap-2 sm:mx-auto sm:max-w-md sm:gap-3" role="timer" aria-live="off">
        {units.map((item) => (
          <div key={item.label} className="rounded-control border border-line bg-surface-2 px-2 py-3">
            <div className="font-mono text-2xl tabular-nums text-fg sm:text-3xl">
              {item.value.toString().padStart(2, '0')}
            </div>
            <div className="mt-1 text-xs text-fg-subtle">{item.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function VideoBlock({ content }: { content: { url?: string; autoplay?: boolean } }) {
  if (!content.url) return null;
  const youtubeMatch = content.url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  const src = youtubeMatch
    ? `https://www.youtube.com/embed/${youtubeMatch[1]}${content.autoplay ? '?autoplay=1&mute=1' : ''}`
    : content.url;
  return (
    <div className="relative aspect-video overflow-hidden rounded-card border border-line bg-surface-2">
      <iframe
        src={src}
        title="วิดีโอ"
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

function AccordionBlock({ content }: { content: { items?: Array<{ title: string; content: string }> } }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (!content.items?.length) return null;
  return (
    <div className="divide-y divide-line rounded-card border border-line bg-surface">
      {content.items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={i}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenIndex(open ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-sm font-medium text-fg transition-colors duration-fast hover:bg-surface-2 sm:px-5"
            >
              <span>{item.title}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-fg-muted ${open ? 'rotate-180' : ''}`}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
            {open && (
              <div className="whitespace-pre-wrap px-4 pb-4 text-sm leading-[1.7] text-fg-muted sm:px-5">
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TabsBlock({ content }: { content: { tabs?: Array<{ title: string; content: string }> } }) {
  const [activeTab, setActiveTab] = useState('0');
  if (!content.tabs?.length) return null;
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList aria-label="หัวข้อ">
        {content.tabs.map((tab, i) => (
          <TabsTrigger key={i} value={String(i)}>
            {tab.title}
          </TabsTrigger>
        ))}
      </TabsList>
      {content.tabs.map((tab, i) => (
        <TabsPanel key={i} value={String(i)} className="pt-4">
          <Card className="whitespace-pre-wrap text-sm leading-[1.7] text-fg-muted">{tab.content}</Card>
        </TabsPanel>
      ))}
    </Tabs>
  );
}
