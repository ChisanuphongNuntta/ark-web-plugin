'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { contentApi, productApi } from '@/lib/api';
import { Loader2, FileX, ChevronDown } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { ProductCard } from '@/components/ProductCard';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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

export default function DynamicPageRenderer() {
  const params = useParams();
  const slug = params.slug as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-page', slug],
    queryFn: () => contentApi.getPublicPageBySlug(slug).then((res) => res.data),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="page-shell flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-iris-cyan" />
      </div>
    );
  }

  if (error || !data?.page) {
    return (
      <div className="page-shell max-w-2xl mx-auto py-24 text-center space-y-4 animate-slide-up">
        <GlassCard className="p-12 text-center">
          <FileX className="mx-auto h-12 w-12 text-rose-400 mb-3" />
          <h1 className="text-2xl font-bold text-iris-pearl">ไม่พบหน้าที่ต้องการ</h1>
          <p className="text-xs text-iris-muted mt-1">หน้านี้อาจถูกลบไปแล้วหรือยังไม่ถูกเผยแพร่ในระบบ</p>
          <div className="mt-6">
            <Link href="/">
              <Button variant="primary">กลับหน้าแรก</Button>
            </Link>
          </div>
        </GlassCard>
      </div>
    );
  }

  const page: DynamicPage = data.page;

  return (
    <div className={`page-shell max-w-7xl mx-auto py-8 sm:py-12 space-y-8 animate-slide-up ${page.layout === 'full-width' ? 'max-w-none px-0' : ''}`}>
      {page.blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}

// Block Renderer Component
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
      return <DividerBlock content={content} />;
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

function HeadingBlock({ content }: { content: { text: string; level?: number; align?: string; gradient?: boolean } }) {
  const alignClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  }[content.align || 'left'];

  const gradientClass = content.gradient
    ? 'bg-gradient-to-r from-iris-cyan via-iris-gold to-iris-orchid bg-clip-text text-transparent'
    : 'text-iris-pearl';

  switch (content.level) {
    case 1:
      return <h1 className={`text-4xl md:text-5xl font-black ${alignClass} ${gradientClass}`}>{content.text}</h1>;
    case 2:
      return <h2 className={`text-2xl md:text-3xl font-black ${alignClass} ${gradientClass}`}>{content.text}</h2>;
    case 3:
      return <h3 className={`text-xl md:text-2xl font-bold ${alignClass} ${gradientClass}`}>{content.text}</h3>;
    default:
      return <h2 className={`text-2xl md:text-3xl font-bold ${alignClass} ${gradientClass}`}>{content.text}</h2>;
  }
}

function TextBlock({ content }: { content: { text: string; align?: string } }) {
  const alignClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  }[content.align || 'left'];

  return (
    <div className={`text-iris-muted text-sm leading-relaxed whitespace-pre-wrap ${alignClass}`}>
      {content.text}
    </div>
  );
}

function ImageBlock({ content }: { content: { url: string; alt?: string; caption?: string } }) {
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl border border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={content.url} alt={content.alt || ''} className="w-full h-auto object-cover" />
      </div>
      {content.caption && (
        <p className="text-center text-xs text-iris-muted">{content.caption}</p>
      )}
    </div>
  );
}

function GalleryBlock({ content }: { content: { images: Array<{ url: string; alt?: string }> } }) {
  if (!content.images?.length) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {content.images.map((img, i) => (
        <div key={i} className="aspect-square rounded-2xl overflow-hidden border border-white/10 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.url}
            alt={img.alt || ''}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      ))}
    </div>
  );
}

function BannerBlock({ content }: { content: { imageUrl?: string; title?: string; subtitle?: string; buttonText?: string; buttonLink?: string } }) {
  return (
    <GlassCard variant="default" className="overflow-hidden">
      <div
        className="relative min-h-[300px] md:min-h-[400px] flex items-center justify-center p-8 text-center"
        style={{
          backgroundImage: content.imageUrl ? `url(${content.imageUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />
        <div className="relative z-10 max-w-2xl space-y-4">
          {content.title && (
            <h2 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-iris-cyan to-iris-gold">
              {content.title}
            </h2>
          )}
          {content.subtitle && (
            <p className="text-base text-iris-muted">{content.subtitle}</p>
          )}
          {content.buttonText && content.buttonLink && (
            <div className="pt-2">
              <Link href={content.buttonLink}>
                <Button variant="primary" size="lg">{content.buttonText}</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function ButtonBlock({ content }: { content: { text: string; link?: string; style?: string } }) {
  const button = <Button variant="primary">{content.text}</Button>;
  if (!content.link) return button;
  return <Link href={content.link}>{button}</Link>;
}

function DividerBlock({ content }: { content: { style?: string } }) {
  return <div className="my-8 h-px bg-white/10" />;
}

function SpacerBlock({ content }: { content: { height?: number } }) {
  return <div style={{ height: content.height || 40 }} />;
}

function HtmlBlock({ content }: { content: { html?: string } }) {
  if (!content.html) return null;
  return (
    <div
      className="prose prose-invert max-w-none text-iris-muted text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: content.html }}
    />
  );
}

function ProductListBlock({ content }: { content: { limit?: number; featured?: boolean; categoryId?: number } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['products-block', content],
    queryFn: () =>
      content.featured
        ? productApi.getFeatured().then((res) => res.data)
        : productApi.getAll({
            categoryId: content.categoryId,
            limit: content.limit || 8,
          }).then((res) => res.data),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-iris-cyan" />
      </div>
    );
  }

  const products = data?.products || [];

  if (products.length === 0) {
    return (
      <GlassCard className="p-8 text-center text-xs text-iris-muted">
        ไม่พบรายการสินค้า
      </GlassCard>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {products.slice(0, content.limit || 8).map((product: any) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

function CountdownBlock({ content }: { content: { title?: string; endDate?: string } }) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    if (!content.endDate) return;

    const calculateTime = () => {
      const end = new Date(content.endDate!).getTime();
      const now = new Date().getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [content.endDate]);

  return (
    <GlassCard variant="default" hoverEffect="glow" className="p-8 text-center space-y-6">
      {content.title && (
        <h3 className="text-2xl font-black text-iris-pearl">
          {content.title}
        </h3>
      )}

      <div className="flex justify-center gap-4">
        {[
          { label: 'Days', value: timeLeft.days },
          { label: 'Hours', value: timeLeft.hours },
          { label: 'Minutes', value: timeLeft.minutes },
          { label: 'Seconds', value: timeLeft.seconds },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-white/10 bg-black/50 p-4 min-w-[75px]">
            <div className="text-2xl sm:text-3xl font-black text-iris-cyan font-mono">
              {item.value.toString().padStart(2, '0')}
            </div>
            <div className="text-[10px] text-iris-muted uppercase font-bold mt-1">{item.label}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function VideoBlock({ content }: { content: { url?: string; autoplay?: boolean } }) {
  if (!content.url) return null;

  const getEmbedUrl = (url: string) => {
    const youtubeMatch = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}${content.autoplay ? '?autoplay=1' : ''}`;
    }
    return url;
  };

  return (
    <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10">
      <iframe
        src={getEmbedUrl(content.url)}
        className="w-full h-full"
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
    <div className="space-y-3">
      {content.items.map((item, i) => (
        <GlassCard key={i} className="overflow-hidden">
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full p-4 flex items-center justify-between text-left text-sm font-bold text-iris-pearl"
          >
            <span>{item.title}</span>
            <ChevronDown className={`h-4 w-4 text-iris-cyan transition-transform ${openIndex === i ? 'rotate-180' : ''}`} />
          </button>
          {openIndex === i && (
            <div className="px-4 pb-4 text-xs text-iris-muted border-t border-white/5 pt-3 leading-relaxed">
              {item.content}
            </div>
          )}
        </GlassCard>
      ))}
    </div>
  );
}

function TabsBlock({ content }: { content: { tabs?: Array<{ title: string; content: string }> } }) {
  const [activeTab, setActiveTab] = useState(0);

  if (!content.tabs?.length) return null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {content.tabs.map((tab, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === i
                ? 'bg-iris-cyan text-black'
                : 'bg-black/40 border border-white/10 text-iris-muted hover:border-white/20'
            }`}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <GlassCard className="p-6 text-sm text-iris-muted leading-relaxed">
        {content.tabs[activeTab]?.content}
      </GlassCard>
    </div>
  );
}
