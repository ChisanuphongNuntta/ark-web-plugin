'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { dinoMarketApi } from '@/lib/api';
import { type MarketAnimal, marketPriceValid } from '@/lib/market';
import { AnimalMetadata } from '@/components/market/AnimalMetadata';
import { AdminNotice, ConfirmDialog, Pagination, adminInputClass } from '@/components/admin';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { apiErrorText } from '@/lib/adminConsoleApi';
import { useAdminLiveRefresh } from '@/hooks/useAdminLiveRefresh';

const STATUS: Record<string, string> = { draft: 'รอตั้งราคา', listed: 'กำลังขาย', sold: 'ขายแล้ว', cancelled: 'รอคืน / ยกเลิก', expired: 'หมดอายุ' };
export default function MyListingsPage() {
  const client = useQueryClient();
  const [status, setStatus] = useState('draft'); const [page, setPage] = useState(1);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState(''); const [cancelId, setCancel] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<{ id: string; price: number; description?: string }[] | null>(null);
  const query = useQuery({ queryKey: ['myDinoListings', status, page], queryFn: () => dinoMarketApi.getMyListings({ status: status || undefined, page, limit: 20 }).then(r => r.data), refetchInterval: status === 'draft' ? 15_000 : false });
  useAdminLiveRefresh(['market:updated', 'catalog:updated'], ['myDinoListings', 'dinoListings']);
  const rows = (query.data?.listings ?? []) as MarketAnimal[];
  const drafts = rows.filter(r => r.status === 'draft');
  const ready = drafts.filter(r => selected.includes(r.id));
  const publish = useMutation({ mutationFn: (items: { id: string; price: number; description?: string }[]) => dinoMarketApi.publishBatch(items), onSuccess: () => { setSelected([]); setPublishing(null); setNotice('เปิดขายแล้ว ผู้ซื้อจะเห็นสัตว์ในตลาด'); void client.invalidateQueries({ queryKey: ['myDinoListings'] }); void client.invalidateQueries({ queryKey: ['dinoListings'] }); } });
  function preparePublish(animals: MarketAnimal[]) {
    if (!animals.length || animals.some(a => !marketPriceValid(prices[a.id] ?? ''))) return;
    setPublishing(animals.map(a => ({ id: a.id, price: Number(prices[a.id]), description: descriptions[a.id] ?? a.description ?? '' })));
  }
  const allReady = ready.length > 0 && ready.every(a => marketPriceValid(prices[a.id] ?? ''));
  return <div className="page-shell mx-auto max-w-7xl space-y-6 py-8 sm:py-10">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><Link href="/market" className="inline-flex items-center gap-1.5 text-sm text-iris-cyan hover:underline"><ChevronLeft size={16} /> กลับตลาดผู้เล่น · Back to Market</Link><p className="eyebrow mt-5">MY ANIMALS · คลังสัตว์ของฉัน</p><h1 className="mt-2 text-3xl font-semibold">สัตว์ของฉันในตลาด</h1></div><Button variant="secondary" onClick={() => void query.refetch()}>รีเฟรชสัตว์ที่อัปโหลด</Button></header>
    <GlassCard className="space-y-2 p-5"><h2 className="font-semibold">อัปโหลดในเกม แล้วตั้งราคาบนเว็บ</h2><p className="text-sm text-iris-muted">เล็งสัตว์ของคุณแล้วใช้ <code className="text-iris-cyan">/market upload</code> หรือ <code className="text-iris-cyan">/market upload group</code> สำหรับสัตว์ในเผ่าใกล้ตัวไม่เกิน 5 ตัว สัตว์ที่อัปโหลดสำเร็จจะอยู่ในคลังรอตั้งราคา ตรวจสเตตัส กำหนดราคาเป็น Iris Coin (IC) และกดเปิดขายที่หน้านี้</p><p className="text-xs text-iris-muted">ก่อนอัปโหลด ลงจากสัตว์และนำอาน สิ่งของ และสิ่งติดตั้งออกก่อน กลุ่มอัปโหลดสร้างรายการแยกตัว แต่ละตัวตั้งราคาแยกกัน เลือกหลายตัวเพื่อเปิดขายพร้อมกันได้สูงสุด 20 ตัว การเปิดขายพร้อมกันสำเร็จทั้งชุดหรือไม่เปลี่ยนรายการใด</p></GlassCard>
    {notice && <AdminNotice tone="success" onDismiss={() => setNotice('')}>{notice}</AdminNotice>}
    {(query.isError || publish.isError) && <AdminNotice tone="danger">{apiErrorText(query.error ?? publish.error, 'ทำรายการไม่สำเร็จ')}</AdminNotice>}
    <div className="flex flex-wrap items-center gap-3"><label className="text-sm">สถานะ <select className={adminInputClass} value={status} onChange={e => { setStatus(e.target.value); setPage(1); setSelected([]); }}><option value="draft">คลังรอตั้งราคา</option><option value="">ทั้งหมด</option>{Object.entries(STATUS).filter(([k]) => k !== 'draft').map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {drafts.length > 0 && <><Button variant="secondary" onClick={() => setSelected(drafts.map(a => a.id))}>เลือกตัวที่รอตั้งราคาทั้งหน้า</Button><Button disabled={!allReady || publish.isPending} onClick={() => preparePublish(ready)}>เปิดขายที่เลือก ({ready.length})</Button></>}
    </div>
    {query.isPending && <p role="status">กำลังโหลดคลังสัตว์…</p>}
    {query.isSuccess && rows.length === 0 && <GlassCard className="p-10 text-center"><h2 className="text-lg font-semibold">ยังไม่มีสัตว์ในสถานะนี้</h2><p className="mt-2 text-sm text-iris-muted">อัปโหลดสัตว์จากเกมก่อน แล้วกดรีเฟรชเพื่อกำหนดราคา</p></GlassCard>}
    <div className="space-y-5">{rows.map(animal => <GlassCard key={animal.id} className="p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3">{animal.status === 'draft' && <input type="checkbox" aria-label={`เลือก ${animal.dinoName ?? animal.species}`} checked={selected.includes(animal.id)} onChange={e => setSelected(prev => e.target.checked ? [...new Set([...prev, animal.id])] : prev.filter(id => id !== animal.id))} />}{animal.status === 'draft' ? <h2 className="text-lg font-semibold">{animal.dinoName || animal.species}</h2> : <Link className="text-lg font-semibold text-iris-pearl hover:text-iris-cyan" href={`/market/${animal.id}`}>{animal.dinoName || animal.species}</Link>}<Badge variant={animal.status === 'draft' ? 'gold' : animal.status === 'listed' ? 'cyan' : 'default'}>{STATUS[animal.status] ?? animal.status}</Badge></div>{animal.status !== 'draft' && <p className="font-mono text-lg text-iris-gold">{animal.price.toLocaleString('th-TH')} IC</p>}</div>
      {animal.uploadBatchId && <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-iris-muted"><span className="break-all">ชุดอัปโหลด: {animal.uploadBatchId}</span>{animal.status === 'draft' && <Button size="sm" variant="secondary" onClick={() => setSelected(drafts.filter(a => a.uploadBatchId === animal.uploadBatchId).map(a => a.id))}>เลือกชุดนี้ในหน้านี้</Button>}</div>}
      <AnimalMetadata animal={animal} />
      {animal.status === 'draft' && <div className="mt-5 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-[1fr_2fr_auto]"><label className="space-y-1 text-sm"><span>ราคา IC (จำนวนเต็ม)</span><input className={adminInputClass} type="number" min="1" max="2000000000" step="1" value={prices[animal.id] ?? ''} onChange={e => setPrices(p => ({ ...p, [animal.id]: e.target.value }))} /></label><label className="space-y-1 text-sm"><span>คำอธิบายเพิ่มเติม</span><input className={adminInputClass} maxLength={2000} value={descriptions[animal.id] ?? animal.description ?? ''} onChange={e => setDescriptions(p => ({ ...p, [animal.id]: e.target.value }))} /></label><Button disabled={!marketPriceValid(prices[animal.id] ?? '') || publish.isPending} onClick={() => preparePublish([animal])}>ตรวจและเปิดขาย</Button></div>}
      {['draft', 'listed'].includes(animal.status) && <div className="mt-4 text-right"><Button variant="secondary" size="sm" onClick={() => setCancel(animal.id)}>ยกเลิกและคืนสัตว์</Button></div>}
    </GlassCard>)}</div>
    <Pagination page={page} pageSize={20} total={query.data?.pagination?.total ?? 0} onPageChange={setPage} onPageSizeChange={() => {}} hidePageSize isUnknown={!query.data} isBusy={query.isFetching} />
    <ConfirmDialog open={!!publishing} tone="default" title="ยืนยันราคาและเปิดขาย" description="ตรวจราคาขายแต่ละตัวก่อนยืนยัน" confirmText="เปิดขายตามราคานี้" onClose={() => setPublishing(null)} onConfirm={() => publishing ? publish.mutateAsync(publishing) : undefined}>{publishing?.map(item => <p key={item.id} className="text-sm">{rows.find(a => a.id === item.id)?.dinoName || rows.find(a => a.id === item.id)?.species || item.id} · {item.price.toLocaleString('th-TH')} IC</p>)}</ConfirmDialog>
    <ConfirmDialog open={!!cancelId} title="ยกเลิกและคืนสัตว์" description="สัตว์จะออกจากตลาดและเข้าสู่คิวคืนให้เจ้าของที่เซิร์ฟเวอร์ต้นทาง" onClose={() => setCancel(null)} onConfirm={async () => { if (!cancelId) return; await dinoMarketApi.cancelListing(cancelId); setNotice('ยกเลิกแล้ว กำลังรอคืนสัตว์ในเกม'); await client.invalidateQueries({ queryKey: ['myDinoListings'] }); }} />
  </div>;
}
