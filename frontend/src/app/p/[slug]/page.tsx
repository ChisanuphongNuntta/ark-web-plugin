'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { contentApi, productApi } from '@/lib/api';
import { Loader2, FileX } from 'lucide-react';
import LaserCard from '@/components/LaserCard';
import LaserButton from '@/components/LaserButton';
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
    queryFn: () => contentApi.getPublicPageBySlug(slug).then(res => res.data),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-pulse"></div>
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400 relative" />
        </div>
      </div>
    );
  }

  if (error || !data?.page) {
    return (
      <div className="text-center py-24">
        <div className="relative inline-block mb-4">
          <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl"></div>
          <FileX className="h-16 w-16 text-red-400/50 relative mx-auto" />
        </div>
        <h1 className="text-2xl font-bold text-gray-300 mb-2">ไม่พบหน้าที่ต้องการ</h1>
        <p className="text-gray-500 mb-6">หน้านี้อาจถูกลบไปแล้วหรือยังไม่ถูกเผยแพร่</p>
        <Link href="/">
          <LaserButton>กลับหน้าแรก</LaserButton>
        </Link>
      </div>
    );
  }

  const page: DynamicPage = data.page;

  return (
    <div className={`space-y-6 ${page.layout === 'full-width' ? 'max-w-none px-0' : ''}`}>
      {page.blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}

// Block Renderer Component
function BlockRenderer({ block }: { block: ContentBlock }) {
  const { blockType, content, settings } = block;

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
    case 'product-list':
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

// Individual Block Components

function HeadingBlock({ content }: { content: { text: string; level: number } }) {
  const { text, level = 2 } = content;

  const sizes: Record<number, string> = {
    1: 'text-4xl md:text-5xl',
    2: 'text-3xl md:text-4xl',
    3: 'text-2xl md:text-3xl',
    4: 'text-xl md:text-2xl',
    5: 'text-lg md:text-xl',
    6: 'text-base md:text-lg',
  };

  return (
    <div className="relative inline-block">
      <div className="absolute inset-0 bg-emerald-500/10 rounded-2xl blur-xl"></div>
      <h2
        className={`${sizes[level]} font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent relative`}
      >
        {text}
      </h2>
    </div>
  );
}

function TextBlock({ content }: { content: { text: string } }) {
  // Simple markdown-like rendering
  const renderText = (text: string) => {
    return text.split('\n').map((line, i) => (
      <p key={i} className="mb-2 last:mb-0">
        {line || <br />}
      </p>
    ));
  };

  return (
    <div className="text-gray-300 leading-relaxed prose prose-invert max-w-none">
      {renderText(content.text || '')}
    </div>
  );
}

function ImageBlock({ content }: { content: { url: string; alt?: string; caption?: string } }) {
  if (!content.url) return null;

  return (
    <figure className="relative group">
      <div className="absolute -inset-2 bg-gradient-to-r from-emerald-600/20 via-cyan-600/20 to-emerald-600/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20">
        <img
          src={content.url}
          alt={content.alt || ''}
          className="w-full h-auto"
        />
      </div>
      {content.caption && (
        <figcaption className="text-center text-sm text-gray-500 mt-3">
          {content.caption}
        </figcaption>
      )}
    </figure>
  );
}

function GalleryBlock({ content }: { content: { images: Array<{ url: string; alt?: string }>; columns?: number } }) {
  const columns = content.columns || 3;
  const gridCols: Record<number, string> = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
  };

  return (
    <div className={`grid ${gridCols[columns] || gridCols[3]} gap-4`}>
      {content.images?.map((image, i) => (
        <div key={i} className="relative group aspect-square overflow-hidden rounded-xl border border-emerald-500/20">
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10"></div>
          <img
            src={image.url}
            alt={image.alt || ''}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        </div>
      ))}
    </div>
  );
}

function BannerBlock({ content }: { content: { imageUrl?: string; title?: string; subtitle?: string; buttonText?: string; buttonLink?: string } }) {
  return (
    <LaserCard withBeam>
      <div
        className="relative min-h-[300px] md:min-h-[400px] flex items-center justify-center p-8 overflow-hidden rounded-2xl"
        style={{
          backgroundImage: content.imageUrl ? `url(${content.imageUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30"></div>

        {/* Content */}
        <div className="relative z-10 text-center">
          {content.title && (
            <h2 className="text-3xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              {content.title}
            </h2>
          )}
          {content.subtitle && (
            <p className="text-xl text-gray-300 mb-6">{content.subtitle}</p>
          )}
          {content.buttonText && content.buttonLink && (
            <Link href={content.buttonLink}>
              <LaserButton size="lg">{content.buttonText}</LaserButton>
            </Link>
          )}
        </div>
      </div>
    </LaserCard>
  );
}

function ButtonBlock({ content }: { content: { text: string; link?: string; style?: string } }) {
  const styles: Record<string, { variant: 'primary' | 'secondary' | 'gold' | 'danger' }> = {
    primary: { variant: 'primary' },
    secondary: { variant: 'secondary' },
    success: { variant: 'gold' },
    danger: { variant: 'danger' },
  };

  const buttonStyle = styles[content.style || 'primary'] || styles.primary;

  if (!content.link) {
    return <LaserButton variant={buttonStyle.variant}>{content.text}</LaserButton>;
  }

  return (
    <Link href={content.link}>
      <LaserButton variant={buttonStyle.variant}>{content.text}</LaserButton>
    </Link>
  );
}

function DividerBlock({ content }: { content: { style?: string } }) {
  const styleClass: Record<string, string> = {
    solid: 'border-t border-emerald-500/30',
    dashed: 'border-t border-dashed border-emerald-500/30',
    dotted: 'border-t border-dotted border-emerald-500/30',
    gradient: 'h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent',
  };

  return (
    <div className={`my-8 ${styleClass[content.style || 'gradient'] || styleClass.gradient}`}></div>
  );
}

function SpacerBlock({ content }: { content: { height?: number } }) {
  return <div style={{ height: content.height || 40 }}></div>;
}

function HtmlBlock({ content }: { content: { html?: string } }) {
  if (!content.html) return null;

  return (
    <div
      className="prose prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: content.html }}
    />
  );
}

function ProductListBlock({ content }: { content: { limit?: number; featured?: boolean; categoryId?: number } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['products-block', content],
    queryFn: () =>
      content.featured
        ? productApi.getFeatured().then(res => res.data)
        : productApi.getAll({
            categoryId: content.categoryId,
            limit: content.limit || 8,
          }).then(res => res.data),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  const products = data?.products || [];

  if (products.length === 0) {
    return (
      <LaserCard>
        <div className="text-center py-8 text-gray-400">ไม่พบสินค้า</div>
      </LaserCard>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
    <LaserCard withBeam glowOnHover>
      <div className="p-8 text-center">
        {content.title && (
          <h3 className="text-2xl font-bold mb-6 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            {content.title}
          </h3>
        )}

        <div className="flex justify-center gap-4 md:gap-8">
          {[
            { label: 'Days', value: timeLeft.days },
            { label: 'Hours', value: timeLeft.hours },
            { label: 'Minutes', value: timeLeft.minutes },
            { label: 'Seconds', value: timeLeft.seconds },
          ].map((item) => (
            <div key={item.label} className="relative">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-xl blur-lg"></div>
              <div className="relative bg-black/60 border border-emerald-500/30 rounded-xl p-4 min-w-[80px]">
                <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  {item.value.toString().padStart(2, '0')}
                </div>
                <div className="text-xs text-gray-500 uppercase mt-1">{item.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </LaserCard>
  );
}

function VideoBlock({ content }: { content: { url?: string; autoplay?: boolean } }) {
  if (!content.url) return null;

  // Convert YouTube URL to embed URL
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
    <div className="relative aspect-video rounded-2xl overflow-hidden border border-emerald-500/20">
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
        <LaserCard key={i}>
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <span className="font-medium">{item.title}</span>
            <span
              className={`transform transition-transform ${
                openIndex === i ? 'rotate-180' : ''
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>
          {openIndex === i && (
            <div className="px-4 pb-4 text-gray-400">{item.content}</div>
          )}
        </LaserCard>
      ))}
    </div>
  );
}

function TabsBlock({ content }: { content: { tabs?: Array<{ title: string; content: string }> } }) {
  const [activeTab, setActiveTab] = useState(0);

  if (!content.tabs?.length) return null;

  return (
    <div>
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {content.tabs.map((tab, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === i
                ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 text-white'
                : 'bg-black/40 border border-emerald-500/30 hover:border-emerald-500/50'
            }`}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <LaserCard>
        <div className="p-6 text-gray-300">
          {content.tabs[activeTab]?.content}
        </div>
      </LaserCard>
    </div>
  );
}
