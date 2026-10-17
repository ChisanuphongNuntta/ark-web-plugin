import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = ['ตรวจรายการและเซิร์ฟเวอร์', 'ยืนยันยอดและชำระ', 'ส่งเข้าเกม'] as const;

/** Static three-step checkout indicator. `current` is 0-based. */
export function CheckoutSteps({ current, className }: { current: 0 | 1 | 2; className?: string }) {
  return (
    <ol className={cn('flex flex-wrap items-center gap-x-6 gap-y-2 text-xs', className)} aria-label="ขั้นตอนการสั่งซื้อ">
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={label}
            className={cn('inline-flex items-center gap-2', active ? 'text-fg' : done ? 'text-fg-muted' : 'text-fg-subtle')}
            aria-current={active ? 'step' : undefined}
          >
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[11px]',
                active ? 'border-accent text-accent' : done ? 'border-line-strong text-fg-muted' : 'border-line text-fg-subtle'
              )}
              aria-hidden="true"
            >
              {done ? <Check className="h-3 w-3" strokeWidth={2} /> : index + 1}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
