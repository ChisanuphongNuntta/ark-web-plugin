'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { dinoMarketApi } from '@/lib/api';
import { walletContractApi } from '@/lib/contracts/client';
import type { ServerSummary } from '@/lib/contracts/types';
import { useAuthStore } from '@/lib/store';
import {
  Amount,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorMessage,
  PageHeader,
  Skeleton,
  buttonVariants,
  useToast,
} from '@/components/ui';
import { ServerPicker, useServers } from '@/components/servers';
import {
  DinoImage,
  ListingStatusBadge,
  formatNumber,
  formatPercent,
  genderLabel,
  listingTitle,
  type MarketListing,
} from '../marketUi';

const STATS: Array<{ label: string; base: keyof MarketListing; added: keyof MarketListing }> = [
  { label: 'พลังชีวิต', base: 'baseHealth', added: 'addedHealth' },
  { label: 'ความอึด', base: 'baseStamina', added: 'addedStamina' },
  { label: 'ออกซิเจน', base: 'baseOxygen', added: 'addedOxygen' },
  { label: 'อาหาร', base: 'baseFood', added: 'addedFood' },
  { label: 'น้ำหนัก', base: 'baseWeight', added: 'addedWeight' },
  { label: 'พลังโจมตี', base: 'baseDamage', added: 'addedDamage' },
];

function dinoDisabledReason(s: ServerSummary): string | null {
  return s.supportsDinoDelivery === false ? 'เซิร์ฟเวอร์นี้ยังไม่รองรับการส่งสัตว์' : null;
}

function errorText(error: unknown): string {
  const e = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return e?.response?.data?.error || e?.response?.data?.message || e?.message || 'ลองอีกครั้งในอีกสักครู่';
}

export default function DinoDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuthStore();

  const [serverId, setServerId] = React.useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const listingQuery = useQuery({
    queryKey: ['dinoListing', id],
    queryFn: () => dinoMarketApi.getListingById(id as string).then((res) => res.data as { listing?: MarketListing }),
    enabled: Boolean(id),
  });

  const servers = useServers();
  const balance = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: () => walletContractApi.getBalance(),
    enabled: Boolean(user),
  });

  const buy = useMutation({
    mutationFn: () => {
      if (!serverId) throw new Error('เลือกเซิร์ฟเวอร์ที่จะรับสัตว์ก่อน');
      return dinoMarketApi.buyDino(id as string, serverId);
    },
    onSuccess: (res) => {
      setConfirmOpen(false);
      toast.success('ซื้อสำเร็จ', res.data?.message || 'ระบบกำลังส่งสัตว์เข้าเซิร์ฟเวอร์ที่คุณเลือก');
      void queryClient.invalidateQueries({ queryKey: ['dinoListing'] });
      void queryClient.invalidateQueries({ queryKey: ['dinoListings'] });
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      void queryClient.invalidateQueries({ queryKey: ['myDinoPurchases'] });
      router.push('/market/my-purchases');
    },
    onError: (error) => {
      setConfirmOpen(false);
      toast.error('ซื้อไม่สำเร็จ', errorText(error));
    },
  });

  if (listingQuery.isLoading) {
    return (
      <div className="page-shell pb-16" aria-busy>
        <Skeleton className="mb-3 h-4 w-32" />
        <Skeleton className="mb-10 h-8 w-64" />
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <Skeleton className="aspect-[16/9]" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (listingQuery.isError) {
    return (
      <div className="page-shell pb-16">
        <PageHeader eyebrow="ตลาดผู้เล่น" title="รายละเอียดสัตว์" />
        <ErrorMessage
          title="โหลดรายการนี้ไม่สำเร็จ"
          message="ลองอีกครั้งในอีกสักครู่"
          onRetry={() => void listingQuery.refetch()}
        />
      </div>
    );
  }

  const listing = listingQuery.data?.listing;

  if (!listing) {
    return (
      <div className="page-shell pb-16">
        <PageHeader eyebrow="ตลาดผู้เล่น" title="ไม่พบรายการนี้" />
        <EmptyState
          title="รายการนี้ไม่อยู่ในตลาดแล้ว"
          description="อาจถูกซื้อไปแล้วหรือผู้ขายยกเลิกการขาย"
          action={
            <Link href="/market" className={buttonVariants()}>
              กลับไปตลาด
            </Link>
          }
        />
      </div>
    );
  }

  const isListed = listing.status === 'listed';
  const selectedServer = servers.data?.find((s) => s.id === serverId) ?? null;
  const colorEntries = listing.colorRegions ? Object.entries(listing.colorRegions) : [];

  const copySummary = () => {
    const lines = [
      `${listingTitle(listing)} (${listing.species}) Lv.${listing.level}`,
      `เพศ: ${genderLabel(listing.gender)}`,
      `พลังชีวิต: ${formatNumber(listing.health ?? listing.baseHealth)}`,
      `ราคา: ${formatNumber(listing.price)} IC`,
      typeof window !== 'undefined' ? window.location.href : '',
    ].filter(Boolean);
    void navigator.clipboard
      ?.writeText(lines.join('\n'))
      .then(() => toast.success('คัดลอกสรุปแล้ว', 'วางในแชต Discord ได้เลย'))
      .catch(() => toast.error('คัดลอกไม่สำเร็จ'));
  };

  return (
    <div className="page-shell pb-16">
      <PageHeader
        eyebrow={listing.species}
        title={listingTitle(listing)}
        description={
          <>
            {genderLabel(listing.gender)} · เลเวล <span className="font-mono">{formatNumber(listing.level)}</span> · ผู้ขาย{' '}
            {listing.seller?.discordUsername || 'ไม่ระบุ'}
          </>
        }
        actions={<ListingStatusBadge status={listing.status} />}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <DinoImage listing={listing} className="aspect-[16/9] rounded-card border border-line" />

          <Card padding="none">
            <div className="border-b border-line px-6 py-4">
              <h2 className="text-base font-semibold text-fg">ค่าสถานะ</h2>
              <p className="mt-0.5 text-xs text-fg-subtle">ค่าพื้นฐาน และแต้มที่อัปเพิ่มหลังเชื่อง</p>
            </div>
            <table className="w-full text-sm">
              <thead className="sr-only">
                <tr>
                  <th scope="col">ค่าสถานะ</th>
                  <th scope="col">พื้นฐาน</th>
                  <th scope="col">อัปเพิ่ม</th>
                </tr>
              </thead>
              <tbody>
                {STATS.map((stat) => {
                  const added = Number(listing[stat.added] ?? 0);
                  return (
                    <tr key={stat.label} className="border-b border-line last:border-b-0">
                      <th scope="row" className="px-6 py-3 text-left font-normal text-fg-muted">
                        {stat.label}
                      </th>
                      <td className="px-6 py-3 text-right font-mono tabular-nums text-fg">
                        {formatNumber(listing[stat.base] as number | null | undefined)}
                      </td>
                      <td className="w-20 px-6 py-3 text-right font-mono tabular-nums text-success">
                        {added > 0 ? `+${added}` : <span className="text-fg-subtle">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card padding="lg">
            <h2 className="text-base font-semibold text-fg">สายเลือด</h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-fg-subtle">Imprint</dt>
                <dd className="mt-1 font-mono text-base tabular-nums text-fg">{formatPercent(listing.imprintQuality)}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">กลายพันธุ์ฝั่งแม่</dt>
                <dd className="mt-1 font-mono text-base tabular-nums text-fg">{listing.mutationsMatrilineal ?? 0} / 20</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">กลายพันธุ์ฝั่งพ่อ</dt>
                <dd className="mt-1 font-mono text-base tabular-nums text-fg">{listing.mutationsPatrilineal ?? 0} / 20</dd>
              </div>
            </dl>
            {colorEntries.length > 0 && (
              <div className="mt-6 border-t border-line pt-5">
                <h3 className="text-sm font-medium text-fg">รหัสสี</h3>
                <dl className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {colorEntries.map(([region, color]) => (
                    <div key={region} className="rounded-control border border-line bg-surface-2 px-3 py-2">
                      <dt className="text-xs text-fg-subtle">ส่วน {region}</dt>
                      <dd className="font-mono text-sm tabular-nums text-fg">{String(color)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card padding="lg" className="space-y-5">
            <div>
              <p className="text-xs text-fg-subtle">ราคา</p>
              <Amount value={listing.price} unit="IC" size="xl" className="mt-1" />
              {user && (
                <p className="mt-2 text-xs text-fg-muted">
                  ยอดที่ใช้ได้{' '}
                  {balance.isLoading ? (
                    '—'
                  ) : (
                    <Amount value={balance.data?.accounts?.available ?? null} unit="IC" size="sm" />
                  )}
                </p>
              )}
            </div>

            {!isListed ? (
              <p className="rounded-control border border-line bg-surface-2 px-3 py-2 text-sm text-fg-muted">
                รายการนี้ไม่ได้เปิดขายแล้ว
              </p>
            ) : !user ? (
              <div className="space-y-3 border-t border-line pt-5">
                <p className="text-sm text-fg-muted">เข้าสู่ระบบเพื่อซื้อและเลือกเซิร์ฟเวอร์ที่จะรับสัตว์</p>
                <Link href="/login" className={buttonVariants({ fullWidth: true })}>
                  เข้าสู่ระบบ
                </Link>
              </div>
            ) : (
              <div className="space-y-4 border-t border-line pt-5">
                <ServerPicker
                  label="ส่งไปที่เซิร์ฟเวอร์"
                  servers={servers.data ?? []}
                  value={serverId}
                  onChange={(next) => setServerId(next)}
                  loading={servers.isLoading}
                  error={servers.isError ? 'โหลดรายชื่อเซิร์ฟเวอร์ไม่สำเร็จ' : null}
                  onRetry={() => void servers.refetch()}
                  disabledReason={dinoDisabledReason}
                  maxHeight={280}
                />
                <Button size="lg" fullWidth disabled={!serverId} onClick={() => setConfirmOpen(true)}>
                  ตรวจสอบและซื้อ
                </Button>
                <p className="text-xs text-fg-subtle">
                  เงินถูกกันไว้ในระบบกลางจนกว่าสัตว์จะส่งถึงเซิร์ฟเวอร์ ถ้าส่งไม่สำเร็จจะคืนเข้ากระเป๋า
                </p>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={copySummary}
              leftIcon={<Copy className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
            >
              คัดลอกสรุปไปแชร์
            </Button>
          </Card>
        </aside>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="ยืนยันการซื้อ"
        description="ตรวจรายละเอียดก่อนยืนยัน ยอดจะถูกหักจากกระเป๋าทันที"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={buy.isPending}>
              ยกเลิก
            </Button>
            <Button loading={buy.isPending} onClick={() => buy.mutate()}>
              ยืนยันการซื้อ
            </Button>
          </>
        }
      >
        <dl className="divide-y divide-line rounded-card border border-line">
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-fg-muted">สัตว์</dt>
            <dd className="text-right text-sm text-fg">
              {listingTitle(listing)} <span className="font-mono text-fg-muted">Lv.{listing.level}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-fg-muted">ส่งไปที่</dt>
            <dd className="text-right text-sm text-fg">{selectedServer?.displayName ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-fg-muted">ราคา</dt>
            <dd>
              <Amount value={listing.price} unit="IC" />
            </dd>
          </div>
        </dl>
      </Dialog>
    </div>
  );
}
