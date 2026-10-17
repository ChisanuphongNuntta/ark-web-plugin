'use client';

/**
 * Overlay plumbing shared by Dialog, Drawer, Menu and Toast:
 * client-only portal, focus trap with focus restore, Escape handling and
 * body scroll lock (reference-counted so stacked overlays behave).
 */
import * as React from 'react';
import { createPortal } from 'react-dom';

const subscribeNoop = () => () => {};

/** True after hydration on the client; false during SSR. */
export function useIsClient(): boolean {
  return React.useSyncExternalStore(subscribeNoop, () => true, () => false);
}

/** Render children into document.body (client only). */
export function Portal({ children }: { children: React.ReactNode }) {
  const isClient = useIsClient();
  if (!isClient) return null;
  return createPortal(children, document.body);
}

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null
  );
}

let scrollLocks = 0;
let savedOverflow = '';
let savedPaddingRight = '';

/** Lock body scroll while `active` (compensates for the scrollbar width). */
export function useScrollLock(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const body = document.body;
    if (scrollLocks === 0) {
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      savedOverflow = body.style.overflow;
      savedPaddingRight = body.style.paddingRight;
      body.style.overflow = 'hidden';
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    }
    scrollLocks += 1;
    return () => {
      scrollLocks -= 1;
      if (scrollLocks === 0) {
        body.style.overflow = savedOverflow;
        body.style.paddingRight = savedPaddingRight;
      }
    };
  }, [active]);
}

/**
 * Trap Tab focus inside `ref` while `active`, move focus in on open
 * (`initialFocus` or the first focusable / the container) and restore it to
 * the previously focused element on close.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  initialFocus?: React.RefObject<HTMLElement | null>
) {
  React.useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      const target = initialFocus?.current ?? getFocusable(container)[0] ?? container;
      target.focus({ preventScroll: true });
    };
    const raf = window.requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = getFocusable(container);
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function' && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [ref, active, initialFocus]);
}

/** Stack of open overlays so Escape closes only the top-most one. */
const escapeStack: symbol[] = [];

/** Call `onEscape` when Escape is pressed while `active` and this overlay is top-most. */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  const handler = React.useRef(onEscape);
  React.useEffect(() => {
    handler.current = onEscape;
  }, [onEscape]);
  React.useEffect(() => {
    if (!active) return;
    const token = Symbol('overlay');
    escapeStack.push(token);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || escapeStack[escapeStack.length - 1] !== token) return;
      event.preventDefault();
      handler.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const idx = escapeStack.lastIndexOf(token);
      if (idx >= 0) escapeStack.splice(idx, 1);
    };
  }, [active]);
}

/** Close when a pointer goes down outside every ref in `refs`. */
export function useOutsidePointer(
  refs: Array<React.RefObject<HTMLElement | null>>,
  active: boolean,
  onOutside: () => void
) {
  const handler = React.useRef(onOutside);
  React.useEffect(() => {
    handler.current = onOutside;
  }, [onOutside]);
  React.useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (refs.every((r) => !r.current?.contains(target))) handler.current();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable objects
  }, [active]);
}
