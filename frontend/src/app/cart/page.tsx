'use client';
import { IrisCoin } from '@/components/ui/IrisCoin';
import { T } from '@/components/i18n/LanguageProvider';


import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check,  Loader2, Minus, Plus, Server, ShieldCheck, ShoppingCart, Trash2 } from 'lucide-react';
import { ArrowLeft } from '@/components/tek/arrows';
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
import { ServerPicker, readPreferredServerId, rememberPreferredServer } from '@/components/shop/ServerPicker';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProductArtwork } from '@/components/ProductArtwork';
import { syncWalletNow } from '@/lib/realtime/walletSync';

type CheckoutStep = 'cart' | 'submitting' | 'success';

function makeIdempotencyKey() {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `checkout:${suffix}`;
}

export default function CartPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useAuthStore();
  const { items, serverId, setServerId, removeItem, setQuantity, clear } = useCartStore();
  const [serverAutoSelected, setServerAutoSelected] = React.useState(false);
  const [checkoutStep, setCheckoutStep] = React.useState<CheckoutStep>('cart');
  const [orderIds, setOrderIds] = React.useState<string[]>([]);
  const [authoritativeTotal, setAuthoritativeTotal] = React.useState<string | null>(null);
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);

  const productQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ['cart-product-contract', item.productId],
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

  // One delivery server for the whole basket; the backend contract still wants it on every line. A saved choice only
  // counts once the server list confirms it is still online (or the list failed to load, and the backend decides),
  // so a stale server is never sent to checkout.
  const serverConfirmed =
    serverId !== null && !isServersLoading && (isServersError || servers.some((server) => server.id === serverId && server.isOnline));
  const activeServerId = serverConfirmed ? serverId : null;
  const syncLines = React.useMemo(
    () =>
      activeServerId === null
        ? []
        : items.map((item) => ({
            productId: item.productId,
            serverId: activeServerId,
            quantity: item.quantity,
          })),
    [items, activeServerId]
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
      // Navbar IC pill + order lists update immediately; socket events confirm.
      void syncWalletNow(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
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

  // Pre-select a server so most players never have to: the basket's server if it is still online, else the one
  // they used last time, else the only online server. With several online servers and no history the player
  // must choose, because a dino sent to the wrong server cannot be moved.
  const onlineServers = servers.filter((server) => server.isOnline);
  React.useEffect(() => {
    if (isServersLoading || servers.length === 0) return;
    if (serverId !== null && servers.some((server) => server.id === serverId && server.isOnline)) return;
    const preferred = readPreferredServerId(servers);
    if (preferred !== null) {
      setServerId(preferred);
      setServerAutoSelected(true);
    } else if (onlineServers.length === 1) {
      setServerId(onlineServers[0].id);
      setServerAutoSelected(true);
    } else if (serverId !== null) {
      setServerId(null); // the saved server went offline: ask again
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers, isServersLoading]);

  const handleServerSelect = (id: number) => {
    setServerId(id);
    setServerAutoSelected(false);
    rememberPreferredServer(id);
  };

  const handleQuantityChange = (productId: number, quantity: number) => {
    setQuantity(productId, quantity);
  };

  const handleRemove = (productId: number) => {
    removeItem(productId);
  };

  const handleCheckoutSubmit = () => {
    setCheckoutError(null);
    if (!user) {
      window.location.href = `${process.env.NEXT_PUBLIC_API_URL || '/api'}/auth/discord`;
      return;
    }
    setCheckoutStep('submitting');
    commitMutation.mutate();
  };

  const serverName = (id: number) =>
    servers.find((server) => server.id === id)?.name ?? `เซิร์ฟเวอร์ #${id}`;
  const hasDino = productQueries.some((query) => (query.data as Product | undefined)?.productType === 'dino');

  if (checkoutStep === 'success') {
    return (
      <div className="page-shell py-16 sm:py-24 max-w-2xl mx-auto space-y-8 animate-slide-up">
        <GlassCard variant="prism" hasLattice className="p-8 text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <Check className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <span className="eyebrow text-iris-cyan">Order Placed</span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-iris-pearl uppercase"><T text={"ทำรายการสำเร็จ"} /></h1>
            <p className="text-xs sm:text-sm text-iris-muted"><T text={"Backend ยืนยันการหักยอดและสร้างคิวจัดส่งสินค้าเข้าเกมแล้ว"} /></p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-black/40 p-5 text-left text-xs space-y-3">
            <div className="flex justify-between gap-4">
              <span className="text-iris-muted"><T text={"ยอดที่หักจริง (Backend Total):"} /></span>
              <span className="font-mono font-bold text-iris-gold">{authoritativeTotal ?? '—'}<IrisCoin size={16} className="ml-1 inline-block align-text-bottom" /><span className="tk-sr">IC</span></span>
            </div>
            <div>
              <p className="mb-1 text-iris-muted"><T text={"หมายเลขคำสั่งซื้อ ("} />{orderIds.length}<T text={" รายการ):"} /></p>
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
            <p className="border-t border-white/5 pt-2 text-[10px] text-iris-muted"><T text={"เข้าเกมแล้วพิมพ์"} /><code className="rounded bg-black/40 px-1.5 py-0.5 font-mono font-bold text-iris-cyan">/claim</code><T text={"เพื่อรับไอเท็มเมื่อระบบจัดส่งพร้อม"} /></p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link className="rounded-full" href="/orders">
              <Button variant="cyan"><T text={"ติดตามการจัดส่ง"} /></Button>
            </Link>
            <Link className="rounded-full" href="/shop">
              <Button variant="secondary"><T text={"ซื้อสินค้าเพิ่ม"} /></Button>
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
          icon={<ShoppingCart className="h-8 w-8" />}
        />
      </div>
    );
  }

  return (
    <div className="page-shell py-10 space-y-8 animate-slide-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-700/30 pb-6">
        <div className="space-y-1">
          <Link href="/shop" className="inline-flex items-center gap-1.5 text-xs font-semibold text-iris-cyan hover:underline uppercase tracking-wider">
            <ArrowLeft className="h-3.5 w-3.5" /><T text={"กลับไปเลือกสินค้า"} /></Link>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-iris-pearl mt-2 tracking-tight flex items-center gap-3">
            <ShoppingCart className="h-7 w-7 text-iris-cyan" /><T text={"ตะกร้าสินค้าและชำระเงิน"} /></h1>
        </div>

        <button
          type="button"
          onClick={() => {
            clear();
            setAuthoritativeTotal(null);
          }}
          className="rounded-full border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition"
        ><T text={"ล้างรายการทั้งหมด"} /></button>
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
          <div className="space-y-3 rounded-2xl border border-slate-700/40 bg-surface-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-iris-pearl">
                <Server className="h-3.5 w-3.5 text-iris-cyan" /><T text={"เซิร์ฟเวอร์ปลายทางของทั้งตะกร้า"} />
              </span>
              <span className="font-mono text-[10px] text-iris-muted">{onlineServers.length}/{servers.length} online</span>
            </div>
            <ServerPicker
              servers={servers}
              isLoading={isServersLoading}
              isError={isServersError}
              selectedServerId={serverId}
              autoSelected={serverAutoSelected}
              onSelect={handleServerSelect}
            />
            {serverId === null && !isServersLoading && servers.length > 0 && (
              <p className="text-[11px] text-amber-200" role="status"><T text={"เลือกเซิร์ฟเวอร์ปลายทางเพื่อตรวจยอดและชำระเงิน"} /></p>
            )}
            {activeServerId !== null && hasDino && (
              <p className="flex items-start gap-1.5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-[11px] text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><T text={"ไดโนเสาร์ในตะกร้าจะถูกส่งไปที่ "} /><strong>{serverName(activeServerId)}</strong><T text={" และย้ายภายหลังไม่ได้ ตรวจชื่อเซิร์ฟเวอร์ก่อนกดยืนยัน"} /></span>
              </p>
            )}
          </div>

          {items.map((item, index) => {
            const productQuery = productQueries[index];
            const product = productQuery?.data as Product | undefined;
            const lineKey = cartLineKey(item.productId);

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
                    <span><T text={"โหลดข้อมูลสินค้า #"} />{item.productId}<T text={" ไม่สำเร็จ"} /></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.productId)}
                    className="text-xs font-bold text-rose-400 hover:underline"
                  ><T text={"นำออก"} /></button>
                </GlassCard>
              );
            }

            return (
              <div key={lineKey} className="p-5 rounded-2xl border border-slate-700/40 bg-surface-3 transition hover:border-cyan-400/30">
                <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-700/50 bg-surface-2">
                    <ProductArtwork product={product} alt={product.name} className="h-full w-full object-contain p-2" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <span className="rounded border border-cyan-400/20 bg-cyan-950/40 px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase text-cyan-300">
                      {product.category?.name || 'IRIS Store'}
                    </span>
                    <h3 className="mt-2 truncate font-semibold text-base text-iris-pearl">{product.name}</h3>
                    <div className="mt-1.5 flex items-center gap-1.5 font-mono text-xs font-bold text-iris-gold">
                      <IrisCoin className="h-4 w-4 text-iris-gold" />
                      <span>
                        <span className="tabular-nums">{product.price.toLocaleString()}</span><span className="tk-sr">IC</span> <span className="font-sans text-[10px] text-iris-muted font-normal"><T text={"ต่อหน่วย"} /></span>
                      </span>
                    </div>
                  </div>

                  <div className="flex h-12 shrink-0 items-center rounded-full border border-slate-700/50 bg-surface-2">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.productId, item.quantity - 1)}
                      className="flex h-full w-11 items-center justify-center rounded-full text-iris-muted hover:bg-white/5 hover:text-white disabled:opacity-30"
                      disabled={item.quantity <= 1}
                      aria-label={`ลดจำนวน ${product.name}`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-8 text-center font-mono text-sm font-bold text-iris-pearl tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.productId, item.quantity + 1)}
                      className="flex h-full w-11 items-center justify-center rounded-full text-iris-muted hover:bg-white/5 hover:text-white"
                      aria-label={`เพิ่มจำนวน ${product.name}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemove(item.productId)}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20"
                    aria-label={`ลบ ${product.name} ออกจากตะกร้า`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

              </div>
            );
          })}
        </section>

        <aside className="space-y-6 lg:sticky lg:top-28">
          <div className="p-6 space-y-5 rounded-2xl border border-slate-700/40 bg-surface-3 shadow-xl">
            <div>
              <span className="text-[10px] font-bold tracking-widest text-cyan-300 uppercase">Checkout Session</span>
              <h2 className="mt-1 font-serif text-xl font-normal text-iris-pearl"><T text={"สรุปการชำระเงิน"} /></h2>
            </div>

            <div className="space-y-3 border-b border-slate-700/40 pb-4 text-xs">
              <div className="flex justify-between gap-4">
                <span className="text-iris-muted"><T text={"ประมาณการจาก catalog:"} /></span>
                <span className="font-mono text-white/70 tabular-nums">
                  {productsLoading ? '…' : <>{`~${estimateSubtotal.toLocaleString()}`}<IrisCoin size={16} className="ml-1 inline-block align-text-bottom" /><span className="tk-sr">IC</span></>}
                </span>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-700/40 pt-2 text-sm font-bold text-iris-pearl">
                <span><T text={"ยอดสุทธิจากระบบ (Backend Total):"} /></span>
                <span className="font-mono text-lg text-iris-gold tabular-nums">
                  {previewMutation.isPending && authoritativeTotal === null ? (
                    <Loader2 className="inline h-4 w-4 animate-spin" />
                  ) : authoritativeTotal !== null ? (
                    <>{authoritativeTotal}<IrisCoin size={18} className="ml-1 inline-block align-text-bottom" /><span className="tk-sr">IC</span></>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
            </div>

            <div className="flex gap-2 rounded-2xl border border-iris-cyan/10 bg-iris-cyan/[0.04] p-3 text-[10px] leading-relaxed text-iris-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-iris-cyan" />
              <span><T text={"ราคาสุดท้าย สิทธิ์ซื้อ โปรโมชัน สต็อก และการหัก wallet ตรวจที่ Backend เท่านั้น หน้าเว็บนี้ไม่คำนวณ final price เอง"} /></span>
            </div>

            {user && (
              <div className="space-y-2 text-[11px]">
                <div className="flex justify-between gap-4">
                  <span className="text-iris-muted"><T text={"ยอดใช้ได้ (Available):"} /></span>
                  <span className="font-mono font-bold text-iris-cyan">
                    {isWalletLoading ? '…' : isWalletError ? 'โหลดไม่สำเร็จ' : <>{availableBalance ?? '—'}<IrisCoin size={16} className="ml-1 inline-block align-text-bottom" /><span className="tk-sr">IC</span></>}
                  </span>
                </div>

                {affordabilityKnown && !isAffordable && (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-rose-300 space-y-1">
                    <p className="font-bold"><T text={"ยอดคงเหลือไม่เพียงพอ"} /></p>
                    <p><T text={"ยอดใช้ได้ "} />{availableBalance}<T text={" IC ไม่พอกับยอดสุทธิ "} />{authoritativeTotal} IC</p>
                    <Link href="/topup" className="block pt-1 font-bold text-iris-gold hover:underline"><T text={"ไปหน้าเติมเงิน"} /></Link>
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
                (!!user && activeServerId === null) ||
                (!!user && affordabilityKnown && !isAffordable)
              }
              isLoading={checkoutStep === 'submitting'}
              onClick={handleCheckoutSubmit}
            >
              <T text={user ? 'ยืนยันคำสั่งซื้อและจัดส่งเข้าเกม' : 'เข้าสู่ระบบเพื่อชำระเงิน'} />
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
