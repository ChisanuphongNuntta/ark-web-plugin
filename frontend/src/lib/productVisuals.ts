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
export const PRODUCT_ARTWORK_FALLBACK = '/images/products/iris-product-generic.svg';

function artworkKeys(name: string): string[] {
  const clean = name.replace(/\s*\((?:lv\.?\s*\d+|\d+\s*lv\.?|\d+x)\)/ig, '').trim();
  return [...new Set([normalize(name), normalize(clean)])];
}

export function getProductArtworkCandidates(product?: VisualProduct | null): string[] {
  if (!product) return [PRODUCT_ARTWORK_FALLBACK];
  const keys = artworkKeys(product.name || '');
  // Respect the catalog's chosen picture. Name-based artwork is recovery only.
  const configured = product.imageUrl?.trim();
  const choices = [
    ...(configured && !/generic|placeholder/i.test(configured) ? [configured] : []),
    ...keys.map(key => ARK_ARTWORK_MAP[key]),
    ...keys.map(key => LEGACY_ARTWORK_MAP[key]),
    PRODUCT_ARTWORK_FALLBACK,
  ];
  return [...new Set(choices.filter((src): src is string => Boolean(src)))];
}

export function getProductImageUrl(product: VisualProduct): string {
  return getProductArtworkCandidates(product)[0];
}
export function getProductArtworkSrc(product?: VisualProduct | null): string {
  return getProductArtworkCandidates(product)[0];
}
