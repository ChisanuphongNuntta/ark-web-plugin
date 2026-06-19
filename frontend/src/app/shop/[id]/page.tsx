'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Coins,
  Minus,
  Plus,
  Server,
  ShoppingCart,
  Sparkles,
  Zap,
  Package,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Loader2,
  ShieldCheck,
  ChevronRight,
  Info,
} from 'lucide-react';
import { productApi, adminApi, orderApi, walletApi } from '@/lib/api';
import { useAuthStore, useCartStore } from '@/lib/store';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

// ——————————————————————————————
// Types (matching OpenAPI contract)
// ——————————————————————————————
interface Product {
  id: number;
  name: string;
  description: string | null;
  blueprint: string | null;
  price: number;
  imageUrl: string | null;
  quantity: number;
  quality: number;
  isBlueprint?: boolean;
  category?: { id: number; name: string; icon: string | null } | null;
}

interface Server {
  id: number;
  name: string;
  map: string;
  mode?: string;
  isOnline: boolean;
  playerCount?: number;
  maxPlayers?: number;
}

// ——————————————————————————————
// Quality configuration
// ——————————————————————————————
const qualityConfig: Record<number, {
  label: string;
  badgeVariant: 'default' | 'cyan' | 'orchid' | 'gold' | 'hot' | 'success' | 'warning' | 'info';
  cardVariant: 'default' | 'prism' | 'gold' | 'flat';
  accentColor: string;
  glowStyle: string;
}> = {
  0: { label: 'PRIMITIVE',    badgeVariant: 'default', cardVariant: 'flat',    accentColor: 'text-gray-400',     glowStyle: 'bg-gray-500/10' },
  1: { label: 'RAMSHACKLE',   badgeVariant: 'success', cardVariant: 'default', accentColor: 'text-emerald-400',  glowStyle: 'bg-emerald-500/10' },
  2: { label: 'APPRENTICE',   badgeVariant: 'info',    cardVariant: 'default', accentColor: 'text-blue-400',     glowStyle: 'bg-blue-500/10' },
  3: { label: 'JOURNEYMAN',   badgeVariant: 'orchid',  cardVariant: 'default', accentColor: 'text-iris-orchid',  glowStyle: 'bg-iris-orchid/10' },
  4: { label: 'MASTERCRAFT',  badgeVariant: 'gold',    cardVariant: 'gold',    accentColor: 'text-iris-gold',    glowStyle: 'bg-iris-gold/10' },
  5: { label: 'ASCENDANT',    badgeVariant: 'cyan',    cardVariant: 'prism',   accentColor: 'text-iris-cyan',    glowStyle: 'bg-iris-cyan/15' },
};

// ——————————————————————————————
// Breadcrumb component
// ——————————————————————————————
function Breadcrumb({ product }: { product: Product }) {
  return (
    <nav aria-label="เส้นทางนำทาง" className="flex items-center gap-2 text-[11px] font-bold text-iris-muted uppercase tracking-wider">
      <Link href="/" className="hover:text-iris-cyan transition-colors">หน้าแรก</Link>
      <ChevronRight className="h-3 w-3 text-iris-muted/40" />
      <Link href="/shop" className="hover:text-iris-cyan transition-colors">ร้านค้า</Link>
      {product.category && (
        <>
          <ChevronRight className="h-3 w-3 text-iris-muted/40" />
          <Link href={`/shop?category=${product.category.id}`} className="hover:text-iris-cyan transition-colors">
            {product.category.icon} {product.category.name}
          </Link>
        </>
      )}
      <ChevronRight className="h-3 w-3 text-iris-muted/40" />
      <span className="text-iris-pearl truncate max-w-[180px]">{product.name}</span>
    </nav>
  );
}

// ——————————————————————————————
// Server Compatibility card
// ——————————————————————————————
function ServerCompatibilityPanel({
  servers,
  selectedServerId,
  onSelect,
}: {
  servers: Server[];
  selectedServerId: number | null;
  onSelect: (id: number) => void;
}) {
  const onlineCount = servers.filter(s => s.isOnline).length;

  return (
    <GlassCard className="p-5 space-y-4" variant="default">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-iris-pearl uppercase tracking-wider flex items-center gap-2">
          <Server className="h-3.5 w-3.5 text-iris-cyan" />
          เลือกเซิร์ฟเวอร์ปลายทาง
        </h3>
        <span className="text-[10px] text-iris-muted font-mono">{onlineCount}/{servers.length} Online</span>
      </div>

      <div className="space-y-2">
        {servers.map((svr) => {
          const isSelected = selectedServerId === svr.id;
          const playerPct = svr.maxPlayers ? Math.round((svr.playerCount ?? 0) / svr.maxPlayers * 100) : 0;

          return (
            <button
              key={svr.id}
              disabled={!svr.isOnline}
              onClick={() => onSelect(svr.id)}
              className={`w-full text-left p-3.5 rounded-2xl border transition-all text-xs font-bold ${
                isSelected
                  ? 'border-iris-cyan/40 bg-iris-cyan/8 text-iris-cyan'
                  : svr.isOnline
                  ? 'border-white/8 bg-black/30 text-iris-muted hover:border-white/20 hover:bg-white/5 hover:text-iris-pearl'
                  : 'border-white/4 bg-black/20 text-iris-muted/40 cursor-not-allowed'
              }`}
              aria-pressed={isSelected}
              aria-label={`เซิร์ฟเวอร์ ${svr.name}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {svr.isOnline ? (
                    <Wifi className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-rose-400/60 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[11px]">{svr.name}</p>
                    <p className="text-[9px] font-mono text-iris-muted/70 mt-0.5 uppercase">{svr.map} · {svr.mode ?? 'PVE'}</p>
                  </div>
                </div>

                {svr.isOnline && svr.maxPlayers && (
                  <div className="shrink-0 text-right">
                    <p className="text-[9px] font-mono text-iris-muted">{svr.playerCount}/{svr.maxPlayers}</p>
                    <div className="w-14 h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${playerPct > 80 ? 'bg-rose-400' : playerPct > 50 ? 'bg-iris-gold' : 'bg-emerald-400'}`}
                        style={{ width: `${playerPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {!svr.isOnline && (
                  <span className="text-[9px] font-bold text-rose-400/70 uppercase shrink-0">Offline</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedServerId && (
        <p className="text-[10px] text-iris-cyan/80 flex items-center gap-1.5 pt-1">
          <CheckCircle2 className="h-3 w-3" />
          สินค้าจะถูกส่งไปยังตัวละครใน {servers.find(s => s.id === selectedServerId)?.name}
        </p>
      )}
    </GlassCard>
  );
}

// ——————————————————————————————
// Delivery Promise strip
// ——————————————————————————————
function DeliveryPromise({ serverSelected }: { serverSelected: boolean }) {
  return (
    <div className="p-4 rounded-2xl border border-iris-cyan/10 bg-iris-cyan/[0.04] space-y-2.5">
      <h4 className="text-[10px] font-black uppercase tracking-wider text-iris-cyan">IRIS Delivery Promise</h4>
      <div className="space-y-2 text-[10px] text-iris-muted">
        {[
          { icon: Zap,          label: 'ส่งทันทีภายใน 5 นาทีหลังชำระ',     ok: serverSelected },
          { icon: ShieldCheck,  label: 'รับประกันคืนเงิน 100% หากส่งไม่ได้', ok: true },
          { icon: Package,      label: 'ติดตามสถานะจัดส่งแบบ Real-Time',      ok: true },
        ].map(({ icon: Icon, label, ok }) => (
          <div key={label} className="flex items-center gap-2">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${ok ? 'text-emerald-400' : 'text-iris-muted/40'}`} />
            <span className={ok ? 'text-iris-pearl/80' : 'text-iris-muted/40'}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ——————————————————————————————
// Main Product Detail Page
// ——————————————————————————————
export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = Number(params.id);

  const { user } = useAuthStore();
  const { addItem } = useCartStore();
  const queryClient = useQueryClient();

  const [qty, setQty] = React.useState(1);
  const [selectedServerId, setSelectedServerId] = React.useState<number | null>(null);
  const [cartFeedback, setCartFeedback] = React.useState<'idle' | 'added' | 'error'>('idle');
  const [buyFeedback, setBuyFeedback] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // ——— Queries ———
  const { data: productData, isLoading: isProductLoading, isError: isProductError, refetch: refetchProduct } = useQuery({
    queryKey: ['product-detail', productId],
    queryFn: () => productApi.getById(productId).then(res => res.data),
    enabled: !isNaN(productId),
  });

  const { data: serversData, isLoading: isServersLoading } = useQuery({
    queryKey: ['servers-product'],
    queryFn: () => adminApi.getServers().then(res => res.data),
  });

  const { data: walletData } = useQuery({
    queryKey: ['wallet-product'],
    queryFn: () => walletApi.getBalance().then(res => res.data),
    enabled: !!user,
  });

  // ——— Mutations ———
  const buyNowMutation = useMutation({
    mutationFn: ({ productId, serverId, quantity }: { productId: number; serverId: number; quantity: number }) =>
      orderApi.create({ productId, serverId, quantity }),
    onSuccess: () => {
      setBuyFeedback('success');
      queryClient.invalidateQueries({ queryKey: ['wallet-product'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => {
      setBuyFeedback('error');
      setTimeout(() => setBuyFeedback('idle'), 3000);
    },
  });

  // ——— Derived ———
  const product: Product | undefined = productData?.product ?? productData;
  const servers: Server[] = serversData?.servers ?? [];
  const quality = product ? (qualityConfig[product.quality] ?? qualityConfig[0]) : qualityConfig[0];
  const userBalance = walletData ? Number(walletData.accounts?.available ?? 0) : Number(user?.pointsBalance ?? 0);
  const totalCost = product ? product.price * qty : 0;
  const canAfford = !user || userBalance >= totalCost;
  const selectedServer = servers.find(s => s.id === selectedServerId);

  // Auto-select first online server
  React.useEffect(() => {
    if (servers.length > 0 && selectedServerId === null) {
      const firstOnline = servers.find(s => s.isOnline);
      if (firstOnline) setSelectedServerId(firstOnline.id);
    }
  }, [servers, selectedServerId]);

  const handleAddToCart = () => {
    if (!product) return;
    addItem(product.id, qty);
    setCartFeedback('added');
    setTimeout(() => setCartFeedback('idle'), 2500);
  };

  const handleBuyNow = () => {
    if (!user) {
      router.push(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/discord`);
      return;
    }
    if (!selectedServerId) return;
    setBuyFeedback('loading');
    buyNowMutation.mutate({ productId: product!.id, serverId: selectedServerId, quantity: qty });
  };

  // ——— Loading State ———
  if (isProductLoading) {
    return (
      <div className="page-shell py-10 space-y-8">
        <Skeleton className="h-5 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <Skeleton variant="card" className="aspect-square rounded-[1.65rem]" />
          <div className="space-y-6">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // ——— Error State ———
  if (isProductError || !product) {
    return (
      <div className="page-shell py-16">
        <ErrorMessage
          title="ไม่พบสินค้าที่ต้องการ"
          message="สินค้านี้อาจถูกลบหรือไม่เคยมีในระบบ กรุณาลองค้นหาใหม่"
          onRetry={refetchProduct}
        />
        <div className="mt-8 flex justify-center">
          <Link href="/shop">
            <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              กลับร้านค้า
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ——— Buy Success State ———
  if (buyFeedback === 'success') {
    return (
      <div className="page-shell py-16 max-w-2xl mx-auto space-y-6 animate-slide-up">
        <GlassCard variant="prism" hasLattice className="p-10 text-center space-y-6">
          <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <span className="eyebrow text-iris-cyan">ซื้อสำเร็จ</span>
            <h1 className="font-display text-2xl font-bold text-iris-pearl">{product.name}</h1>
            <p className="text-sm text-iris-muted">
              หักพ้อยต์ {totalCost.toLocaleString()} IC สำเร็จ · ระบบกำลังส่งสินค้าเข้าเกม
            </p>
          </div>
          <div className="p-4 bg-black/40 rounded-2xl border border-white/5 text-left space-y-2">
            <p className="text-[10px] font-bold text-iris-pearl uppercase tracking-wider">Delivery Status</p>
            <p className="text-xs text-iris-muted">
              เป้าหมาย: <span className="text-iris-cyan">{selectedServer?.name}</span>
            </p>
            <p className="text-xs text-iris-muted">
              พิมพ์ <code className="bg-black/50 text-iris-cyan px-1.5 py-0.5 rounded font-mono">/claim</code> ในเกมเพื่อรับสินค้า
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Link href="/orders">
              <Button variant="cyan">ติดตามคำสั่งซื้อ</Button>
            </Link>
            <Link href="/shop">
              <Button variant="secondary">ซื้อสินค้าเพิ่ม</Button>
            </Link>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="page-shell py-10 space-y-10 animate-slide-up">
      {/* Breadcrumb */}
      <Breadcrumb product={product} />

      {/* Back navigation */}
      <Link
        href="/shop"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-iris-cyan hover:text-iris-pearl transition-colors uppercase tracking-wider"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> กลับร้านค้า
      </Link>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 xl:gap-16">

        {/* LEFT: Product image & preview */}
        <div className="space-y-4">
          <GlassCard
            variant={quality.cardVariant}
            className="aspect-square flex items-center justify-center relative overflow-hidden"
          >
            {/* Quality ambient glow */}
            <div className={`absolute inset-0 ${quality.glowStyle} blur-3xl opacity-60 pointer-events-none`} />

            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="relative z-10 w-full h-full object-contain p-8"
              />
            ) : (
              <div className="relative z-10 flex flex-col items-center gap-4 p-12">
                <span className="text-8xl drop-shadow-2xl">
                  {product.category?.icon ?? '📦'}
                </span>
                <span className="text-xs text-iris-muted font-mono uppercase">{product.category?.name}</span>
              </div>
            )}

            {/* Quality badge overlay */}
            <div className="absolute top-4 right-4 z-20">
              <Badge variant={quality.badgeVariant} className="flex items-center gap-1 font-black px-3 py-1.5">
                <Sparkles className="h-3 w-3" />
                {quality.label}
              </Badge>
            </div>

            {/* Quantity badge */}
            {product.quantity > 1 && (
              <div className="absolute bottom-4 left-4 z-20">
                <span className="px-2.5 py-1 rounded-full bg-black/80 border border-white/10 font-mono text-xs font-bold text-iris-cyan">
                  x{product.quantity}
                </span>
              </div>
            )}
          </GlassCard>

          {/* Blueprint info */}
          {product.blueprint && (
            <GlassCard variant="flat" className="p-4">
              <div className="flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-iris-muted shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-iris-muted uppercase tracking-wider mb-1">ARK Item Class</p>
                  <code className="text-[9px] font-mono text-iris-cyan/80 break-all leading-relaxed">
                    {product.blueprint}
                  </code>
                </div>
              </div>
            </GlassCard>
          )}
        </div>

        {/* RIGHT: Product info, purchase flow */}
        <div className="space-y-6">

          {/* Category + Name */}
          <div className="space-y-2">
            {product.category && (
              <Link href={`/shop?category=${product.category.id}`}>
                <Badge variant="cyan" outline className="py-1 px-3 text-[10px]">
                  {product.category.icon} {product.category.name}
                </Badge>
              </Link>
            )}
            <h1 className="font-display text-3xl sm:text-4xl font-black text-iris-pearl leading-tight uppercase tracking-tight">
              {product.name}
            </h1>
            {product.description && (
              <p className="text-sm text-iris-muted leading-relaxed">
                {product.description}
              </p>
            )}
          </div>

          {/* Price block */}
          <GlassCard variant="gold" className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-iris-muted uppercase tracking-wider font-bold">ราคาต่อชิ้น</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <Coins className="h-5 w-5 text-iris-gold" />
                  <span className="text-3xl font-mono font-black text-gradient-gold">
                    {product.price.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-iris-gold/70 uppercase">IC</span>
                </div>
              </div>
              {user && (
                <div className="text-right">
                  <p className="text-[10px] text-iris-muted uppercase tracking-wider font-bold">ยอดกระเป๋าของคุณ</p>
                  <p className="font-mono font-bold text-sm text-iris-pearl mt-1">
                    {userBalance.toLocaleString()} IC
                  </p>
                  {!canAfford && (
                    <Link href="/topup" className="text-[9px] text-iris-gold hover:underline font-bold">
                      เติมเงิน →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </GlassCard>

          {/* Quantity selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-iris-muted uppercase tracking-wider">
              จำนวนที่ต้องการซื้อ
            </label>
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-black/40 border border-white/10 rounded-full h-11">
                <button
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="w-11 h-full flex items-center justify-center text-iris-muted hover:text-white transition"
                  aria-label="ลดจำนวน"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-10 text-center font-mono font-bold text-base text-iris-pearl">{qty}</span>
                <button
                  onClick={() => setQty(q => q + 1)}
                  className="w-11 h-full flex items-center justify-center text-iris-muted hover:text-white transition"
                  aria-label="เพิ่มจำนวน"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="text-xs text-iris-muted">
                รวม:{' '}
                <span className="font-mono font-bold text-iris-gold">
                  {totalCost.toLocaleString()} IC
                </span>
              </div>
            </div>
          </div>

          {/* Server selection */}
          {isServersLoading ? (
            <GlassCard className="p-5">
              <Skeleton className="h-4 w-40 mb-4" />
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-2xl" />)}
              </div>
            </GlassCard>
          ) : servers.length > 0 ? (
            <ServerCompatibilityPanel
              servers={servers}
              selectedServerId={selectedServerId}
              onSelect={setSelectedServerId}
            />
          ) : null}

          {/* Delivery promise */}
          <DeliveryPromise serverSelected={!!selectedServerId} />

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="cyan"
              className="flex-1 py-3.5"
              disabled={!selectedServerId || buyFeedback === 'loading'}
              isLoading={buyFeedback === 'loading'}
              onClick={handleBuyNow}
              leftIcon={buyFeedback === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
            >
              {!user ? 'เข้าสู่ระบบเพื่อซื้อ' : !canAfford ? 'ยอดพ้อยต์ไม่พอ' : 'ซื้อทันที'}
            </Button>

            <Button
              variant="secondary"
              className="flex-1 py-3.5"
              onClick={handleAddToCart}
              disabled={cartFeedback === 'added'}
              leftIcon={
                cartFeedback === 'added'
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  : <ShoppingCart className="h-4 w-4" />
              }
            >
              {cartFeedback === 'added' ? 'เพิ่มในตะกร้าแล้ว!' : 'เพิ่มในตะกร้า'}
            </Button>
          </div>

          {buyFeedback === 'error' && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              เกิดข้อผิดพลาดในการสั่งซื้อ กรุณาลองใหม่ หรือติดต่อ Support
            </div>
          )}

          {!selectedServerId && servers.length > 0 && (
            <p className="text-[10px] text-rose-400/80 flex items-center gap-1.5">
              <XCircle className="h-3 w-3" />
              กรุณาเลือกเซิร์ฟเวอร์ก่อนดำเนินการซื้อ
            </p>
          )}

          {/* Trust badges */}
          <div className="flex flex-wrap gap-3 pt-2 border-t border-white/5">
            {[
              { icon: ShieldCheck, text: 'ชำระผ่าน IRIS Wallet' },
              { icon: Package,     text: 'ส่งโดย Plugin อัตโนมัติ' },
              { icon: CheckCircle2,text: 'รับประกัน 100%' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5 text-[10px] text-iris-muted">
                <Icon className="h-3.5 w-3.5 text-iris-cyan/60" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
