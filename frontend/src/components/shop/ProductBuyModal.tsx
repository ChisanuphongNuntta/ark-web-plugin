'use client';
import { T, useLanguage } from '@/components/i18n/LanguageProvider';


import * as React from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  CircleAlert,
  Coins,
  CreditCard,
  Minus,
  Plus,
  Server,
  ShoppingCart,
  Sparkles,
  X,
} from 'lucide-react';
import { serverApi } from '@/lib/contracts/client';
import type { GameMode, Product, ServerStatus } from '@/lib/contracts/types';

type ModeTab = GameMode | 'OTHER';

const MODE_TABS: { key: ModeTab; label: string }[] = [
  { key: 'PVE', label: 'PvE' },
  { key: 'PVE_MOD', label: 'PvE Mod' },
  { key: 'PVPVE', label: 'PvPvE' },
  { key: 'OTHER', label: 'อื่นๆ' },
];

const modeOf = (server: ServerStatus): ModeTab => server.gameMode ?? 'OTHER';
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
  const [selectedServerId, setSelectedServerId] = React.useState<number | null>(null);
  const [autoSelected, setAutoSelected] = React.useState(false);
  const [modeTab, setModeTab] = React.useState<ModeTab | null>(null);
  const [feedback, setFeedback] = React.useState<'idle' | 'added'>('idle');

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const serversQuery = useQuery({
    queryKey: ['contract', 'servers'],
    queryFn: () => serverApi.listServers(),
    staleTime: 30_000,
    enabled: isOpen && !!product,
  });

  const servers = serversQuery.data?.servers ?? [];
  const quality = qualityConfig[product?.quality ?? 0] ?? qualityConfig[0];
  const isDino = product?.productType === 'dino';

  React.useEffect(() => {
    if (!isOpen) {
      setQuantity(1);
      setFeedback('idle');
      return;
    }
    const savedServerId = typeof window !== 'undefined' ? localStorage.getItem('iris_preferred_server') : null;
    if (savedServerId && servers.some((s) => s.id === Number(savedServerId) && s.isOnline)) {
      setSelectedServerId(Number(savedServerId));
      setAutoSelected(true);
      return;
    }
    const firstOnline = servers.find((s) => s.isOnline);
    if (firstOnline && selectedServerId === null) {
      setSelectedServerId(firstOnline.id);
      setAutoSelected(true);
    }
  }, [isOpen, servers, selectedServerId]);

  const selectServer = (id: number) => {
    setSelectedServerId(id);
    setAutoSelected(false);
    try {
      localStorage.setItem('iris_preferred_server', String(id));
    } catch {}
  };

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

  const modeTabs = MODE_TABS.filter((tab) => servers.some((s) => modeOf(s) === tab.key));
  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const activeTab =
    modeTab && modeTabs.some((t) => t.key === modeTab)
      ? modeTab
      : selectedServer
      ? modeOf(selectedServer)
      : modeTabs[0]?.key ?? null;
  const visibleServers = activeTab ? servers.filter((s) => modeOf(s) === activeTab) : servers;

  const serverUnavailable = serversQuery.isError || (!serversQuery.isLoading && servers.length === 0);
  const canAdd = selectedServerId !== null && !serversQuery.isLoading && !serverUnavailable;
  const totalPrice = product.price * quantity;

  const handleAddToCart = () => {
    if (!canAdd || selectedServerId === null) return;
    addItem(product.id, selectedServerId, quantity, false);
    setDrawerOpen(false);
    setFeedback('added');
    window.setTimeout(() => setFeedback('idle'), 2200);
  };

  const handleCheckout = () => {
    if (!canAdd || selectedServerId === null) return;
    addItem(product.id, selectedServerId, quantity, false);
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

          {/* Server Selection */}
          <div className="space-y-2 border-t border-slate-700/40 pt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-iris-pearl">
                <Server className="h-3.5 w-3.5 text-iris-cyan" /><T text={"เลือกเซิร์ฟเวอร์ปลายทาง · Server"} /></span>
              <span className="font-mono text-[10px] text-iris-muted">
                {servers.filter((s) => s.isOnline).length}/{servers.length} online
              </span>
            </div>
            <p className="text-[11px] text-slate-400"><T text={"ระบบตรวจจับเซิร์ฟเวอร์ออนไลน์ให้อัตโนมัติ หรือคลิกเพื่อสลับเปลี่ยนเซิร์ฟเวอร์ได้ตามต้องการ"} /></p>

            {serversQuery.isLoading ? (
              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-800" />
            ) : serverUnavailable ? (
              <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
                <CircleAlert className="h-4 w-4 shrink-0 text-amber-400" />
                <span><T text={"ไม่พบเซิร์ฟเวอร์ที่พร้อมรับสินค้า กรุณาลองใหม่อีกครั้ง"} /></span>
              </div>
            ) : (
              <div className="space-y-2">
              {modeTabs.length > 1 && (
                <div role="tablist" aria-label="โหมดเซิร์ฟเวอร์" className="flex flex-wrap gap-1.5">
                  {modeTabs.map((tab) => {
                    const count = servers.filter((s) => modeOf(s) === tab.key).length;
                    const selected = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setModeTab(tab.key)}
                        className={`tk-chip sm${selected ? ' on' : ''}`}
                      >
                        {tab.label} <span className="font-mono text-[10px]">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {visibleServers.map((server: ServerStatus) => {
                  const isSelected = selectedServerId === server.id;
                  return (
                    <button
                      key={server.id}
                      type="button"
                      disabled={!server.isOnline}
                      onClick={() => selectServer(server.id)}
                      className={`flex min-h-[56px] items-center justify-between rounded-md border p-3 text-left transition ${
                        isSelected
                          ? 'border-iris-cyan bg-iris-cyan/10 text-white ring-1 ring-iris-cyan/60'
                          : server.isOnline
                          ? 'border-slate-700/50 bg-surface-3 text-slate-300 hover:border-slate-600 hover:text-white'
                          : 'border-slate-700/60 bg-surface-2 text-slate-300 cursor-not-allowed'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold truncate">{server.displayName || server.name}</p>
                          {isSelected && autoSelected && (
                            <span className="inline-flex items-center rounded bg-cyan-400/20 px-1 py-0.2 text-[9px] font-bold text-cyan-300 uppercase tracking-wider"><T text={"แนะนำ"} /></span>
                          )}
                        </div>
                        <p className="text-[10px] text-iris-muted truncate">{server.cluster?.name ?? server.map}</p>
                      </div>
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          server.isOnline ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-600'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              </div>
            )}
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
          <button type="button" disabled={!canAdd} onClick={handleAddToCart} className="tk-btn ghost w-full sm:w-auto">
            {feedback === 'added' ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
            <T text={feedback === 'added' ? 'เพิ่มแล้ว' : 'ใส่ตะกร้า · Add to Cart'} />
          </button>
          <button type="button" disabled={!canAdd} onClick={handleCheckout} className="tk-btn w-full sm:w-auto">
            {<CreditCard className="h-4 w-4" />}
            <T text={"ตรวจยอดและชำระ · Buy Now"} />
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
