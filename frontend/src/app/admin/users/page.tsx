'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { Ban, Coins, Loader2, Minus, Plus, Replace, ShieldCheck } from 'lucide-react';
import {
  AdminButton,
  AdminDialog,
  AdminField,
  AdminIconButton,
  AdminNotice,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
  AdminSuspense,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminToolbar,
  AdminTr,
  ConfirmDialog,
  Pagination,
  SegmentedTabs,
  StatusBadge,
  adminInputClass,
  formatCount,
  type StatusTone,
} from '@/components/admin';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useAuthStore, type UserRole } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import { adminApi, type AdminUserRow } from '@/lib/api';
import { cn } from '@/lib/utils';

type CoinAction = 'set' | 'add' | 'remove';

const ROLES: readonly UserRole[] = ['user', 'admin', 'server_admin', 'root'];

const ROLE_META: Record<string, { label: string; tone: StatusTone }> = {
  root: { label: 'Root', tone: 'danger' },
  server_admin: { label: 'Server Admin', tone: 'warning' },
  admin: { label: 'Admin', tone: 'info' },
  user: { label: 'ผู้ใช้', tone: 'neutral' },
};

const roleMeta = (role: string) => ROLE_META[role] ?? ROLE_META.user;

const COIN_ACTIONS: { value: CoinAction; label: string }[] = [
  { value: 'add', label: 'เพิ่ม IC' },
  { value: 'remove', label: 'หัก IC' },
  { value: 'set', label: 'กำหนดยอด' },
];

const QUICK_AMOUNTS = [100, 500, 1000, 5000, 10000];

/** Parses the amount field: non-negative integer, never NaN. */
function parseAmount(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function apiErrorText(error: unknown): string {
  const e = error as { response?: { data?: { error?: unknown; message?: unknown } }; message?: unknown } | null;
  const fromApi = e?.response?.data?.error ?? e?.response?.data?.message;
  if (typeof fromApi === 'string' && fromApi) return fromApi;
  return 'ทำรายการไม่สำเร็จ โปรดลองอีกครั้ง';
}

function UserAvatar({ src, size = 'md' }: { src: string | null; size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  if (!src) return <div className={cn(cls, 'shrink-0 rounded-full border border-white/10 bg-white/[0.04]')} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={cn(cls, 'shrink-0 rounded-full border border-white/10 object-cover')} />;
}

function UsersAdmin() {
  const { user, isLoading: authLoading } = useAuthStore();
  const { canManageServerUsers, canManageRoles } = usePermissions();

  const list = usePaginatedQuery({
    key: 'admin-users',
    fetcher: adminApi.getUsersPage,
    enabled: canManageServerUsers,
  });

  // Ban / unban confirmation
  const [banTarget, setBanTarget] = useState<AdminUserRow | null>(null);
  const banMutation = useMutation({
    mutationFn: (target: AdminUserRow) => adminApi.updateUser(target.id, { isBanned: !target.isBanned }),
    onSuccess: () => list.invalidate(),
  });

  // Role change confirmation (root only)
  const [roleChange, setRoleChange] = useState<{ target: AdminUserRow; role: UserRole } | null>(null);
  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => adminApi.updateUserRole(id, role),
    onSuccess: () => list.invalidate(),
  });

  // Coin adjustment dialog
  const [coinTarget, setCoinTarget] = useState<AdminUserRow | null>(null);
  const [coinAction, setCoinAction] = useState<CoinAction>('add');
  const [coinAmount, setCoinAmount] = useState(0);
  const [coinReason, setCoinReason] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const adjustMutation = useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string; name: string }) =>
      adminApi.adjustPoints(id, amount, reason),
    onSuccess: (_res, vars) => {
      list.invalidate();
      setNotice({
        tone: 'success',
        text: `ปรับยอด ${vars.amount > 0 ? '+' : ''}${vars.amount.toLocaleString()} IC ให้ ${vars.name} แล้ว`,
      });
      closeCoinDialog();
    },
  });

  const openCoinDialog = (target: AdminUserRow, action: CoinAction) => {
    adjustMutation.reset();
    setCoinTarget(target);
    setCoinAction(action);
    setCoinAmount(action === 'set' ? target.pointsBalance : 0);
    setCoinReason('');
  };

  function closeCoinDialog() {
    setCoinTarget(null);
    setCoinAmount(0);
    setCoinReason('');
  }

  const changeCoinAction = (action: CoinAction) => {
    setCoinAction(action);
    setCoinAmount(action === 'set' && coinTarget ? coinTarget.pointsBalance : 0);
  };

  const balance = coinTarget?.pointsBalance ?? 0;
  // A removal can never take the balance below zero, so the delta sent matches the preview.
  const adjustment =
    coinAction === 'set' ? coinAmount - balance : coinAction === 'add' ? coinAmount : -Math.min(coinAmount, balance);
  const finalBalance = balance + adjustment;
  const removeCapped = coinAction === 'remove' && coinAmount > balance;

  const submitCoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!coinTarget || adjustment === 0 || adjustMutation.isPending) return;
    const verb = coinAction === 'set' ? 'กำหนด' : coinAction === 'add' ? 'เพิ่ม' : 'หัก';
    adjustMutation.mutate({
      id: coinTarget.id,
      name: coinTarget.discordUsername || coinTarget.discordId,
      amount: adjustment,
      reason: coinReason.trim() || `${verb} ${Math.abs(adjustment).toLocaleString()} IC`,
    });
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-iris-muted">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="กำลังโหลด" />
      </div>
    );
  }

  if (!canManageServerUsers) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="USERS" title="จัดการผู้ใช้" />
        <AdminNotice tone="danger" title="คุณไม่มีสิทธิ์เข้าถึงหน้านี้">
          เฉพาะ Server Admin และ Root เท่านั้น
        </AdminNotice>
      </AdminPage>
    );
  }

  const COLS = 7;
  const total = list.pagination.total;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="USERS"
        title="จัดการผู้ใช้"
        description="ค้นหาผู้เล่น ปรับยอด Iris Coin แบน/ปลดแบน และกำหนดสิทธิ์"
        actions={
          <Link href="/admin" className="btn-secondary">
            กลับแดชบอร์ด
          </Link>
        }
      />

      {notice && (
        <AdminNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </AdminNotice>
      )}

      <AdminPanel flush>
        <AdminToolbar
          list={list}
          searchPlaceholder="ค้นหาชื่อ Discord, Discord ID หรือ Steam ID…"
          end={
            <span className="text-xs text-iris-muted">
              ทั้งหมด <span className="font-semibold text-iris-pearl">{formatCount(total)}</span> คน
            </span>
          }
        />

        <AdminTable caption="รายชื่อผู้ใช้" busy={list.isFetching} minWidth={960}>
          <AdminTableHead>
            <tr>
              <AdminTh>ผู้ใช้</AdminTh>
              <AdminTh>Steam ID</AdminTh>
              <AdminTh align="right">Iris Coin</AdminTh>
              <AdminTh>สิทธิ์</AdminTh>
              <AdminTh>สถานะ</AdminTh>
              <AdminTh>วันที่สมัคร</AdminTh>
              <AdminTh align="right">จัดการ</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody
            colSpan={COLS}
            isInitialLoading={list.isInitialLoading}
            isPlaceholderData={list.isPlaceholderData}
            isError={list.isError}
            onRetry={list.refetch}
            isEmpty={list.items.length === 0}
            emptyTitle={list.isFiltered ? 'ไม่พบผู้ใช้ที่ตรงกับคำค้นหา' : 'ยังไม่มีผู้ใช้'}
            emptyAction={
              list.isFiltered ? (
                <AdminButton size="sm" onClick={list.resetAll}>
                  ล้างคำค้นหา
                </AdminButton>
              ) : undefined
            }
            skeletonRows={Math.min(list.pageSize, 10)}
          >
            {list.items.map((u) => {
              const name = u.discordUsername || 'ไม่ทราบชื่อ';
              const isSelf = u.id === user?.id;
              const meta = roleMeta(u.role);
              return (
                <AdminTr key={u.id}>
                  <AdminTd>
                    <div className="flex items-center gap-3">
                      <UserAvatar src={u.discordAvatar} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {name}
                          {isSelf && <span className="ml-2 text-xs font-normal text-iris-muted">(คุณ)</span>}
                        </div>
                        <div className="font-mono text-xs text-iris-muted">{u.discordId}</div>
                      </div>
                    </div>
                  </AdminTd>
                  <AdminTd mono muted nowrap>
                    {u.steamId || '—'}
                  </AdminTd>
                  <AdminTd align="right" nowrap>
                    <div className="font-semibold text-iris-gold">{u.pointsBalance.toLocaleString()} IC</div>
                    <div className="text-xs text-iris-muted">ใช้ไป {u.totalSpent.toLocaleString()} IC</div>
                  </AdminTd>
                  <AdminTd nowrap>
                    {canManageRoles ? (
                      <select
                        aria-label={`สิทธิ์ของ ${name}`}
                        value={u.role}
                        disabled={isSelf || roleMutation.isPending}
                        title={isSelf ? 'ไม่สามารถเปลี่ยนสิทธิ์ของตัวเองได้' : undefined}
                        onChange={(e) => {
                          const role = e.target.value as UserRole;
                          if (role !== u.role) setRoleChange({ target: u, role });
                        }}
                        className={cn(adminInputClass, 'h-9 w-auto min-w-[9.5rem] py-1.5 pr-8 text-xs')}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleMeta(r).label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                    )}
                  </AdminTd>
                  <AdminTd>
                    <StatusBadge tone={u.isBanned ? 'danger' : 'success'} dot>
                      {u.isBanned ? 'ถูกแบน' : 'ปกติ'}
                    </StatusBadge>
                  </AdminTd>
                  <AdminTd muted nowrap>
                    {new Date(u.createdAt).toLocaleDateString('th-TH')}
                  </AdminTd>
                  <AdminTd align="right" nowrap>
                    <AdminIconButton aria-label={`เพิ่ม IC ให้ ${name}`} onClick={() => openCoinDialog(u, 'add')}>
                      <Plus />
                    </AdminIconButton>
                    <AdminIconButton aria-label={`หัก IC จาก ${name}`} onClick={() => openCoinDialog(u, 'remove')}>
                      <Minus />
                    </AdminIconButton>
                    <AdminIconButton aria-label={`กำหนดยอด IC ของ ${name}`} onClick={() => openCoinDialog(u, 'set')}>
                      <Replace />
                    </AdminIconButton>
                    <AdminIconButton
                      tone="danger"
                      aria-label={isSelf ? 'ไม่สามารถแบนตัวเองได้' : u.isBanned ? `ปลดแบน ${name}` : `แบน ${name}`}
                      disabled={isSelf}
                      onClick={() => setBanTarget(u)}
                    >
                      {u.isBanned ? <ShieldCheck /> : <Ban />}
                    </AdminIconButton>
                  </AdminTd>
                </AdminTr>
              );
            })}
          </AdminTableBody>
        </AdminTable>

        <Pagination {...list.paginationProps} />
      </AdminPanel>

      {/* Ban / unban */}
      <ConfirmDialog
        open={banTarget !== null}
        onClose={() => setBanTarget(null)}
        onConfirm={() => banMutation.mutateAsync(banTarget!)}
        tone={banTarget?.isBanned ? 'default' : 'danger'}
        title={banTarget?.isBanned ? 'ปลดแบนผู้ใช้นี้?' : 'แบนผู้ใช้นี้?'}
        description={
          banTarget
            ? `${banTarget.discordUsername || banTarget.discordId} ${banTarget.isBanned ? 'จะกลับมาใช้งานได้ตามปกติ' : 'จะไม่สามารถเข้าใช้งานร้านค้าได้จนกว่าจะปลดแบน'}`
            : undefined
        }
        confirmText={banTarget?.isBanned ? 'ปลดแบน' : 'แบนผู้ใช้'}
      />

      {/* Role change (root only) */}
      <ConfirmDialog
        open={roleChange !== null}
        onClose={() => setRoleChange(null)}
        onConfirm={() => roleMutation.mutateAsync({ id: roleChange!.target.id, role: roleChange!.role })}
        tone={roleChange && (roleChange.role === 'root' || roleChange.role === 'server_admin') ? 'danger' : 'default'}
        title="เปลี่ยนสิทธิ์ผู้ใช้?"
        description={
          roleChange
            ? `${roleChange.target.discordUsername || roleChange.target.discordId}: ${roleMeta(roleChange.target.role).label} เป็น ${roleMeta(roleChange.role).label}`
            : undefined
        }
        confirmText="เปลี่ยนสิทธิ์"
      >
        {roleChange && (roleChange.role === 'root' || roleChange.role === 'server_admin') && (
          <p>สิทธิ์นี้เข้าถึงข้อมูลสำคัญและจัดการเซิร์ฟเวอร์ได้</p>
        )}
      </ConfirmDialog>

      {/* Coin adjustment */}
      <AdminDialog
        open={coinTarget !== null}
        onClose={closeCoinDialog}
        busy={adjustMutation.isPending}
        title="ปรับยอด Iris Coin"
        description={coinTarget ? coinTarget.discordUsername || coinTarget.discordId : undefined}
        footer={
          <>
            <AdminButton variant="ghost" onClick={closeCoinDialog} disabled={adjustMutation.isPending}>
              ยกเลิก
            </AdminButton>
            <AdminButton
              type="submit"
              form="coin-adjust-form"
              variant="primary"
              icon={<Coins />}
              loading={adjustMutation.isPending}
              disabled={adjustment === 0}
            >
              {COIN_ACTIONS.find((a) => a.value === coinAction)?.label}
            </AdminButton>
          </>
        }
      >
        {coinTarget && (
          <form id="coin-adjust-form" onSubmit={submitCoin} className="space-y-5">
            <div className="flex items-center gap-3">
              <UserAvatar src={coinTarget.discordAvatar} size="lg" />
              <div>
                <p className="text-xs text-iris-muted">ยอดปัจจุบัน</p>
                <p className="text-lg font-semibold text-iris-gold">{balance.toLocaleString()} IC</p>
              </div>
            </div>

            <SegmentedTabs
              aria-label="ประเภทการปรับยอด"
              value={coinAction}
              onChange={changeCoinAction}
              options={COIN_ACTIONS}
            />

            <AdminField
              label={coinAction === 'set' ? 'กำหนดยอดเป็น (IC)' : coinAction === 'add' ? 'จำนวนที่เพิ่ม (IC)' : 'จำนวนที่หัก (IC)'}
              hint={removeCapped ? `หักได้สูงสุด ${balance.toLocaleString()} IC (ยอดจะไม่ติดลบ)` : undefined}
            >
              {(field) => (
                <input
                  {...field}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={coinAmount === 0 ? '' : coinAmount}
                  placeholder="0"
                  onChange={(e) => setCoinAmount(parseAmount(e.target.value))}
                  className={cn(adminInputClass, 'text-lg font-semibold')}
                />
              )}
            </AdminField>

            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((amount) => (
                <AdminButton
                  key={amount}
                  size="sm"
                  onClick={() => setCoinAmount((prev) => (coinAction === 'set' ? amount : prev + amount))}
                >
                  {coinAction === 'set' ? '' : '+'}
                  {amount.toLocaleString()}
                </AdminButton>
              ))}
              <AdminButton size="sm" variant="ghost" onClick={() => setCoinAmount(0)}>
                ล้าง
              </AdminButton>
            </div>

            <AdminField label="เหตุผล (ไม่บังคับ)">
              {(field) => (
                <input
                  {...field}
                  type="text"
                  maxLength={200}
                  value={coinReason}
                  onChange={(e) => setCoinReason(e.target.value)}
                  placeholder="เช่น โบนัสกิจกรรม, คืน IC, แก้ไขยอด"
                  className={adminInputClass}
                />
              )}
            </AdminField>

            <dl className="space-y-2 rounded-2xl border border-white/[0.08] bg-iris-midnight/40 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-iris-muted">ยอดปัจจุบัน</dt>
                <dd className="text-iris-pearl">{balance.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-iris-muted">การเปลี่ยนแปลง</dt>
                <dd className={cn('font-semibold', adjustment > 0 ? 'text-iris-cyan' : adjustment < 0 ? 'text-rose-200' : 'text-iris-muted')}>
                  {adjustment > 0 ? '+' : ''}
                  {adjustment.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between border-t border-white/[0.06] pt-2">
                <dt className="text-iris-muted">ยอดหลังปรับ</dt>
                <dd className="text-base font-semibold text-iris-gold">{finalBalance.toLocaleString()} IC</dd>
              </div>
            </dl>

            {adjustMutation.isError && (
              <AdminNotice tone="danger">{apiErrorText(adjustMutation.error)}</AdminNotice>
            )}
          </form>
        )}
      </AdminDialog>
    </AdminPage>
  );
}

export default function AdminUsersPage() {
  return (
    <AdminSuspense>
      <UsersAdmin />
    </AdminSuspense>
  );
}
