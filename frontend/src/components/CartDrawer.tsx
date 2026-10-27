'use client';
import { IrisCoin } from '@/components/ui/IrisCoin';
import { T } from '@/components/i18n/LanguageProvider';


import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import {  Loader2, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { ArrowRight } from '@/components/tek/arrows';
import { useQueries } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ProductArtwork } from '@/components/ProductArtwork';
import { shopApi } from '@/lib/contracts/client';
import type { Product } from '@/lib/contracts/types';
import { cartLineKey, useCartStore } from '@/lib/store';

export function CartDrawer() {
  const { items, isDrawerOpen, setDrawerOpen, removeItem, setQuantity } = useCartStore();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const portalRef = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const productQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ['product-drawer-contract', item.productId, item.serverId],
      queryFn: () => shopApi.getProduct(item.productId).then((response) => response.product),
      staleTime: 5 * 60 * 1000,
    })),
  });

  React.useEffect(() => {
    if (!isDrawerOpen || !mounted) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const background = Array.from(document.body.children)
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== portalRef.current && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName))
      .map((node) => ({ node, inert: node.inert }));
    background.forEach(({ node }) => { node.inert = true; });
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])
      .filter((node) => node.getClientRects().length > 0);
    const frame = window.requestAnimationFrame(() => focusable()[0]?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setDrawerOpen(false); }
      if (event.key === 'Tab') {
        const controls = focusable();
        const first = controls[0], last = controls.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      background.forEach(({ node, inert }) => { node.inert = inert; });
      if (opener?.isConnected) opener.focus();
    };
  }, [isDrawerOpen, setDrawerOpen, mounted]);

  // Display-only estimate from catalog unit prices. Checkout page fetches the
  // authoritative Backend Total before payment.
  const estimateSubtotal = React.useMemo(() => {
    return items.reduce((sum, item, index) => {
      const product = productQueries[index]?.data as Product | undefined;
      return product ? sum + product.price * item.quantity : sum;
    }, 0);
  }, [items, productQueries]);

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  if (!mounted) return null;
  return createPortal(
    <div ref={portalRef}>
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-[100] bg-surface-0/80 backdrop-blur-sm"
            aria-hidden="true"
          />

          <motion.div
            ref={dialogRef}
            initial={{ x: reduceMotion ? 0 : '100%' }}
            animate={{ x: 0 }}
            exit={{ x: reduceMotion ? 0 : '100%' }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 30, stiffness: 260 }}
            className="tek-frame fixed top-0 right-0 bottom-0 z-[110] flex w-full max-w-md flex-col border-l border-cyan-500/30 bg-surface-1 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="ตะกร้าสินค้าของคุณ"
          >
            <div className="flex items-center justify-between border-b border-white/5 bg-gradient-to-r from-iris-river/20 to-transparent p-5">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-iris-cyan" />
                <h3 className="font-display text-base font-bold uppercase tracking-wide text-iris-pearl"><T text={"ตะกร้าสินค้า"} /></h3>
                <span className="rounded-full bg-iris-cyan/10 px-2 py-0.5 font-mono text-xs text-iris-cyan">
                  {totalQuantity}<T text={"ชิ้น"} /></span>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan"
                aria-label="ปิดตะกร้า"
              >
                <X className="h-4 w-4 text-iris-pearl" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-12 text-center text-xs text-iris-muted">
                  <ShoppingCart className="mb-4 h-12 w-12 text-iris-cyan/30" />
                  <p className="font-bold uppercase tracking-wide text-iris-pearl"><T text={"ตะกร้าของคุณยังว่าง"} /></p>
                  <p className="mt-1 max-w-[220px]"><T text={"เลือกสินค้าและเซิร์ฟเวอร์ปลายทางก่อนเข้าสู่ checkout"} /></p>
                  <Button variant="cyan" size="sm" className="mt-5" onClick={() => setDrawerOpen(false)}><T text={"เลือกสินค้าต่อ"} /></Button>
                </div>
              ) : (
                items.map((item, index) => {
                  const query = productQueries[index];
                  const product = query?.data as Product | undefined;
                  const lineKey = cartLineKey(item.productId, item.serverId);

                  if (query?.isLoading) {
                    return (
                      <div key={lineKey} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                        <Loader2 className="h-4 w-4 animate-spin text-iris-cyan" />
                        <span className="text-xs text-iris-muted"><T text={"กำลังดึงข้อมูลสินค้า..."} /></span>
                      </div>
                    );
                  }

                  if (!product) {
                    return (
                      <div key={lineKey} className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/15 bg-rose-500/5 p-3 text-xs text-rose-200">
                        <span><T text={"โหลดสินค้า #"} />{item.productId}<T text={" ไม่สำเร็จ"} /></span>
                        <button
                          type="button"
                          className="font-bold text-rose-300 hover:underline"
                          onClick={() => removeItem(item.productId, item.serverId)}
                        ><T text={"นำออก"} /></button>
                      </div>
                    );
                  }

                  return (
                    <article
                      key={lineKey}
                      className="group relative grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-2xl border border-white/5 bg-black/30 p-3.5 transition hover:border-white/10"
                    >
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40">
                        <ProductArtwork product={product} alt={product.name} className="h-full w-full" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-medium text-iris-cyan">
                          {product.category?.name || 'IRIS Store'}
                        </p>
                        <h4 className="truncate text-sm font-semibold text-iris-pearl" title={product.name}>{product.name}</h4>
                        <div className="mt-1 flex items-center gap-1 text-xs font-bold text-iris-gold">
                          <IrisCoin className="h-3.5 w-3.5" />
                          <span>{product.price.toLocaleString()}<T text={" IC / หน่วย"} /></span>
                        </div>
                        <p className="mt-1 font-mono text-[9px] text-iris-muted"><T text={"เซิร์ฟเวอร์ #"} />{item.serverId}
                        </p>
                      </div>

                      <div className="col-span-2 flex items-center justify-between gap-3 border-t border-white/5 pt-2">
                        <button
                          type="button"
                          onClick={() => removeItem(item.productId, item.serverId)}
                          className="grid h-11 w-11 place-items-center rounded-full text-iris-muted transition hover:bg-rose-500/10 hover:text-rose-300"
                          aria-label={`ลบ ${product.name} ออกจากตะกร้า`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                        <div className="flex h-12 items-center rounded-full border border-white/10 bg-black/40">
                          <button
                            type="button"
                            onClick={() => setQuantity(item.productId, item.serverId, item.quantity - 1)}
                            className="flex h-full w-11 items-center justify-center rounded-full text-iris-muted hover:bg-white/5 hover:text-white disabled:opacity-30"
                            disabled={item.quantity <= 1}
                            aria-label={`ลดจำนวน ${product.name}`}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="min-w-6 text-center font-mono text-[11px] font-bold text-iris-pearl">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQuantity(item.productId, item.serverId, item.quantity + 1)}
                            className="flex h-full w-11 items-center justify-center rounded-full text-iris-muted hover:bg-white/5 hover:text-white"
                            aria-label={`เพิ่มจำนวน ${product.name}`}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {items.length > 0 && (
              <div className="space-y-4 border-t border-white/5 bg-black/40 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-semibold text-iris-pearl"><T text={"ยอดประเมินเบื้องต้น"} /></h4>
                    <p className="text-[10px] text-iris-muted"><T text={"ตรวจสอบยอดสุทธิได้อีกครั้งก่อนชำระเงิน"} /></p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-mono text-lg font-bold text-iris-gold">
                    <IrisCoin className="h-5 w-5 text-iris-gold" />
                    <span>~{estimateSubtotal.toLocaleString()}</span><span className="tk-sr">IC</span>
                  </div>
                </div>

                <Link href="/cart" className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-iris-cyan px-5 py-3 text-sm font-semibold text-iris-ink transition hover:bg-iris-pearl" onClick={() => setDrawerOpen(false)}>
                  <span><T text={"ไปที่ตะกร้าและชำระเงิน"} /></span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </div>, document.body
  );
}
