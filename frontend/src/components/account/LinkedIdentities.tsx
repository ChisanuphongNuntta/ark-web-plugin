'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { identityApi } from '@/lib/contracts/client';
import type { IdentityProvider, LinkedIdentity } from '@/lib/contracts/types';
import { Badge, Button, Card, Dialog, EmptyState, ErrorMessage, Skeleton, useToast } from '@/components/ui';

const PROVIDER_META: Record<IdentityProvider, { label: string; hint: string }> = {
  discord: { label: 'Discord', hint: 'บัญชีหลักที่ใช้สมัครและกู้คืน IRIS ID' },
  steam: { label: 'Steam', hint: 'ยืนยันผ่าน Steam เพื่อให้ระบบส่งของเข้าตัวละครของคุณ' },
  epic: { label: 'Epic Games', hint: 'สำหรับผู้เล่นที่เข้าเกมผ่าน Epic' },
};

const IDENTITIES_KEY = ['account', 'identities'];
const STEAM_AUTH_URL = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/steam`;

export function LinkedIdentities() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = React.useState<IdentityProvider | null>(null);

  const identities = useQuery({
    queryKey: IDENTITIES_KEY,
    queryFn: () => identityApi.getIdentities(),
  });

  const unlink = useMutation({
    mutationFn: (provider: IdentityProvider) => identityApi.unlink(provider),
    onSuccess: (next, provider) => {
      queryClient.setQueryData(IDENTITIES_KEY, next);
      toast.success(`ยกเลิกการเชื่อม ${PROVIDER_META[provider].label} แล้ว`);
      setConfirming(null);
    },
    onError: (_e, provider) => {
      toast.error(
        `ยกเลิกการเชื่อม ${PROVIDER_META[provider].label} ไม่สำเร็จ`,
        'บัญชีต้องมีการเชื่อมอย่างน้อยตามจำนวนขั้นต่ำ'
      );
    },
  });

  const header = (
    <div>
      <h2 className="text-lg font-semibold tracking-[-0.015em] text-fg">บัญชีที่เชื่อมไว้</h2>
      <p className="mt-1 text-sm text-fg-muted">การเชื่อมทุกครั้งต้องยืนยันกับผู้ให้บริการนั้นโดยตรง</p>
    </div>
  );

  if (identities.isLoading) {
    return (
      <section className="space-y-4" aria-busy>
        {header}
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} padding="md">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-6 h-8 w-full" />
            </Card>
          ))}
        </div>
      </section>
    );
  }

  if (identities.isError || !identities.data) {
    return (
      <section className="space-y-4">
        {header}
        <ErrorMessage
          title="โหลดบัญชีที่เชื่อมไว้ไม่สำเร็จ"
          message="ลองอีกครั้งในอีกสักครู่"
          onRetry={() => void identities.refetch()}
        />
      </section>
    );
  }

  const data = identities.data;
  const linkedCount = data.identities.filter((i) => i.providerAccountId !== null).length;

  return (
    <section className="space-y-4">
      {header}

      {data.identities.length === 0 ? (
        <EmptyState title="ยังไม่มีบัญชีที่เชื่อมไว้" description="เชื่อมผู้ให้บริการอย่างน้อยหนึ่งรายเพื่อใช้ IRIS ID" />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {data.identities.map((identity) => (
            <IdentityCard
              key={identity.provider}
              identity={identity}
              onStartSteamAuth={() => window.location.assign(STEAM_AUTH_URL)}
              onUnlink={() => setConfirming(identity.provider)}
            />
          ))}
        </div>
      )}

      <ul className="space-y-1 text-xs text-fg-subtle">
        <li>ระบบไม่รวมบัญชีให้อัตโนมัติจากอีเมลหรือชื่อที่แสดง</li>
        <li>
          ต้องเชื่อมไว้อย่างน้อย <span className="font-mono text-fg-muted">{data.rules.minimumLinkedProviders}</span> บัญชี
          (ตอนนี้ <span className="font-mono text-fg-muted">{linkedCount}</span>)
        </li>
      </ul>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming ? `ยกเลิกการเชื่อม ${PROVIDER_META[confirming].label}?` : ''}
        description={
          confirming === 'steam'
            ? 'ระบบจะส่งของเข้าตัวละครไม่ได้จนกว่าคุณจะเชื่อม Steam ใหม่'
            : 'คุณเชื่อมบัญชีนี้ใหม่ได้ภายหลัง'
        }
        confirmText="ยกเลิกการเชื่อม"
        variant="danger"
        loading={unlink.isPending}
        onConfirm={() => confirming && unlink.mutate(confirming)}
      />
    </section>
  );
}

function IdentityCard({
  identity,
  onStartSteamAuth,
  onUnlink,
}: {
  identity: LinkedIdentity;
  onStartSteamAuth: () => void;
  onUnlink: () => void;
}) {
  const meta = PROVIDER_META[identity.provider];
  const isLinked = identity.providerAccountId !== null;

  return (
    <Card padding="md" className="flex flex-col justify-between gap-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-fg">{meta.label}</h3>
          <div className="flex gap-1.5">
            {identity.isPrimary && <Badge tone="accent">บัญชีหลัก</Badge>}
            <Badge tone={isLinked ? 'success' : 'neutral'}>{isLinked ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม'}</Badge>
          </div>
        </div>
        <p className="text-sm text-fg-muted">{meta.hint}</p>
      </div>

      <div className="space-y-3 border-t border-line pt-4">
        {isLinked ? (
          <>
            <div className="min-w-0 space-y-0.5">
              {identity.displayName && <p className="truncate text-sm text-fg">{identity.displayName}</p>}
              <p className="truncate font-mono text-xs text-fg-subtle" title={identity.providerAccountId ?? ''}>
                {identity.providerAccountId}
              </p>
              {identity.proofMethod && <p className="text-xs text-fg-subtle">ยืนยันด้วย {identity.proofMethod}</p>}
            </div>
            {identity.canUnlink ? (
              <Button variant="ghost" size="sm" className="text-danger" onClick={onUnlink}>
                ยกเลิกการเชื่อม
              </Button>
            ) : (
              <p className="text-xs text-fg-subtle">ยกเลิกไม่ได้ เพราะต้องคงบัญชีขั้นต่ำไว้</p>
            )}
          </>
        ) : identity.provider === 'steam' ? (
          <Button
            size="sm"
            fullWidth
            onClick={onStartSteamAuth}
            rightIcon={<ExternalLink className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
          >
            เชื่อมด้วย Steam
          </Button>
        ) : identity.provider === 'epic' ? (
          <Button variant="secondary" size="sm" fullWidth disabled>
            ยังไม่เปิดให้เชื่อม Epic
          </Button>
        ) : (
          <p className="text-xs text-fg-subtle">เชื่อมได้ตอนสมัครเท่านั้น</p>
        )}
      </div>
    </Card>
  );
}
