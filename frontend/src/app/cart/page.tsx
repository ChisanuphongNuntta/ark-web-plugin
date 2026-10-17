'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Coins,
  Loader2,
  Minus,
  Plus,
  Server,
  ShieldCheck,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import {
  cartApi,
  checkoutApi,
  serverApi,
  shopApi,
  toContractError,
  walletContractApi,
} from '@/lib/contracts/client';
import type { Product, ServerStatus } from '@/lib/contracts/types';
import { canAfford, cartLineKey, useAuthStore, useCartStore } from '@/lib/store';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { GlassCard } from '@/components/ui/GlassCard';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProductArtwork } from '@/components/ProductArtwork';

type CheckoutStep = 'cart' | 'submitting' | 'success';

function makeIdempotencyKey() {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `checkout:${suffix}`;
}

export default function CartPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { items, removeItem, setQuantity, setLineServer, clear } = useCartStore();
  const [checkoutStep, setCheckoutStep] = React.useState<CheckoutStep>('cart');
  const [orderIds, setOrderIds] = React.useState<string[]>([]);
  const [authoritativeTotal, setAuthoritativeTotal] = React.useState<string | null>(null);
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);

  const productQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ['cart-product-contract', item.productId, item.serverId],
      queryFn: () => shopApi.getProduct(item.productId).then((response) => response.product),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const {
    data: serversData,
    isLoading: isServersLoading,
    isError: isServersError,
    refetch: refetchServers,
  } = useQuery({
    queryKey: ['servers-cart-contract'],
    queryFn: () => serverApi.listServers(),
  });

  const {
    data: wallet,
    isLoading: isWalletLoading,
    isError: isWalletError,
  } = useQuery({
    queryKey: ['wallet-balance-cart-contract'],
    queryFn: () => walletContractApi.getBalance(),
    enabled: Boolean(user),
  });

  const servers: ServerStatus[] = serversData?.servers ?? [];
  const productsLoading = productQueries.some((query) => query.isLoading);
  const productsError = productQueries.some((query) => query.isError);
  const availableBalance = wallet?.accounts.available ?? null;

  const syncLines = React.useMemo(
    () =>
      items.map((item) => ({
        productId: item.productId,
        serverId: item.serverId,
        quantity: item.quantity,
      })),
    [items]
  );
  const syncSignature = React.useMemo(() => JSON.stringify(syncLines), [syncLines]);

  // Display-only estimate. Backend total is authoritative and shown separately.
  const estimateSubtotal = React.useMemo(() => {
    return items.reduce((sum, item, index) => {
      const product = productQueries[index]?.data as Product | undefined;
      return product ? sum + product.price * item.quantity : sum;
    }, 0);
  }, [items, productQueries]);

  const affordabilityKnown = Boolean(user && availableBalance !== null && authoritativeTotal !== null);
  const isAffordable =
    affordabilityKnown && canAfford(availableBalance as string, authoritativeTotal as string);

  const previewMutation = useMutation({
    mutationFn: async () => {
      await cartApi.syncCart(syncLines);
      return checkoutApi.createSession(makeIdempotencyKey());
    },
    onSuccess: (session) => {
      setAuthoritativeTotal(session.totalAmount);
      setCheckoutError(null);
    },
    onError: (err) => {
      const error = toContractError(err, 'ไม่สามารถสร้าง checkout session เพื่อตรวจยอดสุทธิได้');
      setAuthoritativeTotal(null);
      setCheckoutError(
        error.status === 400 || error.status === 404
          ? `ระบบตรวจสอบตะกร้าไม่ผ่าน: ${error.message}`
          : error.message
      );
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      await cartApi.syncCart(syncLines);
      const session = await checkoutApi.createSession(makeIdempotencyKey());
      setAuthoritativeTotal(session.totalAmount);
      return checkoutApi.commitSession(session.id);
    },
    onSuccess: (result) => {
      setOrderIds(result.orderIds);
      setAuthoritativeTotal(result.totalSpent);
      setCheckoutStep('success');
      clear();
    },
    onError: (err) => {
      const error = toContractError(err, 'การยืนยันคำสั่งซื้อล้มเหลว');
      setCheckoutStep('cart');
      setCheckoutError(
        error.status === 400 || error.status === 404
          ? `ระบบตรวจสอบตะกร้าไม่ผ่าน: ${error.message}`
          : error.message
      );
    },
  });

  React.useEffect(() => {
    if (!user || syncLines.length === 0 || previewMutation.isPending) return;
    setAuthoritativeTotal(null);
    previewMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, syncSignature]);

  const handleQuantityChange = (productId: number, serverId: number, quantity: number) => {
    setQuantity(productId, serverId, quantity);
  };

  const handleServerChange = (productId: number, fromServerId: number, toServerId: number) => {
    setLineServer(productId, fromServerId, toServerId);
  };

  const handleRemove = (productId: number, serverId: number) => {
    removeItem(productId, serverId);
  };

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
    servers.find((server) => server.id === serverId)?.name ?? `เซิร์ฟเวอร์ #${serverId}`;

  if (checkoutStep === 'success') {
    return (
      <div className="page-shell py-16 sm:py-24 max-w-2xl mx-auto space-y-8 animate-slide-up">
        <GlassCard variant="prism" hasLattice className="p-8 text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <Check className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <span className="eyebrow text-iris-cyan">Order Placed</span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-iris-pearl uppercase">
              ทำรายการสำเร็จ
            </h1>
            <p className="text-xs sm:text-sm text-iris-muted">
              Backend ยืนยันการหักยอดและสร้างคิวจัดส่งสินค้าเข้าเกมแล้ว
            </p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-black/40 p-5 text-left text-xs space-y-3">
            <div className="flex justify-between gap-4">
              <span className="text-iris-muted">ยอดที่หักจริง (Backend Total):</span>
              <span className="font-mono font-bold text-iris-gold">{authoritativeTotal ?? '—'} IC</span>
            </div>
            <div>
              <p className="mb-1 text-iris-muted">หมายเลขคำสั่งซื้อ ({orderIds.length} รายการ):</p>
              <ul className="space-y-1">
                {orderIds.map((id) => (
                  <li key={id}>
                    <Link href={`/orders/${id}`} className="break-all font-mono text-[11px] text-iris-cyan hover:underline">
                      {id}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <p className="border-t border-white/5 pt-2 text-[10px] text-iris-muted">
              เข้าเกมแล้วพิมพ์ <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono font-bold text-iris-cyan">/claim</code> เพื่อรับไอเท็มเมื่อระบบจัดส่งพร้อม
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link className="rounded-full" href="/orders">
              <Button variant="cyan">ติดตามการจัดส่ง</Button>
            </Link>
            <Link className="rounded-full" href="/shop">
              <Button variant="secondary">ซื้อสินค้าเพิ่ม</Button>
            </Link>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="page-shell py-20">
        <EmptyState
          title="ตะกร้าสินค้ายังว่างอยู่"
          description="เลือกสินค้าและเซิร์ฟเวอร์ปลายทางก่อนดำเนินการชำระเงิน"
          actionText="สำรวจร้านค้า IRIS Store"
          onAction={() => router.push('/shop')}
          icon={<ShoppingBag className="h-8 w-8" />}
        />
      </div>
    );
  }

  return (
    <div className="page-shell py-10 space-y-8 animate-slide-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-700/30 pb-6">
        <div className="space-y-1">
          <Link href="/shop" className="inline-flex items-center gap-1.5 text-xs font-semibold text-iris-cyan hover:underline uppercase tracking-wider">
            <ArrowLeft className="h-3.5 w-3.5" />
            กลับไปเลือกสินค้า
          </Link>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-iris-pearl mt-2 tracking-tight flex items-center gap-3">
            <ShoppingBag className="h-7 w-7 text-iris-cyan" />
            ตะกร้าสินค้าและชำระเงิน
          </h1>
        </div>

        <button
          type="button"
          onClick={() => {
            clear();
            setAuthoritativeTotal(null);
          }}
          className="rounded-full border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition"
        >
          ล้างรายการทั้งหมด
        </button>
      </div>

      {isServersError && (
        <ErrorMessage
          title="โหลดรายชื่อเซิร์ฟเวอร์ไม่สำเร็จ"
          message="ยังปรับจำนวนสินค้าได้ แต่ควรโหลดรายชื่อเซิร์ฟเวอร์ใหม่ก่อนชำระเงิน"
          onRetry={() => refetchServers()}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2 space-y-4" aria-label="รายการสินค้าในตะกร้า">
          {items.map((item, index) => {
            const productQuery = productQueries[index];
            const product = productQuery?.data as Product | undefined;
            const lineKey = cartLineKey(item.productId, item.serverId);

            if (productQuery?.isLoading) {
              return (
                <GlassCard key={lineKey} className="p-5 flex items-center gap-4">
                  <Loader2 className="h-5 w-5 animate-spin text-iris-cyan" />
                  <Skeleton className="h-4 w-1/2" />
                </GlassCard>
              );
            }

            if (productQuery?.isError || !product) {
              return (
                <GlassCard key={lineKey} className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-xs text-iris-muted">
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                    <span>โหลดข้อมูลสินค้า #{item.productId} ไม่สำเร็จ</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.productId, item.serverId)}
                    className="text-xs font-bold text-rose-400 hover:underline"
                  >
                    นำออก
                  </button>
                </GlassCard>
              );
            }

            return (
              <div key={lineKey} className="p-5 rounded-2xl border border-slate-700/40 bg-[#102637] transition hover:border-cyan-400/30">
                <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0a1b28]">
                    <ProductArtwork product={product} alt={product.name} className="h-full w-full object-contain p-2" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <span className="rounded border border-cyan-400/20 bg-cyan-950/40 px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase text-cyan-300">
                      {product.category?.name || 'IRIS Store'}
                    </span>
                    <h3 className="mt-2 truncate font-semibold text-base text-iris-pearl">{product.name}</h3>
                    <div className="mt-1.5 flex items-center gap-1.5 font-mono text-xs font-bold text-iris-gold">
                      <Coins className="h-4 w-4 text-iris-gold" />
                      <span>
                        <span className="tabular-nums">{product.price.toLocaleString()}</span> IC <span className="font-sans text-[10px] text-iris-muted font-normal">ต่อหน่วย</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex h-9 shrink-0 items-center rounded-full border border-slate-700/50 bg-[#091b28]">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.productId, item.serverId, item.quantity - 1)}
                      className="flex h-full w-9 items-center justify-center text-iris-muted hover:text-white"
                      aria-label="ลดจำนวน"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-8 text-center font-mono text-sm font-bold text-iris-pearl tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.productId, item.serverId, item.quantity + 1)}
                      className="flex h-full w-9 items-center justify-center text-iris-muted hover:text-white"
                      aria-label="เพิ่มจำนวน"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemove(item.productId, item.serverId)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20"
                    aria-label="ลบสินค้านี้"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 border-t border-white/5 pt-5">
                  <label className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase text-iris-muted">
                    <Server className="h-3 w-3" />
                    เซิร์ฟเวอร์ปลายทาง
                  </label>
                  {isServersLoading ? (
                    <Skeleton className="h-9 w-full max-w-xs" />
                  ) : servers.length === 0 ? (
                    <p className="text-[11px] text-iris-muted">ปัจจุบัน: {serverName(item.serverId)}</p>
                  ) : (
                    <Select
                      value={item.serverId}
                      onChange={(event) =>
                        handleServerChange(item.productId, item.serverId, Number(event.target.value))
                      }
                      className="max-w-xs py-2 px-3 text-xs bg-black/30"
                      aria-label="เลือกเซิร์ฟเวอร์ปลายทาง"
                    >
                      {servers.map((server) => (
                        <option key={server.id} value={server.id}>
                          {server.name}{server.map ? ` (${server.map})` : ''}{server.isOnline ? '' : ' — ออฟไลน์'}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <aside className="space-y-6 lg:sticky lg:top-28">
          <div className="p-6 space-y-5 rounded-2xl border border-slate-700/40 bg-[#102637] shadow-xl">
            <div>
              <span className="text-[10px] font-bold tracking-widest text-cyan-300 uppercase">Checkout Session</span>
              <h2 className="mt-1 font-serif text-xl font-normal text-iris-pearl">
                สรุปการชำระเงิน
              </h2>
            </div>

            <div className="space-y-3 border-b border-slate-700/40 pb-4 text-xs">
              <div className="flex justify-between gap-4">
                <span className="text-iris-muted">ประมาณการจาก catalog:</span>
                <span className="font-mono text-white/70 tabular-nums">
                  {productsLoading ? '…' : `~${estimateSubtotal.toLocaleString()} IC`}
                </span>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-700/40 pt-2 text-sm font-bold text-iris-pearl">
                <span>ยอดสุทธิจากระบบ (Backend Total):</span>
                <span className="font-mono text-lg text-iris-gold tabular-nums">
                  {previewMutation.isPending && authoritativeTotal === null ? (
                    <Loader2 className="inline h-4 w-4 animate-spin" />
                  ) : authoritativeTotal !== null ? (
                    `${authoritativeTotal} IC`
                  ) : (
                    '—'
                  )}
                </span>
              </div>
            </div>

            <div className="flex gap-2 rounded-2xl border border-iris-cyan/10 bg-iris-cyan/[0.04] p-3 text-[10px] leading-relaxed text-iris-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-iris-cyan" />
              <span>
                ราคาสุดท้าย สิทธิ์ซื้อ โปรโมชัน สต็อก และการหัก wallet ตรวจที่ Backend เท่านั้น
                หน้าเว็บนี้ไม่คำนวณ final price เอง
              </span>
            </div>

            {user && (
              <div className="space-y-2 text-[11px]">
                <div className="flex justify-between gap-4">
                  <span className="text-iris-muted">ยอดใช้ได้ (Available):</span>
                  <span className="font-mono font-bold text-iris-cyan">
                    {isWalletLoading ? '…' : isWalletError ? 'โหลดไม่สำเร็จ' : `${availableBalance ?? '—'} IC`}
                  </span>
                </div>

                {affordabilityKnown && !isAffordable && (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-rose-300 space-y-1">
                    <p className="font-bold">ยอดคงเหลือไม่เพียงพอ</p>
                    <p>ยอดใช้ได้ {availableBalance} IC ไม่พอกับยอดสุทธิ {authoritativeTotal} IC</p>
                    <Link href="/topup" className="block pt-1 font-bold text-iris-gold hover:underline">
                      ไปหน้าเติมเงิน →
                    </Link>
                  </div>
                )}
              </div>
            )}

            {checkoutError && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-[11px] text-rose-300" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{checkoutError}</span>
              </div>
            )}

            <Button
              variant="cyan"
              className="w-full py-3"
              disabled={
                checkoutStep === 'submitting' ||
                productsLoading ||
                productsError ||
                (!!user && affordabilityKnown && !isAffordable)
              }
              isLoading={checkoutStep === 'submitting'}
              onClick={handleCheckoutSubmit}
            >
              {user ? 'ยืนยันคำสั่งซื้อและจัดส่งเข้าเกม' : 'เข้าสู่ระบบเพื่อชำระเงิน'}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
