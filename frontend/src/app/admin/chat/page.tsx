'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminPage, AdminPageHeader, AdminPanel, AdminNotice, AdminButton, Pagination, adminInputClass } from '@/components/admin';
import { AdminAccessGate } from '@/components/admin/console/ConsoleBits';
import { chatAdminApi, CHAT_SOURCE_TH, SNOWFLAKE_RE } from '@/lib/chatAdminApi';
import { apiErrorText } from '@/lib/adminConsoleApi';
import { formatBangkokDateTime } from '@/lib/adminTransactionsMath';
import { useAdminLiveRefresh } from '@/hooks/useAdminLiveRefresh';

const KEYS = ['admin-chat-status', 'admin-chat-channels', 'admin-chat-messages', 'admin-chat-mutes'];
function ChatAdmin() {
  const client = useQueryClient();
  const status = useQuery({ queryKey: [KEYS[0]], queryFn: ({ signal }) => chatAdminApi.getStatus(signal), refetchInterval: 30_000 });
  const channels = useQuery({ queryKey: [KEYS[1]], queryFn: ({ signal }) => chatAdminApi.getChannels(signal) });
  const mutes = useQuery({ queryKey: [KEYS[3]], queryFn: ({ signal }) => chatAdminApi.getMutes(signal) });
  const [page, setPage] = useState(1); const [source, setSource] = useState(''); const [search, setSearch] = useState('');
  const messages = useQuery({ queryKey: [KEYS[2], page, source, search], queryFn: ({ signal }) => chatAdminApi.getMessagesPage({ page, pageSize: 25, search, filters: { source } }, signal) });
  const [editing, setEditing] = useState<number | null>(null); const [channelId, setChannel] = useState(''); const [serverId, setServer] = useState('');
  const [subjectType, setSubjectType] = useState('web_user'); const [subjectId, setSubject] = useState('');
  const [minutes, setMinutes] = useState('60'); const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);
  const mutation = useMutation({ mutationFn: async (operation: () => Promise<unknown>) => operation(), onSuccess: () => { setNotice('ดำเนินการแล้ว'); setDeleting(null); KEYS.forEach(key => void client.invalidateQueries({ queryKey: [key] })); } });
  useAdminLiveRefresh(['admin:chat', 'chat:message', 'chat:deleted'], KEYS);
  const error = mutation.error ?? status.error ?? channels.error ?? mutes.error ?? messages.error;
  return <AdminPage>
    <AdminPageHeader eyebrow="CROSS CHAT" title="Discord / เว็บ / เกม" description="ผูกช่อง Discord ตรวจสถานะบอท และดูแลข้อความจากทุกช่องทาง" actions={<AdminButton onClick={() => KEYS.forEach(key => void client.invalidateQueries({ queryKey: [key] }))}>รีเฟรช</AdminButton>} />
    {error && <AdminNotice tone="danger">{apiErrorText(error, 'ดำเนินการไม่สำเร็จ')}</AdminNotice>}
    {notice && <AdminNotice tone="success" onDismiss={() => setNotice('')}>{notice}</AdminNotice>}
    <AdminPanel title="สถานะบอท Discord">
      {status.isPending ? <p role="status">กำลังตรวจสอบ…</p> : status.data && <div className="space-y-2 text-sm"><p>{status.data.connected ? 'เชื่อมต่อแล้ว' : status.data.configured ? 'กำลังเชื่อมต่อ / เชื่อมต่อไม่ได้' : 'ยังไม่ได้ตั้งค่า DISCORD_BOT_TOKEN'} · {status.data.botTag ?? '—'}</p><p className="text-iris-muted">เซิร์ฟเวอร์ Discord: {status.data.guilds.map(g => g.name).join(', ') || '—'}</p>{status.data.missingIntents.length > 0 && <AdminNotice tone="warning">ต้องเปิด Intent: {status.data.missingIntents.join(', ')}</AdminNotice>}{status.data.lastError && <AdminNotice tone="warning">{status.data.lastError}</AdminNotice>}<p className="text-iris-muted">เปิด Message Content Intent และให้บอทดูช่อง ส่งข้อความ และอ่านประวัติได้ ใส่ token ใน .env ของเซิร์ฟเวอร์</p></div>}
    </AdminPanel>
    <AdminPanel title="ช่อง Discord" description="ช่องรวมรับข้อความทุกเซิร์ฟเวอร์ ช่องเฉพาะรับข้อความของเซิร์ฟเวอร์นั้น ปุ่มทดสอบส่งเฉพาะ Discord">
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); mutation.mutate(() => (editing === null ? chatAdminApi.saveChannel : (input: Parameters<typeof chatAdminApi.saveChannel>[0]) => chatAdminApi.updateChannel(editing, input))({ discordChannelId: channelId, discordGuildId: null, serverId: serverId ? Number(serverId) : null, channelType: serverId ? 'server' : 'global', isActive: true })); }}>
        <Field label="Discord Channel ID"><input required className={adminInputClass} pattern="[0-9]{17,20}" value={channelId} onChange={e => setChannel(e.target.value)} /></Field>
        <Field label="Server ID (เว้นว่าง = รวม)"><input className={adminInputClass} type="number" min="1" value={serverId} onChange={e => setServer(e.target.value)} /></Field>
        <AdminButton type="submit" disabled={mutation.isPending || !SNOWFLAKE_RE.test(channelId)}>{editing === null ? 'เพิ่มการเชื่อมช่อง' : 'บันทึกการเชื่อมช่อง'}</AdminButton>{editing !== null && <AdminButton onClick={() => { setEditing(null); setChannel(''); setServer(''); }}>ยกเลิกแก้ไข</AdminButton>}
      </form>
      {channels.isPending && <p role="status">กำลังตรวจสอบช่อง…</p>}
      {channels.data?.length === 0 && <p className="mt-4 text-sm text-iris-muted">ยังไม่มีช่อง Discord ที่เชื่อมไว้</p>}
      {channels.data?.map(c => <div key={c.id} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><div><p>{c.discordChannelName ?? c.discordChannelId} · {c.serverName ?? (c.serverId ? `Server ${c.serverId}` : 'รวมทุกเซิร์ฟเวอร์')}</p><p className="text-xs text-iris-muted">{c.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}{c.discordCheck ? c.discordCheck.reachable ? ' · พบช่อง Discord' : ' · เข้าถึงช่องไม่ได้' : ''}</p>{c.discordCheck && <p className="text-xs text-amber-200">{c.discordCheck.missingPermissions.join(', ')} {c.discordCheck.error}</p>}</div><div className="flex flex-wrap gap-2"><AdminButton onClick={() => { setEditing(c.id); setChannel(c.discordChannelId); setServer(c.serverId === null ? '' : String(c.serverId)); }}>แก้ไข</AdminButton><AdminButton disabled={mutation.isPending} onClick={() => mutation.mutate(() => chatAdminApi.updateChannel(c.id, { isActive: !c.isActive }))}>{c.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</AdminButton><AdminButton disabled={mutation.isPending} onClick={() => mutation.mutate(() => chatAdminApi.testSend({ channelId: c.id, content: 'IRIS cross-chat connection test' }))}>ทดสอบ Discord</AdminButton><AdminButton disabled={mutation.isPending} onClick={() => setDeleting(c.id)}>ลบ</AdminButton></div></div>)}
      {deleting !== null && <AdminNotice tone="warning">ยืนยันลบการเชื่อมช่องนี้ <AdminButton disabled={mutation.isPending} onClick={() => mutation.mutate(() => chatAdminApi.deleteChannel(deleting))}>ยืนยันลบ</AdminButton> <AdminButton onClick={() => setDeleting(null)}>ยกเลิก</AdminButton></AdminNotice>}
    </AdminPanel>
    <AdminPanel title="ปิดเสียงผู้ใช้" description="ใช้ User ID สำหรับเว็บ, Steam ID สำหรับเกม หรือ Discord User ID; เว้นว่างระยะเวลาเพื่อปิดจนกว่าจะยกเลิก">
      <div className="grid gap-3 sm:grid-cols-2"><Field label="ช่องทาง"><select className={adminInputClass} value={subjectType} onChange={e => setSubjectType(e.target.value)}><option value="web_user">เว็บ</option><option value="player">เกม (Steam ID)</option><option value="discord_user">Discord</option></select></Field><Field label="User / Steam / Discord ID"><input className={adminInputClass} value={subjectId} onChange={e => setSubject(e.target.value)} maxLength={64} /></Field><Field label="ระยะเวลา (นาที)"><input type="number" min="1" className={adminInputClass} value={minutes} onChange={e => setMinutes(e.target.value)} /></Field><Field label="เหตุผล (ใช้กับการลบข้อความด้วย)"><input className={adminInputClass} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></Field></div>
      <AdminButton className="mt-3" disabled={mutation.isPending || !subjectId.trim() || reason.trim().length < 3 || (minutes !== '' && (!Number.isInteger(Number(minutes)) || Number(minutes) < 1))} onClick={() => mutation.mutate(() => chatAdminApi.mute({ senderType: subjectType, senderId: subjectId.trim(), minutes: minutes ? Number(minutes) : null, reason }))}>ปิดเสียง</AdminButton>
      {mutes.data?.map(m => <div key={m.id} className="mt-3 flex items-center justify-between gap-2 text-sm"><span>{m.senderType} · {m.senderId} · {m.reason} · {m.expiresAt ? formatBangkokDateTime(m.expiresAt) : 'ไม่มีกำหนด'}</span><AdminButton disabled={mutation.isPending} onClick={() => mutation.mutate(() => chatAdminApi.unmute(m.id))}>ยกเลิกปิดเสียง</AdminButton></div>)}
    </AdminPanel>
    <AdminPanel title="ประวัติข้อความ"><div className="mb-4 flex gap-3"><select aria-label="ที่มาข้อความ" className={adminInputClass} value={source} onChange={e => { setSource(e.target.value); setPage(1); }}><option value="">ทุกช่องทาง</option><option value="web">เว็บ</option><option value="game">เกม</option><option value="discord">Discord</option></select><input aria-label="ค้นหาข้อความ" className={adminInputClass} placeholder="ค้นหาข้อความ / ผู้ส่ง" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
      {messages.isPending && <p role="status">กำลังโหลด…</p>}{messages.data?.items.length === 0 && <p>ยังไม่มีข้อความ</p>}
      {messages.data?.items.map(m => <article key={m.id} className="flex items-start justify-between gap-3 border-b border-white/10 py-3"><div className="min-w-0"><p className="text-xs text-iris-muted">{CHAT_SOURCE_TH[m.source] ?? m.source} · {m.serverName ?? 'รวม'} · {m.senderName} · {formatBangkokDateTime(m.createdAt)}</p><p className="break-words text-sm">{m.content}</p></div><AdminButton size="sm" disabled={mutation.isPending || !!m.deletedAt || reason.trim().length < 3} onClick={() => mutation.mutate(() => chatAdminApi.deleteMessage(m.id, reason))}>ลบข้อความ</AdminButton></article>)}
      <Pagination page={page} pageSize={25} total={messages.data?.pagination.total ?? 0} hidePageSize onPageChange={setPage} onPageSizeChange={() => {}} isUnknown={!messages.data} isBusy={messages.isFetching} />
    </AdminPanel>
  </AdminPage>;
}
export default function Page() { return <AdminAccessGate allow={['admin', 'root']}><ChatAdmin /></AdminAccessGate>; }

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-sm text-iris-muted"><span>{label}</span>{children}</label>; }
