'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, UserCheck, ShieldAlert, Info, ExternalLink } from 'lucide-react';
import { identityApi } from '@/lib/contracts/client';
import type { IdentityProvider, LinkedIdentity } from '@/lib/contracts/types';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

const PROVIDER_META: Record<
  IdentityProvider,
  { label: string; accent: string; border: string; hint: string }
> = {
  discord: {
    label: 'Discord',
    accent: 'text-indigo-400',
    border: 'border-l-indigo-500',
    hint: 'บัญชีหลักที่ใช้สมัครและกู้คืน IRIS ID',
  },
  steam: {
    label: 'Steam',
    accent: 'text-iris-cyan',
    border: 'border-l-iris-cyan',
    hint: 'ใช้พิสูจน์สิทธิ์ครอบครอง (Steam OpenID) เพื่อรับสินค้าเข้าตัวละคร',
  },
  epic: {
    label: 'Epic Games',
    accent: 'text-iris-orchid',
    border: 'border-l-iris-orchid',
    hint: 'ใช้พิสูจน์สิทธิ์ครอบครอง (Epic OAuth) สำหรับผู้เล่นผ่าน Epic',
  },
};

const IDENTITIES_KEY = ['account', 'identities'];
const STEAM_AUTH_URL = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/steam`;

export function LinkedIdentities() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: IDENTITIES_KEY,
    queryFn: () => identityApi.getIdentities(),
  });

  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = React.useState<IdentityProvider | null>(null);

  const unlinkMutation = useMutation({
    mutationFn: (provider: 'steam' | 'epic' | 'discord') => identityApi.unlink(provider),
    onMutate: (provider) => {
      setActionError(null);
      setActionSuccess(null);
      setPendingProvider(provider);
    },
    onSuccess: (next, provider) => {
      queryClient.setQueryData(IDENTITIES_KEY, next);
      setActionSuccess(`ยกเลิกการเชื่อมต่อ ${PROVIDER_META[provider].label} แล้ว`);
    },
    onError: (_e, provider) => {
      setActionError(`ยกเลิกการเชื่อมต่อ ${PROVIDER_META[provider].label} ไม่สำเร็จ (อาจติดกฎจำนวนบัญชีขั้นต่ำ)`);
    },
    onSettled: () => setPendingProvider(null),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[0, 1, 2].map((i) => (
          <GlassCard key={i} className="p-6 h-64">
            <Skeleton variant="circle" className="h-12 w-12" />
            <Skeleton className="h-4 w-24 mt-4" />
            <Skeleton className="h-3 w-full mt-3" />
            <Skeleton className="h-9 w-full mt-8" />
          </GlassCard>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorMessage
        title="ไม่สามารถโหลดบัญชีที่เชื่อมต่อได้"
        message="ระบบดึงข้อมูล IRIS ID ที่เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
        onRetry={refetch}
      />
    );
  }

  if (data.identities.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มีบัญชีที่เชื่อมต่อ"
        description="เชื่อมต่อผู้ให้บริการอย่างน้อยหนึ่งรายเพื่อใช้งาน IRIS ID"
      />
    );
  }

  const linkedCount = data.identities.filter((i) => i.providerAccountId !== null).length;

  return (
    <div className="space-y-6">
      <div>
        <span className="eyebrow">IRIS ID — Linked Identities</span>
        <h3 className="text-sm font-bold text-iris-pearl mt-0.5 uppercase tracking-wide">บัญชีที่เชื่อมต่อ</h3>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-[11px]">{actionError}</div>
      )}
      {actionSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl text-[11px]">{actionSuccess}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {data.identities.map((identity) => (
          <IdentityCard
            key={identity.provider}
            identity={identity}
            isLinked={identity.providerAccountId !== null}
            isPending={pendingProvider === identity.provider}
            onStartSteamAuth={() => window.location.assign(STEAM_AUTH_URL)}
            onUnlink={() => unlinkMutation.mutate(identity.provider)}
          />
        ))}
      </div>

      {/* Proof-of-control / policy banner straight from the contract rules */}
      <GlassCard variant="flat" className="p-5 border border-white/5 bg-black/20 text-xs leading-relaxed text-iris-muted flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-iris-cyan shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h5 className="font-bold text-iris-pearl">นโยบายความปลอดภัยบัญชี IRIS ID</h5>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>การเชื่อมต่อทุกครั้งต้องผ่านการพิสูจน์สิทธิ์ครอบครอง (proof-of-control) ของผู้ให้บริการนั้น ๆ</li>
            <li>ระบบจะไม่รวมบัญชีอัตโนมัติจากอีเมลหรือชื่อที่แสดง</li>
            <li>ต้องมีบัญชีที่เชื่อมต่ออย่างน้อย {data.rules.minimumLinkedProviders} บัญชี (ปัจจุบัน {linkedCount})</li>
          </ul>
        </div>
      </GlassCard>
    </div>
  );
}

function IdentityCard({
  identity,
  isLinked,
  isPending,
  onStartSteamAuth,
  onUnlink,
}: {
  identity: LinkedIdentity;
  isLinked: boolean;
  isPending: boolean;
  onStartSteamAuth: () => void;
  onUnlink: () => void;
}) {
  const meta = PROVIDER_META[identity.provider];

  return (
    <GlassCard className={`p-6 flex flex-col justify-between min-h-64 border-l-2 ${meta.border}`}>
      <div className="space-y-4">
        <div className="flex justify-between items-start">
          <div className={`h-12 w-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center ${meta.accent}`}>
            {isLinked ? <UserCheck className="h-6 w-6" /> : <Link2 className="h-6 w-6" />}
          </div>
          <div className="flex flex-col items-end gap-1">
            {isLinked ? (
              <Badge variant="cyan">Connected</Badge>
            ) : (
              <Badge variant="default">Disconnected</Badge>
            )}
            {identity.isPrimary && <Badge variant="gold">Primary</Badge>}
          </div>
        </div>
        <div className="space-y-1">
          <h4 className="font-display font-bold text-iris-pearl">{meta.label}</h4>
          <p className="text-xs text-iris-muted leading-relaxed">{meta.hint}</p>
        </div>
      </div>

      <div className="pt-4 mt-4 border-t border-white/5 space-y-3">
        {isLinked ? (
          <>
            <div className="space-y-0.5">
              {identity.displayName && (
                <p className="text-xs font-bold text-iris-pearl truncate">{identity.displayName}</p>
              )}
              <p className="font-mono text-[10px] text-iris-muted truncate" title={identity.providerAccountId ?? ''}>
                {identity.providerAccountId}
              </p>
              {identity.proofMethod && (
                <p className="text-[9px] text-iris-muted">
                  <Info className="h-2.5 w-2.5 inline mr-0.5" />
                  proof: {identity.proofMethod}
                </p>
              )}
            </div>
            {identity.canUnlink ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-rose-400"
                isLoading={isPending}
                onClick={onUnlink}
              >
                ยกเลิกการเชื่อมต่อ
              </Button>
            ) : (
              <p className="text-[10px] text-iris-muted text-center">
                ยกเลิกไม่ได้ (ต้องคงบัญชีขั้นต่ำไว้)
              </p>
            )}
          </>
        ) : identity.provider === 'steam' ? (
          <Button
            type="button"
            variant="cyan"
            size="sm"
            className="w-full"
            onClick={onStartSteamAuth}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            เชื่อมต่อด้วย Steam
          </Button>
        ) : identity.provider === 'epic' ? (
          <Button type="button" variant="ghost" size="sm" className="w-full" disabled>
            Epic OAuth — เร็ว ๆ นี้
          </Button>
        ) : (
          <p className="text-[10px] text-iris-muted text-center">เชื่อมต่อผ่านการสมัครเท่านั้น</p>
        )}
      </div>
    </GlassCard>
  );
}
