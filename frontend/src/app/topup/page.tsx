'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store';
import {
  CreditCard,
  Coins,
  Shield,
  Clock,
  CheckCircle,
  Gift,
  Zap,
  Crown,
  Star,
  Sparkles,
} from 'lucide-react';
import LaserCard from '@/components/LaserCard';
import LaserModal from '@/components/LaserModal';
import LaserButton from '@/components/LaserButton';
import Link from 'next/link';

// Points purchase packages
const coinPackages = [
  { id: 1, coins: 100, price: 35, bonus: 0, tier: 'basic', popular: false },
  { id: 2, coins: 300, price: 99, bonus: 10, tier: 'basic', popular: false },
  { id: 3, coins: 500, price: 159, bonus: 25, tier: 'standard', popular: false },
  { id: 4, coins: 1000, price: 299, bonus: 100, tier: 'standard', popular: true },
  { id: 5, coins: 2500, price: 699, bonus: 350, tier: 'premium', popular: false },
  { id: 6, coins: 5000, price: 1299, bonus: 1000, tier: 'premium', popular: false },
  { id: 7, coins: 10000, price: 2499, bonus: 2500, tier: 'legendary', popular: false },
];

const tierConfig = {
  basic: {
    gradient: 'from-gray-400 to-gray-500',
    border: 'border-gray-500/20 hover:border-gray-500/40',
    glow: 'bg-gray-500/10 shadow-[0_0_15px_rgba(156,163,175,0.1)]',
    tag: 'BASIC',
  },
  standard: {
    gradient: 'from-blue-400 to-cyan-400',
    border: 'border-blue-500/20 hover:border-blue-500/40',
    glow: 'bg-blue-500/10 shadow-[0_0_15px_rgba(96,165,250,0.15)]',
    tag: 'STANDARD',
  },
  premium: {
    gradient: 'from-ark-primary to-ark-accent',
    border: 'border-ark-primary/20 hover:border-ark-primary/40',
    glow: 'bg-ark-primary/10 shadow-[0_0_15px_rgba(0,229,168,0.25)]',
    tag: 'PREMIUM',
  },
  legendary: {
    gradient: 'from-ark-gold via-yellow-400 to-amber-300',
    border: 'border-ark-gold/30 hover:border-ark-gold/60',
    glow: 'bg-ark-gold/10 shadow-[0_0_20px_rgba(246,196,83,0.3)]',
    tag: 'LEGENDARY',
  },
};

const paymentMethods = [
  { id: 'promptpay', name: 'PromptPay', description: 'ชำระเงินผ่าน QR Code', icon: '🏦', speed: 'INSTANT' },
  { id: 'truemoney', name: 'TrueMoney Wallet', description: 'ชำระเงินผ่านทรูมันนี่', icon: '📱', speed: 'AUTOMATED' },
  { id: 'credit', name: 'Credit/Debit Card', description: 'Visa, Mastercard', icon: '💳', speed: 'SECURED' },
];

export default function TopupPage() {
  const { user } = useAuthStore();
  const [selectedPackage, setSelectedPackage] = useState<number | null>(4); // Default standard popular package
  const [selectedPayment, setSelectedPayment] = useState<string>('promptpay');

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    content: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'danger' | 'warning' | 'success';
    onConfirm?: () => void;
    singleButton?: boolean;
  }>({
    isOpen: false,
    title: '',
    content: null,
  });

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }));
  };

  const showModal = (config: {
    title: string;
    content: React.ReactNode;
    onConfirm?: () => void;
    variant?: 'default' | 'danger' | 'warning' | 'success';
    confirmText?: string;
    cancelText?: string;
    singleButton?: boolean;
  }) => {
    setModalConfig({
      isOpen: true,
      title: config.title,
      content: config.content,
      onConfirm: config.onConfirm
        ? () => {
            config.onConfirm?.();
            closeModal();
          }
        : config.singleButton ? closeModal : undefined,
      variant: config.variant || 'default',
      confirmText: config.confirmText || 'ยืนยัน',
      cancelText: config.cancelText || 'ยกเลิก',
      singleButton: config.singleButton,
    });
  };

  const handlePurchase = () => {
    if (!selectedPackage) {
      showModal({
        title: 'ระบบแจ้งเตือน',
        content: <p className="text-sm text-gray-400">โปรดเลือกแพ็คเกจเหรียญที่คุณต้องการสั่งซื้อก่อนทำรายการ</p>,
        variant: 'warning',
        singleButton: true,
        confirmText: 'รับทราบ',
      });
      return;
    }
    if (!user) {
      showModal({
        title: 'กรุณาตรวจสอบการเข้าสู่ระบบ',
        content: <p className="text-sm text-gray-400">คุณต้องเข้าสู่ระบบสมาชิกเพื่อดำเนินการเติมเงินและรับสิทธิประโยชน์</p>,
        variant: 'warning',
        singleButton: true,
        confirmText: 'รับทราบ',
      });
      return;
    }

    const pkg = coinPackages.find(p => p.id === selectedPackage);
    showModal({
      title: 'INITIALIZING TRANSACTION...',
      content: (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">อยู่ระหว่างจำลองขั้นตอนประมวลผลการเชื่อมโยงระบบธนาคาร:</p>
          <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500 uppercase tracking-widest">PACKAGE:</span>
              <span className="text-ark-primary font-black">{(pkg?.coins || 0) + (pkg?.bonus || 0)} IC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 uppercase tracking-widest">PRICE:</span>
              <span className="text-white font-black">฿{pkg?.price.toLocaleString()} THB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 uppercase tracking-widest">METHOD:</span>
              <span className="text-ark-accent font-black uppercase">{selectedPayment}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-ark-primary/5 border border-ark-primary/10 text-ark-primary text-xs">
            <Shield className="w-4 h-4" />
            <span>ชำระผ่านระบบถอดรหัสความปลอดภัย SSL 256-Bit</span>
          </div>
        </div>
      ),
      variant: 'default',
      singleButton: true,
      confirmText: 'ตกลง',
    });
  };

  return (
    <div className="space-y-8 py-6 relative">
      
      {/* Title */}
      <div className="relative inline-block">
        <div className="absolute inset-0 bg-ark-gold/10 rounded-2xl blur-2xl"></div>
        <h1 className="text-3xl font-black bg-gradient-to-r from-ark-gold via-yellow-400 to-ark-gold bg-clip-text text-transparent relative flex items-center gap-3 tracking-widest uppercase">
          <div className="relative">
            <div className="absolute inset-0 bg-ark-gold/25 rounded-full blur-md"></div>
            <CreditCard className="h-8 w-8 text-ark-gold relative" />
          </div>
          RECHARGE HUD
        </h1>
      </div>

      {/* User info card & balance */}
      {user && (
        <LaserCard withBeam variant="gold">
          <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-r from-ark-panel/60 via-[#07111F]/30 to-[#02040b]">
            <div className="flex items-center gap-4.5">
              <div className="relative">
                <div className="absolute inset-0 bg-ark-gold/25 rounded-2xl blur-xl animate-pulse"></div>
                <div className="relative p-4.5 bg-gradient-to-br from-ark-gold/15 to-yellow-600/10 rounded-2xl border border-ark-gold/30 flex items-center justify-center">
                  <Coins className="h-7 w-7 text-ark-gold" />
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-wider">CURRENT BALANCE</p>
                <p className="text-3xl font-black bg-gradient-to-r from-ark-gold via-yellow-400 to-amber-300 bg-clip-text text-transparent">
                  {user.pointsBalance?.toLocaleString() || 0}
                  <span className="text-xs text-ark-gold/60 ml-2 font-black uppercase">IC</span>
                </p>
              </div>
            </div>

            <Link href="/orders">
              <LaserButton variant="secondary" icon={<Clock className="h-4 w-4" />}>
                TRANSACTION HISTORY
              </LaserButton>
            </Link>
          </div>
        </LaserCard>
      )}

      {/* Not logged in alert */}
      {!user && (
        <LaserCard variant="gold">
          <div className="p-8 text-center space-y-4 bg-[#0a0606]/30 border border-yellow-500/10">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-yellow-500/20 rounded-full blur-xl"></div>
              <Shield className="h-12 w-12 text-yellow-500 relative mx-auto" />
            </div>
            <p className="text-xs text-yellow-500 uppercase tracking-widest font-black">กรุณาเข้าสู่ระบบบัญชีสมาชิกเพื่อเติมเงิน</p>
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/discord`}
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-ark-primary to-ark-accent hover:from-ark-primary hover:to-ark-accent/90 rounded-xl font-black text-xs text-black tracking-widest shadow-lg"
            >
              เข้าสู่ระบบสมาชิก
            </a>
          </div>
        </LaserCard>
      )}

      {/* 2-Column Checkout flow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Cols - Packages & payment */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Packages selection */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Coins className="w-4.5 h-4.5 text-ark-gold" />
              <h2 className="text-sm font-black text-white uppercase tracking-widest">SELECT COIN PACKAGE</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {coinPackages.map((pkg) => {
                const config = tierConfig[pkg.tier as keyof typeof tierConfig] || tierConfig.basic;
                const isSelected = selectedPackage === pkg.id;
                const totalCoins = pkg.coins + pkg.bonus;

                return (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedPackage(pkg.id)}
                    className="relative text-left transition-transform duration-300 hover:scale-[1.01]"
                  >
                    {pkg.popular && (
                      <div className="absolute -top-3 left-6 z-20">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-gradient-to-r from-ark-primary to-ark-accent rounded-full text-[9px] font-black text-black uppercase tracking-wider shadow-lg">
                          <Star className="h-2.5 w-2.5 fill-current" />
                          POPULAR
                        </span>
                      </div>
                    )}

                    <LaserCard
                      className={`h-full border transition-all duration-300 ${
                        isSelected
                          ? 'border-ark-gold shadow-lg shadow-ark-gold/10'
                          : config.border
                      }`}
                    >
                      <div className="p-5 flex flex-col justify-between h-full relative overflow-hidden bg-gradient-to-b from-ark-panel/60 to-ark-dark/40">
                        
                        {/* Selected Aura */}
                        {isSelected && (
                          <div className="absolute inset-0 bg-gradient-to-br from-ark-gold/5 to-yellow-600/5"></div>
                        )}

                        <div className="relative z-10 flex items-start justify-between">
                          <div>
                            <span className="text-[8px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-gray-400 font-black tracking-widest">{config.tag}</span>
                            
                            {/* Coins Balance block */}
                            <div className="flex items-center gap-2 mt-2">
                              <Coins className="h-5 w-5 text-ark-gold" />
                              <span className="text-xl font-black text-white">{pkg.coins.toLocaleString()} IC</span>
                            </div>

                            {/* Bonus */}
                            {pkg.bonus > 0 && (
                              <div className="flex items-center gap-1.5 text-xs text-ark-primary font-black uppercase tracking-wide mt-1.5">
                                <Gift className="h-3.5 w-3.5" />
                                <span>+{pkg.bonus.toLocaleString()} IC BONUS</span>
                              </div>
                            )}

                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide mt-2">
                              รวมได้รับ {totalCoins.toLocaleString()} IRIS COINS
                            </p>
                          </div>

                          <div className="text-right">
                            <span className="text-xl font-black text-gradient-gold">฿{pkg.price}</span>
                            <p className="text-[8px] text-gray-500 font-bold">THB</p>
                          </div>
                        </div>

                        {/* Selected Tick Indicator */}
                        {isSelected && (
                          <div className="absolute bottom-3.5 right-3.5 bg-ark-gold text-black rounded-full p-1 shadow-[0_0_10px_rgba(246,196,83,0.5)]">
                            <CheckCircle className="w-3.5 h-3.5" fill="currentColor" />
                          </div>
                        )}
                      </div>
                    </LaserCard>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Payment Selection */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <CreditCard className="w-4.5 h-4.5 text-ark-primary" />
              <h2 className="text-sm font-black text-white uppercase tracking-widest">SELECT PAYMENT METHOD</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {paymentMethods.map((method) => {
                const isSelected = selectedPayment === method.id;

                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedPayment(method.id)}
                    className="text-left transition-transform duration-300 hover:scale-[1.01]"
                  >
                    <LaserCard
                      className={`h-full border transition-all duration-300 ${
                        isSelected ? 'border-ark-primary shadow-lg shadow-ark-primary/10' : 'border-white/5'
                      }`}
                    >
                      <div className="p-4 flex flex-col justify-between h-full bg-gradient-to-b from-ark-panel/60 to-ark-dark/40 relative">
                        <div className="flex items-start justify-between">
                          <span className="text-2xl">{method.icon}</span>
                          <span className="text-[8px] bg-white/2 border border-white/5 px-1 py-0.5 rounded text-gray-400 font-black tracking-widest">{method.speed}</span>
                        </div>
                        <div className="mt-4">
                          <h4 className="font-extrabold text-xs text-white uppercase tracking-wider">{method.name}</h4>
                          <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">{method.description}</p>
                        </div>

                        {isSelected && (
                          <div className="absolute top-3.5 right-3.5 text-ark-primary">
                            <CheckCircle className="w-4 h-4" fill="currentColor" />
                          </div>
                        )}
                      </div>
                    </LaserCard>
                  </button>
                );
              })}
            </div>
          </section>

        </div>

        {/* Right Col - Checkout Details */}
        <div className="lg:col-span-1 space-y-6">
          <div className="flex items-center gap-2 px-1">
            <Zap className="w-4.5 h-4.5 text-ark-gold" />
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">TRANSACTION SUMMARY</h3>
          </div>

          {selectedPackage && (
            <LaserCard withBeam variant="gold">
              <div className="p-5 space-y-4 bg-gradient-to-b from-ark-panel/60 to-ark-dark/40">
                {(() => {
                  const pkg = coinPackages.find(p => p.id === selectedPackage);
                  if (!pkg) return null;
                  const totalCoins = pkg.coins + pkg.bonus;

                  return (
                    <div className="space-y-4">
                      {/* Breakdown table */}
                      <div className="space-y-2.5 text-xs">
                        <div className="flex justify-between py-1.5 border-b border-white/5">
                          <span className="text-gray-500 uppercase tracking-wider">IRIS COINS:</span>
                          <span className="text-white font-extrabold">{pkg.coins.toLocaleString()} IC</span>
                        </div>
                        {pkg.bonus > 0 && (
                          <div className="flex justify-between py-1.5 border-b border-white/5">
                            <span className="text-ark-primary font-bold uppercase tracking-wider">EXTRA BONUS:</span>
                            <span className="text-ark-primary font-black">+{pkg.bonus.toLocaleString()} IC</span>
                          </div>
                        )}
                        <div className="flex justify-between py-1.5 border-b border-white/5">
                          <span className="text-gray-500 uppercase tracking-wider">TOTAL REVENUE:</span>
                          <span className="text-ark-gold font-black text-sm">{totalCoins.toLocaleString()} IC</span>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-white/5">
                          <span className="text-gray-500 uppercase tracking-wider">PAYMENT OPTION:</span>
                          <span className="text-ark-accent font-black uppercase">{selectedPayment}</span>
                        </div>
                        <div className="flex justify-between py-2 text-sm font-black uppercase text-white">
                          <span>AMOUNT THB:</span>
                          <span className="text-xl text-gradient-gold">฿{pkg.price.toLocaleString()}</span>
                        </div>
                      </div>

                      <LaserButton
                        variant="gold"
                        className="w-full py-3 text-xs tracking-widest font-black uppercase"
                        icon={<Zap className="h-4.5 w-4.5" />}
                        onClick={handlePurchase}
                      >
                        PURCHASE ฿{pkg.price} THB
                      </LaserButton>
                    </div>
                  );
                })()}
              </div>
            </LaserCard>
          )}

          {/* Security certifications */}
          <div className="grid grid-cols-1 gap-3">
            {[
              { icon: Shield, title: 'SSL 256-BIT ENCRYPTED', desc: 'Secure connection logs' },
              { icon: Zap, title: 'INSTANT DELIVERY SYSTEM', desc: 'Real-time database injector' },
              { icon: Crown, title: 'LOYALTY REWARDS ON TOP', desc: 'Earn points every checkout' },
            ].map((cert, idx) => {
              const Icon = cert.icon;
              return (
                <div key={idx} className="flex items-start gap-3 p-3.5 rounded-xl border border-white/5 bg-white/2">
                  <Icon className="w-5 h-5 text-ark-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-extrabold text-[10px] text-white tracking-wider uppercase">{cert.title}</h5>
                    <p className="text-[9px] text-gray-500 font-bold mt-0.5">{cert.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

      </div>

      {/* Laser Dialog Box */}
      <LaserModal
        isOpen={modalConfig.isOpen}
        onClose={closeModal}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        variant={modalConfig.variant}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
        singleButton={modalConfig.singleButton}
      >
        {modalConfig.content}
      </LaserModal>
    </div>
  );
}
