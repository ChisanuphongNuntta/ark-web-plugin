'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { dinoMarketApi, authApi } from '@/lib/api';
import LaserCard from '@/components/LaserCard';
import LaserModal from '@/components/LaserModal';
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
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

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
  const total = baseValue + addedValue;
  const maxStat = 50; // Assume max stat points for display

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="text-sm text-gray-300">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-medium ${color}`}>{baseValue}</span>
          {addedValue > 0 && (
            <span className="text-green-400 text-sm">+{addedValue}</span>
          )}
        </div>
      </div>
      <div className="h-2 bg-black/30 rounded-full overflow-hidden">
        <div className="h-full flex">
          <div
            className={`${color.replace('text-', 'bg-').replace('-400', '-600')}`}
            style={{ width: `${(baseValue / maxStat) * 100}%` }}
          />
          {addedValue > 0 && (
            <div
              className="bg-green-500"
              style={{ width: `${(addedValue / maxStat) * 100}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Color swatch component
function ColorSwatch({ colorIndex, region }: { colorIndex: number; region: number }) {
  // ARK color indices map to specific colors (simplified)
  const getColorFromIndex = (idx: number) => {
    if (idx < 0) return '#666666';
    // This is a simplified color mapping
    const colors = [
      '#ff0000', '#ff4400', '#ff8800', '#ffcc00', '#ffff00',
      '#ccff00', '#88ff00', '#44ff00', '#00ff00', '#00ff44',
      '#00ff88', '#00ffcc', '#00ffff', '#00ccff', '#0088ff',
      '#0044ff', '#0000ff', '#4400ff', '#8800ff', '#cc00ff',
    ];
    return colors[idx % colors.length] || '#666666';
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className="w-6 h-6 rounded border border-white/20"
        style={{ backgroundColor: getColorFromIndex(colorIndex) }}
      />
      <span className="text-xs text-gray-400">R{region}</span>
    </div>
  );
}

export default function DinoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);

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

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: () => authApi.getMe().then((res) => res.data),
  });

  const { data: listingData, isLoading } = useQuery({
    queryKey: ['dinoListing', params.id],
    queryFn: () => dinoMarketApi.getListingById(params.id as string).then((res) => res.data),
    enabled: !!params.id,
  });

  const buyMutation = useMutation({
    mutationFn: () => dinoMarketApi.buyDino(params.id as string),
    onSuccess: (res) => {
      showModal({
        title: 'สำเร็จ',
        content: <p>{res.data.message}</p>,
        variant: 'success',
        singleButton: true,
        confirmText: 'ตกลง',
        onConfirm: () => router.push('/market/my-purchases'),
      });
      queryClient.invalidateQueries({ queryKey: ['dinoListing'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error: any) => {
      showModal({
        title: 'ผิดพลาด',
        content: <p>{error.response?.data?.error || 'Failed to purchase'}</p>,
        variant: 'danger',
        singleButton: true,
        confirmText: 'ตกลง',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  const listing = listingData?.listing;

  if (!listing) {
    return (
      <LaserCard>
        <div className="text-center py-16">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">ไม่พบรายการนี้</p>
          <Link
            href="/market"
            className="mt-4 inline-block px-6 py-2 bg-emerald-600/20 border border-emerald-500/30 rounded-xl text-emerald-300 hover:bg-emerald-600/30 transition-all"
          >
            กลับไปตลาด
          </Link>
        </div>
      </LaserCard>
    );
  }

  const totalMutations = listing.maternalMutations + listing.paternalMutations;
  const isOwner = userData?.user?.id === listing.sellerId;
  const canBuy = userData?.user && !isOwner && listing.status === 'listed';

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        href="/market"
        className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors"
      >
        <ArrowLeft className="h-5 w-5" />
        กลับไปตลาด
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <LaserCard withBeam>
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-white">
                    {listing.dinoName || listing.species}
                  </h1>
                  <p className="text-lg text-emerald-300">{listing.species}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-4 py-2 bg-emerald-600/30 rounded-xl text-lg font-bold">
                    Lv.{listing.level}
                  </span>
                  <span
                    className={`text-3xl ${listing.gender === 'Male' ? 'text-blue-400' : 'text-cyan-400'
                      }`}
                  >
                    {listing.gender === 'Male' ? '♂' : '♀'}
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatBar
                  label="Health"
                  icon={Heart}
                  baseValue={listing.baseHealth}
                  addedValue={listing.addedHealth}
                  color="text-red-400"
                />
                <StatBar
                  label="Stamina"
                  icon={Zap}
                  baseValue={listing.baseStamina}
                  addedValue={listing.addedStamina}
                  color="text-yellow-400"
                />
                <StatBar
                  label="Oxygen"
                  icon={Droplets}
                  baseValue={listing.baseOxygen}
                  addedValue={listing.addedOxygen}
                  color="text-blue-400"
                />
                <StatBar
                  label="Food"
                  icon={Utensils}
                  baseValue={listing.baseFood}
                  addedValue={listing.addedFood}
                  color="text-orange-400"
                />
                <StatBar
                  label="Weight"
                  icon={Weight}
                  baseValue={listing.baseWeight}
                  addedValue={listing.addedWeight}
                  color="text-gray-400"
                />
                <StatBar
                  label="Damage"
                  icon={Sword}
                  baseValue={listing.baseDamage}
                  addedValue={listing.addedDamage}
                  color="text-emerald-400"
                />
                <StatBar
                  label="Speed"
                  icon={Gauge}
                  baseValue={listing.baseSpeed}
                  addedValue={listing.addedSpeed}
                  color="text-green-400"
                />
              </div>
            </div>
          </LaserCard>

          {/* Mutations & Ancestry */}
          <LaserCard>
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Dna className="h-5 w-5 text-cyan-400" />
                Mutations & Ancestry
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-black/30 rounded-xl text-center">
                  <p className="text-sm text-gray-400">Maternal Mutations</p>
                  <p className="text-2xl font-bold text-cyan-400">
                    {listing.maternalMutations}
                  </p>
                </div>
                <div className="p-4 bg-black/30 rounded-xl text-center">
                  <p className="text-sm text-gray-400">Paternal Mutations</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {listing.paternalMutations}
                  </p>
                </div>
                <div className="p-4 bg-black/30 rounded-xl text-center">
                  <p className="text-sm text-gray-400">Total Mutations</p>
                  <p className="text-2xl font-bold text-emerald-400">{totalMutations}</p>
                </div>
                <div className="p-4 bg-black/30 rounded-xl text-center">
                  <p className="text-sm text-gray-400">Imprint</p>
                  <p className="text-2xl font-bold text-green-400">
                    {Math.round(listing.imprintQuality * 100)}%
                  </p>
                </div>
              </div>

              {(listing.motherName || listing.fatherName) && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  {listing.motherName && (
                    <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                      <p className="text-sm text-cyan-300">Mother</p>
                      <p className="font-medium text-white">{listing.motherName}</p>
                    </div>
                  )}
                  {listing.fatherName && (
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <p className="text-sm text-blue-300">Father</p>
                      <p className="font-medium text-white">{listing.fatherName}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </LaserCard>

          {/* Colors */}
          <LaserCard>
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">Colors</h2>
              <div className="flex flex-wrap gap-4">
                {[0, 1, 2, 3, 4, 5].map((region) => (
                  <ColorSwatch
                    key={region}
                    colorIndex={listing[`colorRegion${region}`]}
                    region={region}
                  />
                ))}
              </div>
            </div>
          </LaserCard>

          {/* Description */}
          {listing.description && (
            <LaserCard>
              <div className="p-6">
                <h2 className="text-xl font-bold text-white mb-4">Description</h2>
                <p className="text-gray-300 whitespace-pre-wrap">{listing.description}</p>
              </div>
            </LaserCard>
          )}
        </div>

        {/* Sidebar - Purchase */}
        <div className="space-y-6">
          {/* Price Card */}
          <LaserCard withBeam>
            <div className="p-6 text-center">
              <p className="text-gray-400 mb-2">Price</p>
              <p className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                {listing.price.toLocaleString()}
              </p>
              <p className="text-gray-400">Points</p>

              {listing.status !== 'listed' && (
                <div className="mt-4 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-xl">
                  <p className="text-red-400 font-medium">
                    {listing.status === 'sold' ? 'SOLD' : listing.status.toUpperCase()}
                  </p>
                </div>
              )}

              {canBuy && (
                <>
                  {!showConfirm ? (
                    <button
                      onClick={() => setShowConfirm(true)}
                      className="mt-6 w-full py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-xl font-bold text-white hover:from-emerald-500 hover:to-cyan-500 transition-all flex items-center justify-center gap-2"
                    >
                      <ShoppingCart className="h-5 w-5" />
                      ซื้อเลย
                    </button>
                  ) : (
                    <div className="mt-6 space-y-3">
                      <p className="text-yellow-400 text-sm">ยืนยันการซื้อ?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => buyMutation.mutate()}
                          disabled={buyMutation.isPending}
                          className="flex-1 py-2 bg-green-600 rounded-xl font-medium text-white hover:bg-green-500 transition-all disabled:opacity-50"
                        >
                          {buyMutation.isPending ? (
                            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                          ) : (
                            'ยืนยัน'
                          )}
                        </button>
                        <button
                          onClick={() => setShowConfirm(false)}
                          className="flex-1 py-2 bg-gray-600 rounded-xl font-medium text-white hover:bg-gray-500 transition-all"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {isOwner && listing.status === 'listed' && (
                <p className="mt-4 text-yellow-400 text-sm">นี่คือรายการของคุณ</p>
              )}

              {!userData?.user && (
                <Link
                  href="/login"
                  className="mt-6 block w-full py-3 bg-emerald-600/30 border border-emerald-500/30 rounded-xl font-medium text-emerald-300 hover:bg-emerald-600/40 transition-all text-center"
                >
                  เข้าสู่ระบบเพื่อซื้อ
                </Link>
              )}
            </div>
          </LaserCard>

          {/* Seller Card */}
          <LaserCard>
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-emerald-400" />
                Seller
              </h3>
              <div className="flex items-center gap-3">
                {listing.seller?.discordAvatar ? (
                  <img
                    src={`https://cdn.discordapp.com/avatars/${listing.seller.id}/${listing.seller.discordAvatar}.png`}
                    alt=""
                    className="w-12 h-12 rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-emerald-600/30" />
                )}
                <div>
                  <p className="font-medium text-white">
                    {listing.seller?.discordUsername || 'Unknown'}
                  </p>
                </div>
              </div>
            </div>
          </LaserCard>

          {/* Listed Date */}
          <LaserCard>
            <div className="p-6">
              <div className="flex items-center gap-2 text-gray-400">
                <Calendar className="h-4 w-4" />
                <span className="text-sm">
                  Listed on {new Date(listing.createdAt).toLocaleDateString('th-TH')}
                </span>
              </div>
            </div>
          </LaserCard>
        </div>
      </div>

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
