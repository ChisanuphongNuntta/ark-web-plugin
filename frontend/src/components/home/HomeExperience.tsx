'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Coins,
  Gamepad2,
  Gem,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  WalletCards,
  Wifi,
  WifiOff,
  ChevronRight,
  Package,
  Activity,
  Users,
  Server,
  Swords,
  Trophy,
  MessageCircle,
} from 'lucide-react';
import { api, orderApi, walletApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { ProductCard } from '@/components/ProductCard';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { EmptyState } from '@/components/ui/EmptyState';

// ——— Types ———
interface Category {
  id: number;
  name: string;
  icon: string | null;
  productCount?: number;
}

interface FeaturedProduct {
  id: number;
  name: string;
  description: string | null;
  /** Contract field (openapi.yaml Product.itemBlueprint). */
  itemBlueprint?: string | null;
  price: number;
  imageUrl: string | null;
  quantity: number;
  quality: number;
  isBlueprint: boolean;
  category?: { id: number; name: string; icon: string | null } | null;
}

interface ServerStatus {
  id: number;
  name: string;
  map: string;
  mode?: string;
  isOnline: boolean;
  playerCount?: number;
  maxPlayers?: number;
}

// ——— Server Status Section ———
function ServerStatusSection() {
  const { data: serversData, isLoading, isError, refetch } = useQuery<{ servers: ServerStatus[] }>({
    queryKey: ['home-servers'],
    queryFn: () => api.get('/servers').then(res => res.data),
    refetchInterval: 30_000, // Refresh every 30 seconds
    staleTime: 15_000,
  });

  const servers = serversData?.servers ?? [];
  const onlineCount = servers.filter(s => s.isOnline).length;
  const totalPlayers = servers.reduce((sum, s) => sum + (s.playerCount ?? 0), 0);

  return (
    <section className="page-shell" aria-label="สถานะเซิร์ฟเวอร์">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <span className="eyebrow text-cyan-300">Live Server Status</span>
          <h2 className="font-serif text-2xl md:text-3xl font-normal text-iris-pearl mt-1">สถานะเซิร์ฟเวอร์ IRIS</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-iris-muted">
            <Users className="h-4 w-4 text-iris-cyan" />
            <span className="font-mono text-iris-pearl">{onlineCount} / {servers.length}</span>
            <span>เซิร์ฟเวอร์ออนไลน์</span>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="h-8 w-8 rounded-full border border-white/10 flex items-center justify-center text-iris-muted hover:text-iris-cyan hover:border-iris-cyan/30 transition"
            aria-label="รีเฟรชสถานะ"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <GlassCard key={i} className="p-5">
              <Skeleton className="h-4 w-3/4 mb-3" />
              <Skeleton className="h-3 w-1/2 mb-4" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </GlassCard>
          ))}
        </div>
      ) : isError ? (
        <ErrorMessage
          title="ไม่สามารถโหลดสถานะเซิร์ฟเวอร์ได้"
          message="ระบบตรวจสอบสถานะ heartbeat ขัดข้องชั่วคราว"
          onRetry={refetch}
        />
      ) : servers.length === 0 ? (
        <EmptyState title="ไม่มีข้อมูลเซิร์ฟเวอร์" description="ยังไม่มีเซิร์ฟเวอร์ที่เปิดใช้งานในขณะนี้" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {servers.map(svr => {
            const playerPct = svr.maxPlayers ? Math.round((svr.playerCount ?? 0) / svr.maxPlayers * 100) : 0;
            return (
              <GlassCard
                key={svr.id}
                variant={svr.isOnline ? 'default' : 'flat'}
                className={`p-5 space-y-4 transition-all ${svr.isOnline ? 'hover:border-iris-cyan/30' : 'opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold text-iris-muted uppercase tracking-wider">{svr.map}</p>
                    <h3 className="text-xs font-bold text-iris-pearl truncate mt-0.5">{svr.name}</h3>
                    {svr.mode && (
                      <span className="text-[9px] font-bold text-iris-orchid/80 uppercase">{svr.mode}</span>
                    )}
                  </div>
                  <div className="shrink-0">
                    {svr.isOnline ? (
                      <Wifi className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-rose-400/60" />
                    )}
                  </div>
                </div>

                {svr.isOnline && svr.maxPlayers ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] font-mono text-iris-muted">
                      <span>{svr.playerCount ?? 0} ผู้เล่น</span>
                      <span>{svr.maxPlayers} slots</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          playerPct > 80 ? 'bg-rose-400' : playerPct > 50 ? 'bg-iris-gold' : 'bg-emerald-400'
                        }`}
                        style={{ width: `${playerPct}%` }}
                        role="progressbar"
                        aria-valuenow={svr.playerCount ?? 0}
                        aria-valuemax={svr.maxPlayers}
                        aria-label={`${svr.playerCount ?? 0} จาก ${svr.maxPlayers} ผู้เล่น`}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-[9px] font-bold text-rose-400/70 uppercase tracking-wider">
                    {svr.isOnline ? 'พร้อมเข้าเล่น' : 'ออฟไลน์'}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ——— Community Section ———
function CommunitySection() {
  const communityLinks = [
    {
      icon: MessageCircle,
      label: 'Discord Community',
      description: 'พูดคุย แชร์ประสบการณ์ และรับอัปเดตล่าสุด',
      href: 'https://discord.gg/iris-thailand',
      color: 'text-[#5865F2]',
      bg: 'bg-[#5865F2]/10',
      border: 'border-[#5865F2]/20',
    },
    {
      icon: Trophy,
      label: 'Ranking Board',
      description: 'ตรวจสอบอันดับผู้เล่นและสถิติของชนเผ่า',
      href: '/ranking',
      color: 'text-iris-gold',
      bg: 'bg-iris-gold/10',
      border: 'border-iris-gold/20',
    },
    {
      icon: Swords,
      label: 'กิจกรรมประจำสัปดาห์',
      description: 'ร่วมกิจกรรมพิเศษ รับรางวัลและ Iris Coins',
      href: '/event',
      color: 'text-iris-orchid',
      bg: 'bg-iris-orchid/10',
      border: 'border-iris-orchid/20',
    },
  ];

  return (
    <section className="page-shell" aria-label="ชุมชน IRIS">
      <div className="mb-8">
        <span className="eyebrow text-cyan-300">IRIS Community</span>
        <h2 className="font-serif text-2xl md:text-3xl font-normal text-iris-pearl mt-1">ร่วมชุมชน IRIS Thailand</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {communityLinks.map(({ icon: Icon, label, description, href, color, bg, border }) => (
          <Link key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}>
            <GlassCard
              className={`p-6 border ${border} hover:-translate-y-1 transition-all duration-300 group`}
              hoverEffect="glow"
            >
              <div className={`h-12 w-12 rounded-2xl ${bg} border ${border} flex items-center justify-center mb-4`}>
                <Icon className={`h-6 w-6 ${color}`} />
              </div>
              <h3 className="font-display font-bold text-base text-iris-pearl mb-1 group-hover:text-iris-cyan transition-colors">
                {label}
              </h3>
              <p className="text-xs text-iris-muted leading-relaxed">{description}</p>
              <div className={`flex items-center gap-1.5 mt-4 text-[10px] font-bold ${color} uppercase tracking-wider`}>
                <span>เข้าร่วม</span>
                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </GlassCard>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ——— Main HomeExperience ———
export function HomeExperience() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthStore();
  const [searchQuery, setSearchQuery] = React.useState('');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  const {
    data: featuredData,
    isLoading: isFeaturedLoading,
    isError: isFeaturedError,
    refetch: refetchFeatured,
  } = useQuery<{ products: FeaturedProduct[] }>({
    queryKey: ['featured-products'],
    queryFn: () => api.get('/products/featured').then(res => res.data),
  });

  const { data: categoriesData } = useQuery<{ categories: Category[] }>({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories').then(res => res.data),
  });

  const { data: activeOrdersData } = useQuery({
    queryKey: ['dashboard-active-orders'],
    queryFn: () => orderApi.getAll(1).then(res => res.data),
    enabled: !!user,
    refetchInterval: 15_000,
  });

  const { data: walletData } = useQuery({
    queryKey: ['dashboard-wallet'],
    queryFn: () => walletApi.getBalance().then(res => res.data),
    enabled: !!user,
  });

  const featuredProducts = featuredData?.products ?? [];
  const categories = categoriesData?.categories ?? [];
  const activeDeliveries =
    activeOrdersData?.orders?.filter((o: any) =>
      ['pending', 'delivering', 'processing'].includes(o.status)
    ) ?? [];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="pb-24 bg-iris-ink text-iris-pearl min-h-screen space-y-14">

      {/* ═══ SECTION 1: Prismatic River Gate Hero — Frozen Winter Expedition ═══ */}
      <section
        className="relative isolate min-h-[560px] md:min-h-[640px] overflow-hidden flex items-center border-b border-cyan-400/20 bg-[#030915]"
        aria-label="ยินดีต้อนรับสู่ IRIS Thailand"
      >
        {/* Frozen Background art with parallax scaling */}
        <Image
          src="/images/backgrounds/winter_hero_frozen.jpg"
          alt="ARK Iris Frozen Winter Landscape"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-65 transition-transform duration-1000"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#030915] via-[#030915]/85 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#030915] via-transparent to-[#030915]/40" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(75,228,255,0.12),transparent_60%)] pointer-events-none" aria-hidden="true" />
        <div className="iris-grid absolute inset-0 opacity-25 pointer-events-none" aria-hidden="true" />

        {/* Ambient Aurora Borealis glows */}
        <div className="absolute -left-20 top-10 h-[30rem] w-[30rem] animate-pulse rounded-full bg-cyan-400/15 blur-[140px]" aria-hidden="true" />
        <div className="absolute right-1/4 top-10 h-[26rem] w-[26rem] rounded-full bg-sky-300/10 blur-[130px]" aria-hidden="true" />

        <div className="page-shell relative z-10 py-16 md:py-24 flex flex-col justify-center">
          <div className="max-w-3xl space-y-7">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="cyan" className="py-1.5 px-4 border border-cyan-400/30 bg-cyan-950/70 backdrop-blur-md flex items-center gap-2 shadow-[0_0_15px_rgba(75,228,255,0.3)]">
                <span className="text-sm">❄️</span>
                <span className="font-bold tracking-wider text-cyan-200">FROZEN EXPEDITION</span>
              </Badge>
              <span className="inline-flex items-center gap-1.5 text-xs text-cyan-300/80 font-medium">
                <Wifi className="h-3.5 w-3.5 text-cyan-400 animate-pulse" aria-hidden="true" />
                ร้านค้าและชุมชน ARK
              </span>
            </div>

            <p className="eyebrow text-cyan-300 tracking-[0.25em] font-semibold">
              ARK · IRIS THAILAND
            </p>

            <h1 className="font-serif text-3xl sm:text-5xl md:text-6xl font-normal leading-[1.38] tracking-tight text-iris-pearl">
              เหมันต์นิรันดร์<br />
              <span className="text-cyan-300">
                FROZEN EXPEDITION
              </span>
            </h1>

            <p className="max-w-xl text-sm sm:text-base text-cyan-100/80 leading-relaxed">
              ออกสำรวจโลก ARK ต้อนรับฤดูหนาว เลือกไดโนเสาร์คู่ใจ เตรียมอุปกรณ์ และพบเพื่อนร่วมทางในชุมชน IRIS
            </p>

            {/* Universal Search */}
            <form onSubmit={handleSearchSubmit} className="max-w-md" role="search">
              <Input
                placeholder="ค้นหาสินค้า, สัตว์เลี้ยง, อาวุธแดนหิมะ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="ค้นหาสินค้าและบริการ"
                leftIcon={<Search className="h-4 w-4 text-cyan-400" aria-hidden="true" />}
                rightIcon={
                  <Button type="submit" size="sm" variant="cyan" className="h-8 min-h-[32px] px-3 py-1 font-bold text-xs rounded-full shadow-[0_0_10px_rgba(75,228,255,0.4)]">
                    ค้นหา
                  </Button>
                }
              />
            </form>

            <div className="flex flex-wrap gap-4 pt-2">
              <Link href="/shop">
                <Button variant="primary" rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />} className="bg-[#d8f3fc] text-[#092331] font-bold hover:bg-white transition border border-cyan-300/30">
                  เข้าสู่ร้านค้าเหมันต์
                </Button>
              </Link>
              <Link href="/market">
                <Button variant="secondary" leftIcon={<Store className="h-4 w-4" aria-hidden="true" />} className="border-slate-700/50 bg-[#102637]/80 hover:border-cyan-400/40 text-iris-pearl">
                  สำรวจตลาดผู้เล่น
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 2: Player Dashboard / Identity Linking ═══ */}
      <div className="page-shell">
        {isAuthLoading ? (
          <GlassCard className="p-8">
            <div className="flex items-center gap-3 text-sm text-iris-muted">
              <Loader2 className="h-5 w-5 animate-spin text-iris-cyan" aria-hidden="true" />
              <span>กำลังตรวจสอบสถานะบัญชี...</span>
            </div>
          </GlassCard>
        ) : !user ? (
          <GlassCard variant="prism" hasLattice className="p-8">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
              <div className="space-y-2">
                <span className="eyebrow">Continue in IRIS</span>
                <h2 className="font-display text-2xl md:text-3xl font-bold text-iris-pearl">
                  เชื่อมบัญชีครั้งเดียว แล้วรับสิทธิ์ซื้อได้ทุกบริการ
                </h2>
                <p className="text-xs sm:text-sm text-iris-muted max-w-2xl leading-relaxed">
                  เชื่อมโยง Discord และ Steam ID เพื่อปลดล็อกประวัติการรับสินค้า กระเป๋า IRIS Coins และการติดตามสถานะจัดส่ง
                </p>
              </div>
              <a href={`${apiUrl}/auth/discord`} className="shrink-0">
                <Button variant="cyan" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  เชื่อมต่อ Discord ID
                </Button>
              </a>
            </div>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Profile */}
              <GlassCard className="p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center gap-4">
                    {user.discordAvatar ? (
                      <Image
                        src={user.discordAvatar}
                        alt={`Avatar ของ ${user.discordUsername}`}
                        width={64}
                        height={64}
                        className="rounded-full border border-iris-cyan/30"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-full bg-black/40 border border-white/10 flex items-center justify-center font-bold text-iris-cyan text-lg">
                        {user.discordUsername?.substring(0, 2) ?? 'S'}
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] text-iris-muted uppercase font-bold tracking-wider">Survivor Profile</p>
                      <h3 className="text-lg font-extrabold text-iris-pearl flex items-center gap-2 mt-0.5">
                        {user.discordUsername}
                        <Badge variant="cyan">Online</Badge>
                      </h3>
                      <p className="text-xs text-iris-muted font-mono mt-0.5">
                        Steam: {user.steamId ?? 'ไม่ได้เชื่อมโยง'}
                      </p>
                    </div>
                  </div>
                  <Link href="/profile">
                    <Button variant="ghost" size="sm" rightIcon={<ChevronRight className="h-4 w-4" />}>
                      จัดการไอดี
                    </Button>
                  </Link>
                </div>
              </GlassCard>

              {/* Active Deliveries */}
              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <h3 className="text-sm font-bold text-iris-pearl uppercase tracking-wider flex items-center gap-2">
                    <Activity className="h-4 w-4 text-iris-cyan" aria-hidden="true" />
                    รายการนำส่งเข้าเกมเวลานี้
                  </h3>
                  <span className="font-mono text-xs text-iris-muted">{activeDeliveries.length} รายการกำลังส่ง</span>
                </div>

                {activeDeliveries.length === 0 ? (
                  <GlassCard variant="flat" className="p-8 text-center text-xs text-iris-muted">
                    <Package className="h-8 w-8 mx-auto mb-2 text-iris-muted/40" aria-hidden="true" />
                    ไม่มีสินค้าค้างส่งในขณะนี้ — สินค้าที่ซื้อสำเร็จจะถูกส่งเข้าตัวละครเกมผ่านระบบอัตโนมัติ
                  </GlassCard>
                ) : (
                  <div className="space-y-4">
                    {activeDeliveries.map((order: any) => (
                      <GlassCard key={order.id} className="p-5 border-l-2 border-l-iris-cyan bg-black/30">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div className="space-y-1">
                            <h4 className="font-bold text-xs text-iris-pearl uppercase">{order.product?.name}</h4>
                            <p className="text-[10px] text-iris-muted">
                              เซิร์ฟเวอร์: {order.server?.name} · จำนวน: x{order.quantity}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] font-bold text-iris-muted uppercase">
                            <span className="h-2 w-2 rounded-full bg-iris-cyan animate-ping" />
                            <span className="text-iris-cyan">กำลังส่ง</span>
                            <code className="bg-black/40 text-iris-cyan px-2 py-0.5 rounded font-mono">/claim</code>
                          </div>
                        </div>
                      </GlassCard>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Wallet */}
            <div className="space-y-6">
              <GlassCard variant="gold" className="p-6 bg-gradient-to-b from-iris-gold/5 to-transparent">
                <p className="text-[10px] text-iris-muted font-black uppercase tracking-wider">IRIS Wallet Balance</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <Coins className="h-5 w-5 text-iris-gold self-center" aria-hidden="true" />
                  <span className="text-3xl font-mono font-black text-gradient-gold">
                    {walletData
                      ? Number(walletData.accounts?.available ?? 0).toLocaleString()
                      : Number(user.pointsBalance ?? 0).toLocaleString()}
                  </span>
                  <span className="text-xs text-iris-gold/80 font-bold uppercase">IC</span>
                </div>

                {walletData && (
                  <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/5 text-[10px] text-iris-muted">
                    <div>
                      <p>เงินประกัน P2P:</p>
                      <p className="font-mono font-bold text-white mt-0.5">
                        {Number(walletData.accounts?.held ?? 0).toLocaleString()} IC
                      </p>
                    </div>
                    <div>
                      <p>โบนัสเครดิต:</p>
                      <p className="font-mono font-bold text-white mt-0.5">
                        {Number(walletData.accounts?.promotional ?? 0).toLocaleString()} IC
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex gap-2.5">
                  <Link href="/topup" className="flex-1">
                    <Button variant="gold" className="w-full text-xs py-2 min-h-[38px]">เติมเงิน</Button>
                  </Link>
                  <Link href="/profile" className="flex-1">
                    <Button variant="secondary" className="w-full text-xs py-2 min-h-[38px]">สมุดบัญชี</Button>
                  </Link>
                </div>
              </GlassCard>

              <GlassCard className="p-5 space-y-3">
                <h4 className="text-xs font-bold text-iris-pearl uppercase tracking-wider border-b border-white/5 pb-2">คำสั่งเกมที่ใช้บ่อย</h4>
                <div className="space-y-2 text-[11px] text-iris-muted">
                  {[
                    { label: 'รับของขวัญเข้าตัวละคร:', cmd: '/claim' },
                    { label: 'แลกเปลี่ยนไดโนเสาร์:', cmd: '/market' },
                    { label: 'ตรวจสอบสถานะ IRIS:', cmd: '/iris' },
                  ].map(({ label, cmd }) => (
                    <div key={cmd} className="flex justify-between items-center py-1">
                      <span>{label}</span>
                      <code className="bg-black/40 text-iris-cyan px-1.5 py-0.5 rounded font-mono font-bold">{cmd}</code>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>
          </div>
        )}
      </div>

      {/* ═══ SECTION 3: Server Status ═══ */}
      <ServerStatusSection />

      {/* ═══ SECTION 4: Featured Products ═══ */}
      <div className="page-shell space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow text-cyan-300">Curated for your survivor</span>
            <h2 id="catalog-title" className="font-serif text-3xl md:text-4xl font-normal text-iris-pearl mt-2">ยอดนิยมจาก IRIS Store</h2>
            <p className="text-xs sm:text-sm text-iris-muted mt-2 max-w-xl">
              สินค้าและสัตว์เลี้ยงคุณภาพยอดนิยมที่พร้อมส่งตรงลงตัวละครของคุณ
            </p>
          </div>
          <Link href="/shop">
            <Button variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" />}>
              ดูทั้งหมด
            </Button>
          </Link>
        </div>

        {/* Categories slider */}
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2" role="navigation" aria-label="หมวดหมู่สินค้า">
            {categories.slice(0, 8).map((cat) => (
              <Link key={cat.id} href={`/shop?category=${cat.id}`} className="shrink-0">
                <Badge variant="cyan" outline className="py-1.5 px-3.5 border border-white/10 hover:border-iris-cyan/40 hover:text-white transition">
                  <span className="mr-1.5" aria-hidden="true">{cat.icon ?? '◇'}</span>
                  {cat.name}
                </Badge>
              </Link>
            ))}
          </div>
        )}

        {/* Products Grid */}
        {isFeaturedLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" aria-busy="true" aria-label="กำลังโหลดสินค้า">
            {[...Array(4)].map((_, i) => (
              <GlassCard key={i} className="p-6">
                <Skeleton variant="card" className="h-48 mb-4" />
                <Skeleton className="w-2/3 h-5 mb-2" />
                <Skeleton className="w-full h-3" />
              </GlassCard>
            ))}
          </div>
        )}

        {isFeaturedError && (
          <ErrorMessage
            title="เกิดข้อผิดพลาดในการดึงรายการสินค้า"
            message="ระบบดึงข้อมูลแคตตาล็อกขัดข้องชั่วคราว กรุณาลองใหม่"
            onRetry={refetchFeatured}
          />
        )}

        {!isFeaturedLoading && !isFeaturedError && featuredProducts.length === 0 && (
          <EmptyState
            title="ยังไม่มีสินค้าแนะนำ"
            description="สินค้าชุดใหม่กำลังเดินทางมาถึง ติดตามข่าวสารโปรโมชั่นได้เร็วๆ นี้"
          />
        )}

        {featuredProducts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.slice(0, 4).map((product) => (
              <ProductCard key={product.id} product={{ ...product, badge: 'HOT' }} />
            ))}
          </div>
        )}
      </div>

      {/* ═══ SECTION 5: IRIS Trust Matrix ═══ */}
      <section className="page-shell" aria-label="The IRIS Promise">
        <GlassCard variant="flat" hasGrid className="p-8 sm:p-12 thai-lattice">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center relative z-10">
            <div className="space-y-4">
              <span className="eyebrow text-cyan-300">The IRIS promise</span>
              <h2 className="font-serif text-3xl sm:text-4xl font-normal leading-snug text-iris-pearl">
                โปร่งใส ปลอดภัย<br />ตรวจสอบธุรกรรมได้จริง
              </h2>
              <p className="text-xs sm:text-sm text-iris-muted leading-relaxed">
                IRIS Thailand นำระบบตรวจสอบความถูกต้องแบบอัตโนมัติมาสู่ e-commerce ของเซิร์ฟเวอร์เกม
                ทุกคะแนนพ้อยต์ ยอดการค้ำประกัน และคิวการส่งของในเกมถูกบันทึกและติดตามผลได้แบบวินาทีต่อวินาที
              </p>
            </div>

            <div className="space-y-3">
              {[
                {
                  icon: WalletCards,
                  title: 'ประวัติยอดเงิน',
                  text: 'ทุกรายการทำบัญชีผ่าน double-entry ป้องกันการคำนวณแต้มผิดพลาด',
                },
                {
                  icon: ShieldCheck,
                  title: 'ติดตามการรับสินค้า',
                  text: 'ติดตามงานส่งของและกู้คืนสินค้าล้มเหลวด้วยระบบ Rescue Console',
                },
                {
                  icon: Gem,
                  title: 'เชื่อมบัญชีเกม',
                  text: 'ระบบประเมินความเข้ากันของเซิร์ฟเวอร์กับตัวละครก่อนทำการหักเงิน',
                },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-4 p-4 border border-white/5 bg-black/25 rounded-2xl">
                  <div className="h-10 w-10 rounded-xl bg-iris-cyan/10 border border-iris-cyan/20 flex items-center justify-center text-iris-cyan shrink-0">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-white uppercase">{title}</h4>
                    <p className="text-[10px] text-iris-muted mt-1 leading-relaxed">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </section>

      {/* ═══ SECTION 6: Community ═══ */}
      <CommunitySection />
    </div>
  );
}

export default HomeExperience;
