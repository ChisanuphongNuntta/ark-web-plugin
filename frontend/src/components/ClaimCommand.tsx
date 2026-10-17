import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The in-game command that pulls queued deliveries. The plugin registers both
 * `/iris claim` and `/claim`, but its own confirmation message says
 * `/iris claim`, so the site uses that form everywhere.
 */
export const CLAIM_COMMAND = '/iris claim';

/** Inline mono rendering of the claim command. */
export function ClaimCommand({ className }: { className?: string }) {
  return (
    <code
      className={cn(
        'whitespace-nowrap rounded-control border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg',
        className
      )}
    >
      {CLAIM_COMMAND}
    </code>
  );
}

/** Renders plain copy, swapping each occurrence of CLAIM_COMMAND for <ClaimCommand />. */
export function withClaimCommand(text: string): React.ReactNode {
  const parts = text.split(CLAIM_COMMAND);
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {part}
      {i < parts.length - 1 ? <ClaimCommand /> : null}
    </React.Fragment>
  ));
}
