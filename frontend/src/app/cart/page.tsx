'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Coins, Trash2, Plus, Minus, ShieldCheck, ShoppingBag, Server, Check, CreditCard, Sparkles, Loader2 } from 'lucide-react';
import { productApi, orderApi, adminApi, walletApi } from '@/lib/api';
import { useAuthStore, useCartStore } from '@/lib/store';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

import { useRouter } from 'next/navigation';

interface CartProduct {
  id: number;
  name: string;
  price: number;
  imageUrl: string | null;
  category?: { name: string } | null;
}

export default function CartPage() {
  const { items, removeItem, setQuantity, clear } = useCartStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();

  // Selected server and character recipient per cart item
  const [itemConfigs, setItemConfigs] = React.useState<Record<number, { serverId: number; recipient: string }>>({});
  
  // Voucher code states
  const [voucherCode, setVoucherCode] = React.useState('');
  const [appliedVoucher, setAppliedVoucher] = React.useState<{ code: string; discountPercent: number } | null>(null);
  const [voucherError, setVoucherError] = React.useState('');
  const [voucherSuccess, setVoucherSuccess] = React.useState('');

  // Checkout process outcomes
  const [checkoutStep, setCheckoutStep] = React.useState<'cart' | 'submitting' | 'success'>('cart');
  const [placedOrders, setPlacedOrders] = React.useState<any[]>([]);

  // Fetch products in cart
  const productQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ['cart-product', item.productId],
      queryFn: () =>
        productApi.getById(item.productId).then((res) => (res.data.product ?? res.data) as CartProduct),
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Fetch servers list
  const { data: serversData } = useQuery({
    queryKey: ['servers-cart'],
    queryFn: () => adminApi.getServers().then((res) => res.data),
  });

  // Fetch user wallet balance
  const { data: walletData } = useQuery({
    queryKey: ['user-wallet-cart'],
    queryFn: () => walletApi.getBalance().then((res) => res.data),
    enabled: !!user,
  });

  // Deduct points batch placement simulation
  const placeOrdersMutation = useMutation({
    mutationFn: async (orders: Array<{ productId: number; serverId: number; quantity: number }>) => {
      const results = [];
      for (const order of orders) {
        const res = await orderApi.create(order);
        results.push(res.data);
      }
      return results;
    },
    onSuccess: (data) => {
      setPlacedOrders(data.map(d => d.order));
      setCheckoutStep('success');
      clear(); // Clear local Zustand cart
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
    },
  });

  // Setup default servers and recipient names for items
  React.useEffect(() => {
    if (serversData?.servers?.length > 0 && items.length > 0) {
      const defaultServerId = serversData.servers[0].id;
      setItemConfigs(prev => {
        const updated = { ...prev };
        items.forEach(item => {
          if (!updated[item.productId]) {
            updated[item.productId] = {
              serverId: defaultServerId,
              recipient: user?.discordUsername || 'Survivor'
            };
          }
        });
        return updated;
      });
    }
  }, [serversData, items, user]);

  // Calculations
  const subtotal = React.useMemo(() => {
    return items.reduce((sum, item, idx) => {
      const product = productQueries[idx]?.data;
      if (!product) return sum;
      return sum + product.price * item.quantity;
    }, 0);
  }, [items, productQueries]);

  const discountAmount = React.useMemo(() => {
    if (!appliedVoucher) return 0;
    return Math.floor((subtotal * appliedVoucher.discountPercent) / 100);
  }, [subtotal, appliedVoucher]);

  const finalTotal = Math.max(0, subtotal - discountAmount);
  
  // Available funds checking
  const userBalance = walletData ? Number(walletData.accounts?.available || 0) : Number(user?.pointsBalance || 0);
  const isBalanceSufficient = userBalance >= finalTotal;

  const handleUpdateItemConfig = (productId: number, field: 'serverId' | 'recipient', value: any) => {
    setItemConfigs(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value
      }
    }));
  };

  const applyVoucherCode = (e: React.FormEvent) => {
    e.preventDefault();
    setVoucherError('');
    setVoucherSuccess('');
    
    const code = voucherCode.trim().toUpperCase();
    if (!code) return;

    if (code === 'IRIS50' || code === 'SIAMGOLD') {
      setAppliedVoucher({ code, discountPercent: 20 });
      setVoucherSuccess('ประยุกต์ใช้คูปองส่วนลด 20% สำเร็จ!');
      setVoucherCode('');
    } else {
      setVoucherError('ไม่พบคูปองส่วนลดนี้ หรือ สิทธิ์ใช้งานเต็มแล้ว');
    }
  };

  const handleCheckoutSubmit = () => {
    if (!user) {
      window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/discord`;
      return;
    }

    // Verify all item configs are complete
    const orderPayload = items.map(item => {
      const config = itemConfigs[item.productId];
      return {
        productId: item.productId,
        serverId: config?.serverId || (serversData?.servers?.[0]?.id || 0),
        quantity: item.quantity
      };
    });

    if (orderPayload.some(o => !o.serverId)) {
      alert('กรุณาเลือกเซิร์ฟเวอร์ปลายทางให้ครบถ้วนทุกรายการ');
      return;
    }

    setCheckoutStep('submitting');
    placeOrdersMutation.mutate(orderPayload);
  };

  if (checkoutStep === 'success') {
    return (
      <div className="page-shell py-16 sm:py-24 max-w-2xl mx-auto space-y-8 animate-slide-up">
        <GlassCard variant="prism" hasLattice className="p-8 text-center space-y-6">
          <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto animate-bounce">
            <Check className="h-8 w-8" />
          </div>
          
          <div className="space-y-2">
            <span className="eyebrow text-iris-cyan">Order Placed</span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-iris-pearl uppercase">ทำรายการจัดสั่งของขวัญเรียบร้อย!</h1>
            <p className="text-xs sm:text-sm text-iris-muted">
              หักแต้มในกระเป๋าของคุณสำเร็จและระบบกำลังทำการ Inject ข้อมูลเข้าตัวละครเซิร์ฟเวอร์เกม
            </p>
          </div>

          {/* Game Delivery Timeline Checklist */}
          <div className="p-5 bg-black/40 border border-white/5 rounded-2xl text-left space-y-4">
            <h3 className="text-xs font-bold text-iris-pearl uppercase tracking-wider">ไทม์ไลน์สถานะการจัดส่ง (Fulfillment Progress)</h3>
            
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="h-5.5 w-5.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">✓</span>
                <div>
                  <p className="font-bold text-iris-pearl">IRIS Available Account Ledger Debited</p>
                  <p className="text-[10px] text-iris-muted">หักพ้อยต์ตามจริงและบันทึกรหัสประวัติถาวร</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-5.5 w-5.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">✓</span>
                <div>
                  <p className="font-bold text-iris-pearl">Fulfillment Orchestration Queued</p>
                  <p className="text-[10px] text-iris-muted">นำสินค้า {placedOrders.length} รายการ เข้าสู่คิวนำจ่ายของเกมปลั๊กอิน</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-5.5 w-5.5 rounded-full bg-iris-cyan/10 border border-iris-cyan/20 text-iris-cyan flex items-center justify-center font-mono text-[9px] font-bold animate-ping">●</span>
                <div>
                  <p className="font-bold text-iris-cyan">Ready for Claim in Game</p>
                  <p className="text-[10px] text-iris-muted">เข้าสู่เกมและพิมพ์คำสั่ง <code className="bg-black/40 text-iris-cyan px-1.5 py-0.5 rounded font-mono font-bold">/claim</code> เพื่อรับไอเท็ม</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            <Link href="/">
              <Button variant="primary">กลับสู่หน้าแรก Dashboard</Button>
            </Link>
            <Link href="/shop">
              <Button variant="secondary">ซื้อสินค้าเพิ่ม</Button>
            </Link>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="page-shell py-20">
        <EmptyState
          title="ตะกร้าสินค้ายังคงว่างอยู่"
          description="คุณยังไม่ได้เลือกซื้อไดโนเสาร์หรืออาวุธระดับสูงลงในตะกร้าชั่วคราว โปรดเลือกซื้อของเพื่อดำเนินการต่อ"
          actionText="สำรวจร้านค้า IRIS Store"
          onAction={() => {
            router.push('/shop');
          }}
        />
      </div>
    );
  }

  return (
    <div className="page-shell py-10 space-y-8 animate-slide-up">
      {/* 1. Header Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
        <div className="space-y-1">
          <Link href="/shop" className="inline-flex items-center gap-1.5 text-xs font-bold text-iris-cyan hover:underline uppercase">
            <ArrowLeft className="h-3.5 w-3.5" /> กลับไปเลือกซื้อของ
          </Link>
          <h1 className="font-display text-4xl font-extrabold text-iris-pearl mt-2 uppercase tracking-tight flex items-center gap-3">
            <ShoppingBag className="h-8 w-8 text-iris-cyan" />
            <span>ตระกร้าสินค้าและทำรายการ</span>
          </h1>
        </div>

        <button
          onClick={clear}
          className="text-xs font-bold text-rose-400 hover:underline border border-rose-500/10 hover:border-rose-500/20 bg-rose-500/5 px-4 py-2 rounded-full"
        >
          ล้างรายการทั้งหมด
        </button>
      </div>

      {/* 2. Cart Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Cols: Cart Line Items list */}
        <section className="lg:col-span-2 space-y-4" aria-label="รายการอาวุธและไดโนเสาร์ในตะกร้า">
          {items.map((item, index) => {
            const query = productQueries[index];
            const product = query?.data;
            const config = itemConfigs[item.productId];

            if (query?.isLoading) {
              return (
                <GlassCard key={item.productId} className="p-5 flex items-center gap-4">
                  <Loader2 className="h-5 w-5 animate-spin text-iris-cyan" />
                  <Skeleton className="w-1/2 h-4" />
                </GlassCard>
              );
            }

            if (!product) return null;

            return (
              <GlassCard key={item.productId} className="p-5" variant="default">
                <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  
                  {/* Photo */}
                  <div className="h-20 w-20 bg-black/40 border border-white/10 rounded-2xl flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-3xl">📦</span>
                    )}
                  </div>

                  {/* Name and Price */}
                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] font-bold text-iris-cyan uppercase bg-iris-cyan/5 px-2 py-0.5 rounded border border-iris-cyan/10">
                      {product.category?.name || 'IRIS Store'}
                    </span>
                    <h3 className="font-display font-bold text-base text-iris-pearl mt-2 truncate uppercase">{product.name}</h3>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-iris-gold mt-1.5">
                      <Coins className="h-4 w-4 text-iris-gold" />
                      <span>{product.price.toLocaleString()} IC <span className="font-sans text-[10px] text-iris-muted">ต่อหน่วย</span></span>
                    </div>
                  </div>

                  {/* Quantity adjustments */}
                  <div className="flex items-center bg-black/40 border border-white/10 rounded-full h-9 shrink-0">
                    <button
                      onClick={() => setQuantity(item.productId, item.quantity - 1)}
                      className="w-9 h-full flex items-center justify-center text-iris-muted hover:text-white"
                      aria-label="ลดจำนวน"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-8 text-center font-mono font-bold text-sm text-iris-pearl">{item.quantity}</span>
                    <button
                      onClick={() => setQuantity(item.productId, item.quantity + 1)}
                      className="w-9 h-full flex items-center justify-center text-iris-muted hover:text-white"
                      aria-label="เพิ่มจำนวน"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Trash action */}
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="h-9 w-9 rounded-full border border-rose-500/10 hover:border-rose-500/20 bg-rose-500/5 flex items-center justify-center text-rose-400 transition"
                    aria-label="ลบสินค้านี้"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Configurations: Server & Recipient Character */}
                <div className="mt-5 pt-5 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-iris-muted uppercase flex items-center gap-1">
                      <Server className="h-3 w-3" /> เลือกเซิร์ฟเวอร์ปลายทาง
                    </label>
                    <Select
                      value={config?.serverId || ''}
                      onChange={(e) => handleUpdateItemConfig(item.productId, 'serverId', parseInt(e.target.value))}
                      className="py-2 px-3 text-xs bg-black/30"
                    >
                      {serversData?.servers?.map((svr: any) => (
                        <option key={svr.id} value={svr.id}>
                          {svr.name} ({svr.map})
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-iris-muted uppercase">
                      ชื่อตัวละครผู้รับ (Recipient Survivor)
                    </label>
                    <Input
                      placeholder="เช่น Survivor123"
                      value={config?.recipient || ''}
                      onChange={(e) => handleUpdateItemConfig(item.productId, 'recipient', e.target.value)}
                      className="py-2 px-3 text-xs bg-black/30"
                    />
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </section>

        {/* Right Col: Checkout Summary & Voucher options */}
        <aside className="space-y-6">
          
          {/* Promo code card */}
          <GlassCard className="p-5" variant="default">
            <h3 className="text-xs font-bold text-iris-pearl uppercase tracking-wider mb-4 border-b border-white/5 pb-2">คูปองโค้ดส่วนลด</h3>
            
            <form onSubmit={applyVoucherCode} className="flex gap-2">
              <Input
                placeholder="ระบุรหัสโปรโมชั่น..."
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value)}
                className="py-2 px-3 text-xs bg-black/30"
              />
              <Button type="submit" variant="secondary" size="sm" className="px-4 text-xs font-bold shrink-0">
                ประยุกต์ใช้
              </Button>
            </form>

            {voucherError && <p className="text-[10px] font-bold text-rose-400 mt-2">{voucherError}</p>}
            {voucherSuccess && <p className="text-[10px] font-bold text-emerald-400 mt-2">{voucherSuccess}</p>}
            
            <div className="mt-3.5 text-[10px] text-iris-muted space-y-1">
              <p>แนะนำคูปองโค้ดทดลอง:</p>
              <div className="flex gap-2 mt-1">
                <code className="bg-white/5 border border-white/10 px-1 rounded text-white font-mono">IRIS50</code>
                <code className="bg-white/5 border border-white/10 px-1 rounded text-white font-mono">SIAMGOLD</code>
              </div>
            </div>
          </GlassCard>

          {/* Checkout Preview card */}
          <GlassCard variant="gold" className="p-6 space-y-5">
            <div>
              <span className="eyebrow text-iris-gold">Checkout Session</span>
              <h2 className="font-display text-xl font-bold text-iris-pearl uppercase mt-1">สรุปข้อมูลการหักแต้ม</h2>
            </div>

            <div className="space-y-3 text-xs border-b border-white/5 pb-4">
              <div className="flex justify-between">
                <span className="text-iris-muted">ยอดรวมสินค้า (Subtotal):</span>
                <span className="font-mono font-bold text-white">{subtotal.toLocaleString()} IC</span>
              </div>
              {appliedVoucher && (
                <div className="flex justify-between text-emerald-400">
                  <span>ส่วนลดคูปอง ({appliedVoucher.code}):</span>
                  <span className="font-mono font-bold">-{discountAmount.toLocaleString()} IC</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-iris-muted">ค่าดำเนินการเครือข่าย:</span>
                <span className="font-mono font-bold text-white">0 IC (ฟรี)</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/5 text-iris-pearl">
                <span>ราคาสุทธิ (Final Price):</span>
                <span className="font-mono text-gradient-gold text-lg">{finalTotal.toLocaleString()} IC</span>
              </div>
            </div>

            {/* Verification message from plan */}
            <div className="p-3 bg-iris-cyan/[0.04] border border-iris-cyan/10 rounded-2xl flex gap-2 text-[10px] leading-relaxed text-iris-muted">
              <ShieldCheck className="h-4.5 w-4.5 text-iris-cyan shrink-0 mt-0.5" />
              <span>ราคาสุดท้ายและสิทธิซื้อจะได้รับการตรวจสอบความมั่นคง (State Validation) ที่ระบบหลังบ้านก่อนทำรายการจริง</span>
            </div>

            {/* Balance check warning */}
            {user && !isBalanceSufficient && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-[10px] leading-relaxed space-y-1">
                <p className="font-bold">ยอดพ้อยต์คงเหลือมีไม่เพียงพอ</p>
                <p>กระเป๋าพ้อยต์ Available ของคุณมี {userBalance.toLocaleString()} IC ซึ่งไม่พอกับยอดสุทธิ {finalTotal.toLocaleString()} IC</p>
                <Link href="/topup" className="font-bold text-iris-gold hover:underline block pt-1">
                  ไปหน้าเติมเงินทรูมันนี่/พร้อมเพย์ →
                </Link>
              </div>
            )}

            {/* Submit checkout button */}
            <Button
              variant="cyan"
              className="w-full py-3"
              disabled={checkoutStep === 'submitting' || (!!user && !isBalanceSufficient)}
              isLoading={checkoutStep === 'submitting'}
              onClick={handleCheckoutSubmit}
            >
              ยืนยันคำสั่งซื้อและจัดส่งเข้าเกม
            </Button>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}
