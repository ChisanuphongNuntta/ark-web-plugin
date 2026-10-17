'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus } from 'lucide-react';
import type { Product, ServerSummary } from '@/lib/contracts/types';
import { useCartStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import { categoryLabel } from '@/lib/catalogLabels';
import { Dialog, DialogFooter, useDialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Amount, formatAmount } from '@/components/ui/Amount';
import { CopyField } from '@/components/ui/CopyField';
import { ProductArtwork } from '@/components/ProductArtwork';
import { ServerPicker } from '@/components/servers/ServerPicker';
import { deliveryBlockReason } from '@/components/servers/serverMeta';
import { useServers } from '@/components/servers/useServers';

/** ARK item quality tiers (proper nouns, kept in English). */
const QUALITY_LABEL: Record<number, string> = {
  0: 'Primitive',
  1: 'Ramshackle',
  2: 'Apprentice',
  3: 'Journeyman',
  4: 'Mastercraft',
  5: 'Ascendant',
};

const TYPE_LABEL: Record<string, string> = {
  item: 'ไอเทม',
  dino: 'สัตว์',
  engram: 'เอนแกรม',
  kit: 'ชุดสินค้า',
};

const MAX_QTY = 99;

/** Minimal product shape the modal needs (contract Product satisfies it). */
export type BuyableProduct = Pick<Product, 'id' | 'name' | 'price'> &
  Partial<Omit<Product, 'id' | 'name' | 'price' | 'description'>> & { description?: string | null };

export interface ProductBuyModalProps {
  product: BuyableProduct | null;
  isOpen: boolean;
  onClose: () => void;
  /** Show the full description, spec list and (admins only) the spawn command. */
  detailed?: boolean;
}

/**
 * Buy dialog: artwork, price (mono), server picker, quantity stepper,
 * estimated subtotal, "ตรวจยอดและชำระ" (primary) + "เพิ่มในตะกร้า" (secondary).
 * The final total is computed by the backend at checkout — the subtotal here is
 * labelled as an estimate (unit price × quantity) and never used for payment.
 */
export function ProductBuyModal({ product, isOpen, onClose, detailed = false }: ProductBuyModalProps) {
  const open = isOpen && !!product;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="lg">
      {product ? <BuyPanel key={product.id} product={product} onClose={onClose} detailed={detailed} /> : null}
    </Dialog>
  );
}

function BuyPanel({ product, onClose, detailed }: { product: BuyableProduct; onClose: () => void; detailed: boolean }) {
  const router = useRouter();
  const dialog = useDialog();
  const qtyLabelId = React.useId();
  const addItem = useCartStore((s) => s.addItem);
  const setDrawerOpen = useCartStore((s) => s.setDrawerOpen);
  const { canManageProducts } = usePermissions();

  const [quantity, setQuantity] = React.useState(1);
  const [serverId, setServerId] = React.useState<number | null>(null);
  const serversQuery = useServers();

  const isDino = product.productType === 'dino';
  const qtyLocked = isDino;
  const servers = serversQuery.data ?? [];
  const hasDeliverable = servers.some((s) => s.deliverable && s.available);

  const dinoReason = React.useCallback(
    (s: ServerSummary) =>
      isDino && s.supportsDinoDelivery === false ? 'เซิร์ฟเวอร์นี้ยังไม่รองรับการส่งสัตว์' : null,
    [isDino]
  );

  // Re-check the chosen server against the latest list (ServerPicker refetches every
  // 60s and on focus): it may have been drained, closed or lost its credential.
  const selected = serverId !== null ? servers.find((s) => s.id === serverId) : undefined;
  const selectedBlock = selected ? deliveryBlockReason(selected) ?? dinoReason(selected) : null;
  const canSubmit = !serversQuery.isLoading && !serversQuery.isError && !!selected && !selectedBlock;

  const commit = (goToCheckout: boolean) => {
    if (!canSubmit || !selected) return;
    addItem(product.id, selected.id, quantity);
    onClose();
    if (goToCheckout) {
      setDrawerOpen(false);
      router.push('/cart');
    }
    // Otherwise the cart store opens the cart drawer as confirmation.
  };

  const quality = QUALITY_LABEL[product.quality ?? 0];
  const category = product.category?.name ? categoryLabel(product.category.name) : null;
  const blueprint = product.itemBlueprint ?? product.blueprint ?? null;
  const spawnCommand = blueprint
    ? `admincheat GiveItem "${blueprint}" ${product.quantity || 1} ${product.quality || 0} ${product.isBlueprint ? 1 : 0}`
    : null;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Product summary */}
        <div className="grid gap-5 border-b border-line px-5 py-5 pr-14 sm:grid-cols-[160px_1fr] sm:px-6 sm:pr-14">
          <div className="relative aspect-square w-32 overflow-hidden rounded-card border border-line bg-surface-2 sm:w-full">
            <ProductArtwork product={product as Product} fit="contain" className="h-full w-full p-3" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {category ? <Badge tone="neutral">{category}</Badge> : null}
              {product.isBlueprint ? <Badge tone="info" outline>พิมพ์เขียว</Badge> : null}
              {!isDino && product.quality !== undefined ? (
                <Badge tone="neutral" outline>
                  {quality}
                </Badge>
              ) : null}
            </div>
            <h2 id={dialog?.titleId} className="mt-3 text-xl font-semibold leading-snug text-fg">
              {product.name}
            </h2>
            {product.description ? (
              <p className={detailed ? 'mt-2 text-sm text-fg-muted' : 'mt-2 line-clamp-2 text-sm text-fg-muted'}>
                {product.description}
              </p>
            ) : null}
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-xs text-fg-subtle">ราคาต่อชิ้น</span>
              <Amount value={product.price} size="lg" />
            </div>
          </div>
        </div>

        {detailed ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-line px-5 py-4 text-sm sm:grid-cols-4 sm:px-6">
            <Spec label="ประเภท" value={TYPE_LABEL[product.productType ?? 'item'] ?? 'ไอเทม'} />
            <Spec label="จำนวนต่อชุด" value={<span className="font-mono">{product.quantity ?? 1}</span>} />
            <Spec label="คุณภาพ" value={isDino ? '—' : quality} />
            <Spec label="พิมพ์เขียว" value={product.isBlueprint ? 'ใช่' : 'ไม่ใช่'} />
          </dl>
        ) : null}

        {/* Server */}
        <div className="px-5 py-5 sm:px-6">
          <ServerPicker
            servers={servers}
            value={serverId}
            onChange={(id) => setServerId(id)}
            loading={serversQuery.isLoading}
            error={serversQuery.isError ? 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง' : null}
            onRetry={() => void serversQuery.refetch()}
            disabledReason={dinoReason}
            maxHeight={260}
          />
        </div>

        {/* Quantity */}
        {hasDeliverable || serversQuery.isLoading ? (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-4 sm:px-6">
            <div>
              <p id={qtyLabelId} className="text-xs font-medium text-fg-muted">
                จำนวน
              </p>
              {qtyLocked ? <p className="text-xs text-fg-subtle">สัตว์ซื้อได้ครั้งละ 1 ตัว</p> : null}
            </div>
            <div className="inline-flex items-center rounded-control border border-line-strong" role="group" aria-labelledby={qtyLabelId}>
              <button
                type="button"
                onClick={() => setQuantity((v) => Math.max(1, v - 1))}
                disabled={quantity <= 1 || qtyLocked}
                className="grid h-9 w-9 place-items-center text-fg-muted transition-colors duration-fast hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                aria-label="ลดจำนวน"
              >
                <Minus className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_QTY}
                value={quantity}
                disabled={qtyLocked}
                onChange={(e) => {
                  const n = Math.floor(Number(e.target.value));
                  setQuantity(Number.isFinite(n) ? Math.min(MAX_QTY, Math.max(1, n)) : 1);
                }}
                className="h-9 w-12 border-x border-line bg-transparent text-center font-mono text-sm text-fg focus:outline-none"
                aria-label="จำนวนสินค้า"
              />
              <button
                type="button"
                onClick={() => setQuantity((v) => Math.min(MAX_QTY, v + 1))}
                disabled={quantity >= MAX_QTY || qtyLocked}
                className="grid h-9 w-9 place-items-center text-fg-muted transition-colors duration-fast hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                aria-label="เพิ่มจำนวน"
              >
                <Plus className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        ) : null}

        {detailed && canManageProducts && spawnCommand ? (
          <div className="border-t border-line px-5 py-4 sm:px-6">
            <CopyField label="คำสั่งเสกของ (เฉพาะผู้ดูแล)" value={spawnCommand} size="sm" />
          </div>
        ) : null}
      </div>

      <div className="border-t border-line px-5 py-4 sm:px-6">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-fg-muted">ยอดโดยประมาณ</span>
          <span className="inline-flex items-baseline gap-1">
            <span className="font-mono text-xl font-medium tabular-nums text-fg">
              {formatAmount(product.price * quantity)}
            </span>
            <span className="text-xs text-fg-subtle">IC</span>
          </span>
        </div>
        <p className="mt-1 text-xs text-fg-subtle">ยอดสุดท้ายรวมส่วนลดจะยืนยันอีกครั้งในขั้นตอนชำระเงิน</p>
        {selectedBlock ? (
          <p role="alert" className="mt-2 text-xs text-warning">
            {selected?.displayName}: {selectedBlock} เลือกเซิร์ฟเวอร์อื่น
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button variant="secondary" disabled={!canSubmit} onClick={() => commit(false)}>
          เพิ่มในตะกร้า
        </Button>
        <Button disabled={!canSubmit} onClick={() => commit(true)}>
          ตรวจยอดและชำระ
        </Button>
      </DialogFooter>
    </>
  );
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-fg">{value}</dd>
    </div>
  );
}

export default ProductBuyModal;
