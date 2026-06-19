'use client';

import { useQuery } from '@tanstack/react-query';
import { protectionApi } from '@/lib/api';
import { Shield, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import LaserCard from './LaserCard';

interface ProtectionData {
  hasProtection: boolean;
  player: {
    protectionStartAt: string;
    protectionEndAt: string;
    protectionDays: number;
    protectionType: string;
    isActive: boolean;
    remainingDays: number;
    remainingHours: number;
  } | null;
  tribe: {
    tribeId: string;
    tribeName: string;
    serverId: number;
    protectionEndAt: string;
    isActive: boolean;
  } | null;
}

function formatTimeRemaining(hours: number): string {
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (days > 0) {
    return `${days} วัน ${remainingHours} ชั่วโมง`;
  }
  return `${remainingHours} ชั่วโมง`;
}

function ProtectionBadge({ type }: { type: string }) {
  const badges: Record<string, { label: string; className: string }> = {
    new_player: {
      label: 'ผู้เล่นใหม่',
      className: 'bg-green-500/20 text-green-400 border-green-500/30',
    },
    admin_granted: {
      label: 'Admin',
      className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    },
  };

  const badge = badges[type] || { label: type, className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${badge.className}`}>
      {badge.label}
    </span>
  );
}

export default function ProtectionStatus() {
  const { data, isLoading, error } = useQuery<ProtectionData>({
    queryKey: ['protection-status'],
    queryFn: () => protectionApi.getMyProtection().then(res => res.data),
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <LaserCard glowOnHover>
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-cyan-500/30 rounded-full blur-md animate-pulse"></div>
              <Shield className="h-6 w-6 text-cyan-400 relative animate-pulse" />
            </div>
            <span className="text-gray-400">กำลังโหลด...</span>
          </div>
        </div>
      </LaserCard>
    );
  }

  if (error) {
    return null; // Don't show anything on error
  }

  if (!data?.hasProtection) {
    return (
      <LaserCard className="border-gray-500/20">
        <div className="p-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gray-500/20 rounded-full blur-md"></div>
              <Shield className="h-8 w-8 text-gray-500 relative" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-400">
                ไม่มี Protection
              </h3>
              <p className="text-sm text-gray-500">
                คุณไม่มีการป้องกันผู้เล่นใหม่
              </p>
            </div>
          </div>
        </div>
      </LaserCard>
    );
  }

  const { player, tribe } = data;

  return (
    <LaserCard className="border-cyan-500/30 shadow-cyan-500/10" withBeam glowOnHover>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-cyan-500/40 rounded-full blur-xl animate-pulse"></div>
              <Shield className="h-8 w-8 text-cyan-400 relative" />
            </div>
            <div>
              <h3 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                New Player Protection
              </h3>
              <p className="text-sm text-gray-400">
                คุณได้รับการป้องกันจากการโจมตี
              </p>
            </div>
          </div>
          {player && <ProtectionBadge type={player.protectionType} />}
        </div>

        {/* Player Protection */}
        {player && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-cyan-400" />
                <div>
                  <p className="font-medium text-cyan-300">Player Protection</p>
                  <p className="text-sm text-gray-400">
                    เริ่ม: {new Date(player.protectionStartAt).toLocaleDateString('th-TH')}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-cyan-300">
                  <Clock className="h-4 w-4" />
                  <span className="font-bold text-lg">
                    {formatTimeRemaining(player.remainingHours)}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  หมด: {new Date(player.protectionEndAt).toLocaleDateString('th-TH')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tribe Protection */}
        {tribe && tribe.isActive && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
                <div>
                  <p className="font-medium text-emerald-300">Tribe Protection</p>
                  <p className="text-sm text-gray-400">
                    {tribe.tribeName || `Tribe ${tribe.tribeId}`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-emerald-300">
                  Server ID: {tribe.serverId}
                </p>
                <p className="text-xs text-gray-500">
                  หมด: {new Date(tribe.protectionEndAt).toLocaleDateString('th-TH')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Warning */}
        {player && player.remainingDays <= 1 && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
            <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
            <p className="text-sm text-yellow-300">
              Protection ของคุณกำลังจะหมดเร็วๆ นี้!
            </p>
          </div>
        )}

        {/* Info */}
        <div className="text-xs text-gray-500 pt-2 border-t border-gray-700/50">
          <p>Protection ป้องกัน:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>ความเสียหายจากผู้เล่นอื่น</li>
            <li>ความเสียหายต่อสิ่งก่อสร้าง</li>
            <li>ความเสียหายต่อไดโนเสาร์ที่เลี้ยง</li>
          </ul>
        </div>
      </div>
    </LaserCard>
  );
}
