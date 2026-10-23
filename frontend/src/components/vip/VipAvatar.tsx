'use client';

/**
 * Avatar with the VIP frame for its frameStyle (CSS: src/app/vip-frames.css).
 * Without a VIP badge it renders the plain avatar, so callers can use it
 * everywhere an avatar appears (navbar, profile, rankings, chat, market).
 */
import * as React from 'react';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveFrameStyle, type VipBadge } from '@/lib/vip';

export interface VipAvatarProps {
  /** Image URL; falls back to `fallback` or the name's initials. */
  src?: string | null;
  name?: string | null;
  /** Pixel size of the whole avatar (frame included). */
  size: number;
  vip?: VipBadge | null;
  shape?: 'circle' | 'rounded';
  /** Show the small tier label under the frame (default: true when size >= 40). */
  showLabel?: boolean;
  fallback?: React.ReactNode;
  /** Classes for the plain (non-VIP) avatar wrapper, e.g. an existing border. */
  plainClassName?: string;
  className?: string;
}

function initials(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  return n ? n.slice(0, 2).toUpperCase() : '?';
}

function AvatarContent({ src, name, fallback }: Pick<VipAvatarProps, 'src' | 'name' | 'fallback'>) {
  const [broken, setBroken] = React.useState(false);
  if (src && !broken) {
    // Discord / Steam CDNs: plain <img> so no remotePatterns config is needed.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  }
  return <>{fallback ?? <span className="text-[0.7em] font-semibold text-iris-pearl">{initials(name)}</span>}</>;
}

export function VipAvatar({
  src,
  name,
  size,
  vip,
  shape = 'circle',
  showLabel,
  fallback,
  plainClassName,
  className,
}: VipAvatarProps) {
  const style: React.CSSProperties = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) };
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-2xl';

  if (!vip) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden bg-white/[0.04] [&>img]:h-full [&>img]:w-full [&>img]:object-cover',
          radius,
          plainClassName,
          className,
        )}
        style={style}
        aria-hidden={name ? undefined : true}
        title={name ?? undefined}
      >
        <AvatarContent src={src} name={name} fallback={fallback} />
      </span>
    );
  }

  const label = showLabel ?? size >= 40;
  const frame = resolveFrameStyle(vip.frameStyle);
  return (
    <span
      className={cn('vip-frame', className)}
      data-frame={frame}
      data-shape={shape}
      data-size={size >= 72 ? 'lg' : undefined}
      style={style}
      title={name ? `${name} · ${vip.label}` : vip.label}
    >
      <span className="vip-frame-inner">
        <AvatarContent src={src} name={name} fallback={fallback} />
      </span>
      {label && (
        <span className="vip-frame-label" aria-hidden="true">
          {vip.label}
        </span>
      )}
      <span className="sr-only">สมาชิก {vip.label}</span>
    </span>
  );
}

/** Inline VIP pill (P2P seller, chat names, admin rows). Renders nothing for non-VIP. */
export function VipBadgePill({ vip, className }: { vip?: VipBadge | null; className?: string }) {
  if (!vip) return null;
  return (
    <span className={cn('vip-badge', className)} data-frame={resolveFrameStyle(vip.frameStyle)} title={`สมาชิก ${vip.label}`}>
      <Crown aria-hidden="true" />
      {vip.label}
    </span>
  );
}
