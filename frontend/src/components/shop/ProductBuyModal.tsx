'use client';
import { T, useLanguage } from '@/components/i18n/LanguageProvider';


import * as React from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Check,
  Coins,
  CreditCard,
  Minus,
  Plus,
  ShoppingCart,
  Sparkles,
  X,
} from 'lucide-react';
import type { Product } from '@/lib/contracts/types';
import { useCartStore } from '@/lib/store';
import { Badge } from '@/components/ui/Badge';
import { ProductArtwork } from '@/components/ProductArtwork';
import { categoryLabel } from '@/lib/catalogLabels';
import { IrisCoin } from '@/components/ui/IrisCoin';

const qualityConfig: Record<
  number,
  { label: string; tone: string; badge: 'default' | 'success' | 'info' | 'orchid' | 'gold' | 'cyan' }
> = {
  0: { label: 'PRIMITIVE', tone: 'text-slate-300', badge: 'default' },
  1: { label: 'RAMSHACKLE', tone: 'text-emerald-300', badge: 'success' },
  2: { label: 'APPRENTICE', tone: 'text-sky-300', badge: 'info' },
  3: { label: 'JOURNEYMAN', tone: 'text-iris-orchid', badge: 'orchid' },
  4: { label: 'MASTERCRAFT', tone: 'text-iris-gold', badge: 'gold' },
  5: { label: 'ASCENDANT', tone: 'text-iris-cyan', badge: 'cyan' },
};

interface ProductBuyModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ProductBuyModal({ product, isOpen, onClose }: ProductBuyModalProps) {
  const { t } = useLanguage();
  const modalRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);
  React.useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const setDrawerOpen = useCartStore((state) => state.setDrawerOpen);

  const [mounted, setMounted] = React.useState(false);
  const [quantity, setQuantity] = React.useState(1);
  const [feedback, setFeedback] = React.useState<'idle' | 'added'>('idle');

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const quality = qualityConfig[product?.quality ?? 0] ?? qualityConfig[0];
  const isDino = product?.productType === 'dino';

  React.useEffect(() => {
    if (!isOpen) {
      setQuantity(1);
      setFeedback('idle');
      return;
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen || !mounted) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const background = Array.from(document.body.children)
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== modalRef.current && !['SCRIPT','STYLE','NOSCRIPT'].includes(node.tagName))
      .map((node) => ({ node, inert: node.inert }));
    background.forEach(({ node }) => { node.inert = true; });
    const controls = () => Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)') ?? []).filter((node) => node.getClientRects().length > 0);
    const frame = window.requestAnimationFrame(() => controls()[0]?.focus());
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
      if (e.key === 'Tab') {
        const list = controls(), first = list[0], last = list.at(-1);
        if (!first) { e.preventDefault(); return; }
        const outside = !modalRef.current?.contains(document.activeElement);
        if (e.shiftKey && (outside || document.activeElement === first)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (outside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      background.forEach(({ node, inert }) => { node.inert = inert; });
      window.removeEventListener('keydown', handleKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen, mounted]);

  if (!mounted || !isOpen || !product) return null;

  const totalPrice = product.price * quantity;

  const handleAddToCart = () => {
    addItem(product.id, quantity, false);
    setDrawerOpen(false);
    setFeedback('added');
    window.setTimeout(() => setFeedback('idle'), 2200);
  };

  // Buy now = put it in the basket and go to the payment page, where delivery is set (automatic by default).
  const handleCheckout = () => {
    addItem(product.id, quantity, false);
    setDrawerOpen(false);
    onClose();
    router.push('/cart');
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] m-0 w-screen h-screen flex items-center justify-center p-4 sm:p-6 bg-black/20 backdrop-blur-xl animate-in fade-in duration-200"
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`สั่งซื้อ ${product.name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tk-modal relative flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden bg-surface-1 transition-all">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-700/60 px-6 py-4 bg-surface-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-iris-gold" />
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
              {t(categoryLabel(product.category?.name || 'Items'), product.category?.name || 'Items')}
              <T text={product.isBlueprint ? ' · พิมพ์เขียว' : ''} />
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="ปิดหน้าต่างสั่งซื้อ"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="min-h-0 flex-1 p-6 space-y-6 max-h-[65dvh] overflow-y-auto overscroll-contain">
          <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
            {/* Artwork */}
            <div className="relative aspect-square overflow-hidden rounded-md border border-slate-700/50 bg-surface-2 flex items-center justify-center p-3">
              <ProductArtwork product={product} fit="contain" className="h-full w-full object-contain" />
              <div className="absolute top-2 left-2">
                <Badge variant={quality.badge}>{quality.label}</Badge>
              </div>
            </div>

            {/* Basic Info */}
            <div className="space-y-3">
              <h2 className="font-serif text-2xl font-normal text-iris-pearl leading-snug">
                {product.name}
              </h2>
              {product.description ? (
                <p className="text-xs text-iris-muted line-clamp-3 leading-relaxed">
                  {product.description}
                </p>
              ) : null}

              <div className="pt-2 flex items-baseline gap-2">
                <span className="text-xs uppercase tracking-wider text-iris-muted"><T text={"ราคาต่อหน่วย:"} /></span>
                <span className="font-mono text-2xl font-bold tabular-nums text-iris-pearl">
                  {product.price.toLocaleString()}
                </span>
                <IrisCoin size={22} /><span className="tk-sr">IC</span>
              </div>
            </div>
          </div>

          {/* Quantity and Subtotal */}
          <div className="flex items-center justify-between border-t border-slate-700/40 pt-4">
            <div>
              <p className="text-xs font-bold text-iris-pearl"><T text={"จำนวนสินค้า · Quantity"} /></p>
              <p className="text-[11px] text-iris-muted"><T text={"ยอดรวม:"} /><span className="inline-flex items-center gap-1 font-mono text-sm font-bold text-iris-gold tabular-nums">{totalPrice.toLocaleString()}<IrisCoin size={18} /><span className="tk-sr">IC</span></span>
              </p>
            </div>
            <div className="flex items-center rounded-md border border-white/15 bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => setQuantity((v) => Math.max(1, v - 1))}
                disabled={quantity <= 1 || isDino}
                  className="grid h-11 w-11 place-items-center rounded text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                aria-label="ลดจำนวน"
              >
                <Minus size={14} />
              </button>
              <output aria-label="จำนวนสินค้า" className="w-9 text-center font-mono text-sm font-bold text-iris-pearl">
                {quantity}
              </output>
              <button
                type="button"
                onClick={() => setQuantity((v) => Math.min(99, v + 1))}
                disabled={quantity >= 99 || isDino}
                  className="grid h-11 w-11 place-items-center rounded text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                aria-label="เพิ่มจำนวน"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Feedback */}
          {feedback === 'added' ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-300 animate-in fade-in">
              <Check className="h-4 w-4" /><T text={"เพิ่มสินค้าลงในตะกร้าเรียบร้อยแล้ว (คุณสามารถเลือกดูต่อได้ทันที)"} /></div>
          ) : null}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-slate-700/50 bg-surface-3 p-5">
          <button type="button" onClick={handleAddToCart} className="tk-btn ghost w-full sm:w-auto">
            {feedback === 'added' ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
            <T text={feedback === 'added' ? 'เพิ่มแล้ว' : 'ใส่ตะกร้า · Add to Cart'} />
          </button>
          <button type="button" onClick={handleCheckout} className="tk-btn w-full sm:w-auto">
            {<CreditCard className="h-4 w-4" />}
            <T text={"ตรวจยอดและชำระ · Buy Now"} />
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
