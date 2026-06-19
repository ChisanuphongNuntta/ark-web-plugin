'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQueries, useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  Coins,
  Trash2,
  Plus,
  Minus,
  ShieldCheck,
  ShoppingBag,
  Server,
  Check,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { productApi } from '@/lib/api';
import { serverApi, checkoutApi, walletContractApi } from '@/lib/contracts/client';
import type { ServerStatus } from '@/lib/contracts/types';
import { useAuthStore, useCartStore, cartLineKey, canAfford } from '@/lib/store';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { useRouter } from 'next/navigation';

interface CartProduct {
  id: number;
  name: string;
  price: number;
  imageUrl: string | null;
  category?: { name: string } | null;
}

type CheckoutStep = 'cart' | 'submitting' | 'success';

export default function CartPage() {
  const { items, removeItem, setQuantity, setLineServer, clear } = useCartStore();
  const { user } = useAuthStore();
  const router = useRouter();

  const [checkoutStep, setCheckoutStep] = React.useState<CheckoutStep>('cart');
  const [orderIds, setOrderIds] = React.useState<string[]>([]);
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);

  // Backend-computed authoritative total for the current cart (decimal string).
  // The frontend NEVER computes the final total — it asks the backend for a
  // checkout session and reads totalAmount from it (TEAM_OWNERSHIP.md §2).
  const [authoritativeTotal, setAuthoritativeTotal] = React.useState<string | null>(null);

  // Fetch product data per cart line (keyed by the productId/serverId pair).
  const productQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ['cart-product', item.productId, item.serverId],
      queryFn: () =>
        productApi.getById(item.productId).then((res) => (res.data.product ?? res.data) as CartProduct),
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Server directory (contract: GET /servers, isOnline derived).
  const {
    data: serversData,
    isLoading: isServersLoading,
    isError: isServersError,
    refetch: refetchServers,
  } = useQuery({
    queryKey: ['servers-cart'],
    queryFn: () => serverApi.listServers(),
  });
  const servers: ServerStatus[] = serversData?.servers ?? [];

  // Wallet available balance (contract: GET /wallet — decimal strings).
  const {
    data: wallet,
    isLoading: isWalletLoading,
    isError: isWalletError,
  } = useQuery({
    queryKey: ['wallet-balance-cart'],
    queryFn: () => walletContractApi.getBalance(),
    enabled: !!user,
  });
  const availableBalance = wallet?.accounts?.available ?? null;

  // Informational (NON-authoritative) estimate for display only. This is a
  // rough preview so the user sees an order of magnitude; the backend total
  // from the checkout session is the only figure used for affordability and
  // the actual debit.
  const estimateSubtotal = React.useMemo(() => {
    return items.reduce((sum, item, idx) => {
      const product = productQueries[idx]?.data;
      if (!product) return sum;
      return sum + product.price * item.quantity;
    }, 0);
  }, [items, productQueries]);

  const productsLoading = productQueries.some((q) => q.isLoading);

  // Affordability is a comparison of two backend decimal strings only.
  const affordabilityKnown = availableBalance !== null && authoritativeTotal !== null;
  const isAffordable =
    affordabilityKnown && canAfford(availableBalance as string, authoritativeTotal as string);

  const handleServerChange = (productId: number, fromServerId: number, toServerId: number) => {
    setLineServer(productId, fromServerId, toServerId);
    // The cart contents changed → any previously fetched total is stale.
    setAuthoritativeTotal(null);
  };

  const handleQuantityChange = (productId: number, serverId: number, qty: number) => {
    setQuantity(productId, serverId, qty);
    setAuthoritativeTotal(null);
  };

  const handleRemove = (productId: number, serverId: number) => {
    removeItem(productId, serverId);
    setAuthoritativeTotal(null);
  };

  // Step 1: create a checkout session to obtain the backend-authoritative total.
  const previewMutation = useMutation({
    mutationFn: () => {
      const idempotencyKey = `checkout:${crypto.randomUUID()}`;
      return checkoutApi.createSession(idempotencyKey);
    },
    onSuccess: (session) => {
      setAuthoritativeTotal(session.totalAmount);
      setCheckoutError(null);
    },
    onError: () => {
      setCheckoutError('ไม่สามารถสร้างเซสชันชำระเงินเพื่อตรวจสอบยอดสุทธิได้ กรุณาลองใหม่');
    },
  });

  // Step 2: commit the session (backend re-validates price/wallet/stock).
  const commitMutation = useMutation({
    mutationFn: async () => {
      const idempotencyKey = `checkout:${crypto.randomUUID()}`;
      const session = await checkoutApi.createSession(idempotencyKey);
      setAuthoritativeTotal(session.totalAmount);
      return checkoutApi.commitSession(session.id);
    },
    onSuccess: (result) => {
      setOrderIds(result.orderIds);
      setAuthoritativeTotal(result.totalSpent);
      setCheckoutStep('success');
      clear();
    },
    onError: () => {
      setCheckoutStep('cart');
      setCheckoutError('การยืนยันคำสั่งซื้อล้มเหลว ระบบหลังบ้านปฏิเสธรายการ (ราคา/ยอดเงิน/สต็อก) กรุณาลองใหม่');
    },
  });

  // Auto-fetch a preview total whenever the cart composition changes.
  React.useEffect(() => {
    if (items.length > 0 && authoritativeTotal === null && !previewMutation.isPending) {
      previewMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, authoritativeTotal]);

  const handleCheckoutSubmit = () => {
    setCheckoutError(null);
    if (!user) {
      window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/discord`;
      return;
    }
    setCheckoutStep('submitting');
    commitMutation.mutate();
  };

  const serverName = (serverId: number) =>
    servers.find((s) => s.id === serverId)?.name ?? `เซิร์ฟเวอร์ #${serverId}`;

  /* --------------------------- success state --------------------------- */
  if (checkoutStep === 'success') {
    return (
      <div className="page-shell py-16 sm:py-24 max-w-2xl mx-auto space-y-8 animate-slide-up">
        <GlassCard variant="prism" hasLattice className="p-8 text-center space-y-6">
          <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
            <Check className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <span className="eyebrow text-iris-cyan">Order Placed</span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-iris-pearl uppercase">ทำรายการสำเร็จ</h1>
            <p className="text-xs sm:text-sm text-iris-muted">
              หักยอดจากกระเป๋าเงินสำเร็จ และระบบได้จัดคิวนำส่งสินค้าเข้าเกมแล้ว
            </p>
          </div>

          <div className="p-5 bg-black/40 border border-white/5 rounded-2xl text-left space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-iris-muted">ยอดที่หักจริง (Total Spent):</span>
              <span className="font-mono font-bold text-iris-gold">
                {authoritativeTotal ?? '—'} IC
              </span>
            </div>
            <div>
              <p className="text-iris-muted mb-1">หมายเลขคำสั่งซื้อ ({orderIds.length} รายการ):</p>
              <ul className="space-y-1">
                {orderIds.map((id) => (
                  <li key={id} className="font-mono text-[11px] text-iris-pearl break-all">{id}</li>
                ))}
              </ul>
            </div>
            <p className="text-[10px] text-iris-muted pt-2 border-t border-white/5">
              เข้าสู่เกมแล้วพิมพ์คำสั่ง{' '}
              <code className="bg-black/40 text-iris-cyan px-1.5 py-0.5 rounded font-mono font-bold">/claim</code>{' '}
              เพื่อรับไอเท็ม
            </p>
          </div>

          <div className="flex gap-4 justify-center">
            <Link href="/"><Button variant="primary">กลับสู่หน้าแรก</Button></Link>
            <Link href="/shop"><Button variant="secondary">ซื้อสินค้าเพิ่ม</Button></Link>
          </div>
        </GlassCard>
      </div>
    );
  }

  /* ---------------------------- empty state ---------------------------- */
  if (items.length === 0) {
    return (
      <div className="page-shell py-20">
        <EmptyState
          title="ตะกร้าสินค้ายังว่างอยู่"
          description="คุณยังไม่ได้เลือกซื้อไดโนเสาร์หรืออาวุธลงในตะกร้า โปรดเลือกสินค้าเพื่อดำเนินการต่อ"
          actionText="สำรวจร้านค้า IRIS Store"
          onAction={() => router.push('/shop')}
        />
      </div>
    );
  }

  /* ------------------------------ cart view ---------------------------- */
  return (
    <div className="page-shell py-10 space-y-8 animate-slide-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
        <div className="space-y-1">
          <Link href="/shop" className="inline-flex items-center gap-1.5 text-xs font-bold text-iris-cyan hover:underline uppercase">
            <ArrowLeft className="h-3.5 w-3.5" /> กลับไปเลือกซื้อของ
          </Link>
          <h1 className="font-display text-4xl font-extrabold text-iris-pearl mt-2 uppercase tracking-tight flex items-center gap-3">
            <ShoppingBag className="h-8 w-8 text-iris-cyan" />
            <span>ตะกร้าสินค้าและทำรายการ</span>
          </h1>
        </div>

        <button
          onClick={() => { clear(); setAuthoritativeTotal(null); }}
          className="text-xs font-bold text-rose-400 hover:underline border border-rose-500/10 hover:border-rose-500/20 bg-rose-500/5 px-4 py-2 rounded-full"
        >
          ล้างรายการทั้งหมด
        </button>
      </div>

      {isServersError && (
        <ErrorMessage
          title="ไม่สามารถโหลดรายชื่อเซิร์ฟเวอร์ได้"
          message="ระบบดึงรายชื่อเซิร์ฟเวอร์ปลายทางไม่สำเร็จ คุณยังคงปรับจำนวนได้ แต่ควรลองโหลดใหม่ก่อนชำระเงิน"
          onRetry={refetchServers}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart lines */}
        <section className="lg:col-span-2 space-y-4" aria-label="รายการสินค้าในตะกร้า">
          {items.map((item, index) => {
            const query = productQueries[index];
            const product = query?.data;
            const lineKey = cartLineKey(item.productId, item.serverId);

            if (query?.isLoading) {
              return (
                <GlassCard key={lineKey} className="p-5 flex items-center gap-4">
                  <Loader2 className="h-5 w-5 animate-spin text-iris-cyan" />
                  <Skeleton className="w-1/2 h-4" />
                </GlassCard>
              );
            }

            if (query?.isError || !product) {
              return (
                <GlassCard key={lineKey} className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-xs text-iris-muted">
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                    <span>โหลดข้อมูลสินค้า #{item.productId} ไม่สำเร็จ</span>
                  </div>
                  <button
                    onClick={() => handleRemove(item.productId, item.serverId)}
                    className="text-xs font-bold text-rose-400 hover:underline"
                  >
                    นำออก
                  </button>
                </GlassCard>
              );
            }

            return (
              <GlassCard key={lineKey} className="p-5" variant="default">
                <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="h-20 w-20 bg-black/40 border border-white/10 rounded-2xl flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-3xl">📦</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] font-bold text-iris-cyan uppercase bg-iris-cyan/5 px-2 py-0.5 rounded border border-iris-cyan/10">
                      {product.category?.name || 'IRIS Store'}
                    </span>
                    <h3 className="font-display font-bold text-base text-iris-pearl mt-2 truncate uppercase">{product.name}</h3>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-iris-gold mt-1.5">
                      <Coins className="h-4 w-4 text-iris-gold" />
                      <span>{product.price.toLocaleString()} IC <span className="font-sans text-[10px] text-iris-muted">ต่อหน่วย</span></span>
                    </div>
                  </div>

                  <div className="flex items-center bg-black/40 border border-white/10 rounded-full h-9 shrink-0">
                    <button
                      onClick={() => handleQuantityChange(item.productId, item.serverId, item.quantity - 1)}
                      className="w-9 h-full flex items-center justify-center text-iris-muted hover:text-white"
                      aria-label="ลดจำนวน"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-8 text-center font-mono font-bold text-sm text-iris-pearl">{item.quantity}</span>
                    <button
                      onClick={() => handleQuantityChange(item.productId, item.serverId, item.quantity + 1)}
                      className="w-9 h-full flex items-center justify-center text-iris-muted hover:text-white"
                      aria-label="เพิ่มจำนวน"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => handleRemove(item.productId, item.serverId)}
                    className="h-9 w-9 rounded-full border border-rose-500/10 hover:border-rose-500/20 bg-rose-500/5 flex items-center justify-center text-rose-400 transition"
                    aria-label="ลบสินค้านี้"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Per-line target server (cart lines are keyed by this) */}
                <div className="mt-5 pt-5 border-t border-white/5">
                  <label className="text-[10px] font-bold text-iris-muted uppercase flex items-center gap-1 mb-1.5">
                    <Server className="h-3 w-3" /> เซิร์ฟเวอร์ปลายทาง
                  </label>
                  {isServersLoading ? (
                    <Skeleton className="h-9 w-full max-w-xs" />
                  ) : servers.length === 0 ? (
                    <p className="text-[11px] text-iris-muted">ปัจจุบัน: {serverName(item.serverId)}</p>
                  ) : (
                    <Select
                      value={item.serverId}
                      onChange={(e) =>
                        handleServerChange(item.productId, item.serverId, parseInt(e.target.value, 10))
                      }
                      className="py-2 px-3 text-xs bg-black/30 max-w-xs"
                      aria-label="เลือกเซิร์ฟเวอร์ปลายทาง"
                    >
                      {servers.map((svr) => (
                        <option key={svr.id} value={svr.id}>
                          {svr.name}{svr.map ? ` (${svr.map})` : ''}{svr.isOnline ? '' : ' — ออฟไลน์'}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </section>

        {/* Summary */}
        <aside className="space-y-6">
          <GlassCard variant="gold" className="p-6 space-y-5">
            <div>
              <span className="eyebrow text-iris-gold">Checkout Session</span>
              <h2 className="font-display text-xl font-bold text-iris-pearl uppercase mt-1">สรุปการชำระเงิน</h2>
            </div>

            <div className="space-y-3 text-xs border-b border-white/5 pb-4">
              <div className="flex justify-between">
                <span className="text-iris-muted">ประมาณการ (ก่อนตรวจสอบ):</span>
                <span className="font-mono text-white/70">
                  {productsLoading ? '…' : `~${estimateSubtotal.toLocaleString()} IC`}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/5 text-iris-pearl">
                <span>ยอดสุทธิจากระบบ (Backend Total):</span>
                <span className="font-mono text-gradient-gold text-lg">
                  {previewMutation.isPending && authoritativeTotal === null ? (
                    <Loader2 className="h-4 w-4 animate-spin inline" />
                  ) : authoritativeTotal !== null ? (
                    `${authoritativeTotal} IC`
                  ) : (
                    '—'
                  )}
                </span>
              </div>
            </div>

            <div className="p-3 bg-iris-cyan/[0.04] border border-iris-cyan/10 rounded-2xl flex gap-2 text-[10px] leading-relaxed text-iris-muted">
              <ShieldCheck className="h-4.5 w-4.5 text-iris-cyan shrink-0 mt-0.5" />
              <span>ยอดสุทธิและสิทธิ์การซื้อคำนวณและตรวจสอบที่ระบบหลังบ้านเท่านั้น เว็บไม่คำนวณราคาสุดท้ายเอง</span>
            </div>

            {/* Wallet / affordability */}
            {user && (
              <div className="text-[11px] space-y-2">
                <div className="flex justify-between">
                  <span className="text-iris-muted">ยอดใช้ได้ (Available):</span>
                  <span className="font-mono font-bold text-iris-cyan">
                    {isWalletLoading ? '…' : isWalletError ? 'โหลดไม่สำเร็จ' : `${availableBalance ?? '—'} IC`}
                  </span>
                </div>

                {affordabilityKnown && !isAffordable && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl space-y-1">
                    <p className="font-bold">ยอดคงเหลือไม่เพียงพอ</p>
                    <p>ยอดใช้ได้ {availableBalance} IC ไม่พอกับยอดสุทธิ {authoritativeTotal} IC</p>
                    <Link href="/topup" className="font-bold text-iris-gold hover:underline block pt-1">
                      ไปหน้าเติมเงิน →
                    </Link>
                  </div>
                )}
              </div>
            )}

            {checkoutError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-[11px] flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{checkoutError}</span>
              </div>
            )}

            <Button
              variant="cyan"
              className="w-full py-3"
              disabled={
                checkoutStep === 'submitting' ||
                productsLoading ||
                (!!user && affordabilityKnown && !isAffordable)
              }
              isLoading={checkoutStep === 'submitting'}
              onClick={handleCheckoutSubmit}
            >
              {user ? 'ยืนยันคำสั่งซื้อและจัดส่งเข้าเกม' : 'เข้าสู่ระบบเพื่อชำระเงิน'}
            </Button>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}
