import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Inner padding. Use 'none' when composing CardHeader/CardContent. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Hover border for clickable cards (no lift, no glow). */
  interactive?: boolean;
  /** surface (default) or surface-2 for nested/inset blocks. */
  tone?: 'surface' | 'inset';
  as?: 'div' | 'section' | 'article' | 'aside' | 'li';
}

const PADDING = { none: '', sm: 'p-4', md: 'p-5 sm:p-6', lg: 'p-6 sm:p-8' };

/** Card — 10px radius, 1px hairline, flat surface. No shadow. */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, padding = 'md', interactive = false, tone = 'surface', as: Tag = 'div', ...props },
  ref
) {
  // Semantic tag only; typed as div for the shared HTMLDivElement ref.
  const Comp = Tag as 'div';
  return (
    <Comp
      ref={ref}
      className={cn(
        'relative min-w-0 rounded-card border border-line text-fg',
        tone === 'inset' ? 'bg-surface-2' : 'bg-surface',
        PADDING[padding],
        interactive && 'transition-colors duration-fast hover:border-line-strong',
        className
      )}
      {...props}
    />
  );
});

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned actions (buttons, links). */
  actions?: React.ReactNode;
  /** Draw a hairline under the header (for padding="none" cards). */
  divided?: boolean;
}

export function CardHeader({ title, description, actions, divided = false, className, children, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3',
        divided && 'border-b border-line px-5 py-4 sm:px-6',
        className
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        {title ? <CardTitle>{title}</CardTitle> : null}
        {description ? <CardDescription>{description}</CardDescription> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold leading-snug text-fg', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-sm text-fg-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-5 sm:px-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 border-t border-line px-5 py-4 sm:px-6', className)} {...props} />;
}

export interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Remove body padding (tables that run edge to edge). */
  flush?: boolean;
}

/**
 * Panel — a titled section container (admin blocks, settings groups):
 * header row with title/actions, hairline, then content.
 */
export function Panel({ title, description, actions, flush = false, className, children, ...props }: PanelProps) {
  return (
    <section className={cn('min-w-0 rounded-card border border-line bg-surface', className)} {...props}>
      {title || actions ? (
        <CardHeader title={title} description={description} actions={actions} divided />
      ) : null}
      <div className={flush ? '' : 'px-5 py-5 sm:px-6'}>{children}</div>
    </section>
  );
}

export default Card;
