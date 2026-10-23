'use client';

/**
 * /vip — buy VIP with real money (Stripe card checkout or bank transfer) and see
 * the current VIP status. Contract: backend/contracts/vip-2026-10.md.
 *
 *   - packages: GET /vip/packages (active + priced only)
 *   - status:   GET /vip/me, refreshed live by 'vip:updated' (RealtimeProvider)
 *   - checkout: POST /vip/checkout { packageId, provider, transferBank?, transferRef?, notes? }
 *               with an Idempotency-Key reused for retries of the same attempt
 *   - Stripe returns to /vip?checkout=returned&session_id=… -> POST /payments/verify-session
 *
 * VIP is never paid with IC, and the page never computes a price: it shows what the API sent.
 */
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  Copy,
  CreditCard,
  Crown,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { paymentApi } from '@/lib/api';
import type { PaymentIntent } from '@/lib/contracts/types';
import { VIP_ME_KEY, VIP_PACKAGES_KEY } from '@/lib/realtime/queryKeys';
import { BANK_ACCOUNTS, BANK_ACCOUNT_NAME } from '@/lib/paymentAccounts';
import {
  MEMBERSHIP_SOURCE_TH,
  MEMBERSHIP_STATUS_TH,
  SYNC_STATUS_TH,
  daysRemaining,
  durationLabel,
  formatThb,
  type VipPackage,
} from '@/lib/vip';
import { vipApi, type VipProvider } from '@/lib/vipApi';
import { VipAvatar } from './VipAvatar';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/** In-game VIP commands from the legacy system (https://www.iris-th.cloud/Command), enforced via Permissions groups. */
const VIP_COMMANDS = ['/pod', '/pods', '/hatch', '/raisebaby', '/imprint', '/getbags', '/clear', '/repair', '/mutate'];

const INTENT_STATUS_TH: Record<string, string> = {
  pending: 'รอการชำระเงิน',
  processing: 'กำลังตรวจสอบการชำระเงิน',
  completed: 'ชำระเงินสำเร็จ เปิดใช้งาน VIP แล้ว',
  failed: 'การชำระเงินไม่สำเร็จ',
  expired: 'รายการหมดอายุ',
};

const bangkok = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : bangkok.format(d);
}

function errorText(error: unknown, fallback: string): string {
  const e = error as { response?: { status?: number; data?: { error?: unknown; message?: unknown } } } | null;
  const msg = e?.response?.data?.error ?? e?.response?.data?.message;
  if (e?.response?.status === 409 && typeof msg === 'string' && /steam/i.test(msg)) {
    return 'กรุณาเชื่อมบัญชี Steam ก่อนซื้อ VIP (สิทธิ์ในเกมผูกกับ Steam ID)';
  }
  if (e?.response?.status === 429) return 'ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';
  return typeof msg === 'string' && msg ? msg : fallback;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          },
          () => undefined,
        );
      }}
      className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-iris-cyan hover:bg-white/[0.05]"
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Current status                                                      */
/* ------------------------------------------------------------------ */

function StatusCard() {
  const user = useAuthStore((s) => s.user);
  const me = useQuery({
    queryKey: [...VIP_ME_KEY],
    enabled: Boolean(user),
    queryFn: ({ signal }) => vipApi.getMe(signal),
    staleTime: 15_000,
  });
  if (!user) return null;

  const data = me.data;
  const vip = data?.vip ?? user.vip ?? null;
  const active = data?.active ?? null;
  const left = active ? daysRemaining(active.expiresAt) : null;
  const scheduled = (data?.memberships ?? []).filter((m) => m.state === 'scheduled');
  const lastExpiry = data?.groups.length
    ? data.groups.some((g) => g.expiresAt === null)
      ? null
      : data.groups.map((g) => g.expiresAt!).sort().at(-1) ?? null
    : active?.expiresAt ?? null;

  return (
    <section className="glass-card p-6" aria-labelledby="vip-status-title" aria-live="polite">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <VipAvatar size={88} src={user.discordAvatar} name={user.discordUsername} vip={vip} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="eyebrow">YOUR STATUS</p>
          <h2 id="vip-status-title" className="text-xl font-semibold text-iris-pearl">
            {me.isLoading ? 'กำลังตรวจสอบสถานะ VIP…' : vip ? `คุณเป็นสมาชิก ${vip.label}` : 'คุณยังไม่ได้เป็นสมาชิก VIP'}
          </h2>
          {vip && (
            <p className="text-sm text-iris-muted">
              {lastExpiry === null ? (
                'สิทธิ์ VIP แบบถาวร'
              ) : (
                <>
                  ใช้ได้ถึง <span className="text-iris-pearl">{formatDate(lastExpiry)}</span>
                  {left !== null && <> · เหลือ {daysRemaining(lastExpiry) ?? left} วัน</>}
                </>
              )}
              {scheduled.length > 0 && ` · รวมการต่ออายุล่วงหน้า ${scheduled.length} รายการ`}
            </p>
          )}
          {active?.sync?.status && active.sync.status !== 'synced' && (
            <p className="text-xs text-iris-muted">
              สถานะในเกม: {SYNC_STATUS_TH[active.sync.status] ?? active.sync.status}
              {active.sync.status === 'pending' && ' (ระบบจะอัปเดตกลุ่มผ่านเซิร์ฟเวอร์ที่ออนไลน์อยู่ ไม่ต้องออนไลน์ในเกม)'}
            </p>
          )}
          {me.isError && <p className="text-xs text-rose-200">{errorText(me.error, 'ตรวจสอบสถานะ VIP ไม่สำเร็จ')}</p>}
        </div>
      </div>
      {(data?.steamLinked === false || !user.steamId) && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200/25 bg-amber-200/[0.06] p-4 text-sm text-iris-pearl">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
          <span className="min-w-0 flex-1">ต้องเชื่อมบัญชี Steam ก่อนซื้อ VIP เพราะสิทธิ์ในเกมผูกกับ Steam ID ของคุณ</span>
          <Link href="/profile?linkSteam=true" className="btn-secondary min-h-9 px-4 py-1.5 text-xs">
            เชื่อม Steam
          </Link>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Latest checkout status                                              */
/* ------------------------------------------------------------------ */

function IntentStatus({ intentId, provider }: { intentId: string; provider: string | null }) {
  const queryClient = useQueryClient();
  const intent = useQuery({
    queryKey: ['vip-intent', intentId],
    queryFn: ({ signal }) => vipApi.getIntent(intentId, signal),
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      if (!st || !['pending', 'processing'].includes(st)) return false;
      return (q.state.data?.provider ?? provider) === 'bank_slip' ? 30_000 : 4_000;
    },
    retry: 1,
  });
  const status = intent.data?.status;
  useEffect(() => {
    if (status === 'completed') void queryClient.invalidateQueries({ queryKey: [...VIP_ME_KEY] });
  }, [status, queryClient]);

  const isSlip = (intent.data?.provider ?? provider) === 'bank_slip';
  return (
    <section className="glass-card p-6" aria-live="polite" aria-labelledby="vip-intent-title">
      <h2 id="vip-intent-title" className="text-base font-semibold text-iris-pearl">
        สถานะรายการล่าสุด
      </h2>
      {intent.data ? (
        <>
          <p className="mt-3 text-lg text-iris-pearl">
            {isSlip && status === 'pending' ? 'ส่งข้อมูลการโอนแล้ว รอทีมงานตรวจสอบ' : INTENT_STATUS_TH[status ?? ''] ?? status}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-iris-muted">อ้างอิง {intent.data.reference}</p>
          {isSlip && status === 'pending' && (
            <p className="mt-2 text-sm text-iris-muted">เมื่ออนุมัติแล้ว VIP จะเปิดใช้งานทันทีและหน้านี้จะอัปเดตเอง</p>
          )}
          {!isSlip && status === 'pending' && intent.data.paymentUrl?.startsWith('https://checkout.stripe.com/') && (
            <a href={intent.data.paymentUrl} className="mt-3 inline-flex items-center gap-2 text-sm text-iris-cyan hover:underline">
              กลับไปชำระรายการเดิม <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm text-iris-muted">{intent.isError ? 'ยังตรวจสอบสถานะไม่ได้' : 'กำลังตรวจสอบรายการ…'}</p>
      )}
      <button type="button" className="btn-secondary mt-4 min-h-9 px-4 py-1.5 text-xs" onClick={() => void intent.refetch()}>
        ตรวจสอบสถานะอีกครั้ง
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function VipPage() {
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  const queryClient = useQueryClient();
  const packages = useQuery({
    queryKey: [...VIP_PACKAGES_KEY],
    queryFn: ({ signal }) => vipApi.getPackages(signal),
    staleTime: 60_000,
    retry: 1,
  });
  const me = useQuery({ queryKey: [...VIP_ME_KEY], enabled: Boolean(user), queryFn: ({ signal }) => vipApi.getMe(signal), staleTime: 15_000 });

  const [selectedId, setSelectedId] = useState('');
  const [provider, setProvider] = useState<VipProvider>('stripe');
  const [bank, setBank] = useState(BANK_ACCOUNTS[0]?.code ?? '');
  const [transferRef, setTransferRef] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'info'; text: string } | null>(null);
  const [intent, setIntent] = useState<{ id: string; provider: string | null } | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const storageKey = user ? `iris:vip-intent:${user.id}` : '';

  const list = packages.data ?? [];
  const chosen: VipPackage | undefined = list.find((p) => p.id === selectedId) ?? list[0];
  const isVip = Boolean(me.data?.vip ?? user?.vip);
  const steamMissing = Boolean(user && (!user.steamId || me.data?.steamLinked === false));

  // Restore the last intent of this session (e.g. after the Stripe redirect).
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { id?: unknown; provider?: unknown };
        if (typeof parsed.id === 'string') {
          const restored = { id: parsed.id, provider: typeof parsed.provider === 'string' ? parsed.provider : null };
          const t = window.setTimeout(() => setIntent(restored), 0);
          return () => window.clearTimeout(t);
        }
      }
    } catch {
      /* storage may be disabled */
    }
  }, [storageKey]);

  // Return from Stripe Checkout: verify the session server-side (the webhook may be slower).
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const state = params.get('checkout');
    if (!sessionId && !state) return;
    window.history.replaceState(window.history.state, '', '/vip');
    if (state === 'cancelled' || state === 'canceled') {
      // Deferred (not cleared): the URL params are already gone if the effect re-runs.
      window.setTimeout(() => setNotice({ tone: 'info', text: 'ยกเลิกการชำระเงินแล้ว ยังไม่มีการเรียกเก็บเงิน' }), 0);
      return;
    }
    if (!sessionId) return;
    paymentApi
      .verifyStripeSession(sessionId)
      .then((res: { success?: boolean; message?: string }) => {
        setNotice(
          res?.success
            ? { tone: 'success', text: 'ชำระเงินสำเร็จ เปิดใช้งาน VIP แล้ว สิทธิ์ในเกมจะซิงก์ภายในไม่กี่นาที' }
            : { tone: 'info', text: 'ระบบยังไม่ได้รับยืนยันจาก Stripe หน้านี้จะอัปเดตเองเมื่อชำระสำเร็จ' },
        );
      })
      .catch(() => setNotice({ tone: 'info', text: 'กำลังรอการยืนยันจาก Stripe หน้านี้จะอัปเดตเองเมื่อชำระสำเร็จ' }))
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: [...VIP_ME_KEY] });
        void queryClient.invalidateQueries({ queryKey: ['vip-intent'] });
      });
  }, [user, queryClient]);

  function rememberIntent(next: { id: string; provider: string | null }) {
    setIntent(next);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* the page still tracks it */
    }
  }

  async function checkout() {
    if (!chosen || !user || busy) return;
    setError('');
    if (provider === 'bank_slip' && transferRef.trim().length < 4) {
      setError('กรุณากรอกเลขอ้างอิงการโอน (อย่างน้อย 4 ตัวอักษร) เพื่อให้ทีมงานตรวจสอบได้');
      return;
    }
    const fingerprint = `${chosen.id}|${provider}|${provider === 'bank_slip' ? `${bank}|${transferRef.trim()}` : ''}`;
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: vipApi.newIdempotencyKey('vip') };
    }
    setBusy(true);
    try {
      const { intent: created }: { intent: PaymentIntent } = await vipApi.checkout(
        {
          packageId: chosen.id,
          provider,
          ...(provider === 'bank_slip'
            ? { transferBank: bank, transferRef: transferRef.trim(), ...(notes.trim() ? { notes: notes.trim() } : {}) }
            : {}),
        },
        attempt.current.key,
      );
      rememberIntent({ id: created.id, provider });
      if (provider === 'stripe') {
        const url = new URL(created.paymentUrl || '');
        if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('invalid checkout url');
        window.location.assign(url.href);
        return;
      }
      attempt.current = null;
      setTransferRef('');
      setNotes('');
      setNotice({ tone: 'success', text: 'ส่งข้อมูลการโอนแล้ว ทีมงานจะตรวจสอบและเปิดใช้งาน VIP ให้ หน้านี้จะอัปเดตเองเมื่ออนุมัติ' });
    } catch (err) {
      setError(
        provider === 'stripe'
          ? errorText(err, 'ยังเปิดหน้าชำระเงินไม่ได้ กรุณาลองอีกครั้ง (ยังไม่มีการเรียกเก็บเงิน)')
          : errorText(err, 'ส่งข้อมูลการโอนไม่สำเร็จ กรุณาลองอีกครั้ง'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell space-y-8 py-10 text-iris-pearl md:py-14">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-white/10 pb-8">
        <div>
          <p className="eyebrow">IRIS / VIP</p>
          <h1 className="display-title mt-3 text-4xl md:text-5xl">สมาชิก VIP</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-iris-muted">
            VIP ใช้คำสั่งพิเศษในเกมได้ทุกเซิร์ฟเวอร์ในคลัสเตอร์ พร้อมกรอบรูปโปรไฟล์บนเว็บ ป้าย VIP ในตลาดผู้เล่น และยศในแชทในเกม
            ชำระด้วยเงินจริงผ่านบัตรหรือโอนเงินเท่านั้น (ไม่ใช้ IRIS Coin)
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-iris-gold/30 px-4 py-2 text-xs text-iris-gold">
          <Crown className="h-4 w-4" aria-hidden="true" /> สิทธิ์ซิงก์เข้าเกมอัตโนมัติ
        </span>
      </header>

      {notice && (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
            notice.tone === 'success' ? 'border-emerald-300/25 bg-emerald-300/[0.06]' : 'border-iris-cyan/25 bg-iris-cyan/[0.06]'
          }`}
        >
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-iris-cyan" aria-hidden="true" />
          <span className="min-w-0 flex-1">{notice.text}</span>
          <button type="button" className="text-xs text-iris-muted hover:text-iris-pearl" onClick={() => setNotice(null)}>
            ปิด
          </button>
        </div>
      )}

      {!user && !authLoading ? (
        <section className="glass-card flex flex-wrap items-center justify-between gap-4 p-6">
          <p className="text-sm text-iris-muted">เข้าสู่ระบบเพื่อดูสถานะ VIP และสมัครสมาชิก</p>
          <a href={`${API_URL}/auth/discord`} className="btn-primary min-h-10 px-5 text-sm">
            เข้าสู่ระบบด้วย Discord
          </a>
        </section>
      ) : (
        <StatusCard />
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <section aria-labelledby="vip-packages-title">
            <div className="mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-iris-gold">01</span>
              <h2 id="vip-packages-title" className="text-xl">
                เลือกแพ็กเกจ
              </h2>
            </div>
            {packages.isPending ? (
              <div role="status" className="flex items-center gap-3 p-6 text-iris-muted">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> กำลังโหลดแพ็กเกจ
              </div>
            ) : packages.isError ? (
              <div className="glass-card p-6">
                <p role="alert" className="text-sm">
                  โหลดแพ็กเกจไม่ได้ กรุณาลองอีกครั้ง
                </p>
                <button type="button" className="btn-secondary mt-4 min-h-9 px-4 text-xs" onClick={() => void packages.refetch()}>
                  ลองใหม่
                </button>
              </div>
            ) : list.length === 0 ? (
              <div className="glass-card p-6 text-sm text-iris-muted">ยังไม่เปิดขาย VIP ในขณะนี้ ติดตามประกาศจากทีมงาน</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="แพ็กเกจ VIP">
                {list.map((p) => {
                  const selected = chosen?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={busy}
                      onClick={() => setSelectedId(p.id)}
                      className={`flex min-h-44 flex-col gap-4 rounded-2xl border p-5 text-left transition-colors disabled:opacity-60 ${
                        selected ? 'border-iris-gold/60 bg-iris-gold/[0.06]' : 'border-white/10 bg-iris-river/40 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <VipAvatar
                          size={52}
                          src={user?.discordAvatar}
                          name={user?.discordUsername ?? 'VIP'}
                          vip={{ tierRank: p.tierRank, frameStyle: p.frameStyle, label: p.badgeLabel }}
                        />
                        {selected ? (
                          <Check className="h-5 w-5 text-iris-gold" aria-hidden="true" />
                        ) : (
                          <span className="text-xs text-iris-muted">{durationLabel(p.durationDays)}</span>
                        )}
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-iris-pearl">{p.name}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-iris-gold">{formatThb(p.priceThb)}</p>
                        <p className="mt-1 text-xs text-iris-muted">
                          {durationLabel(p.durationDays)} · กลุ่มในเกม {p.permissionGroup}
                        </p>
                      </div>
                      {p.description && <p className="whitespace-pre-line text-sm leading-6 text-iris-muted">{p.description}</p>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-labelledby="vip-method-title">
            <div className="mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-iris-gold">02</span>
              <h2 id="vip-method-title" className="text-xl">
                วิธีชำระเงิน
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="วิธีชำระเงิน">
              {(
                [
                  { value: 'stripe', title: 'บัตรเครดิต / เดบิต', hint: 'ชำระผ่าน Stripe เปิดใช้งานทันที', icon: <CreditCard className="h-5 w-5" /> },
                  { value: 'bank_slip', title: 'โอนเงิน / พร้อมเพย์', hint: 'ทีมงานตรวจสอบแล้วเปิดใช้งานให้', icon: <Building2 className="h-5 w-5" /> },
                ] as const
              ).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={provider === m.value}
                  disabled={busy}
                  onClick={() => {
                    setProvider(m.value);
                    setError('');
                  }}
                  className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${
                    provider === m.value ? 'border-iris-cyan/50 bg-iris-cyan/[0.06]' : 'border-white/10 bg-iris-river/40 hover:border-white/25'
                  }`}
                >
                  <span className="text-iris-cyan" aria-hidden="true">
                    {m.icon}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-iris-pearl">{m.title}</span>
                    <span className="block text-xs text-iris-muted">{m.hint}</span>
                  </span>
                </button>
              ))}
            </div>

            {provider === 'bank_slip' && (
              <div className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-iris-river/40 p-5">
                <p className="text-sm text-iris-muted">
                  โอนยอด <span className="font-semibold text-iris-pearl">{chosen ? formatThb(chosen.priceThb) : '—'}</span> ไปยังบัญชีด้านล่าง ชื่อบัญชี{' '}
                  {BANK_ACCOUNT_NAME} แล้วกรอกเลขอ้างอิงจากสลิป
                </p>
                <div className="space-y-2" role="radiogroup" aria-label="บัญชีที่โอนเข้า">
                  {BANK_ACCOUNTS.map((b) => (
                    <div
                      key={b.code}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                        bank === b.code ? 'border-iris-cyan/40 bg-iris-cyan/[0.05]' : 'border-white/[0.08]'
                      }`}
                    >
                      <label className="flex min-w-0 items-center gap-3 text-sm">
                        <input
                          type="radio"
                          name="vip-bank"
                          className="h-4 w-4 accent-[#37E5D2]"
                          checked={bank === b.code}
                          onChange={() => setBank(b.code)}
                        />
                        <span className="min-w-0">
                          <span className="block text-iris-pearl">{b.nameTh}</span>
                          <span className="block font-mono text-xs text-iris-muted">{b.accountNumber}</span>
                        </span>
                      </label>
                      <CopyButton value={b.accountNumber} label={`คัดลอกเลขบัญชี ${b.nameTh}`} />
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-iris-muted">
                    เลขอ้างอิงการโอน *
                    <input
                      className="input"
                      value={transferRef}
                      maxLength={120}
                      onChange={(e) => setTransferRef(e.target.value)}
                      placeholder="เลขที่รายการจากสลิป"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-iris-muted">
                    หมายเหตุถึงทีมงาน (ไม่บังคับ)
                    <input className="input" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="เช่น เวลาที่โอน" />
                  </label>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside>
          <div className="glass-card space-y-5 p-6 lg:sticky lg:top-28">
            <div>
              <p className="eyebrow">YOUR SELECTION</p>
              <h2 className="mt-2 text-xl">สรุปรายการ</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-iris-muted">แพ็กเกจ</dt>
                <dd className="text-right">{chosen?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-iris-muted">ระยะเวลา</dt>
                <dd>{chosen ? durationLabel(chosen.durationDays) : '—'}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-white/10 pt-3">
                <dt className="text-iris-muted">ยอดชำระ</dt>
                <dd className="text-2xl font-semibold text-iris-gold">{chosen ? formatThb(chosen.priceThb) : '—'}</dd>
              </div>
            </dl>
            {isVip && chosen?.durationDays !== null && (
              <p className="text-xs leading-6 text-iris-muted">คุณเป็น VIP อยู่แล้ว ระยะเวลาใหม่จะต่อจากวันหมดอายุเดิม</p>
            )}
            {!user ? (
              <a href={`${API_URL}/auth/discord`} className="btn-primary w-full">
                เข้าสู่ระบบเพื่อสมัคร VIP
              </a>
            ) : (
              <button
                type="button"
                className="btn-primary w-full"
                disabled={!chosen || busy || steamMissing || packages.isError}
                onClick={() => void checkout()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {provider === 'stripe' ? 'ไปหน้าชำระเงิน' : 'ส่งข้อมูลการโอน'}
                {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </button>
            )}
            {steamMissing && <p className="text-xs text-amber-100">เชื่อม Steam ก่อนจึงจะซื้อได้</p>}
            {error && (
              <p role="alert" className="text-sm leading-6 text-rose-200">
                {error}
              </p>
            )}
            <p className="text-xs leading-6 text-iris-muted">
              {provider === 'stripe'
                ? 'ชำระบนหน้าของ Stripe เว็บไซต์ไม่เก็บหมายเลขบัตร VIP เปิดใช้งานหลังระบบยืนยันการชำระเงินเท่านั้น'
                : 'VIP จะเปิดใช้งานหลังทีมงานตรวจสอบยอดโอน โดยทั่วไปภายในวันทำการ'}
            </p>
          </div>
        </aside>
      </div>

      {intent && <IntentStatus key={intent.id} intentId={intent.id} provider={intent.provider} />}

      <section className="glass-card p-6" aria-labelledby="vip-perks-title">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-iris-cyan" aria-hidden="true" />
          <h2 id="vip-perks-title" className="text-base font-semibold">
            สิทธิ์ VIP ในเกม (ตามระบบเดิม)
          </h2>
        </div>
        <p className="mt-2 text-sm text-iris-muted">
          คำสั่งเหล่านี้ใช้ได้เมื่ออยู่ในกลุ่ม VIP ของปลั๊กอิน Permissions ระบบเพิ่ม/ถอดกลุ่มให้อัตโนมัติทุกเซิร์ฟเวอร์ในคลัสเตอร์
          ดูรายละเอียดแต่ละคำสั่งได้ที่{' '}
          <a href="https://www.iris-th.cloud/Command" target="_blank" rel="noopener noreferrer" className="text-iris-cyan hover:underline">
            หน้าคำสั่ง
          </a>
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {VIP_COMMANDS.map((c) => (
            <li key={c} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-iris-pearl">
              {c}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-iris-muted">/mutate ฟรีสำหรับ VIP (ผู้เล่นทั่วไป 500 IC)</p>
      </section>

      {user && (me.data?.memberships.length ?? 0) > 0 && (
        <section className="glass-card p-6" aria-labelledby="vip-history-title">
          <h2 id="vip-history-title" className="text-base font-semibold">
            ประวัติสมาชิก VIP
          </h2>
          <ul className="mt-4 divide-y divide-white/[0.06]">
            {me.data!.memberships.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block text-iris-pearl">{m.package?.name ?? m.permissionGroup}</span>
                  <span className="block text-xs text-iris-muted">
                    {formatDate(m.startsAt)} – {m.expiresAt ? formatDate(m.expiresAt) : 'ถาวร'} · {MEMBERSHIP_SOURCE_TH[m.source] ?? m.source}
                  </span>
                </span>
                <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-iris-muted">
                  {MEMBERSHIP_STATUS_TH[m.state] ?? m.state}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
