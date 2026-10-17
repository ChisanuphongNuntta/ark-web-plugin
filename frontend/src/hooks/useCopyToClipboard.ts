'use client';

import * as React from 'react';

/**
 * Copy text to the clipboard. `copied` is true for `resetMs` after a success.
 * Falls back to a hidden textarea when the async Clipboard API is unavailable
 * (http origins, older browsers).
 */
export function useCopyToClipboard(resetMs = 1800) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const copy = React.useCallback(
    async (text: string): Promise<boolean> => {
      let ok = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          ok = true;
        }
      } catch {
        ok = false;
      }
      if (!ok) {
        try {
          const el = document.createElement('textarea');
          el.value = text;
          el.setAttribute('readonly', '');
          el.style.position = 'fixed';
          el.style.opacity = '0';
          document.body.appendChild(el);
          el.select();
          ok = document.execCommand('copy');
          document.body.removeChild(el);
        } catch {
          ok = false;
        }
      }
      if (ok) {
        setCopied(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), resetMs);
      }
      return ok;
    },
    [resetMs]
  );

  return { copied, copy };
}
