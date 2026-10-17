'use client';

import * as React from 'react';
import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { Amount, Drawer, IconButton, Skeleton, buttonVariants, formatAmount } from '@/components/ui';
import { useServers } from '@/components/servers';
import { ProductArtwork } from '@/components/ProductArtwork';
import { shopApi } from '@/lib/contracts/client';
import type { Product } from '@/lib/contracts/types';
import { cartLineKey, useCartStore } from '@/lib/store';

const MAX_QTY = 99;

/**
 * Quick cart opened from the header / after "เพิ่มในตะกร้า".
 * The estimate is display-only; /cart fetches the authoritative backend total.
 */
export function CartDrawer() {
  const { items, isDrawerOpen, setDrawerOpen, removeItem, setQuantity } = useCartStore();
  const servers = useServers({ enabled: isDrawerOpen && items.length > 0 });

  const productQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ['cart-product', item.productId],
      queryFn: () => shopApi.getProduct(item.productId).then((response) => response.product),
      staleTime: 5 * 60 * 1000,
      enabled: isDrawerOpen,
    })),
  });

  const estimateSubtotal = React.useMemo(
    () =>
      items.reduce((sum, item, index) => {
        const product = productQueries[index]?.data as Product | undefined;
        return product ? sum + product.price * item.quantity : sum;
      }, 0),
    [items, productQueries]
  );
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const serverLabel = (id: number) => servers.data?.find((s) => s.id === id)?.displayName ?? `เซิร์ฟเวอร์ #${id}`;

  const close = () => setDrawerOpen(false);

  return (
    <Drawer
      open={isDrawerOpen}
      onOpenChange={setDrawerOpen}
      side="right"
      size="md"
      title="ตะกร้า"
      description={items.length ? `${totalQuantity} ชิ้น` : undefined}
      footer={
        items.length > 0 ? (
          <div className="w-full space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-sm text-fg">ยอดโดยประมาณ</p>
                <p className="text-xs text-fg-subtle">ยอดสุทธิจะแสดงในหน้าตะกร้าก่อนชำระ</p>
              </div>
              <span className="font-mono text-lg tabular-nums text-fg">{formatAmount(estimateSubtotal)} IC</span>
            </div>
            <Link href="/cart" onClick={close} className={buttonVariants({ fullWidth: true })}>
              ไปที่ตะกร้าและชำระ
            </Link>
          </div>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center py-16 text-center">
          <p className="text-base font-semibold text-fg">ตะกร้ายังว่าง</p>
          <p className="mt-1 max-w-[240px] text-sm text-fg-muted">เลือกสินค้าและเซิร์ฟเวอร์ที่จะรับของ แล้วรายการจะมาอยู่ที่นี่</p>
          <Link href="/shop" onClick={close} className={buttonVariants({ variant: 'secondary', size: 'sm', className: 'mt-6' })}>
            ไปที่ร้านค้า
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item, index) => {
            const query = productQueries[index];
            const product = query?.data as Product | undefined;
            const lineKey = cartLineKey(item.productId, item.serverId);

            if (query?.isLoading) {
              return (
                <li key={lineKey} className="flex items-center gap-3 py-4" aria-busy="true">
                  <Skeleton className="h-14 w-14 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </li>
              );
            }

            if (!product) {
              return (
                <li key={lineKey} className="flex items-center justify-between gap-3 py-4 text-sm">
                  <span className="text-fg-muted">
                    โหลดสินค้า <span className="font-mono">#{item.productId}</span> ไม่สำเร็จ
                  </span>
                  <button
                    type="button"
                    className="text-xs text-danger underline-offset-4 hover:underline"
                    onClick={() => removeItem(item.productId, item.serverId)}
                  >
                    นำออก
                  </button>
                </li>
              );
            }

            const maxQty = product.productType === 'dino' ? 1 : MAX_QTY;

            return (
              <li key={lineKey} className="flex gap-3 py-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-surface-2">
                  <ProductArtwork product={product} alt={product.name} className="h-full w-full object-contain p-1" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{product.name}</p>
                  <p className="mt-0.5 truncate text-xs text-fg-subtle">ส่งไปที่ {serverLabel(item.serverId)}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Amount value={product.price} size="sm" />
                    <div className="flex items-center gap-1">
                      <div className="inline-flex h-8 items-center rounded-control border border-line-strong" role="group" aria-label={`จำนวน ${product.name}`}>
                        <button
                          type="button"
                          onClick={() => setQuantity(item.productId, item.serverId, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="flex h-full w-8 items-center justify-center text-fg-muted transition-colors duration-fast hover:text-fg disabled:opacity-40"
                          aria-label="ลดจำนวน"
                        >
                          <Minus className="h-3 w-3" strokeWidth={1.5} />
                        </button>
                        <span className="min-w-7 text-center font-mono text-xs tabular-nums text-fg">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setQuantity(item.productId, item.serverId, item.quantity + 1)}
                          disabled={item.quantity >= maxQty}
                          className="flex h-full w-8 items-center justify-center text-fg-muted transition-colors duration-fast hover:text-fg disabled:opacity-40"
                          aria-label="เพิ่มจำนวน"
                        >
                          <Plus className="h-3 w-3" strokeWidth={1.5} />
                        </button>
                      </div>
                      <IconButton aria-label={`นำ ${product.name} ออก`} size="sm" onClick={() => removeItem(item.productId, item.serverId)}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </IconButton>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}

export default CartDrawer;
