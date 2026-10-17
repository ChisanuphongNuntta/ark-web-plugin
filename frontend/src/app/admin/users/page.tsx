'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Search } from 'lucide-react';
import {
  Amount,
  Badge,
  Button,
  Dialog,
  Drawer,
  EmptyState,
  ErrorMessage,
  IconButton,
  Input,
  PageHeader,
  Pagination,
  SegmentedControl,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableLoadingRows,
  TableRow,
  formatAmount,
  useToast,
  type BadgeTone,
} from '@/components/ui';
import { adminApi, api } from '@/lib/api';
import { useAuthStore, type UserRole } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

interface AdminUser {
  id: string;
  discordId: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  steamId: string | null;
  epicId: string | null;
  pointsBalance: number;
  totalSpent: number;
  isAdmin: boolean;
  isBanned: boolean;
  role: UserRole;
  apiKeyServerId?: number | null;
  apiKeyServerName?: string | null;
  createdAt: string;
}

interface UsersResponse {
  users: AdminUser[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

type CoinAction = 'add' | 'remove' | 'set';

const PAGE_SIZE = 20;
const ROLES: UserRole[] = ['user', 'admin', 'server_admin', 'root'];

const ROLE_LABEL: Record<UserRole, string> = {
  user: 'ผู้ใช้',
  admin: 'Admin',
  server_admin: 'Server Admin',
  root: 'Root',
};

const ROLE_TONE: Record<UserRole, BadgeTone> = {
  user: 'neutral',
  admin: 'accent',
  server_admin: 'info',
  root: 'warning',
};

const ROLE_HINT: Record<UserRole, string> = {
  user: 'ใช้งานร้านค้าและบัญชีของตัวเอง',
  admin: 'จัดการร้านค้า สินค้า คำสั่งซื้อ และเนื้อหา',
  server_admin: 'จัดการผู้เล่นและ API key ของเซิร์ฟเวอร์',
  root: 'สิทธิ์ทั้งหมด รวมถึงเซิร์ฟเวอร์และบทบาทผู้ใช้',
};

function apiErrorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (data && typeof data.message === 'string' && data.message) return data.message;
  return fallback;
}

function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime
    ? d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `admin:adjust:${crypto.randomUUID()}`;
  return `admin:adjust:${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Avatar({ user, size = 'md' }: { user: Pick<AdminUser, 'discordAvatar' | 'discordUsername'>; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-12 w-12 text-base' : 'h-8 w-8 text-xs';
  if (user.discordAvatar) {
    return (
      // Discord CDN avatars are external and already sized; next/image adds nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={user.discordAvatar} alt="" className={`${box} shrink-0 rounded-full border border-line object-cover`} />
    );
  }
  return (
    <span aria-hidden="true" className={`${box} grid shrink-0 place-items-center rounded-full border border-line bg-surface-2 font-medium text-fg-muted`}>
      {(user.discordUsername ?? '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function AdminUsersPage() {
  const { user: me, isLoading: authLoading } = useAuthStore();
  const { canManageServerUsers, canManageRoles } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [page, setPage] = React.useState(1);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [coinTarget, setCoinTarget] = React.useState<AdminUser | null>(null);
  const [banTarget, setBanTarget] = React.useState<AdminUser | null>(null);
  const [roleChange, setRoleChange] = React.useState<{ user: AdminUser; role: UserRole } | null>(null);

  const usersQuery = useQuery({
    queryKey: ['admin-users', page, debouncedSearch],
    queryFn: () => adminApi.getUsers(page, debouncedSearch || undefined).then((res) => res.data as UsersResponse),
    enabled: canManageServerUsers,
    placeholderData: (prev) => prev,
  });

  const users = usersQuery.data?.users ?? [];
  const total = usersQuery.data?.pagination?.total ?? users.length;
  const detail = users.find((u) => u.id === detailId) ?? null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const banMutation = useMutation({
    mutationFn: (target: AdminUser) => adminApi.updateUser(target.id, { isBanned: !target.isBanned }),
    onSuccess: (_d, target) => {
      toast.success(target.isBanned ? 'ปลดแบนแล้ว' : 'แบนผู้ใช้แล้ว', target.discordUsername ?? undefined);
      setBanTarget(null);
      void invalidate();
    },
    onError: (err) => toast.error('ทำรายการไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const roleMutation = useMutation({
    mutationFn: ({ user, role }: { user: AdminUser; role: UserRole }) => adminApi.updateUserRole(user.id, role),
    onSuccess: (_d, vars) => {
      toast.success('เปลี่ยนสิทธิ์แล้ว', `${vars.user.discordUsername ?? vars.user.discordId} เป็น ${ROLE_LABEL[vars.role]}`);
      setRoleChange(null);
      void invalidate();
    },
    onError: (err) => toast.error('เปลี่ยนสิทธิ์ไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  if (authLoading) {
    return (
      <div className="pb-16" aria-busy="true">
        <PageHeader eyebrow="ผู้ใช้และสิทธิ์" title="ผู้ใช้" />
      </div>
    );
  }

  if (!canManageServerUsers) {
    return (
      <div className="pb-16">
        <PageHeader eyebrow="ผู้ใช้และสิทธิ์" title="ผู้ใช้" />
        <EmptyState
          title="หน้านี้สำหรับ Server Admin และ Root"
          description="การปรับยอด IC และการแบนผู้ใช้จำกัดไว้เฉพาะผู้ดูแลที่ได้รับสิทธิ์ ติดต่อ Root หากต้องการเข้าถึง"
        />
      </div>
    );
  }

  const isSelf = (u: AdminUser) => u.id === me?.id;

  return (
    <div className="min-w-0 pb-16">
      <PageHeader
        eyebrow="ผู้ใช้และสิทธิ์"
        title="ผู้ใช้"
        description="ค้นหาบัญชี ปรับยอด Iris Coin แบนผู้ใช้ และกำหนดบทบาท"
      />

      <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <Input
          label="ค้นหาผู้ใช้"
          hideLabel
          placeholder="ชื่อ Discord, Discord ID หรือ Steam ID"
          leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} />}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          wrapperClassName="w-full sm:w-96"
        />
        <p className="text-xs text-fg-muted">
          ทั้งหมด <span className="font-mono text-fg">{formatAmount(total)}</span> บัญชี
        </p>
      </div>

      {usersQuery.isError ? (
        <ErrorMessage
          title="โหลดรายชื่อผู้ใช้ไม่สำเร็จ"
          message={apiErrorText(usersQuery.error, 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')}
          onRetry={() => void usersQuery.refetch()}
        />
      ) : (
        <TableContainer aria-busy={usersQuery.isFetching || undefined}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>ผู้ใช้</TableHeaderCell>
                <TableHeaderCell>Steam ID</TableHeaderCell>
                <TableHeaderCell align="right">ยอดคงเหลือ</TableHeaderCell>
                <TableHeaderCell align="right">ใช้ไปแล้ว</TableHeaderCell>
                <TableHeaderCell>บทบาท</TableHeaderCell>
                <TableHeaderCell>สถานะ</TableHeaderCell>
                <TableHeaderCell>สมัครเมื่อ</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">การทำงาน</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {usersQuery.isLoading ? (
                <TableLoadingRows columns={8} rows={8} />
              ) : users.length === 0 ? (
                <TableEmptyRow
                  colSpan={8}
                  title={debouncedSearch ? 'ไม่พบผู้ใช้ที่ตรงกับคำค้น' : 'ยังไม่มีผู้ใช้'}
                  description={debouncedSearch ? 'ลองค้นด้วย Discord ID หรือ Steam ID แบบเต็ม' : 'บัญชีจะแสดงที่นี่หลังผู้เล่นเข้าสู่ระบบครั้งแรก'}
                />
              ) : (
                users.map((u) => (
                  <TableRow key={u.id} interactive onClick={() => setDetailId(u.id)}>
                    <TableCell className="min-w-[220px]">
                      <div className="flex items-center gap-3">
                        <Avatar user={u} />
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="block max-w-full truncate text-left font-medium text-fg hover:text-accent"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailId(u.id);
                            }}
                          >
                            {u.discordUsername || 'ไม่มีชื่อ'}
                          </button>
                          <p className="font-mono text-xs text-fg-subtle">{u.discordId}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell mono muted>
                      {u.steamId ?? '—'}
                    </TableCell>
                    <TableCell align="right">
                      <Amount value={u.pointsBalance} size="sm" />
                    </TableCell>
                    <TableCell align="right">
                      <Amount value={u.totalSpent} size="sm" tone="muted" />
                    </TableCell>
                    <TableCell>
                      <Badge tone={ROLE_TONE[u.role] ?? 'neutral'} outline={u.role === 'user'}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.isBanned ? <Badge tone="danger">ถูกแบน</Badge> : <span className="text-fg-muted">ปกติ</span>}
                    </TableCell>
                    <TableCell muted className="whitespace-nowrap">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <IconButton aria-label={`ปรับยอด IC ของ ${u.discordUsername ?? u.discordId}`} size="sm" onClick={() => setCoinTarget(u)}>
                        <Coins className="h-4 w-4" strokeWidth={1.5} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Pagination className="mt-4" page={page} pageSize={usersQuery.data?.pagination?.limit ?? PAGE_SIZE} total={total} onPageChange={setPage} />

      {/* Detail drawer */}
      <Drawer
        open={!!detail}
        onOpenChange={(open) => !open && setDetailId(null)}
        size="md"
        title={detail?.discordUsername || 'ผู้ใช้'}
        description={detail ? `สมัครเมื่อ ${formatDate(detail.createdAt, true)}` : undefined}
        footer={
          detail ? (
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                variant={detail.isBanned ? 'secondary' : 'danger'}
                size="sm"
                disabled={isSelf(detail)}
                onClick={() => setBanTarget(detail)}
              >
                {detail.isBanned ? 'ปลดแบน' : 'แบนผู้ใช้'}
              </Button>
              <Button size="sm" leftIcon={<Coins className="h-4 w-4" strokeWidth={1.5} />} onClick={() => setCoinTarget(detail)}>
                ปรับยอด IC
              </Button>
            </div>
          ) : null
        }
      >
        {detail ? (
          <UserDetail
            user={detail}
            isSelf={isSelf(detail)}
            canManageRoles={canManageRoles}
            onRequestRole={(role) => setRoleChange({ user: detail, role })}
          />
        ) : null}
      </Drawer>

      {/* Coin adjustment */}
      <CoinDialog
        target={coinTarget}
        onClose={() => setCoinTarget(null)}
        onDone={() => {
          setCoinTarget(null);
          void invalidate();
        }}
      />

      {/* Ban / unban */}
      <Dialog
        open={!!banTarget}
        onOpenChange={(open) => !open && setBanTarget(null)}
        title={banTarget?.isBanned ? 'ปลดแบนผู้ใช้' : 'แบนผู้ใช้'}
        description={
          banTarget
            ? banTarget.isBanned
              ? `${banTarget.discordUsername ?? banTarget.discordId} จะกลับมาเข้าสู่ระบบและซื้อของได้ตามปกติ`
              : `${banTarget.discordUsername ?? banTarget.discordId} จะเข้าสู่ระบบ ซื้อของ และใช้ API ไม่ได้จนกว่าจะปลดแบน`
            : undefined
        }
        variant={banTarget?.isBanned ? 'default' : 'danger'}
        confirmText={banTarget?.isBanned ? 'ปลดแบน' : 'แบน'}
        loading={banMutation.isPending}
        onConfirm={() => banTarget && banMutation.mutate(banTarget)}
      />

      {/* Role change */}
      <Dialog
        open={!!roleChange}
        onOpenChange={(open) => !open && setRoleChange(null)}
        title="เปลี่ยนบทบาทผู้ใช้"
        description={
          roleChange
            ? `${roleChange.user.discordUsername ?? roleChange.user.discordId}: ${ROLE_LABEL[roleChange.user.role]} → ${ROLE_LABEL[roleChange.role]}`
            : undefined
        }
        variant={roleChange && (roleChange.role === 'root' || roleChange.role === 'server_admin') ? 'warning' : 'default'}
        confirmText="เปลี่ยนบทบาท"
        loading={roleMutation.isPending}
        onConfirm={() => roleChange && roleMutation.mutate(roleChange)}
      >
        {roleChange ? (
          <div className="space-y-2 text-sm text-fg-muted">
            <p>{ROLE_HINT[roleChange.role]}</p>
            {roleChange.role === 'root' || roleChange.role === 'server_admin' ? (
              <p className="text-warning">บทบาทนี้เข้าถึงข้อมูลผู้เล่นและการตั้งค่าเซิร์ฟเวอร์ได้ ให้เฉพาะคนที่ไว้ใจเท่านั้น</p>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  );
}

function UserDetail({
  user,
  isSelf,
  canManageRoles,
  onRequestRole,
}: {
  user: AdminUser;
  isSelf: boolean;
  canManageRoles: boolean;
  onRequestRole: (role: UserRole) => void;
}) {
  const [role, setRole] = React.useState<UserRole>(user.role);

  return (
    <div className="divide-y divide-line">
      <div className="flex items-center gap-4 px-5 py-4">
        <Avatar user={user} size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ROLE_TONE[user.role] ?? 'neutral'} outline={user.role === 'user'}>
              {ROLE_LABEL[user.role] ?? user.role}
            </Badge>
            {user.isBanned ? <Badge tone="danger">ถูกแบน</Badge> : null}
            {isSelf ? <Badge outline>บัญชีของคุณ</Badge> : null}
          </div>
          <div className="mt-2">
            <Amount value={user.pointsBalance} size="lg" />
          </div>
        </div>
      </div>

      <dl className="divide-y divide-line px-5 py-2">
        <DetailRow label="Discord ID">
          <span className="font-mono">{user.discordId}</span>
        </DetailRow>
        <DetailRow label="Steam ID">{user.steamId ? <span className="font-mono">{user.steamId}</span> : '—'}</DetailRow>
        <DetailRow label="Epic ID">{user.epicId ? <span className="font-mono">{user.epicId}</span> : '—'}</DetailRow>
        <DetailRow label="ใช้ไปแล้ว">
          <Amount value={user.totalSpent} size="sm" />
        </DetailRow>
        <DetailRow label="เซิร์ฟเวอร์ของ API key">{user.apiKeyServerName ?? '—'}</DetailRow>
        <DetailRow label="รหัสบัญชี">
          <span className="font-mono text-xs">{user.id}</span>
        </DetailRow>
      </dl>

      {canManageRoles ? (
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-fg">บทบาท</h3>
          <p className="mt-0.5 text-xs text-fg-subtle">{isSelf ? 'เปลี่ยนบทบาทของตัวเองไม่ได้' : ROLE_HINT[role]}</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Select
              label="บทบาท"
              hideLabel
              value={role}
              disabled={isSelf}
              onChange={(e) => setRole(e.target.value as UserRole)}
              options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
              wrapperClassName="w-48"
            />
            <Button variant="secondary" disabled={isSelf || role === user.role} onClick={() => onRequestRole(role)}>
              เปลี่ยนบทบาท
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const QUICK_AMOUNTS = [100, 500, 1000, 5000, 10000];

const ACTION_LABEL: Record<CoinAction, string> = {
  add: 'เพิ่ม IC',
  remove: 'หัก IC',
  set: 'กำหนดยอด',
};

function CoinDialog({ target, onClose, onDone }: { target: AdminUser | null; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      title="ปรับยอด Iris Coin"
      description={target ? `${target.discordUsername ?? target.discordId} · ยอดปัจจุบัน ${formatAmount(target.pointsBalance)} IC` : undefined}
      size="md"
      dismissible={false}
    >
      {target ? <CoinForm key={target.id} target={target} onCancel={onClose} onDone={onDone} /> : null}
    </Dialog>
  );
}

function CoinForm({ target, onCancel, onDone }: { target: AdminUser; onCancel: () => void; onDone: () => void }) {
  const toast = useToast();
  const [action, setAction] = React.useState<CoinAction>('add');
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  // One key per dialog session: a double submit or network retry cannot credit twice.
  const [idempotencyKey] = React.useState(newIdempotencyKey);

  const value = /^\d+$/.test(amount.trim()) ? Number(amount.trim()) : NaN;
  const valid = Number.isSafeInteger(value) && (action === 'set' ? value >= 0 : value > 0);
  // The ledger applies the change; this delta only translates "set to X" into the signed amount the API takes.
  const delta = !valid ? 0 : action === 'add' ? value : action === 'remove' ? -value : value - target.pointsBalance;

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/admin/users/${target.id}/points`, {
        amount: delta,
        reason: reason.trim() || `${ACTION_LABEL[action]} ${formatAmount(Math.abs(delta))} IC`,
        idempotencyKey,
      }),
    onSuccess: (res) => {
      const newBalance = (res.data as { newBalance?: number } | undefined)?.newBalance;
      toast.success(
        'ปรับยอดแล้ว',
        newBalance !== undefined
          ? `${target.discordUsername ?? target.discordId} มียอดใหม่ ${formatAmount(newBalance)} IC`
          : `${delta > 0 ? '+' : ''}${formatAmount(delta)} IC ให้ ${target.discordUsername ?? target.discordId}`
      );
      onDone();
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || delta === 0 || mutation.isPending) return;
    mutation.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <SegmentedControl<CoinAction>
        aria-label="ประเภทการปรับยอด"
        fullWidth
        value={action}
        onChange={(next) => {
          setAction(next);
          setAmount(next === 'set' ? String(target.pointsBalance) : '');
        }}
        options={[
          { value: 'add', label: 'เพิ่ม' },
          { value: 'remove', label: 'หัก' },
          { value: 'set', label: 'กำหนดยอด' },
        ]}
      />

      <Input
        label={action === 'set' ? 'ยอดใหม่' : action === 'add' ? 'จำนวนที่เพิ่ม' : 'จำนวนที่หัก'}
        mono
        inputMode="numeric"
        autoComplete="off"
        rightIcon={<span className="text-xs">IC</span>}
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
        error={amount && !valid ? 'ใส่จำนวนเต็มบวก' : undefined}
      />

      {action !== 'set' ? (
        <div className="flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((n) => (
            <Button
              key={n}
              type="button"
              variant="secondary"
              size="sm"
              className="font-mono"
              onClick={() => setAmount(String((Number.isFinite(value) ? value : 0) + n))}
            >
              +{formatAmount(n)}
            </Button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setAmount('')}>
            ล้าง
          </Button>
        </div>
      ) : null}

      <Input
        label="เหตุผล"
        placeholder="เช่น ชดเชยของไม่เข้าเกม, แก้ยอดผิด"
        helperText="บันทึกลงประวัติธุรกรรมของผู้ใช้"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={200}
      />

      <dl className="space-y-2 rounded-card border border-line bg-canvas px-4 py-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">ยอดปัจจุบัน</dt>
          <dd>
            <Amount value={target.pointsBalance} size="sm" />
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">การเปลี่ยนแปลง</dt>
          <dd className={delta > 0 ? 'font-mono text-success' : delta < 0 ? 'font-mono text-danger' : 'font-mono text-fg-subtle'}>
            {delta > 0 ? '+' : ''}
            {formatAmount(delta)} IC
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-line pt-2">
          <dt className="text-fg-muted">ยอดโดยประมาณหลังปรับ</dt>
          <dd>
            <Amount value={target.pointsBalance + delta} size="sm" />
          </dd>
        </div>
      </dl>
      <p className="text-xs text-fg-subtle">ระบบบัญชีเป็นผู้คำนวณยอดจริง ตัวเลขนี้ประมาณจากยอดล่าสุดในตาราง</p>

      {mutation.isError ? (
        <ErrorMessage variant="inline" message={apiErrorText(mutation.error, 'ปรับยอดไม่สำเร็จ ยอดยังไม่เปลี่ยน ลองอีกครั้ง')} />
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={mutation.isPending}>
          ยกเลิก
        </Button>
        <Button type="submit" variant={delta < 0 ? 'danger' : 'primary'} loading={mutation.isPending} disabled={!valid || delta === 0}>
          {ACTION_LABEL[action]}
        </Button>
      </div>
    </form>
  );
}
