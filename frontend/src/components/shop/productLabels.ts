import type { Product } from '@/lib/contracts/types';

/** ARK item quality tiers (game terms, kept in English). */
export const QUALITY_LABEL: Record<number, string> = {
  0: 'Primitive',
  1: 'Ramshackle',
  2: 'Apprentice',
  3: 'Journeyman',
  4: 'Mastercraft',
  5: 'Ascendant',
};

export const PRODUCT_TYPE_LABEL: Record<NonNullable<Product['productType']>, string> = {
  item: 'ไอเทม',
  dino: 'สัตว์',
  engram: 'เอนแกรม',
  kit: 'ชุดสินค้า',
};

/** Sort options the catalogue offers. `featured` keeps the backend order. */
export type CatalogSort = 'featured' | 'price_asc' | 'price_desc' | 'name';

export const CATALOG_SORT_OPTIONS: Array<{ value: CatalogSort; label: string }> = [
  { value: 'featured', label: 'แนะนำ' },
  { value: 'price_asc', label: 'ราคาน้อยไปมาก' },
  { value: 'price_desc', label: 'ราคามากไปน้อย' },
  { value: 'name', label: 'ชื่อ A–Z' },
];

export function isCatalogSort(value: string | null | undefined): value is CatalogSort {
  return !!value && CATALOG_SORT_OPTIONS.some((o) => o.value === value);
}

/**
 * Display ordering of an already-loaded page of products. This only reorders
 * what the backend returned (no prices are derived). The `sort` value is also
 * sent to GET /products so the backend can order across pages once it
 * supports the parameter.
 */
export function sortProducts<T extends Pick<Product, 'price' | 'name'>>(products: T[], sort: CatalogSort): T[] {
  if (sort === 'featured') return products;
  const copy = [...products];
  if (sort === 'price_asc') copy.sort((a, b) => a.price - b.price);
  else if (sort === 'price_desc') copy.sort((a, b) => b.price - a.price);
  else copy.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return copy;
}
