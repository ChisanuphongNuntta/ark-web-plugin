import type { SVGProps } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Tek replacement for decorative arrow icons: a small hexagon mark.
 * Same prop surface as lucide icons (size, className, aria-*) so call sites need no changes.
 */
type MarkProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & { size?: number | string; strokeWidth?: number | string };

function HexMark({ size = 16, strokeWidth = 2, className, ...rest }: MarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="miter"
      className={className}
      aria-hidden={rest['aria-label'] ? undefined : true}
      {...rest}
    >
      <path d="M7 4.5h10l5 7.5-5 7.5H7L2 12z" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export const ArrowRight = HexMark as unknown as LucideIcon;
export const ArrowLeft = HexMark as unknown as LucideIcon;
export const ArrowUp = HexMark as unknown as LucideIcon;
export const ArrowDown = HexMark as unknown as LucideIcon;
export const ArrowUpRight = HexMark as unknown as LucideIcon;
export const ExternalLink = HexMark as unknown as LucideIcon;
