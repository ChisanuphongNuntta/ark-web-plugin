import type { Metadata } from 'next';
import { ProductDetail } from '@/components/shop/ProductDetail';

export const metadata: Metadata = {
  title: 'รายละเอียดสินค้า',
  description: 'รายละเอียดสินค้า ราคา และวิธีรับของในเกมจากร้านค้า IRIS Thailand',
};

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductDetail id={Number(id)} />;
}
