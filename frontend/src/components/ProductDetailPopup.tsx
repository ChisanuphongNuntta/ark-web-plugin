'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, useCartStore } from '@/lib/store';
import { orderApi, adminApi, walletApi } from '@/lib/api';
import {
  X,
  Coins,
  Plus,
  Minus,
  ShoppingCart,
  Zap,
  Package,
  Info,
  Server,
  Sparkles,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ProductArtwork } from '@/components/ProductArtwork';

interface Product {
  id: number;
  name: string;
  description: string | null;
  /** Contract field (openapi.yaml Product.itemBlueprint). */
  itemBlueprint?: string | null;
  price: number;
  imageUrl: string | null;
  quantity: number;
  quality: number;
  category?: {
    name: string;
    icon: string | null;
  } | null;
}

interface ProductDetailPopupProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
}

const qualityConfig: Record<number, {
  name: string;
  badgeVariant: 'default' | 'cyan' | 'orchid' | 'gold' | 'hot' | 'success' | 'warning' | 'info';
  cardVariant: 'default' | 'prism' | 'gold' | 'flat';
  textColor: string;
  glowClass: string;
}> = {
  0: { name: 'PRIMITIVE', badgeVariant: 'default', cardVariant: 'flat', textColor: 'text-gray-400', glowClass: 'bg-gray-500/10' },
  1: { name: 'RAMSHACKLE', badgeVariant: 'success', cardVariant: 'default', textColor: 'text-emerald-400', glowClass: 'bg-emerald-500/10' },
  2: { name: 'APPRENTICE', badgeVariant: 'info', cardVariant: 'default', textColor: 'text-blue-400', glowClass: 'bg-blue-500/10' },
  3: { name: 'JOURNEYMAN', badgeVariant: 'orchid', cardVariant: 'default', textColor: 'text-purple-400', glowClass: 'bg-purple-500/10' },
  4: { name: 'MASTERCRAFT', badgeVariant: 'gold', cardVariant: 'gold', textColor: 'text-iris-gold', glowClass: 'bg-iris-gold/10' },
  5: { name: 'ASCENDANT', badgeVariant: 'cyan', cardVariant: 'prism', textColor: 'text-iris-cyan', glowClass: 'bg-iris-cyan/15' },
};

export default function ProductDetailPopup({
  product,
  isOpen,
  onClose,
}: ProductDetailPopupProps) {
  const { user } = useAuthStore();
  const addItem = useCartStore((state) => state.addItem);
  const queryClient = useQueryClient();
  
  const [quantity, setQuantity] = React.useState(1);
  const [selectedServer, setSelectedServer] = React.useState<number | null>(null);
  
  // Custom button feedback states
  const [isBuySuccess, setIsBuySuccess] = React.useState(false);
  const [isBuyError, setIsBuyError] = React.useState(false);
  const [isCartSuccess, setIsCartSuccess] = React.useState(false);
  const [buyErrorText, setBuyErrorText] = React.useState('');

  // Fetch servers list
  const { data: serversData, isError: isServersError } = useQuery({
    queryKey: ['servers'],
    queryFn: () => adminApi.getServers().then((res) => res.data),
    enabled: isOpen,
  });

  // Fetch real available balance
  const { data: walletData } = useQuery({
    queryKey: ['user-wallet-popup'],
    queryFn: () => walletApi.getBalance().then((res) => res.data),
    enabled: isOpen && !!user,
  });

  // Purchase mutation
  const orderMutation = useMutation({
    mutationFn: (data: { productId: number; serverId: number; quantity: number }) =>
      orderApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      queryClient.invalidateQueries({ queryKey: ['user-wallet-popup'] });
      
      setIsBuySuccess(true);
      setIsBuyError(false);
      
      setTimeout(() => {
        onClose();
        setIsBuySuccess(false);
      }, 2000);
    },
    onError: (err: any) => {
      setIsBuyError(true);
      setBuyErrorText(err.response?.data?.message || 'เกิดความผิดพลาดในการชำระพ้อยต์');
    },
  });

  // Esc key closure
  const handleEsc = React.useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  React.useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
      setQuantity(1);
      setIsBuySuccess(false);
      setIsBuyError(false);
      setIsCartSuccess(false);
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEsc]);

  // Set default server selection when servers load
  React.useEffect(() => {
    if (serversData?.servers?.length > 0 && !selectedServer) {
      setSelectedServer(serversData.servers[0].id);
    }
  }, [serversData, selectedServer]);

  if (!isOpen) return null;

  const quality = qualityConfig[product.quality] || qualityConfig[0];
  const totalPrice = product.price * quantity;
  
  // Balance checking
  const userBalance = walletData ? Number(walletData.accounts?.available || 0) : Number(user?.pointsBalance || 0);
  const hasEnoughBalance = userBalance >= totalPrice;

  const handleOrder = () => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    if (!selectedServer) {
      setIsBuyError(true);
      setBuyErrorText('กรุณาเลือกเซิร์ฟเวอร์ปลายทาง');
      return;
    }
    setIsBuyError(false);
    orderMutation.mutate({
      productId: product.id,
      serverId: selectedServer,
      quantity,
    });
  };

  const handleAddToCart = () => {
    if (!selectedServer) {
      setIsBuyError(true);
      setBuyErrorText('กรุณาเลือกเซิร์ฟเวอร์ปลายทางก่อนเพิ่มลงตะกร้า');
      return;
    }
    setIsBuyError(false);
    // Cart lines are keyed by (productId, serverId) — pass the chosen server.
    addItem(product.id, selectedServer, quantity);
    setIsCartSuccess(true);
    setTimeout(() => {
      setIsCartSuccess(false);
    }, 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] m-0 w-screen h-screen flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="popup-title"
    >
      {/* Modal Card wrapper */}
      <GlassCard
        variant={quality.cardVariant === 'flat' ? 'default' : quality.cardVariant}
        hasGrid
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-300 relative shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
      >
        {/* Floating Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 h-10 w-10 rounded-full border border-white/10 bg-black/80 hover:bg-white/5 flex items-center justify-center transition outline-none focus-visible:ring-2 focus-visible:ring-iris-cyan"
          aria-label="ปิดหน้าต่างรายละเอียด"
        >
          <X className="h-5 w-5 text-iris-pearl" />
        </button>

        <div className="flex flex-col lg:flex-row h-full">
          {/* Left panel: Image viewport & shopping controls */}
          <div className="lg:w-1/2 p-6 flex flex-col justify-between bg-gradient-to-br from-iris-river/20 to-transparent border-r border-white/5">
            <div>
              {/* Image box */}
              <div className="relative aspect-square bg-black/40 rounded-2xl border border-white/10 overflow-hidden mb-6 flex items-center justify-center">
                <div className={`absolute inset-0 ${quality.glowClass} opacity-30`} />
                <ProductArtwork product={product} alt={product.name} className="relative z-10 h-full w-full" fit="contain" />

                {/* Tags overlay */}
                <div className="absolute top-4 left-4 z-20 flex gap-2">
                  {product.category && (
                    <Badge variant="default" outline>
                      {product.category.icon} {product.category.name}
                    </Badge>
                  )}
                </div>

                <div className="absolute top-4 right-4 z-20">
                  <Badge variant={quality.badgeVariant} className="flex items-center gap-1 font-bold">
                    <Sparkles className="h-3.5 w-3.5" />
                    {quality.name}
                  </Badge>
                </div>
              </div>

              {/* Quantity input counter */}
              <div className="space-y-2 mb-4">
                <label htmlFor="popup-qty" className="text-xs font-bold uppercase tracking-wider text-iris-muted">
                  ระบุจำนวนชิ้น
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="h-11 w-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition"
                    aria-label="ลดจำนวนลง 1 ชิ้น"
                  >
                    <Minus className="h-4 w-4 text-iris-pearl" />
                  </button>
                  <div className="flex-1">
                    <Input
                      id="popup-qty"
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="text-center font-bold text-lg bg-black/30 py-2.5"
                    />
                  </div>
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    className="h-11 w-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition"
                    aria-label="เพิ่มจำนวนขึ้น 1 ชิ้น"
                  >
                    <Plus className="h-4 w-4 text-iris-pearl" />
                  </button>
                </div>
              </div>

              {/* Server selector */}
              <div className="space-y-2 mb-6">
                <label className="text-xs font-bold uppercase tracking-wider text-iris-muted flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5" />
                  เลือกเซิร์ฟเวอร์เป้าหมาย
                </label>
                {isServersError ? (
                  <p className="text-xs text-rose-400">ระบบไม่สามารถดึงรายชื่อเซิร์ฟเวอร์ได้</p>
                ) : (
                  <Select
                    value={selectedServer || ''}
                    onChange={(e) => setSelectedServer(parseInt(e.target.value))}
                    className="bg-black/30"
                  >
                    <option value="">-- กรุณาเลือกเซิร์ฟเวอร์ --</option>
                    {serversData?.servers?.map((svr: any) => (
                      <option key={svr.id} value={svr.id}>
                        {svr.name} ({svr.map})
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            </div>

            {/* Total Pricing panel */}
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-black/40 border border-white/5 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-iris-muted">ราคาต่อชิ้น:</span>
                  <span className="font-mono font-bold text-iris-pearl">{product.price.toLocaleString()} IC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-iris-muted">จำนวน:</span>
                  <span className="font-mono font-bold text-iris-pearl">x{quantity}</span>
                </div>
                <div className="border-t border-white/5 pt-2 flex justify-between items-center">
                  <span className="font-bold text-iris-pearl">ราคารวมที้งสิ้น:</span>
                  <div className="flex items-center gap-1.5 font-mono text-xl font-bold text-gradient-gold">
                    <Coins className="h-5 w-5 text-iris-gold" />
                    <span>{totalPrice.toLocaleString()} IC</span>
                  </div>
                </div>
              </div>

              {/* Balance warning check */}
              {user && !hasEnoughBalance && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl flex items-start gap-2.5 text-xs">
                  <ShieldAlert className="h-4.5 w-4.5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">เหรียญไม่เพียงพอสำหรับซื้อไอเท็มนี้</p>
                    <p className="text-[10px] text-rose-400/80 mt-0.5">ยอดเงินของคุณ: {userBalance.toLocaleString()} IC (ขาดอีก {(totalPrice - userBalance).toLocaleString()} IC)</p>
                    <Link href="/topup" className="text-[10px] font-bold text-iris-gold hover:underline mt-1.5 inline-block flex items-center gap-1">
                      ไปที่หน้าเติมเงินทันที
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              )}

              {/* Error triggers */}
              {isBuyError && (
                <ErrorMessage
                  title="ชำระเงินไม่สำเร็จ"
                  message={buyErrorText}
                  errorCode="ERR_INSUFFICIENT_FUNDS_OR_SERVER"
                />
              )}

              {/* Actions: Add to cart / Buy Now */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="secondary"
                  onClick={handleAddToCart}
                  isSuccess={isCartSuccess}
                  successText="ใส่ตะกร้าแล้ว!"
                  leftIcon={<ShoppingCart className="h-4 w-4" />}
                >
                  ใส่ตะกร้า
                </Button>

                <Button
                  variant="primary"
                  onClick={handleOrder}
                  isLoading={orderMutation.isPending}
                  isSuccess={isBuySuccess}
                  isError={isBuyError}
                  successText="ซื้อสำเร็จแล้ว!"
                  errorText="เกิดข้อผิดพลาด"
                  disabled={!selectedServer || (!!user && !hasEnoughBalance)}
                  leftIcon={<Zap className="h-4 w-4" />}
                >
                  ซื้อทันที
                </Button>
              </div>
            </div>
          </div>

          {/* Right panel: Description & Delivery guidelines */}
          <div className="lg:w-1/2 p-6 space-y-6 overflow-y-auto">
            {/* Header info */}
            <div>
              <h2 id="popup-title" className="font-display text-2xl font-extrabold text-iris-pearl uppercase tracking-wide">
                {product.name}
              </h2>
              <div className="flex items-center gap-3 text-xs text-iris-muted mt-1.5">
                <span>Product ID: {product.id}</span>
                {product.quantity > 1 && (
                  <Badge variant="cyan">
                    บรรจุ x{product.quantity} ชิ้นต่อแพ็ก
                  </Badge>
                )}
              </div>
            </div>

            {/* Description details */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-iris-pearl flex items-center gap-2">
                <Info className="h-4.5 w-4.5 text-iris-cyan" />
                <span>รายละเอียดสินค้า (Product Description)</span>
              </h3>
              <p className="text-xs sm:text-sm text-iris-muted leading-relaxed whitespace-pre-wrap bg-white/[0.015] border border-white/5 rounded-2xl p-4">
                {product.description || 'ไม่มีคำอธิบายเพิ่มเติมสำหรับสินค้านี้'}
              </p>
            </div>

            {/* Delivery orchestrator guidelines */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-iris-pearl flex items-center gap-2">
                <Zap className="h-4.5 w-4.5 text-iris-gold" />
                <span>ขั้นตอนการจัดส่งสินค้า (Fulfillment Promise)</span>
              </h3>
              
              <div className="space-y-2.5">
                <div className="flex gap-3 text-xs">
                  <span className="h-5 w-5 rounded-full bg-iris-cyan/10 border border-iris-cyan/30 text-iris-cyan flex items-center justify-center font-bold shrink-0">1</span>
                  <div>
                    <p className="font-bold text-iris-pearl">ยืนยันการชำระพ้อยต์ผ่านกระเป๋า IRIS Wallet</p>
                    <p className="text-[11px] text-iris-muted mt-0.5">ยอดแต้มจะถูกบันทึกผ่าน Ledger หักลบยอดคงเหลือตามจริง</p>
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="h-5 w-5 rounded-full bg-iris-cyan/10 border border-iris-cyan/30 text-iris-cyan flex items-center justify-center font-bold shrink-0">2</span>
                  <div>
                    <p className="font-bold text-iris-pearl">ระบบนำจ่าย (Orchestrator Plugin) เตรียมโหลดไอเท็มเข้าคิว</p>
                    <p className="text-[11px] text-iris-muted mt-0.5">ส่งข้อมูลเข้าสู่เซิร์ฟเวอร์ปลายทาง {selectedServer ? `ID: ${selectedServer}` : ''} อย่างปลอดภัย</p>
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="h-5 w-5 rounded-full bg-iris-cyan/10 border border-iris-cyan/30 text-iris-cyan flex items-center justify-center font-bold shrink-0">3</span>
                  <div>
                    <p className="font-bold text-iris-pearl">พิมพ์คำสั่งรับของรางวัลสะสมในช่องแชทเกม</p>
                    <p className="text-[11px] text-iris-muted mt-0.5">
                      พิมพ์คำสั่ง <code className="bg-black/40 text-iris-cyan px-1.5 py-0.5 rounded font-mono font-bold">/claim</code> ในหน้าต่างแชทตัวละคร ARK ของคุณเพื่อเรียกใช้ของทันที
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Spec breakdown details */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-iris-pearl flex items-center gap-2">
                <Package className="h-4.5 w-4.5 text-iris-orchid" />
                <span>คุณลักษณะเฉพาะ (Product Specifications)</span>
              </h3>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 bg-black/40 border border-white/5 rounded-2xl">
                  <span className="text-[10px] text-iris-muted block">ระดับคุณภาพอาวุธ</span>
                  <span className={`font-bold mt-1 block ${quality.textColor}`}>{quality.name}</span>
                </div>
                <div className="p-3 bg-black/40 border border-white/5 rounded-2xl">
                  <span className="text-[10px] text-iris-muted block">หมวดหมู่สินค้า</span>
                  <span className="font-bold text-iris-pearl mt-1 block">
                    {product.category?.icon || '◇'} {product.category?.name || 'ไม่ระบุ'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
