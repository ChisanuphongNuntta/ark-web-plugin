'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Coins, CreditCard, ExternalLink, Loader2, ShieldCheck, Wallet, AlertCircle } from 'lucide-react';
import { api, authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import type { PaymentIntent, PaymentPackage } from '@/lib/contracts/types';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';

const count = (value: string) => /^\d+$/.test(value) ? BigInt(value).toLocaleString('th-TH') : '—';
const labels: Record<PaymentIntent['status'], string> = {
  pending: 'รอการชำระเงิน', processing: 'กำลังตรวจสอบและเพิ่มเหรียญ', completed: 'เพิ่มเหรียญสำเร็จ', failed: 'ชำระเงินไม่สำเร็จ', expired: 'รายการหมดอายุ',
};

export function StripeTopup() {
  const { user, setUser } = useAuthStore();
  const cache = useQueryClient();
  const [selected, setSelected] = useState('');
  const [intentId, setIntentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef<{ packageId: string; key: string } | null>(null);
  const storageKey = user ? `iris:stripe-intent:${user.id}` : '';

  useEffect(() => {
    setIntentId('');
    attempt.current = null;
    if (storageKey) {
      try { setIntentId(sessionStorage.getItem(storageKey) || ''); } catch { /* Storage may be disabled. */ }
    }
  }, [storageKey]);

  // Payment operations deliberately never use development fixture fallback.
  const packages = useQuery({ queryKey: ['stripe-packages'],
    queryFn: () => api.get<{ packages: PaymentPackage[] }>('/payments/packages').then(r => r.data.packages), retry: 1 });
  const chosen = packages.data?.find(p => p.id === selected) || packages.data?.[0];
  const payment = useQuery({ queryKey: ['stripe-intent', user?.id, intentId], enabled: Boolean(user && intentId),
    queryFn: () => api.get<PaymentIntent>(`/payments/intents/${encodeURIComponent(intentId)}`).then(r => r.data),
    refetchInterval: query => ['pending', 'processing'].includes(query.state.data?.status || '') ? 3000 : false,
    retry: 1 });

  useEffect(() => {
    if (payment.data && !['pending', 'processing'].includes(payment.data.status)) attempt.current = null;
    if (payment.data?.status === 'completed') {
      void cache.invalidateQueries({ queryKey: ['wallet'] });
      void cache.invalidateQueries({ queryKey: ['user'] });
      void authApi.getMe().then(({ data }) => { if (data.user) setUser(data.user); }).catch(() => undefined);
    }
  }, [payment.data?.status, cache, setUser]);

  async function checkout() {
    if (!chosen || !user || busy) return;
    setBusy(true); setError('');
    if (!attempt.current || attempt.current.packageId !== chosen.id) {
      attempt.current = { packageId: chosen.id, key: crypto.randomUUID() };
    }
    try {
      const { data } = await api.post<{ intent: PaymentIntent }>('/payments/intents', { packageId: chosen.id, provider: 'stripe' }, {
        headers: { 'Idempotency-Key': attempt.current.key }, timeout: 60_000,
      });
      setIntentId(data.intent.id);
      try { sessionStorage.setItem(storageKey, data.intent.id); } catch { /* The current page still tracks this intent. */ }
      const url = new URL(data.intent.paymentUrl || '');
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Invalid checkout URL');
      window.location.assign(url.href);
    } catch {
      setError('ยังเปิดหน้าชำระเงินไม่ได้ กรุณาลองอีกครั้ง หากระบบยังไม่พร้อมจะไม่มีการเพิ่มเหรียญหรือสร้างยอดสำเร็จจำลอง');
    } finally { setBusy(false); }
  }

  const pending = Boolean(payment.data && ['pending', 'processing'].includes(payment.data.status));
  return (
    <div className="page-shell py-12 md:py-20 text-iris-pearl">
      <div className="mb-12 flex flex-wrap items-center justify-between gap-6 border-b border-white/10 pb-8">
        <div><p className="eyebrow">IRIS / WALLET</p><h1 className="display-title mt-3 text-4xl md:text-6xl">เติมพลังให้การผจญภัย</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-iris-muted">เลือก IRIS Coin สำหรับร้านค้าในเกมและบนเว็บ ตรวจสอบทุกรายการได้ในกระเป๋าของคุณ</p></div>
        <span className="inline-flex items-center gap-2 rounded-full border border-iris-gold/30 px-4 py-2 text-xs text-iris-gold"><ShieldCheck size={16} /> Stripe sandbox · โหมดทดสอบ</span>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="packages-title">
          <div className="mb-6 flex items-center gap-3"><span className="text-xs font-mono text-iris-gold">01</span><h2 id="packages-title" className="text-xl">เลือกแพ็กเกจเหรียญ</h2></div>
          {packages.isPending ? <div role="status" className="flex items-center gap-3 p-8 text-iris-muted"><Loader2 className="animate-spin" />กำลังโหลดแพ็กเกจ</div> : packages.isError ?
            <Surface className="p-8"><p role="alert">โหลดแพ็กเกจไม่ได้ กรุณาลองอีกครั้ง</p><Button className="mt-4" onClick={() => packages.refetch()}>ลองใหม่</Button></Surface> : !packages.data?.length ?
            <Surface className="p-8 text-iris-muted">ยังไม่มีแพ็กเกจเปิดขายในขณะนี้</Surface> :
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="แพ็กเกจ IRIS Coin">
              {packages.data.map(pkg => <button key={pkg.id} type="button" aria-pressed={chosen?.id === pkg.id} onClick={() => setSelected(pkg.id)} disabled={busy || pending}
                className={`relative min-h-48 rounded-2xl border p-6 text-left transition-colors disabled:opacity-60 ${chosen?.id === pkg.id ? 'border-iris-gold bg-iris-gold/[0.08]' : 'border-white/10 bg-iris-river/40 hover:border-white/30'}`}>
                <div className="flex items-center justify-between"><Coins className="text-iris-gold" size={23} />{chosen?.id === pkg.id ? <Check size={18} className="text-iris-gold" /> : <span className="text-xs text-iris-muted">IRIS COIN</span>}</div>
                <div className="mt-7 text-3xl font-semibold tabular-nums">{count(pkg.totalPoints)} <span className="text-xs font-normal text-iris-muted">IC</span></div>
                <div className="mt-2 flex items-center justify-between gap-2 text-sm"><span className="text-iris-gold">฿{pkg.priceThb}</span><span className="text-xs text-iris-muted">{pkg.bonusPoints !== '0' ? `รวมโบนัส ${count(pkg.bonusPoints)} IC` : pkg.name}</span></div>
              </button>)}
            </div>}
          <div className="mt-8 flex gap-3 border-t border-white/10 pt-6 text-sm leading-7 text-iris-muted"><ShieldCheck className="mt-1 shrink-0 text-iris-cyan" size={20} /><p>ชำระผ่านหน้าที่ดูแลโดย Stripe เว็บไซต์ไม่เก็บหมายเลขบัตร การเพิ่มเหรียญเกิดขึ้นหลังเซิร์ฟเวอร์ตรวจสอบหลักฐานการชำระเงินเท่านั้น</p></div>
        </section>
        <aside>
          <Surface className="p-7 lg:sticky lg:top-28" variant="elevated">
            <p className="eyebrow">YOUR SELECTION</p><h2 className="mt-3 text-2xl">สรุปรายการ</h2>
            <dl className="my-7 space-y-4 text-sm"><div className="flex justify-between"><dt className="text-iris-muted">เหรียญที่จะได้รับ</dt><dd>{chosen ? count(chosen.totalPoints) : '—'} IC</dd></div><div className="flex justify-between border-t border-white/10 pt-4"><dt className="text-iris-muted">ยอดชำระทดสอบ</dt><dd className="text-2xl text-iris-gold">{chosen ? `฿${chosen.priceThb}` : '—'}</dd></div></dl>
            <div className="mb-6 flex items-center gap-3 rounded-xl bg-white/[0.035] p-4 text-sm"><CreditCard size={20} className="text-iris-gold" /><div>บัตรผ่าน Stripe Checkout<p className="mt-1 text-xs text-iris-muted">ใช้เฉพาะบัตรทดสอบ ไม่ใช้เงินจริง</p></div></div>
            {!user ? <Link href="/login" className="flex min-h-12 items-center justify-center rounded-full bg-iris-gold px-4 text-sm font-bold text-iris-ink">เข้าสู่ระบบเพื่อเติมเหรียญ</Link> :
              <Button variant="gold" className="w-full" isLoading={busy} disabled={!chosen || packages.isError || pending} onClick={checkout} rightIcon={<ArrowRight size={17} />}>ไปหน้าชำระเงินทดสอบ</Button>}
            {error ? <p role="alert" className="mt-4 text-sm leading-6 text-rose-300">{error}</p> : null}
            <p className="mt-5 text-xs leading-6 text-iris-muted">การกลับมาจาก Stripe ไม่ใช่หลักฐานว่าชำระสำเร็จ กรุณาดูสถานะยืนยันด้านล่าง</p>
          </Surface>
        </aside>
      </div>
      {intentId ? <Surface className="mt-10 p-6" aria-live="polite">
        <div className="flex items-center gap-3"><Wallet size={21} className="text-iris-gold" /><h2>สถานะรายการล่าสุด</h2></div>
        {payment.data ? <><p className="mt-4 text-lg">{labels[payment.data.status]}</p><p className="mt-2 break-all font-mono text-xs text-iris-muted">{payment.data.reference}</p>
          {payment.data.status === 'pending' && payment.data.paymentUrl?.startsWith('https://checkout.stripe.com/') ? <a href={payment.data.paymentUrl} className="mt-4 inline-flex items-center gap-2 text-sm text-iris-cyan">กลับไปชำระรายการเดิม <ExternalLink size={15} /></a> : null}
          {payment.data.status === 'completed' ? <Link href="/profile" className="mt-4 inline-flex text-sm text-iris-cyan">ดูกระเป๋าเงินและประวัติรายการ</Link> : null}</> : <p className="mt-4 text-sm text-iris-muted">{payment.isError ? 'ยังตรวจสอบสถานะไม่ได้' : 'กำลังตรวจสอบรายการ'}</p>}
        <Button variant="ghost" className="mt-3" onClick={() => payment.refetch()}>ตรวจสอบสถานะอีกครั้ง</Button>
      </Surface> : null}
      <div className="mt-12 flex gap-3 text-xs leading-6 text-iris-muted"><AlertCircle size={17} className="shrink-0" /><p>ระบบนี้อยู่ในโหมดทดสอบ ยังไม่เปิดรับเงินจริง หากเกิดปัญหาโปรดเก็บเลขอ้างอิงเพื่อติดต่อทีมงาน</p></div>
    </div>
  );
}
