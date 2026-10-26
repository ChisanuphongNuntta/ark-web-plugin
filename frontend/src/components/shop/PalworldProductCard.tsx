'use client';
import { IrisCoin } from '@/components/ui/IrisCoin';
import { T, useLanguage } from '@/components/i18n/LanguageProvider';

import { Plus } from 'lucide-react';
import { categoryLabel } from '@/lib/catalogLabels';
import type { Product } from '@/lib/contracts/types';
import { ProductArtwork } from '@/components/ProductArtwork';
import { tekCategory } from '@/components/tek/TekProductCard';

/** Shop grid card (Tek hex slot). Opens the buy modal through onQuickBuy. */
export function PalworldProductCard({
  product,
  onQuickBuy,
}: {
  product: Product;
  onQuickBuy?: (product: Product) => void;
}) {
  const { t } = useLanguage();
  const handleClick = () => {
    if (onQuickBuy) {
      onQuickBuy(product);
    }
  };
  const flag = product.isFeatured ? 'HOT' : product.isBlueprint ? 'BP' : product.price >= 800 ? 'ELITE' : null;

  return (
    <article className={`tk-card tk-panel tk-lift ${tekCategory(product)}`}>
      <button type="button" onClick={handleClick} className="tk-card-main" aria-label={`ดูรายละเอียดและซื้อ ${product.name}`}>
        <div className="tk-slot">
          <ProductArtwork product={product} alt="" fit="contain" className="tk-art" />
          {flag ? <span className={`tk-flag ${flag.toLowerCase()}`}>{flag}</span> : null}
        </div>
        <span className="tk-card-cat">
          {t(categoryLabel(product.category?.name || 'Items'), product.category?.name || 'Items')}
          <T text={product.isBlueprint ? ' · พิมพ์เขียว' : ''} />
        </span>
        <h3>{product.name}</h3>
      </button>
      <div className="tk-card-row">
        <div>
          <span className="tk-sr"><T text={"ราคาต่อหน่วย"} /></span>
          <span className="tk-price tk-mono">
            <IrisCoin size={22} />{product.price.toLocaleString()}
            <i>IC</i>
          </span>
        </div>
        <button
          type="button"
          onClick={handleClick}
          className="tk-add"
          aria-label={`เลือกเซิร์ฟเวอร์และซื้อ ${product.name}`}
          title="เลือกเซิร์ฟเวอร์และเพิ่มลงตะกร้า"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
