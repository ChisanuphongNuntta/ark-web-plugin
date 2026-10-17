import { redirect } from 'next/navigation';

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (id && id !== 'missing') {
    redirect(`/shop?buy=${id}`);
  }
  redirect('/shop');
}
