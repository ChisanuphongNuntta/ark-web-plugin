import * as React from 'react';
import { cn } from '@/lib/utils';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required accessible name (Thai). */
  'aria-label': string;
  variant?: 'ghost' | 'secondary' | 'primary';
  size?: 'sm' | 'md' | 'lg';
}

const VARIANTS = {
  ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
  secondary: 'border border-line-strong text-fg hover:bg-surface-2',
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
};

// sm keeps a 40px touch target below the sm breakpoint (DESIGN.md §10).
const SIZES = { sm: 'h-10 w-10 sm:h-8 sm:w-8', md: 'h-10 w-10', lg: 'h-12 w-12' };

/** Square icon-only button. Children: one lucide icon at 16–18px, strokeWidth 1.5. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant = 'ghost', size = 'md', type = 'button', children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'relative inline-grid shrink-0 place-items-center rounded-control transition-colors duration-fast',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});

export default IconButton;
