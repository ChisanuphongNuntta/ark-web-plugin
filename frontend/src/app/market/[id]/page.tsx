'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, TrendingUp } from 'lucide-react';
import { dinoMarketApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { AnimalMetadata } from '@/components/market/AnimalMetadata';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { AdminNotice, ConfirmDialog, adminInputClass } from '@/components/admin';
import { VipAvatar, VipBadgePill } from '@/components/vip/VipAvatar';
import { toVipBadge } from '@/lib/vip';
import { type MarketAnimal } from '@/lib/market';
import { marketArtwork } from '@/lib/marketArtwork';
import { apiErrorText } from '@/lib/adminConsoleApi';
import { syncWalletNow } from '@/lib/realtime/walletSync';

export default function DinoDetailPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const client = useQueryClient();
  const user = useAuthStore(s => s.user);
  const [serverId, setServer] = useState(''); const [confirm, setConfirm] = useState(false);
  const listingQuery = useQuery({ queryKey: ['dinoListing', id], queryFn: () => dinoMarketApi.getListingById(id).then(r => r.data), enabled: !!id });
  const serversQuery = useQuery({ queryKey: ['dinoDeliveryServers'], queryFn: () => dinoMarketApi.getDeliveryServers().then(r => r.data) });
  const listing = listingQuery.data?.listing as (MarketAnimal & { sellerId: string; seller?: { discordUsername?: string; discordAvatar?: string; vip?: unknown } }) | undefined;
  const servers = (serversQuery.data?.servers ?? []).filter((s: { isOnline: boolean; drainMode?: boolean; supportsDinoDelivery?: boolean; supportsNativeDinoDelivery?: boolean }) => s.isOnline && !s.drainMode && s.supportsNativeDinoDelivery);
  const purchase = useMutation({ mutationFn: () => dinoMarketApi.buyDino(id, Number(serverId)), onSuccess: async () => { void syncWalletNow(client); await client.invalidateQueries({ queryKey: ['dinoListing', id] }); router.push('/market/my-purchases'); } });
  if (listingQuery.isPending) return <p className="page-shell py-16" role="status">กำลังโหลดสัตว์…</p>;
  if (!listing) return <div className="page-shell space-y-4 py-16"><AdminNotice tone="danger">{apiErrorText(listingQuery.error, 'ไม่พบสัตว์ในตลาด')}</AdminNotice><Link href="/market">กลับตลาด</Link></div>;
  const own = user?.id === listing.sellerId;
  const vip = toVipBadge(listing.seller?.vip);
  return <div className="page-shell mx-auto max-w-7xl space-y-6 py-8"><Link href="/market" className="inline-flex items-center gap-1.5 text-sm text-iris-cyan hover:underline"><ChevronLeft size={16} /> กลับตลาดผู้เล่น · Back to Market</Link>
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]"><GlassCard className="space-y-6 p-6">
      {/* Species reference artwork; exact animal colors are listed as native color IDs below. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={marketArtwork(listing).imageUrl} alt={`ภาพอ้างอิงสายพันธุ์ ${marketArtwork(listing).name}`} className="h-64 w-full rounded-xl bg-surface-1 object-contain" />
      <p className="text-xs text-iris-muted">ภาพอ้างอิงสายพันธุ์ สีจริงของสัตว์ดูจากรหัส Color Region ด้านล่าง</p>
      <div><p className="eyebrow">PLAYER MARKET</p><h1 className="mt-2 text-3xl font-semibold">{listing.dinoName || listing.species}</h1></div>
      <AnimalMetadata animal={listing} />
      {listing.description && <p className="whitespace-pre-wrap break-words border-t border-white/10 pt-4 text-sm">{listing.description}</p>}
    </GlassCard>
    <aside className="space-y-4"><GlassCard className="space-y-5 p-6"><div><p className="text-sm text-iris-muted">ราคาขาย · Listing Price</p><p className="mt-2 font-mono text-3xl text-iris-gold">{listing.price.toLocaleString('th-TH')} IC</p></div>
      <div className="flex items-center gap-3"><VipAvatar size={36} src={listing.seller?.discordAvatar} name={listing.seller?.discordUsername} vip={vip} /><span>{listing.seller?.discordUsername ?? 'ผู้ขาย'}</span><VipBadgePill vip={vip} /></div>
      <p className="text-xs leading-5 text-iris-muted">รับสัตว์ตัวที่ฝากไว้ในระบบ พร้อมข้อมูล native จากเกม การส่งมอบต้องใช้เซิร์ฟเวอร์ที่รองรับและผู้ซื้อพร้อมรับในเกม</p>
      {own ? <Link href="/market/my-listings" className="inline-flex items-center gap-1.5 text-sm text-iris-cyan hover:underline"><TrendingUp size={16} /> จัดการสัตว์ของฉัน · My Listings</Link> : listing.status !== 'listed' ? <AdminNotice>รายการนี้ไม่เปิดขายแล้ว</AdminNotice> : !user ? <Link href="/login" className="block text-iris-cyan">เข้าสู่ระบบเพื่อซื้อ · Login to Buy</Link> : <><label className="block space-y-2 text-sm"><span>เซิร์ฟเวอร์รับสัตว์ · Delivery Server</span><select className={adminInputClass} value={serverId} onChange={e => setServer(e.target.value)}><option value="">เลือกเซิร์ฟเวอร์ · Select Server</option>{servers.map((s: { id: number; name: string; map?: string }) => <option key={s.id} value={s.id}>{s.name} {s.map ? `(${s.map})` : ''}</option>)}</select></label>{serversQuery.isError && <AdminNotice tone="danger">โหลดเซิร์ฟเวอร์ไม่ได้</AdminNotice>}{serversQuery.isSuccess && servers.length === 0 && <AdminNotice>ยังไม่มีเซิร์ฟเวอร์พร้อมรับสัตว์ native</AdminNotice>}<Button className="w-full" disabled={!serverId || purchase.isPending} onClick={() => setConfirm(true)}>ซื้อสัตว์ · {listing.price.toLocaleString('th-TH')} IC</Button></>}
    </GlassCard></aside></div>
    <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} tone="default" title={`ซื้อ ${listing.dinoName || listing.species}`} description={`ราคา ${listing.price.toLocaleString('th-TH')} IC รับที่ ${servers.find((s: { id: number }) => s.id === Number(serverId))?.name ?? ''}`} confirmText="ยืนยันซื้อ" onConfirm={() => purchase.mutateAsync()} />
  </div>;
}
