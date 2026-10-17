'use client';

import { ClaimCommand } from '@/components/ClaimCommand';
import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, Minus, Plus, Trash2 } from 'lucide-react';
import { cartApi, checkoutApi, shopApi, toContractError, walletContractApi } from '@/lib/contracts/client';
import type { Product } from '@/lib/contracts/types';
import { canAfford, cartLineKey, useAuthStore, useCartStore } from '@/lib/store';
import {
  Amount,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorMessage,
  IconButton,
  PageHeader,
  Skeleton,
  Spinner,
  buttonVariants,
  formatAmount,
} from '@/components/ui';
import { useServers } from '@/components/servers';
import { ProductArtwork } from '@/components/ProductArtwork';
import { discordLoginUrl } from '@/components/account/DiscordMark';
import { CheckoutSteps } from './CheckoutSteps';
import { LineServer, lineBlockReason } from './LineServer';

type CheckoutStep = 'cart' | 'submitting' | 'success';

const MAX_QTY = 99;

function makeIdempotencyKey() {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `checkout:${suffix}`;
}

function validationMessage(status: number | null | undefined, message: string) {
  return status === 400 || status === 404 ? `ตะกร้ายังไม่ผ่านการตรวจสอบ: ${message}` : message;
}

export default function CartPage() {
  const { user } = useAuthStore();
  const { items, removeItem, setQuantity, setLineServer, clear } = useCartStore();
  const [checkoutStep, setCheckoutStep] = React.useState<CheckoutStep>('cart');
  const [orderIds, setOrderIds] = React.useState<string[]>([]);
  const [authoritativeTotal, setAuthoritativeTotal] = React.useState<string | null>(null);
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);
  const [confirmClear, setConfirmClear] = React.useState(false);

  const productQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ['cart-product', item.productId],
      queryFn: () => shopApi.getProduct(item.productId).then((response) => response.product),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const serversQuery = useServers();
  const servers = React.useMemo(() => serversQuery.data ?? [], [serversQuery.data]);

  const walletQuery = useQuery({
    queryKey: ['wallet-balance-cart-contract'],
    queryFn: () => walletContractApi.getBalance(),
    enabled: Boolean(user),
  });

  const productsLoading = productQueries.some((query) => query.isLoading);
  const productsError = productQueries.some((query) => query.isError);
  const availableBalance = walletQuery.data?.accounts.available ?? null;

  const syncLines = React.useMemo(
    () => items.map((item) => ({ productId: item.productId, serverId: item.serverId, quantity: item.quantity })),
    [items]
  );
  const syncSignature = React.useMemo(() => JSON.stringify(syncLines), [syncLines]);

  // Display-only estimate from catalog unit prices. The backend total is authoritative.
  const estimateSubtotal = React.useMemo(
    () =>
      items.reduce((sum, item, index) => {
        const product = productQueries[index]?.data as Product | undefined;
        return product ? sum + product.price * item.quantity : sum;
      }, 0),
    [items, productQueries]
  );
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  // Lines whose target cannot receive delivery (backend flags only). Only checked once servers loaded.
  const blockedLines = React.useMemo(() => {
    if (serversQuery.isLoading || serversQuery.isError) return 0;
    return items.filter((item, index) => {
      const product = productQueries[index]?.data as Product | undefined;
      return lineBlockReason(
        servers.find((s) => s.id === item.serverId),
        product?.productType === 'dino'
      );
    }).length;
  }, [items, productQueries, servers, serversQuery.isLoading, serversQuery.isError]);

  const affordabilityKnown = Boolean(user && availableBalance !== null && authoritativeTotal !== null);
  const isAffordable = affordabilityKnown && canAfford(availableBalance as string, authoritativeTotal as string);

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
      const error = toContractError(err, 'ตรวจยอดสุทธิไม่สำเร็จ ลองอีกครั้ง');
      setAuthoritativeTotal(null);
      setCheckoutError(validationMessage(error.status, error.message));
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
      const error = toContractError(err, 'ยืนยันคำสั่งซื้อไม่สำเร็จ ยังไม่มีการหักเงิน');
      setCheckoutStep('cart');
      setCheckoutError(validationMessage(error.status, error.message));
    },
  });

  React.useEffect(() => {
    if (!user || syncLines.length === 0 || previewMutation.isPending) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the previous total is stale once the cart changes
    setAuthoritativeTotal(null);
    previewMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, syncSignature]);

  const handleCheckoutSubmit = () => {
    setCheckoutError(null);
    if (!user) {
      window.location.href = discordLoginUrl();
      return;
    }
    setCheckoutStep('submitting');
    commitMutation.mutate();
  };

  /* ------------------------------ success ------------------------------ */

  if (checkoutStep === 'success') {
    return (
      <div className="page-shell pb-16">
        <div className="mx-auto max-w-xl pt-10 sm:pt-14">
          <CheckoutSteps current={2} className="mb-8" />
          <Card padding="lg">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-success/30 text-success">
              <Check className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.015em] text-fg">สั่งซื้อเรียบร้อย</h1>
            <p className="mt-2 text-sm text-fg-muted">
              หักยอดจากกระเป๋าแล้ว ระบบกำลังส่งของเข้าเซิร์ฟเวอร์ที่คุณเลือก ติดตามสถานะได้ในหน้าคำสั่งซื้อ
            </p>

            <dl className="mt-6 divide-y divide-line rounded-card border border-line">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-sm text-fg-muted">ยอดที่ชำระ</dt>
                <dd>
                  <Amount value={authoritativeTotal} size="lg" />
                </dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-sm text-fg-muted">
                  หมายเลขคำสั่งซื้อ <span className="font-mono text-fg-subtle">({orderIds.length})</span>
                </dt>
                <dd className="mt-2 space-y-1">
                  {orderIds.map((id) => (
                    <Link
                      key={id}
                      href={`/orders/${id}`}
                      className="block break-all font-mono text-xs text-fg underline-offset-4 hover:text-accent hover:underline"
                    >
                      {id}
                    </Link>
                  ))}
                </dd>
              </div>
            </dl>

            <p className="mt-5 text-sm text-fg-muted">
              ถ้าของยังไม่เข้า ให้พิมพ์{' '}
              <ClaimCommand />{' '}
              ในเกม
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/orders" className={buttonVariants()}>
                ติดตามการจัดส่ง
              </Link>
              <Link href="/shop" className={buttonVariants({ variant: 'secondary' })}>
                เลือกซื้อต่อ
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  /* ------------------------------- empty -------------------------------- */

  if (items.length === 0) {
    return (
      <div className="page-shell pb-16">
        <PageHeader eyebrow="ร้านค้า" title="ตะกร้า" />
        <EmptyState
          title="ตะกร้ายังว่าง"
          description="เลือกไอเทมหรือสัตว์จากร้านค้า แล้วเลือกเซิร์ฟเวอร์ที่จะรับของ รายการจะมาอยู่ที่นี่"
          action={
            <Link href="/shop" className={buttonVariants()}>
              ไปที่ร้านค้า
            </Link>
          }
        />
      </div>
    );
  }

  /* -------------------------------- cart -------------------------------- */

  const submitting = checkoutStep === 'submitting';
  // Paying needs a loaded server list: without it no line can be checked as deliverable.
  const serversReady = !serversQuery.isLoading && !serversQuery.isError;
  const canSubmit =
    !submitting &&
    !productsLoading &&
    !productsError &&
    blockedLines === 0 &&
    !(user && !serversReady) &&
    !(user && affordabilityKnown && !isAffordable);

  return (
    <div className="page-shell pb-16">
      <PageHeader
        eyebrow="ร้านค้า"
        title="ตะกร้า"
        description="ตรวจรายการและเซิร์ฟเวอร์ที่จะรับของ ก่อนชำระด้วย Iris Coin"
        actions={
          <>
            <Link href="/shop" className={buttonVariants({ variant: 'ghost' })}>
              เลือกซื้อต่อ
            </Link>
            <Button variant="ghost" onClick={() => setConfirmClear(true)}>
              ล้างตะกร้า
            </Button>
          </>
        }
      >
        <CheckoutSteps current={authoritativeTotal ? 1 : 0} />
      </PageHeader>

      {serversQuery.isError ? (
        <ErrorMessage
          className="mb-6"
          title="โหลดรายชื่อเซิร์ฟเวอร์ไม่สำเร็จ"
          message="ยังแก้จำนวนได้ แต่ควรโหลดรายชื่อเซิร์ฟเวอร์ใหม่ก่อนชำระ"
          onRetry={() => void serversQuery.refetch()}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="รายการในตะกร้า">
          <ul className="space-y-3">
            {items.map((item, index) => {
              const productQuery = productQueries[index];
              const product = productQuery?.data as Product | undefined;
              const lineKey = cartLineKey(item.productId, item.serverId);

              if (productQuery?.isLoading) {
                return (
                  <li key={lineKey}>
                    <Card padding="md" aria-busy="true" className="flex items-center gap-4">
                      <Skeleton className="h-16 w-16 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </Card>
                  </li>
                );
              }

              if (productQuery?.isError || !product) {
                return (
                  <li key={lineKey}>
                    <Card padding="md" className="flex items-center justify-between gap-4">
                      <p className="inline-flex items-center gap-2 text-sm text-fg-muted">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-danger" strokeWidth={1.5} aria-hidden="true" />
                        โหลดข้อมูลสินค้า <span className="font-mono">#{item.productId}</span> ไม่สำเร็จ
                      </p>
                      <Button variant="ghost" size="sm" onClick={() => removeItem(item.productId, item.serverId)}>
                        นำออก
                      </Button>
                    </Card>
                  </li>
                );
              }

              const isDino = product.productType === 'dino';
              const maxQty = isDino ? 1 : MAX_QTY;

              return (
                <li key={lineKey}>
                  <Card padding="none">
                    <div className="flex gap-4 p-4 sm:p-5">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-surface-2 sm:h-20 sm:w-20">
                        <ProductArtwork product={product} alt={product.name} className="h-full w-full object-contain p-1.5" />
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs text-fg-subtle">{product.category?.name || 'ร้านค้า IRIS'}</p>
                          <h3 className="mt-0.5 truncate text-base font-semibold text-fg">{product.name}</h3>
                          <p className="mt-1 text-xs text-fg-muted">
                            <Amount value={product.price} size="sm" /> <span className="text-fg-subtle">ต่อชิ้น</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <div
                            className="inline-flex h-9 items-center rounded-control border border-line-strong"
                            role="group"
                            aria-label={`จำนวน ${product.name}`}
                          >
                            <button
                              type="button"
                              onClick={() => setQuantity(item.productId, item.serverId, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                              className="flex h-full w-9 items-center justify-center text-fg-muted transition-colors duration-fast hover:text-fg disabled:opacity-40"
                              aria-label="ลดจำนวน"
                            >
                              <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </button>
                            <span className="min-w-8 text-center font-mono text-sm tabular-nums text-fg" aria-live="polite">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => setQuantity(item.productId, item.serverId, item.quantity + 1)}
                              disabled={item.quantity >= maxQty}
                              className="flex h-full w-9 items-center justify-center text-fg-muted transition-colors duration-fast hover:text-fg disabled:opacity-40"
                              aria-label="เพิ่มจำนวน"
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </button>
                          </div>
                          <IconButton
                            aria-label={`นำ ${product.name} ออกจากตะกร้า`}
                            size="sm"
                            onClick={() => removeItem(item.productId, item.serverId)}
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                          </IconButton>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-line px-4 py-3 sm:px-5">
                      <LineServer
                        serverId={item.serverId}
                        servers={servers}
                        loading={serversQuery.isLoading}
                        error={serversQuery.isError}
                        onRetry={() => void serversQuery.refetch()}
                        isDino={isDino}
                        onChange={(to) => setLineServer(item.productId, item.serverId, to)}
                      />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="สรุปยอด">
          <Card padding="none">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-base font-semibold text-fg">สรุปยอด</h2>
              <p className="mt-0.5 text-xs text-fg-muted">
                <span className="font-mono">{totalQuantity}</span> ชิ้น ·{' '}
                <span className="font-mono">{items.length}</span> รายการ
              </p>
            </div>

            <dl className="space-y-3 px-5 py-4 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-fg-muted">ยอดโดยประมาณ</dt>
                <dd className="font-mono tabular-nums text-fg-muted">
                  {productsLoading ? '…' : `${formatAmount(estimateSubtotal)} IC`}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
                <dt className="font-medium text-fg">ยอดชำระสุทธิ</dt>
                <dd>
                  {previewMutation.isPending && authoritativeTotal === null ? (
                    <Spinner label="กำลังตรวจยอด" />
                  ) : authoritativeTotal !== null ? (
                    <Amount value={authoritativeTotal} size="lg" />
                  ) : (
                    <span className="font-mono text-fg-subtle">—</span>
                  )}
                </dd>
              </div>
              {user ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-fg-muted">ยอดในกระเป๋าที่ใช้ได้</dt>
                  <dd className="font-mono tabular-nums text-fg">
                    {walletQuery.isLoading
                      ? '…'
                      : walletQuery.isError
                        ? 'โหลดไม่สำเร็จ'
                        : `${formatAmount(availableBalance)} IC`}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="space-y-3 px-5 pb-5">
              <p className="text-xs leading-relaxed text-fg-subtle">
                ยอดสุทธิ โปรโมชัน สิทธิ์ซื้อ และสต็อก ตรวจโดยระบบหลังบ้านทุกครั้งก่อนหักเงิน
                {user ? '' : ' เข้าสู่ระบบเพื่อดูยอดสุทธิ'}
              </p>

              {affordabilityKnown && !isAffordable ? (
                <div className="rounded-control border border-danger/25 bg-danger/10 p-3 text-sm" role="alert">
                  <p className="font-medium text-danger">ยอดในกระเป๋าไม่พอ</p>
                  <p className="mt-1 text-xs text-fg-muted">
                    ต้องใช้ <span className="font-mono text-fg">{formatAmount(authoritativeTotal)} IC</span> มีอยู่{' '}
                    <span className="font-mono text-fg">{formatAmount(availableBalance)} IC</span>
                  </p>
                  <Link href="/topup" className="mt-2 inline-block text-xs font-medium text-accent underline-offset-4 hover:underline">
                    เติม Iris Coin
                  </Link>
                </div>
              ) : null}

              {blockedLines > 0 ? (
                <p className="rounded-control border border-warning/25 bg-warning/10 p-3 text-xs text-fg" role="alert">
                  มี <span className="font-mono">{blockedLines}</span> รายการที่เซิร์ฟเวอร์ปลายทางยังรับของไม่ได้
                  เปลี่ยนเซิร์ฟเวอร์ก่อนชำระ
                </p>
              ) : null}

              {checkoutError ? <ErrorMessage variant="inline" message={checkoutError} /> : null}

              <Button fullWidth size="lg" disabled={!canSubmit} loading={submitting} onClick={handleCheckoutSubmit}>
                {user ? 'ยืนยันและชำระ' : 'เข้าสู่ระบบเพื่อชำระ'}
              </Button>
              {user && checkoutError && !submitting ? (
                <Button fullWidth variant="ghost" size="sm" onClick={() => previewMutation.mutate()} loading={previewMutation.isPending}>
                  ตรวจยอดอีกครั้ง
                </Button>
              ) : null}
            </div>
          </Card>
        </aside>
      </div>

      <Dialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="ล้างตะกร้า?"
        description="รายการทั้งหมดในตะกร้าจะถูกนำออก ยังไม่มีการหักเงินใด ๆ"
        variant="warning"
        confirmText="ล้างตะกร้า"
        cancelText="ยกเลิก"
        onConfirm={() => {
          clear();
          setAuthoritativeTotal(null);
          setConfirmClear(false);
        }}
      />
    </div>
  );
}
