import { LEGACY_ARTWORK_MAP } from './legacyArtworkIndex';
import arkArtwork from './arkArtwork.json';
const ARK_ARTWORK_MAP: Record<string,string> = arkArtwork;

type VisualProduct = {
  id?: number | string;
  name?: string;
  imageUrl?: string | null;
  categoryId?: number | null;
  productType?: string;
  category?: { id?: number; name?: string | null; icon?: string | null } | null;
};
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export function getProductImageUrl(product: VisualProduct): string {
  const name = product.name || '';
  const clean = name.replace(/\s*\((?:lv\.?\s*\d+|\d+x)\)/ig, '').trim();
  // Exact species/item icons keep the catalogue consistent without random substitutions.
  for (const key of [normalize(name), normalize(clean)]) {
    if (ARK_ARTWORK_MAP[key]) return ARK_ARTWORK_MAP[key];
  }
  if (product.imageUrl && !/generic|placeholder/.test(product.imageUrl)) return product.imageUrl;
  for (const key of [normalize(name), normalize(clean)]) {
    if (LEGACY_ARTWORK_MAP[key]) return LEGACY_ARTWORK_MAP[key];
  }
  return '/images/products/iris-product-generic.svg';
}
export function getProductArtworkSrc(product?: VisualProduct | null): string {
  return product ? getProductImageUrl(product) : '/images/products/iris-product-generic.svg';
}
