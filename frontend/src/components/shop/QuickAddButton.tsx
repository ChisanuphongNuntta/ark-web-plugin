'use client';

import * as React from 'react';
import { Check, ShoppingCart } from 'lucide-react';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { useCartStore } from '@/lib/store';
import type { Product } from '@/lib/contracts/types';

/**
 * One-click add to the basket from a product card. No server question here: the basket has a single delivery
 * server that is picked once at checkout. A dino can only be bought once per basket (the buy popup locks its
 * quantity to 1 too), so a second click just confirms it is already there.
 */
export function QuickAddButton({ product }: { product: Pick<Product, 'id' | 'name' | 'productType'> }) {
  const { t } = useLanguage();
  const addItem = useCartStore((state) => state.addItem);
  const inCart = useCartStore((state) => state.items.some((item) => item.productId === product.id));
  const [flash, setFlash] = React.useState<'idle' | 'added' | 'already'>('idle');
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleAdd = () => {
    const already = product.productType === 'dino' && inCart;
    if (!already) addItem(product.id, 1, false);
    setFlash(already ? 'already' : 'added');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash('idle'), 1600);
  };

  return (
    <>
      <button type="button" onClick={handleAdd} className="tk-add" aria-label={`เพิ่ม ${product.name} ลงตะกร้า`} title="เพิ่มลงตะกร้า">
        {flash === 'idle' ? <ShoppingCart size={17} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
      </button>
      <span className="tk-sr" role="status" aria-live="polite">
        {flash === 'added' ? t('เพิ่มลงตะกร้าแล้ว', 'Added to cart') : flash === 'already' ? t('มีในตะกร้าแล้ว', 'Already in cart') : ''}
      </span>
    </>
  );
}
