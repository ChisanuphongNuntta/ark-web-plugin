import { IrisCoin } from '@/components/ui/IrisCoin';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { Product } from '@/lib/contracts/types';
import { ProductArtwork } from '@/components/ProductArtwork';

export type TekProduct = Product & { badge?: 'HOT' | 'NEW' | 'SALE' | null };

/** Frame colour follows the product family (catalog items are mostly Primitive quality). */
export function tekCategory(product: Pick<Product, 'productType' | 'name' | 'category'>): string {
  if (product.productType === 'dino') return 'tk-cat-dino';
  const hay = `${product.category?.name ?? ''} ${product.name}`.toLowerCase();
  if (/saddle|อาน/.test(hay)) return 'tk-cat-saddle';
  if (/resource|element|ทรัพยากร|egg|ไข่/.test(hay)) return 'tk-cat-resource';
  if (/structure|foundation|wall|door|สิ่งก่อสร้าง|gate|turret|generator|teleporter/.test(hay)) return 'tk-cat-structure';
  return 'tk-cat-weapon';
}

export function TekProductCard({ product }: { product: TekProduct }) {
  const href = `/shop?buy=${product.id}`;
  return (
    <article className={`tk-card tk-panel tk-lift ${tekCategory(product)}`}>
      <Link href={href} className="tk-card-main" aria-label={`ดูรายละเอียดสินค้า ${product.name}`}>
        <div className="tk-slot">
          <ProductArtwork product={product} alt="" fit="contain" className="tk-art" />
        </div>
        <span className="tk-card-cat">
          {product.productType === 'dino' ? 'DINO' : product.category?.name || 'IRIS Store'}
          {product.quantity > 1 ? ` · x${product.quantity}` : ''}
        </span>
        <h3>{product.name}</h3>
      </Link>
      <div className="tk-card-row">
        <span className="tk-price tk-mono">
          <IrisCoin size={22} />{product.price.toLocaleString()}
          <i className="tk-sr">IC</i>
        </span>
        <Link href={href} className="tk-add" aria-label={`เลือกเซิร์ฟเวอร์และซื้อ ${product.name}`}>
          <Plus size={18} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
