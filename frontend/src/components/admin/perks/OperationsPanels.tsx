'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminButton, AdminPanel, AdminNotice, Pagination, adminInputClass } from '@/components/admin';
import { UserPicker, type PickedUser } from '@/components/admin/console/UserPicker';
import { apiErrorText } from '@/lib/adminConsoleApi';
import { formatBangkokDateTime } from '@/lib/adminTransactionsMath';
import { newIdempotencyKey, perksAdminApi } from '@/lib/perksApi';
import { remainingLabel } from '@/lib/perks';
import { USER_KEY, USAGE_KEY, REVENUE_KEY, SummaryTile, useAdminPlans } from './shared';

export function UsersPanel() {
  const [user, setUser] = useState<PickedUser | null>(null);
  return <AdminPanel title="สิทธิ์รายคน"><UserPicker value={user} onChange={setUser} />{user && <UserRights key={user.id} userId={user.id} />}</AdminPanel>;
}
function UserRights({ userId }: { userId: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: [USER_KEY, userId], queryFn: ({ signal }) => perksAdminApi.getUser(userId, signal) });
  const plans = useAdminPlans();
  const [planKey, setPlanKey] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const mutation = useMutation({
    mutationFn: async (action: { type: 'tokens' | 'grant' | 'revoke'; id?: string }) => {
      if (action.type === 'grant') return perksAdminApi.grantSubscription(userId, { planKey, reason });
      if (action.type === 'revoke') return perksAdminApi.revokeSubscription(action.id!, reason);
      const fingerprint = `${userId}|${delta}|${reason}`;
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newIdempotencyKey('tokens') };
      return perksAdminApi.adjustTokens(userId, Number(delta), reason, attempt.current.key);
    },
    onSuccess: () => { attempt.current = null; setNotice('บันทึกแล้ว'); setDelta(''); void client.invalidateQueries({ queryKey: [USER_KEY, userId] }); },
  });
  const validReason = reason.trim().length >= 3 && reason.length <= 500;
  return <div className="mt-5 space-y-4">
    {query.isPending && <p role="status">กำลังโหลด…</p>}
    {(query.isError || mutation.isError) && <AdminNotice tone="danger">{apiErrorText(query.error ?? mutation.error, 'ดำเนินการไม่สำเร็จ')}</AdminNotice>}
    {notice && <AdminNotice tone="success">{notice}</AdminNotice>}
    {query.data && <>
      <SummaryTile label="Perk Token" value={query.data.tokenBalance} />
      <Field label="เหตุผล (บันทึกในประวัติ)"><input aria-label="เหตุผล" className={adminInputClass} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-2">
        <input aria-label="จำนวน Token ที่เพิ่มหรือลด" className={adminInputClass} type="number" min={-100000} max={100000} value={delta} onChange={e => setDelta(e.target.value)} placeholder="จำนวน Token เช่น 10 หรือ -5" />
        <AdminButton disabled={!validReason || !Number.isInteger(Number(delta)) || !Number(delta) || Math.abs(Number(delta)) > 100000 || mutation.isPending} onClick={() => mutation.mutate({ type: 'tokens' })}>ปรับ Token</AdminButton>
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="แพ็กสิทธิ์" className={adminInputClass} value={planKey} onChange={e => setPlanKey(e.target.value)}><option value="">เลือกแพ็ก</option>{plans.data?.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select>
        <AdminButton disabled={!validReason || !planKey || mutation.isPending} onClick={() => mutation.mutate({ type: 'grant' })}>มอบตามระยะเวลาแพ็ก</AdminButton>
      </div>
      {query.data.subscriptions.map(s => <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 py-3"><span>{s.planName} · {s.state} · {formatBangkokDateTime(s.expiresAt)}</span><AdminButton disabled={!validReason || mutation.isPending || !['active', 'scheduled'].includes(s.state)} onClick={() => mutation.mutate({ type: 'revoke', id: s.id })}>ยกเลิกสิทธิ์</AdminButton></div>)}
      <div className="grid gap-2 sm:grid-cols-2">{query.data.features.map(f => <div key={f.key} className="rounded-xl border border-white/10 p-3"><p>{f.name}</p><p className="text-sm text-iris-muted">{remainingLabel(f)}</p></div>)}</div>
      <h3 className="font-semibold">ประวัติ Token ล่าสุด</h3>{query.data.tokenLedger.map(e => <p key={e.id} className="text-sm text-iris-muted">{formatBangkokDateTime(e.createdAt)} · {e.delta > 0 ? '+' : ''}{e.delta} · คงเหลือ {e.balanceAfter} · {e.reason ?? e.kind}</p>)}
    </>}
  </div>;
}
export function UsagePanel() {
  const [page, setPage] = useState(1);
  const [featureKey, setFeature] = useState('');
  const [allowed, setAllowed] = useState('');
  const query = useQuery({ queryKey: [USAGE_KEY, page, featureKey, allowed], queryFn: ({ signal }) => perksAdminApi.getUsagePage({ page, pageSize: 25, filters: { featureKey, allowed } }, signal) });
  return <AdminPanel title="ประวัติการใช้สิทธิ์"><div className="mb-4 flex gap-2"><input aria-label="รหัสความสามารถ" className={adminInputClass} placeholder="เช่น cmd.pod" value={featureKey} onChange={e => { setFeature(e.target.value); setPage(1); }} /><select aria-label="ผลการใช้" className={adminInputClass} value={allowed} onChange={e => { setAllowed(e.target.value); setPage(1); }}><option value="">ทุกผลลัพธ์</option><option value="true">อนุญาต</option><option value="false">ปฏิเสธ</option></select></div>
    {query.isError && <AdminNotice tone="danger">{apiErrorText(query.error, 'โหลดข้อมูลไม่สำเร็จ')}</AdminNotice>}
    {query.isPending && <p role="status">กำลังโหลด…</p>}
    {query.data?.items.length === 0 && <p>ยังไม่มีการใช้สิทธิ์</p>}
    {query.data?.items.map(u => <div key={u.id} className="border-b border-white/10 py-3 text-sm"><p>{u.featureName ?? u.featureKey} · {u.userName ?? u.steamId ?? u.userId} · {u.allowed ? 'อนุญาต' : 'ปฏิเสธ'}</p><p className="text-iris-muted">{formatBangkokDateTime(u.createdAt)} · {u.source} · {u.tokensSpent ?? 0} Token · {u.reason}</p></div>)}
    <Pagination page={page} pageSize={25} total={query.data?.pagination.total ?? 0} onPageChange={setPage} onPageSizeChange={() => {}} hidePageSize isUnknown={!query.data} isBusy={query.isFetching} />
  </AdminPanel>;
}
export function RevenuePanel() {
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const query = useQuery({ queryKey: [REVENUE_KEY, from, to], queryFn: ({ signal }) => perksAdminApi.getRevenue({ from: from || undefined, to: to || undefined }, signal) });
  return <AdminPanel title="ยอดขายสิทธิ์" description="วันที่ตามเวลาไทย ค่าเริ่มต้นย้อนหลัง 30 วัน"><div className="mb-4 flex gap-3"><Field label="เริ่ม"><input type="date" className={adminInputClass} value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="ถึง"><input type="date" className={adminInputClass} value={to} onChange={e => setTo(e.target.value)} /></Field></div>
    {query.isError && <AdminNotice tone="danger">{apiErrorText(query.error, 'โหลดข้อมูลไม่สำเร็จ')}</AdminNotice>}
    {query.isPending && <p role="status">กำลังโหลด…</p>}
    {query.data && <><div className="grid gap-3 sm:grid-cols-3"><SummaryTile label="ยอดเงินจริง (THB)" value={query.data.thbTotal} /><SummaryTile label="ยอด IRIS Coin" value={query.data.icTotal} /><SummaryTile label="Token ใช้แล้ว" value={query.data.tokensConsumed} /></div>{[...query.data.thbRows.map(r => ({ ...r, currency: 'THB' })), ...query.data.icRows.map(r => ({ ...r, currency: 'IC' }))].map(r => <p key={`${r.currency}:${r.key}`} className="mt-3 text-sm">{r.name} · {r.count} รายการ · {r.amount} {r.currency}</p>)}</>}
  </AdminPanel>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-sm text-iris-muted"><span>{label}</span>{children}</label>; }
