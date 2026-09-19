'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { dinoMarketApi, authApi } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import {
  Loader2,
  ArrowLeft,
  Heart,
  Zap,
  Droplets,
  Utensils,
  Weight,
  Sword,
  Gauge,
  Dna,
  User,
  Calendar,
  ShoppingCart,
  AlertCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { getProductImageUrl } from '@/lib/productVisuals';

// Stat display component
function StatBar({
  label,
  icon: Icon,
  baseValue,
  addedValue,
  color,
}: {
  label: string;
  icon: any;
  baseValue: number;
  addedValue: number;
  color: string;
}) {
  const maxStat = 50;

  return (
    <div className="space-y-1.5 rounded-xl border border-white/5 bg-black/40 p-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="font-semibold text-iris-pearl">{label}</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono">
          <span className={`font-bold ${color}`}>{baseValue}</span>
          {addedValue > 0 && (
            <span className="text-emerald-400 font-bold">+{addedValue}</span>
          )}
        </div>
      </div>
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-iris-cyan rounded-full"
          style={{ width: `${Math.min(100, (baseValue / maxStat) * 100)}%` }}
        />
      </div>
    </div>
  );
}

// Color swatch component
function ColorSwatch({ colorIndex, region }: { colorIndex: number; region: number }) {
  const colors = [
    '#ff0000', '#ff4400', '#ff8800', '#ffcc00', '#ffff00',
    '#ccff00', '#88ff00', '#44ff00', '#00ff00', '#00ff44',
    '#00ff88', '#00ffcc', '#00ffff', '#00ccff', '#0088ff',
    '#0044ff', '#0000ff', '#4400ff', '#8800ff', '#cc00ff',
  ];
  const bg = colorIndex >= 0 ? (colors[colorIndex % colors.length] || '#666666') : '#333333';

  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/30 px-3 py-1.5">
      <div
        className="h-4 w-4 rounded-full border border-white/20"
        style={{ backgroundColor: bg }}
      />
      <span className="text-[11px] font-mono text-iris-muted">Region {region}: <strong className="text-iris-pearl">ID {colorIndex}</strong></span>
    </div>
  );
}

export default function DinoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [dialogConfig, setDialogConfig] = useState<{
    open: boolean;
    title: string;
    description?: string;
    variant?: 'primary' | 'danger';
    onConfirm?: () => void;
  }>({
    open: false,
    title: '',
  });

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: () => authApi.getMe().then((res) => res.data),
  });

  const { data: listingData, isLoading } = useQuery({
    queryKey: ['dinoListing', params.id],
    queryFn: () => dinoMarketApi.getListingById(params.id as string).then((res) => res.data),
    enabled: !!params.id,
  });

  const { data: serverData } = useQuery({
    queryKey: ['dinoDeliveryServers'],
    queryFn: () => dinoMarketApi.getDeliveryServers().then((res) => res.data),
  });
  const deliveryServers = (serverData?.servers ?? []).filter(
    (server: any) => server.isOnline && !server.drainMode && server.supportsDinoDelivery,
  );

  const buyMutation = useMutation({
    mutationFn: () => {
      if (!selectedServerId) throw new Error('กรุณาเลือกเซิร์ฟเวอร์ปลายทางสำหรับรับสัตว์');
      return dinoMarketApi.buyDino(params.id as string, Number(selectedServerId));
    },
    onSuccess: (res) => {
      setDialogConfig({
        open: true,
        title: 'สั่งซื้อสำเร็จ',
        description: res.data?.message || 'ส่งคำสั่งจัดส่งสัตว์เข้าสู่เซิร์ฟเวอร์เรียบร้อยแล้ว',
        onConfirm: () => router.push('/market/my-purchases'),
      });
      queryClient.invalidateQueries({ queryKey: ['dinoListing'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error: any) => {
      setDialogConfig({
        open: true,
        title: 'ไม่สามารถสั่งซื้อได้',
        description: error.response?.data?.error || 'เกิดข้อผิดพลาดในการสั่งซื้อ',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="page-shell flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-iris-cyan" />
      </div>
    );
  }

  const listing = listingData?.listing;

  if (!listing) {
    return (
      <div className="page-shell max-w-4xl mx-auto py-16 text-center space-y-4">
        <GlassCard className="p-12 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-400 mb-3" />
          <h2 className="text-xl font-bold text-iris-pearl">ไม่พบข้อมูลสัตว์ตัวนี้ในตลาด</h2>
          <p className="text-xs text-iris-muted mt-1">รายการอาจถูกซื้อไปแล้วหรือถูกยกเลิกการวางขาย</p>
          <div className="mt-6">
            <Link href="/market">
              <Button variant="primary">กลับไปตลาดสัตว์เลี้ยง</Button>
            </Link>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="page-shell max-w-7xl mx-auto py-8 sm:py-10 space-y-8 animate-slide-up">
      {/* Back Button */}
      <div className="flex items-center justify-between">
        <Link href="/market">
          <Button variant="secondary" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            กลับไปตลาดผู้เล่น
          </Button>
        </Link>
        <Badge variant={listing.status === 'listed' ? 'cyan' : 'gold'}>
          {listing.status === 'listed' ? 'พร้อมส่งมอบทันที' : listing.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main Info (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <div className="p-6 md:p-8 space-y-6 overflow-hidden rounded-2xl border border-slate-700/40 bg-[#102637]">
            {/* Cinematic Creature Artwork Preview */}
            <div className="relative h-64 sm:h-72 w-full overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_40%,#28495a,#102637_75%)] border border-slate-700/40 shadow-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getProductImageUrl({ name: listing.species || listing.dinoName, imageUrl: listing.imageUrl })}
                alt={listing.species}
                className="h-full w-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#06111d] via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-widest text-cyan-300">
                    ARK SPECIMEN DOSSIER
                  </span>
                  <h1 className="font-serif text-2xl sm:text-3xl font-normal text-iris-pearl mt-1">
                    {listing.dinoName || listing.species}
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-xl border border-cyan-400/30 bg-black/60 backdrop-blur-md px-3 py-1.5 text-center">
                    <span className="text-[9px] uppercase font-bold text-iris-muted block">LEVEL</span>
                    <span className="text-lg font-bold text-iris-pearl font-mono tabular-nums">{listing.level}</span>
                  </div>
                  <div className="rounded-xl border border-white/20 bg-black/60 backdrop-blur-md px-3 py-1.5 text-center">
                    <span className="text-[9px] uppercase font-bold text-iris-muted block">GENDER</span>
                    <span className={`text-lg font-bold ${listing.gender === 'Male' ? 'text-sky-300' : 'text-rose-300'}`}>
                      {listing.gender === 'Male' ? '♂ ผู้' : '♀ เมีย'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/5 pb-4">
              <div>
                <p className="text-base font-semibold text-iris-cyan">{listing.species}</p>
                <p className="text-xs text-iris-muted mt-0.5">
                  ลงทะเบียนวางขายโดย: <span className="font-bold text-iris-pearl">{listing.seller?.discordUsername || 'UNKNOWN'}</span>
                </p>
              </div>
            </div>

            {/* Base Stats Matrix */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-iris-muted">
                สถิติค่าพลังพื้นฐาน (Base & Mutation Stats)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <StatBar label="Health (เลือด)" icon={Heart} baseValue={listing.baseHealth} addedValue={listing.addedHealth} color="text-rose-400" />
                <StatBar label="Stamina (ความเหนื่อย)" icon={Zap} baseValue={listing.baseStamina} addedValue={listing.addedStamina} color="text-amber-400" />
                <StatBar label="Oxygen (ออกซิเจน)" icon={Droplets} baseValue={listing.baseOxygen} addedValue={listing.addedOxygen} color="text-cyan-400" />
                <StatBar label="Food (อาหาร)" icon={Utensils} baseValue={listing.baseFood} addedValue={listing.addedFood} color="text-orange-400" />
                <StatBar label="Weight (น้ำหนัก)" icon={Weight} baseValue={listing.baseWeight} addedValue={listing.addedWeight} color="text-purple-400" />
                <StatBar label="Melee Damage (พลังโจมตี)" icon={Sword} baseValue={listing.baseDamage} addedValue={listing.addedDamage} color="text-emerald-400" />
              </div>
            </div>

            {/* Lineage & Mutations */}
            <div className="space-y-3 pt-2 border-t border-white/5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-iris-muted">
                ข้อมูลสายพันธุ์ & การกลายพันธุ์ (Lineage)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/5 bg-black/40 p-3 text-xs">
                  <span className="text-[10px] text-iris-muted uppercase block">Imprint Quality</span>
                  <span className="font-bold text-iris-cyan text-sm">{Math.round(listing.imprintQuality * 100)}%</span>
                </div>
                <div className="rounded-xl border border-white/5 bg-black/40 p-3 text-xs">
                  <span className="text-[10px] text-iris-muted uppercase block">Matrilineal Mutations</span>
                  <span className="font-bold text-iris-pearl text-sm">{listing.mutationsMatrilineal || 0} / 20</span>
                </div>
                <div className="rounded-xl border border-white/5 bg-black/40 p-3 text-xs">
                  <span className="text-[10px] text-iris-muted uppercase block">Patrilineal Mutations</span>
                  <span className="font-bold text-iris-pearl text-sm">{listing.mutationsPatrilineal || 0} / 20</span>
                </div>
              </div>
            </div>

            {/* Color Regions */}
            {listing.colorRegions && (
              <div className="space-y-3 pt-2 border-t border-white/5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-iris-muted">
                  รหัสสีตามภูมิภาค (Color Regions)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(listing.colorRegions).map(([region, colorIdx]: [string, any]) => (
                    <ColorSwatch key={region} region={Number(region)} colorIndex={Number(colorIdx)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Purchase Sidebar (1 Col) */}
        <div className="space-y-6">
          <GlassCard variant="default" className="p-6 space-y-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-iris-muted">ราคาจำหน่าย</span>
              <p className="text-3xl font-black text-iris-gold mt-1">
                {listing.price.toLocaleString()} <span className="text-sm font-bold text-iris-gold/70">IC</span>
              </p>
            </div>

            {/* Server Selector for Delivery */}
            <div className="space-y-2 border-t border-white/5 pt-4">
              <label className="text-xs font-bold uppercase tracking-wider text-iris-muted">
                เลือกเซิร์ฟเวอร์สำหรับรับส่งมอบ *
              </label>
              <select
                value={selectedServerId}
                onChange={(e) => setSelectedServerId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/50 p-3 text-xs font-bold text-iris-pearl focus:border-iris-cyan focus:outline-none"
              >
                <option value="">-- เลือกเซิร์ฟเวอร์ที่ต้องการรับไดโน --</option>
                {deliveryServers.map((server: any) => (
                  <option key={server.id} value={server.id}>
                    {server.name} ({server.map || 'Cluster'})
                  </option>
                ))}
              </select>
            </div>

            {/* User Points Check */}
            {userData && (
              <div className="rounded-xl border border-white/5 bg-black/40 p-3 text-xs flex justify-between items-center">
                <span className="text-iris-muted">เหรียญของคุณ:</span>
                <span className="font-bold text-iris-gold">
                  {userData.user?.pointsBalance?.toLocaleString() || 0} IC
                </span>
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              className="w-full font-bold"
              disabled={buyMutation.isPending || !selectedServerId}
              isLoading={buyMutation.isPending}
              onClick={() => buyMutation.mutate()}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              ยืนยันการซื้อ (Purchase Dino)
            </Button>
          </GlassCard>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={dialogConfig.open} onOpenChange={(open) => setDialogConfig((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogConfig.title}</DialogTitle>
            {dialogConfig.description && (
              <DialogDescription>{dialogConfig.description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="mt-4 flex justify-end">
            <Button
              variant="primary"
              onClick={() => {
                dialogConfig.onConfirm?.();
                setDialogConfig((prev) => ({ ...prev, open: false }));
              }}
            >
              รับทราบ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
