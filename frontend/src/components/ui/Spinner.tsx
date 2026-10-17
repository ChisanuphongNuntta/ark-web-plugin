import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Inline loading indicator. Pair with visible text or pass `label` for screen readers. */
export function Spinner({ className, label = 'กำลังโหลด', size = 16 }: { className?: string; label?: string; size?: number }) {
  return (
    <span role="status" className={cn('inline-flex items-center text-fg-muted', className)}>
      <Loader2 className="animate-spin" width={size} height={size} strokeWidth={1.5} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default Spinner;
