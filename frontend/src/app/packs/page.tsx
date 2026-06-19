'use client';

import { Gift, Package, Coins, Check, Star, Sparkles, Crown, Zap } from 'lucide-react';
import LaserCard from '@/components/LaserCard';
import LaserModal from '@/components/LaserModal';
import LaserButton from '@/components/LaserButton';
import { useState } from 'react';

// Mock packs data - in production, these would come from an API
const itemPacks = [
  {
    id: 1,
    name: 'Starter Pack',
    description: 'แพ็คสำหรับผู้เล่นใหม่ มีทุกอย่างที่จำเป็นสำหรับเริ่มต้น',
    price: 500,
    originalPrice: 800,
    tier: 'basic',
    icon: '📦',
    items: [
      { name: 'Metal Tools Set', quantity: 1, quality: 'Journeyman' },
      { name: 'Flak Armor Set', quantity: 1, quality: 'Apprentice' },
      { name: 'Longneck Rifle', quantity: 1, quality: 'Apprentice' },
      { name: 'Ammo Bundle', quantity: 500, quality: null },
      { name: 'Cooked Meat Jerky', quantity: 100, quality: null },
    ],
    gradient: 'from-gray-600 via-gray-500 to-gray-600',
    popular: false,
  },
  {
    id: 2,
    name: 'Builder Pack',
    description: 'สำหรับคนที่ชอบสร้างบ้าน มีวัสดุก่อสร้างครบครัน',
    price: 1200,
    originalPrice: 1800,
    tier: 'standard',
    icon: '🏠',
    items: [
      { name: 'Metal Ingot', quantity: 5000, quality: null },
      { name: 'Cementing Paste', quantity: 2000, quality: null },
      { name: 'Crystal', quantity: 1000, quality: null },
      { name: 'Electronics', quantity: 500, quality: null },
      { name: 'Polymer', quantity: 500, quality: null },
      { name: 'Industrial Forge', quantity: 1, quality: null },
    ],
    gradient: 'from-blue-600 via-cyan-600 to-blue-600',
    popular: false,
  },
  {
    id: 3,
    name: 'Hunter Pack',
    description: 'แพ็คนักล่า อาวุธและชุดเกราะคุณภาพสูง',
    price: 2500,
    originalPrice: 3500,
    tier: 'premium',
    icon: '🎯',
    items: [
      { name: 'Tek Rifle', quantity: 1, quality: 'Ascendant' },
      { name: 'Tek Armor Set', quantity: 1, quality: 'Mastercraft' },
      { name: 'Element', quantity: 100, quality: null },
      { name: 'Assault Rifle', quantity: 2, quality: 'Ascendant' },
      { name: 'Advanced Rifle Bullet', quantity: 2000, quality: null },
      { name: 'Rocket Launcher', quantity: 1, quality: 'Mastercraft' },
    ],
    gradient: 'from-emerald-600 via-cyan-600 to-emerald-600',
    popular: true,
  },
  {
    id: 4,
    name: 'Tamer Pack',
    description: 'แพ็คสำหรับคนรักไดโน อุปกรณ์และไอเทมช่วย tame',
    price: 1800,
    originalPrice: 2500,
    tier: 'premium',
    icon: '🦕',
    items: [
      { name: 'Exceptional Kibble', quantity: 200, quality: null },
      { name: 'Tranq Dart', quantity: 500, quality: null },
      { name: 'Longneck Rifle', quantity: 2, quality: 'Mastercraft' },
      { name: 'Cryopod', quantity: 10, quality: null },
      { name: 'Soothing Balm', quantity: 10, quality: null },
      { name: 'Ghillie Armor Set', quantity: 1, quality: 'Journeyman' },
    ],
    gradient: 'from-green-600 via-emerald-600 to-green-600',
    popular: false,
  },
  {
    id: 5,
    name: 'Ultimate Pack',
    description: 'แพ็คที่ดีที่สุด! รวมทุกอย่างที่คุณต้องการ',
    price: 5000,
    originalPrice: 8000,
    tier: 'legendary',
    icon: '👑',
    items: [
      { name: 'Full Tek Armor Set', quantity: 1, quality: 'Ascendant' },
      { name: 'Tek Rifle', quantity: 1, quality: 'Ascendant' },
      { name: 'Tek Saddle (Any)', quantity: 1, quality: 'Ascendant' },
      { name: 'Element', quantity: 500, quality: null },
      { name: 'Metal Ingot', quantity: 10000, quality: null },
      { name: 'Cryopod', quantity: 20, quality: null },
      { name: 'Boss Rex (Leveled)', quantity: 1, quality: 'Bred' },
      { name: 'Exclusive Skin Pack', quantity: 1, quality: null },
    ],
    gradient: 'from-yellow-500 via-amber-500 to-yellow-500',
    popular: false,
  },
];

const tierConfig = {
  basic: {
    label: 'Basic',
    color: 'text-gray-400 border-gray-500/30',
    icon: Package,
  },
  standard: {
    label: 'Standard',
    color: 'text-blue-400 border-blue-500/30',
    icon: Star,
  },
  premium: {
    label: 'Premium',
    color: 'text-emerald-400 border-emerald-500/30',
    icon: Sparkles,
  },
  legendary: {
    label: 'Legendary',
    color: 'text-yellow-400 border-yellow-500/30',
    icon: Crown,
  },
};

export default function PacksPage() {
  const [selectedPack, setSelectedPack] = useState<number | null>(null);

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

  const showModal = ({
    title,
    content,
    onConfirm,
    variant = 'default',
    confirmText = 'ยืนยัน',
    cancelText = 'ยกเลิก',
    singleButton = false,
  }: {
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
      title,
      content,
      onConfirm: onConfirm
        ? () => {
          onConfirm();
          closeModal();
        }
        : singleButton ? closeModal : undefined,
      variant,
      confirmText,
      cancelText,
      singleButton,
    });
  };

  const handleBuyPack = (packId: number) => {
    // In production, this would open a purchase modal or redirect to checkout
    console.log('Buying pack:', packId);
    showModal({
      title: 'กำลังพัฒนา',
      content: <p>ระบบซื้อแพ็คเกจกำลังอยู่ในระหว่างการพัฒนา กรุณารอสักครู่</p>,
      variant: 'default',
      singleButton: true,
      confirmText: 'ตกลง',
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative inline-block">
        <div className="absolute inset-0 bg-cyan-500/20 rounded-2xl blur-2xl"></div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent relative flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-cyan-500/30 rounded-full blur-lg animate-pulse"></div>
            <Gift className="h-10 w-10 text-cyan-400 relative" />
          </div>
          แพ็คเกจพิเศษ
        </h1>
      </div>

      {/* Info Banner */}
      <LaserCard withBeam>
        <div className="p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="h-5 w-5 text-yellow-400" />
            <span className="text-lg font-medium bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent">
              ประหยัดมากกว่าซื้อแยก!
            </span>
          </div>
          <p className="text-gray-400">
            แพ็คเกจรวมไอเทมหลายชิ้นในราคาพิเศษ รับไอเทมทันทีหลังซื้อ
          </p>
        </div>
      </LaserCard>

      {/* Packs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {itemPacks.map((pack) => {
          const tier = tierConfig[pack.tier as keyof typeof tierConfig];
          const TierIcon = tier.icon;
          const discount = Math.round((1 - pack.price / pack.originalPrice) * 100);

          return (
            <LaserCard
              key={pack.id}
              withBeam={pack.popular}
              glowOnHover
              className={pack.popular ? 'border-emerald-500/50' : ''}
            >
              <div className="relative overflow-hidden">
                {/* Popular badge */}
                {pack.popular && (
                  <div className="absolute top-4 right-4 z-10">
                    <div className="relative">
                      <div className="absolute inset-0 bg-cyan-500/50 rounded-full blur-lg"></div>
                      <span className="relative inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-full text-xs font-bold text-white">
                        <Star className="h-3 w-3" fill="currentColor" />
                        ยอดนิยม
                      </span>
                    </div>
                  </div>
                )}

                {/* Header */}
                <div className={`p-6 bg-gradient-to-br ${pack.gradient} bg-opacity-10`}>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className={`absolute inset-0 bg-gradient-to-br ${pack.gradient} opacity-30 rounded-2xl blur-lg`}></div>
                      <div className="relative w-16 h-16 bg-black/40 rounded-2xl flex items-center justify-center text-4xl border border-white/10">
                        {pack.icon}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <TierIcon className={`h-4 w-4 ${tier.color.split(' ')[0]}`} />
                        <span className={`text-xs font-medium ${tier.color.split(' ')[0]}`}>
                          {tier.label}
                        </span>
                      </div>
                      <h3 className={`text-xl font-bold bg-gradient-to-r ${pack.gradient} bg-clip-text text-transparent`}>
                        {pack.name}
                      </h3>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <p className="text-gray-400 text-sm mb-4">{pack.description}</p>

                  {/* Items Preview */}
                  <div className="space-y-2 mb-4">
                    {pack.items.slice(0, 4).map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                        <span className="text-gray-300">
                          {item.name}
                          {item.quantity > 1 && <span className="text-emerald-400 ml-1">x{item.quantity}</span>}
                          {item.quality && <span className="text-cyan-400 ml-1">({item.quality})</span>}
                        </span>
                      </div>
                    ))}
                    {pack.items.length > 4 && (
                      <button
                        onClick={() => setSelectedPack(selectedPack === pack.id ? null : pack.id)}
                        className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                      >
                        {selectedPack === pack.id ? 'แสดงน้อยลง' : `+${pack.items.length - 4} ไอเทมอื่นๆ`}
                      </button>
                    )}

                    {/* Expanded items */}
                    {selectedPack === pack.id && pack.items.slice(4).map((item, idx) => (
                      <div key={`extra-${idx}`} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                        <span className="text-gray-300">
                          {item.name}
                          {item.quantity > 1 && <span className="text-emerald-400 ml-1">x{item.quantity}</span>}
                          {item.quality && <span className="text-cyan-400 ml-1">({item.quality})</span>}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Price */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <div className="absolute inset-0 bg-yellow-500/30 rounded-full blur-md"></div>
                          <Coins className="h-5 w-5 text-yellow-500 relative" />
                        </div>
                        <span className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent">
                          {pack.price.toLocaleString()}
                        </span>
                        <span className="text-xs text-yellow-500/70">IC</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-gray-500 line-through">
                          {pack.originalPrice.toLocaleString()} IC
                        </span>
                        <span className="text-xs font-medium text-green-400 bg-green-500/20 px-2 py-0.5 rounded-full">
                          -{discount}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Buy Button */}
                  <LaserButton
                    variant={pack.popular ? 'primary' : 'secondary'}
                    className="w-full"
                    onClick={() => handleBuyPack(pack.id)}
                  >
                    ซื้อแพ็คเกจ
                  </LaserButton>
                </div>
              </div>
            </LaserCard>
          );
        })}
      </div>

      {/* FAQ Section */}
      <LaserCard>
        <div className="p-6">
          <h3 className="text-xl font-bold mb-4 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            คำถามที่พบบ่อย
          </h3>
          <div className="space-y-4 text-gray-400">
            <div>
              <p className="font-medium text-gray-200 mb-1">รับไอเทมอย่างไร?</p>
              <p className="text-sm">หลังซื้อสำเร็จ ไอเทมจะเข้าสู่ระบบอัตโนมัติ พิมพ์ /claim ในเกมเพื่อรับ</p>
            </div>
            <div>
              <p className="font-medium text-gray-200 mb-1">ซื้อได้กี่ครั้ง?</p>
              <p className="text-sm">สามารถซื้อได้ไม่จำกัด ทุกครั้งที่ซื้อจะได้รับไอเทมใหม่</p>
            </div>
            <div>
              <p className="font-medium text-gray-200 mb-1">สามารถคืนเงินได้ไหม?</p>
              <p className="text-sm">ไม่สามารถคืนเงินได้หลังจากซื้อแพ็คเกจแล้ว กรุณาตรวจสอบก่อนสั่งซื้อ</p>
            </div>
          </div>
        </div>
      </LaserCard>

      {/* Laser Modal */}
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
    </div >
  );
}
