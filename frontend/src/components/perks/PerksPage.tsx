'use client';
import { IrisCoin } from '@/components/ui/IrisCoin';

/**
 * /perks — in-game command rights read live by the HeartShop plugin.
 * Contract: backend/contracts/entitlements-2026-10.md.
 *
 *   catalog:  GET /perks/catalog (plans, token packs, features, live promotions)
 *   status:   GET /perks/me, refreshed live by 'perks:updated' (RealtimeProvider)
 *   buy:      POST /perks/checkout { planKey | packKey, provider }  (real money: Stripe / bank slip)
 *             POST /perks/buy-tokens-ic { packKey }                  (token packs priced in IC)
 *   Stripe returns to /perks?checkout=returned&session_id=… -> POST /payments/verify-session
 *
 * The page never computes a price; it shows what the API sent. A use in game is
 * taken from (1) a live promotion quota, (2) a subscription grant, (3) Perk Tokens.
 */
import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Building2, CalendarClock, Check,  CreditCard, Gift, Loader2, Repeat, ShieldCheck, Terminal, Ticket } from 'lucide-react';
import { ArrowRight, ExternalLink } from '@/components/tek/arrows';
import { useAuthStore } from '@/lib/store';
import { paymentApi } from '@/lib/api';
import { PERKS_CATALOG_KEY, PERKS_ME_KEY, VIP_ME_KEY } from '@/lib/realtime/queryKeys';
import { BANK_ACCOUNTS, BANK_ACCOUNT_NAME } from '@/lib/paymentAccounts';
import { applyWalletBalance, syncWalletNow } from '@/lib/realtime/walletSync';
import { daysRemaining, durationLabel, formatThb, isZeroPrice } from '@/lib/vip';
import {
  USE_SOURCE_TH,
  audienceLabel,
  isPromotionLive,
  quotaLabel,
  remainingLabel,
  type FeatureStatus,
  type PerkFeature,
  type PerkPlan,
  type TokenPack,
} from '@/lib/perks';
import { newIdempotencyKey, perksApi, type PerksProvider } from '@/lib/perksApi';
import { VipAvatar } from '@/components/vip/VipAvatar';
import { CopyButton } from '@/components/vip/VipPage';
import { useServerOptions } from '@/hooks/useServerOptions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const INTENT_STATUS_TH: Record<string, string> = {
  pending: 'รอการชำระเงิน',
  processing: 'กำลังตรวจสอบการชำระเงิน',
  completed: 'ชำระเงินสำเร็จ เปิดใช้งานสิทธิ์แล้ว',
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

function formatIc(value: string | null): string {
  if (!value) return '—';
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toLocaleString('th-TH')} IC` : `${value} IC`;
}

function errorText(error: unknown, fallback: string): string {
  const e = error as { response?: { status?: number; data?: { error?: unknown; message?: unknown; code?: unknown } } } | null;
  const msg = e?.response?.data?.error ?? e?.response?.data?.message;
  const code = e?.response?.data?.code;
  if (e?.response?.status === 409 && typeof msg === 'string' && /steam/i.test(msg)) {
    return 'กรุณาเชื่อมบัญชี Steam ก่อน (สิทธิ์ในเกมผูกกับ Steam ID)';
  }
  if (code === 'INSUFFICIENT_FUNDS' || (typeof msg === 'string' && /insufficient/i.test(msg))) return 'ยอด IC ไม่พอ เติมเหรียญก่อนแล้วลองใหม่';
  if (e?.response?.status === 429) return 'ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';
  if (e?.response?.status === 404) return 'ไม่พบแพ็กเกจนี้ หรือปิดขายไปแล้ว';
  return typeof msg === 'string' && msg ? msg : fallback;
}

type Selection = { kind: 'plan'; key: string } | { kind: 'pack'; key: string } | null;
type Method = PerksProvider | 'ic';

function SectionTitle({ index, id, children }: { index: string; id: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="font-mono text-xs text-iris-gold">{index}</span>
      <h2 id={id} className="text-xl">
        {children}
      </h2>
    </div>
  );
}

function CommandChips({ commands, max = 6 }: { commands: string[]; max?: number }) {
  if (commands.length === 0) return null;
  const shown = commands.slice(0, max);
  return (
    <span className="flex flex-wrap gap-1.5">
      {shown.map((c) => (
        <span key={c} className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[11px] text-iris-pearl">
          {c}
        </span>
      ))}
      {commands.length > max && <span className="text-[11px] text-iris-muted">+{commands.length - max}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* My status                                                           */
/* ------------------------------------------------------------------ */

function sourceTone(f: FeatureStatus): string {
  if (!f.allowed) return 'border-white/10 text-iris-muted';
  switch (f.source) {
    case 'promotion':
      return 'border-iris-cyan/30 text-iris-cyan';
    case 'subscription':
      return 'border-iris-gold/35 text-iris-gold';
    case 'tokens':
      return 'border-white/20 text-iris-pearl';
    default:
      return 'border-white/15 text-iris-pearl';
  }
}

function StatusSection({ features }: { features: PerkFeature[] }) {
  const user = useAuthStore((s) => s.user);
  const me = useQuery({
    queryKey: [...PERKS_ME_KEY],
    enabled: Boolean(user),
    queryFn: ({ signal }) => perksApi.getMe(signal),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  const [showAll, setShowAll] = useState(false);
  const servers = useServerOptions(Boolean(user));
  if (!user) return null;
  const serverName = (id: number | null) => (id === null ? '' : (servers.data?.find((s) => s.id === id)?.name ?? `เซิร์ฟเวอร์ #${id}`));

  const data = me.data;
  const active = (data?.subscriptions ?? []).filter((s) => s.state === 'active');
  const scheduled = (data?.subscriptions ?? []).filter((s) => s.state === 'scheduled');
  const statuses = data?.features ?? [];
  const commandsOf = (key: string) => features.find((f) => f.key === key)?.commands ?? [];
  const sorted = [...statuses].sort((a, b) => Number(b.allowed) - Number(a.allowed) || a.name.localeCompare(b.name, 'th'));
  const visible = showAll ? sorted : sorted.filter((f) => f.allowed).slice(0, 24);
  const steamMissing = !user.steamId || data?.steamLinked === false;

  return (
    <section className="glass-card space-y-6 p-6" aria-labelledby="perks-status-title" aria-live="polite">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <VipAvatar size={80} src={user.discordAvatar} name={user.discordUsername} vip={user.vip ?? null} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="eyebrow">YOUR PERKS</p>
          <h2 id="perks-status-title" className="text-xl font-semibold text-iris-pearl">
            {me.isLoading
              ? 'กำลังตรวจสอบสิทธิ์…'
              : active.length > 0
                ? `แพ็กเกจที่ใช้อยู่: ${active.map((s) => s.planName).join(', ')}`
                : 'ยังไม่มีแพ็กเกจรายเดือน'}
          </h2>
          {active.map((s) => (
            <p key={s.id} className="text-sm text-iris-muted">
              {s.planName}:{' '}
              {s.expiresAt === null ? (
                'ถาวร'
              ) : (
                <>
                  ใช้ได้ถึง <span className="text-iris-pearl">{formatDate(s.expiresAt)}</span> · เหลือ {daysRemaining(s.expiresAt) ?? 0} วัน
                </>
              )}
            </p>
          ))}
          {scheduled.length > 0 && <p className="text-xs text-iris-muted">รวมการต่ออายุล่วงหน้า {scheduled.length} รายการ</p>}
          {me.isError && <p className="text-xs text-rose-200">{errorText(me.error, 'ตรวจสอบสิทธิ์ไม่สำเร็จ')}</p>}
        </div>
        <div className="rounded-2xl border border-white/10 bg-iris-river/40 px-5 py-4 text-center">
          <p className="text-xs text-iris-muted">Perk Token คงเหลือ</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-iris-pearl">{data ? data.tokenBalance.toLocaleString('th-TH') : '—'}</p>
        </div>
      </div>

      {steamMissing && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200/25 bg-amber-200/[0.06] p-4 text-sm text-iris-pearl">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
          <span className="min-w-0 flex-1">ต้องเชื่อมบัญชี Steam ก่อน ระบบในเกมตรวจสิทธิ์จาก Steam ID ของคุณ</span>
          <Link href="/profile?linkSteam=true" className="btn-secondary min-h-9 px-4 py-1.5 text-xs">
            เชื่อม Steam
          </Link>
        </div>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-iris-pearl">สิทธิ์ของฉันวันนี้</h3>
          <span className="text-xs text-iris-muted">โควตารายวันรีเซ็ตเที่ยงคืนเวลาประเทศไทย</span>
        </div>
        {statuses.length === 0 ? (
          <p className="text-sm text-iris-muted">{me.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีสิทธิ์ที่ใช้ได้ตอนนี้ ซื้อแพ็กเกจหรือ Perk Token ด้านล่าง'}</p>
        ) : (
          <>
            {visible.length === 0 && <p className="text-sm text-iris-muted">ตอนนี้ยังไม่มีคำสั่งที่ใช้ได้</p>}
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((f) => {
                const cmds = f.commands.length ? f.commands : commandsOf(f.key);
                return (
                  <li key={f.key} className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                    <span className="min-w-0 space-y-1">
                      <span className="block truncate text-sm text-iris-pearl">{f.name}</span>
                      <CommandChips commands={cmds} max={3} />
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${sourceTone(f)}`}>
                        {f.allowed ? (USE_SOURCE_TH[f.source ?? ''] ?? 'ใช้ได้') : 'ไม่มีสิทธิ์'}
                      </span>
                      <span className="mt-1 block text-[11px] text-iris-muted">
                        {f.allowed || f.tokenCost === null ? remainingLabel(f) : `${remainingLabel(f)} · ${f.tokenCost.toLocaleString('th-TH')} Token/ครั้ง`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {sorted.length > visible.length || showAll ? (
              <button type="button" className="mt-3 text-xs text-iris-cyan hover:underline" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'แสดงเฉพาะที่ใช้ได้' : `แสดงทั้งหมด ${sorted.length.toLocaleString('th-TH')} รายการ`}
              </button>
            ) : null}
          </>
        )}
      </div>

      {(data?.usage.length ?? 0) > 0 && (
        <div>
          <h3 className="mb-3 text-base font-semibold text-iris-pearl">การใช้งานล่าสุด</h3>
          <ul className="divide-y divide-white/[0.06] text-sm">
            {data!.usage.slice(0, 10).map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-mono text-xs text-iris-pearl">{u.command ?? u.featureName ?? u.featureKey}</span>
                  <span className="ml-2 text-xs text-iris-muted">{u.serverName ?? serverName(u.serverId)}</span>
                </span>
                <span className="text-xs text-iris-muted">
                  {USE_SOURCE_TH[u.source] ?? u.source}
                  {u.source === 'tokens' && u.tokensSpent ? ` −${u.tokensSpent}` : ''} · {formatDate(u.createdAt)}
                </span>
              </li>
            ))}
          </ul>
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
    queryKey: ['perks-intent', intentId],
    queryFn: ({ signal }) => perksApi.getIntent(intentId, signal),
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      if (!st || !['pending', 'processing'].includes(st)) return false;
      return (q.state.data?.provider ?? provider) === 'bank_slip' ? 30_000 : 4_000;
    },
    retry: 1,
  });
  const status = intent.data?.status;
  useEffect(() => {
    if (status === 'completed') {
      void queryClient.invalidateQueries({ queryKey: [...PERKS_ME_KEY] });
      void queryClient.invalidateQueries({ queryKey: [...VIP_ME_KEY] });
    }
  }, [status, queryClient]);

  const isSlip = (intent.data?.provider ?? provider) === 'bank_slip';
  return (
    <section className="glass-card p-6" aria-live="polite" aria-labelledby="perks-intent-title">
      <h2 id="perks-intent-title" className="text-base font-semibold text-iris-pearl">
        สถานะรายการล่าสุด
      </h2>
      {intent.data ? (
        <>
          <p className="mt-3 text-lg text-iris-pearl">
            {isSlip && status === 'pending' ? 'ส่งข้อมูลการโอนแล้ว รอทีมงานตรวจสอบ' : (INTENT_STATUS_TH[status ?? ''] ?? status)}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-iris-muted">อ้างอิง {intent.data.reference}</p>
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
/* Product cards                                                       */
/* ------------------------------------------------------------------ */

function PlanCard({
  plan,
  features,
  selected,
  disabled,
  onSelect,
}: {
  plan: PerkPlan;
  features: PerkFeature[];
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const named = plan.grants.map((g) => {
    const f = features.find((x) => x.key === g.featureKey);
    return {
      key: g.featureKey,
      name: g.featureName ?? f?.name ?? g.featureKey,
      commands: g.commands.length ? g.commands : (f?.commands ?? []),
      quota: g.quota,
    };
  });
  const shown = open ? named : named.slice(0, 6);
  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border p-5 transition-colors ${
        selected ? 'border-iris-gold/60 bg-iris-gold/[0.06]' : 'border-white/10 bg-iris-river/40'
      }`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={disabled}
        onClick={onSelect}
        className="flex items-start justify-between gap-3 text-left disabled:opacity-60"
      >
        <span className="flex items-center gap-3">
          {plan.badge ? (
            <VipAvatar size={48} src={user?.discordAvatar} name={user?.discordUsername ?? plan.name} vip={plan.badge} />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 text-iris-gold" aria-hidden="true">
              <Repeat className="h-5 w-5" />
            </span>
          )}
          <span>
            <span className="block text-lg font-semibold text-iris-pearl">{plan.name}</span>
            <span className="block text-2xl font-semibold tabular-nums text-iris-gold">{formatThb(plan.priceThb)}</span>
            <span className="block text-xs text-iris-muted">
              ต่อ {durationLabel(plan.periodDays)}
              {plan.permissionGroup ? ` · กลุ่มในเกม ${plan.permissionGroup}` : ''}
            </span>
          </span>
        </span>
        {selected ? <Check className="h-5 w-5 shrink-0 text-iris-gold" aria-hidden="true" /> : <span className="text-xs text-iris-muted">เลือก</span>}
      </button>
      {plan.description && <p className="whitespace-pre-line text-sm leading-6 text-iris-muted">{plan.description}</p>}
      {named.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-iris-muted">สิทธิ์ที่ได้ ({named.length.toLocaleString('th-TH')} รายการ)</p>
          <ul className="space-y-1.5">
            {shown.map((g) => (
              <li key={g.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-iris-pearl">
                  {g.commands[0] ? <span className="mr-2 font-mono text-xs text-iris-cyan">{g.commands[0]}</span> : null}
                  {g.name}
                </span>
                <span className="shrink-0 text-xs text-iris-muted">{quotaLabel(g.quota)}</span>
              </li>
            ))}
          </ul>
          {named.length > 6 && (
            <button type="button" className="mt-2 text-xs text-iris-cyan hover:underline" onClick={() => setOpen((v) => !v)}>
              {open ? 'ย่อ' : `ดูทั้งหมด ${named.length.toLocaleString('th-TH')} รายการ`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PackCard({ pack, selected, disabled, onSelect }: { pack: TokenPack; selected: boolean; disabled: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex min-h-36 flex-col gap-3 rounded-2xl border p-5 text-left transition-colors disabled:opacity-60 ${
        selected ? 'border-iris-cyan/50 bg-iris-cyan/[0.06]' : 'border-white/10 bg-iris-river/40 hover:border-white/25'
      }`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-iris-pearl">
          <Ticket className="h-5 w-5 text-iris-cyan" aria-hidden="true" />
          <span className="text-lg font-semibold">{pack.name}</span>
        </span>
        {selected && <Check className="h-5 w-5 text-iris-cyan" aria-hidden="true" />}
      </span>
      <span className="text-2xl font-semibold tabular-nums text-iris-pearl">{pack.tokens.toLocaleString('th-TH')} Token</span>
      <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {pack.priceThb && !isZeroPrice(pack.priceThb) && <span className="text-iris-gold">{formatThb(pack.priceThb)}</span>}
        {pack.priceIc && !isZeroPrice(pack.priceIc) && <span className="text-iris-cyan">{formatIc(pack.priceIc)}</span>}
      </span>
      {pack.description && <span className="text-xs leading-5 text-iris-muted">{pack.description}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function PerksPage() {
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  const queryClient = useQueryClient();
  const catalog = useQuery({
    queryKey: [...PERKS_CATALOG_KEY],
    queryFn: ({ signal }) => perksApi.getCatalog(signal),
    staleTime: 60_000,
    retry: 1,
  });

  const [selection, setSelection] = useState<Selection>(null);
  const [method, setMethod] = useState<Method>('stripe');
  const [bank, setBank] = useState(BANK_ACCOUNTS[0]?.code ?? '');
  const [transferRef, setTransferRef] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'info'; text: string } | null>(null);
  const [intent, setIntent] = useState<{ id: string; provider: string | null } | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const storageKey = user ? `iris:perks-intent:${user.id}` : '';

  const data = catalog.data;
  const features = useMemo(() => (data?.features ?? []).filter((f) => f.isActive), [data]);
  const plans = useMemo(() => (data?.plans ?? []).filter((p) => p.isActive && !isZeroPrice(p.priceThb)), [data]);
  const packs = useMemo(
    () =>
      (data?.tokenPacks ?? []).filter(
        (p) => p.isActive && p.tokens > 0 && ((p.priceThb && !isZeroPrice(p.priceThb)) || (p.priceIc && !isZeroPrice(p.priceIc))),
      ),
    [data],
  );
  const promotions = useMemo(() => (data?.promotions ?? []).filter((p) => isPromotionLive(p)), [data]);
  const freeFeatures = features.filter((f) => f.isFree);

  const chosenPlan = selection?.kind === 'plan' ? (plans.find((p) => p.key === selection.key) ?? null) : null;
  const chosenPack = selection?.kind === 'pack' ? (packs.find((p) => p.key === selection.key) ?? null) : null;
  const packHasThb = Boolean(chosenPack?.priceThb && !isZeroPrice(chosenPack.priceThb));
  const packHasIc = Boolean(chosenPack?.priceIc && !isZeroPrice(chosenPack.priceIc));
  // Valid methods for the current selection.
  const methods: Method[] = chosenPlan ? ['stripe', 'bank_slip'] : chosenPack ? [...(packHasThb ? (['stripe', 'bank_slip'] as const) : []), ...(packHasIc ? (['ic'] as const) : [])] : [];
  const effectiveMethod: Method | null = methods.includes(method) ? method : (methods[0] ?? null);
  const priceText = chosenPlan
    ? formatThb(chosenPlan.priceThb)
    : chosenPack
      ? effectiveMethod === 'ic'
        ? formatIc(chosenPack.priceIc)
        : formatThb(chosenPack.priceThb)
      : '—';
  // Plans grant in-game rights tied to the Steam ID (checkout answers 409 without one). Token
  // packs can be bought before linking, but tokens are only usable in game once linked.
  const steamMissing = Boolean(user && !user.steamId);
  const steamBlocksPurchase = steamMissing && Boolean(chosenPlan);

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
    window.history.replaceState(window.history.state, '', '/perks');
    if (state === 'cancelled' || state === 'canceled') {
      window.setTimeout(() => setNotice({ tone: 'info', text: 'ยกเลิกการชำระเงินแล้ว ยังไม่มีการเรียกเก็บเงิน' }), 0);
      return;
    }
    if (!sessionId) return;
    paymentApi
      .verifyStripeSession(sessionId)
      .then((res: { success?: boolean }) => {
        setNotice(
          res?.success
            ? { tone: 'success', text: 'ชำระเงินสำเร็จ สิทธิ์ในเกมจะอัปเดตภายในไม่กี่วินาที' }
            : { tone: 'info', text: 'ระบบยังไม่ได้รับยืนยันจาก Stripe หน้านี้จะอัปเดตเองเมื่อชำระสำเร็จ' },
        );
      })
      .catch(() => setNotice({ tone: 'info', text: 'กำลังรอการยืนยันจาก Stripe หน้านี้จะอัปเดตเองเมื่อชำระสำเร็จ' }))
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: [...PERKS_ME_KEY] });
        void queryClient.invalidateQueries({ queryKey: ['perks-intent'] });
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

  function select(next: Selection) {
    setSelection(next);
    setError('');
  }

  async function buy() {
    if (!user || busy || !effectiveMethod || (!chosenPlan && !chosenPack)) return;
    setError('');
    if (effectiveMethod === 'bank_slip' && transferRef.trim().length < 4) {
      setError('กรุณากรอกเลขอ้างอิงการโอน (อย่างน้อย 4 ตัวอักษร) เพื่อให้ทีมงานตรวจสอบได้');
      return;
    }
    const target = chosenPlan ? { planKey: chosenPlan.key } : { packKey: chosenPack!.key };
    const fingerprint = `${chosenPlan ? `plan:${chosenPlan.key}` : `pack:${chosenPack!.key}`}|${effectiveMethod}|${
      effectiveMethod === 'bank_slip' ? `${bank}|${transferRef.trim()}` : ''
    }`;
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: newIdempotencyKey('perks') };
    }
    setBusy(true);
    try {
      if (effectiveMethod === 'ic') {
        const res = await perksApi.buyTokensWithIc(chosenPack!.key, attempt.current.key);
        attempt.current = null;
        if (res.walletBalance !== null) applyWalletBalance(res.walletBalance);
        void syncWalletNow(queryClient);
        void queryClient.invalidateQueries({ queryKey: [...PERKS_ME_KEY] });
        setNotice({
          tone: 'success',
          text: `ซื้อ ${chosenPack!.tokens.toLocaleString('th-TH')} Perk Token แล้ว${
            res.tokenBalance !== null ? ` คงเหลือ ${res.tokenBalance.toLocaleString('th-TH')} Token` : ''
          }`,
        });
        return;
      }
      const { intent: created } = await perksApi.checkout(
        {
          ...target,
          provider: effectiveMethod,
          ...(effectiveMethod === 'bank_slip'
            ? { transferBank: bank, transferRef: transferRef.trim(), ...(notes.trim() ? { notes: notes.trim() } : {}) }
            : {}),
        },
        attempt.current.key,
      );
      rememberIntent({ id: created.id, provider: effectiveMethod });
      if (effectiveMethod === 'stripe') {
        const url = new URL(created.paymentUrl || '');
        if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('invalid checkout url');
        window.location.assign(url.href);
        return;
      }
      attempt.current = null;
      setTransferRef('');
      setNotes('');
      setNotice({ tone: 'success', text: 'ส่งข้อมูลการโอนแล้ว ทีมงานจะตรวจสอบและเปิดใช้งานให้ หน้านี้จะอัปเดตเองเมื่ออนุมัติ' });
    } catch (err) {
      setError(
        effectiveMethod === 'stripe'
          ? errorText(err, 'ยังเปิดหน้าชำระเงินไม่ได้ กรุณาลองอีกครั้ง (ยังไม่มีการเรียกเก็บเงิน)')
          : effectiveMethod === 'ic'
            ? errorText(err, 'ซื้อด้วย IC ไม่สำเร็จ กรุณาลองอีกครั้ง')
            : errorText(err, 'ส่งข้อมูลการโอนไม่สำเร็จ กรุณาลองอีกครั้ง'),
      );
    } finally {
      setBusy(false);
    }
  }

  const methodOptions: { value: Method; title: string; hint: string; icon: React.ReactNode }[] = [
    { value: 'stripe', title: 'บัตรเครดิต / เดบิต', hint: 'ชำระผ่าน Stripe เปิดใช้งานทันที', icon: <CreditCard className="h-5 w-5" /> },
    { value: 'bank_slip', title: 'โอนเงิน / พร้อมเพย์', hint: 'ทีมงานตรวจสอบแล้วเปิดใช้งานให้', icon: <Building2 className="h-5 w-5" /> },
    { value: 'ic', title: 'จ่ายด้วย IRIS Coin', hint: 'ตัดจากยอด IC ทันที (เฉพาะ Perk Token)', icon: <IrisCoin className="h-5 w-5" /> },
  ];

  return (
    <div className="page-shell space-y-8 py-10 text-iris-pearl md:py-14">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-white/10 pb-8">
        <div>
          <p className="eyebrow">IRIS / PERKS</p>
          <h1 className="display-title mt-3 text-4xl md:text-5xl">สิทธิ์พิเศษในเกม</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-iris-muted">
            คำสั่งพิเศษในเกม เช่น /pod /hatch /imprint ตรวจสิทธิ์จากเว็บแบบเรียลไทม์ทุกเซิร์ฟเวอร์ในคลัสเตอร์ เลือกได้ทั้งแพ็กเกจรายเดือน (ชำระด้วยเงินจริง)
            หรือ Perk Token จ่ายตามครั้งที่ใช้ และยังมีโปรโมชั่นใช้ฟรีรายวันสำหรับผู้เล่นทุกคน
          </p>
        </div>
        <Link href="/vip" className="inline-flex items-center gap-2 rounded-full border border-iris-gold/30 px-4 py-2 text-xs text-iris-gold hover:border-iris-gold/60">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> สถานะ VIP และกรอบโปรไฟล์
        </Link>
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
          <p className="text-sm text-iris-muted">เข้าสู่ระบบเพื่อดูสิทธิ์ของคุณ ยอด Perk Token และโควตาที่เหลือวันนี้</p>
          <a href={`${API_URL}/auth/discord`} className="btn-primary min-h-10 px-5 text-sm">
            เข้าสู่ระบบด้วย Discord
          </a>
        </section>
      ) : (
        <StatusSection features={features} />
      )}

      <section className="grid gap-3 md:grid-cols-3" aria-label="ลำดับการใช้สิทธิ์">
        {[
          { icon: <Gift className="h-5 w-5" />, title: '1. โปรโมชั่น', text: 'ถ้ามีโปรที่ใช้ได้ ระบบใช้โควตาโปรก่อน ไม่เสียอะไร' },
          { icon: <Repeat className="h-5 w-5" />, title: '2. แพ็กเกจรายเดือน', text: 'ใช้สิทธิ์จากแพ็กเกจตามโควตา (ไม่จำกัด หรือวันละ x ครั้ง)' },
          { icon: <Ticket className="h-5 w-5" />, title: '3. Perk Token', text: 'ถ้าไม่มีสิทธิ์อื่น หัก Token ตามราคาของคำสั่งนั้น' },
        ].map((s) => (
          <div key={s.title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-iris-river/40 p-4">
            <span className="text-iris-cyan" aria-hidden="true">
              {s.icon}
            </span>
            <span>
              <span className="block text-sm font-semibold text-iris-pearl">{s.title}</span>
              <span className="block text-xs leading-5 text-iris-muted">{s.text}</span>
            </span>
          </div>
        ))}
      </section>

      {catalog.isPending ? (
        <div role="status" className="flex items-center gap-3 p-6 text-iris-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> กำลังโหลดแพ็กเกจ
        </div>
      ) : catalog.isError ? (
        <div className="glass-card p-6">
          <p role="alert" className="text-sm">
            โหลดข้อมูลสิทธิ์ไม่ได้ กรุณาลองอีกครั้ง
          </p>
          <button type="button" className="btn-secondary mt-4 min-h-9 px-4 text-xs" onClick={() => void catalog.refetch()}>
            ลองใหม่
          </button>
        </div>
      ) : (
        <>
          {(promotions.length > 0 || freeFeatures.length > 0) && (
            <section aria-labelledby="perks-promos-title">
              <SectionTitle index="01" id="perks-promos-title">
                โปรโมชั่นที่ใช้ได้ตอนนี้
              </SectionTitle>
              <div className="grid gap-4 md:grid-cols-2">
                {promotions.map((p) => {
                  const cmds = p.featureKeys.flatMap((k) => features.find((f) => f.key === k)?.commands ?? []);
                  return (
                    <div key={p.id} className="glass-card space-y-3 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <p className="flex items-center gap-2 text-base font-semibold text-iris-pearl">
                          <Gift className="h-4 w-4 text-iris-cyan" aria-hidden="true" /> {p.name}
                        </p>
                        <span className="rounded-full border border-iris-cyan/30 px-2.5 py-0.5 text-xs text-iris-cyan">{quotaLabel(p.quota)}</span>
                      </div>
                      {p.description && <p className="text-sm leading-6 text-iris-muted">{p.description}</p>}
                      <CommandChips commands={cmds} />
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-iris-muted">
                        <span>สำหรับ {audienceLabel(p.audience, data?.plans ?? [])}</span>
                        {p.endsAt && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> ถึง {formatDate(p.endsAt)}
                          </span>
                        )}
                      </p>
                    </div>
                  );
                })}
                {freeFeatures.length > 0 && (
                  <div className="glass-card space-y-3 p-5">
                    <p className="text-base font-semibold text-iris-pearl">ใช้ฟรีตลอด</p>
                    <CommandChips commands={freeFeatures.flatMap((f) => f.commands)} max={20} />
                  </div>
                )}
              </div>
            </section>
          )}

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-10">
              <section aria-labelledby="perks-plans-title">
                <SectionTitle index="02" id="perks-plans-title">
                  แพ็กเกจรายเดือน
                </SectionTitle>
                {plans.length === 0 ? (
                  <div className="glass-card p-6 text-sm text-iris-muted">ยังไม่เปิดขายแพ็กเกจรายเดือนในขณะนี้</div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2" role="radiogroup" aria-label="แพ็กเกจรายเดือน">
                    {plans.map((p) => (
                      <PlanCard
                        key={p.id}
                        plan={p}
                        features={features}
                        selected={chosenPlan?.key === p.key}
                        disabled={busy}
                        onSelect={() => select({ kind: 'plan', key: p.key })}
                      />
                    ))}
                  </div>
                )}
                <p className="mt-3 text-xs text-iris-muted">ซื้อซ้ำระหว่างที่ยังใช้งานอยู่ ระยะเวลาจะต่อจากวันหมดอายุเดิม ชำระด้วยเงินจริงเท่านั้น</p>
              </section>

              <section aria-labelledby="perks-packs-title">
                <SectionTitle index="03" id="perks-packs-title">
                  Perk Token (จ่ายต่อคำสั่งที่อนุญาต)
                </SectionTitle>
                {packs.length === 0 ? (
                  <div className="glass-card p-6 text-sm text-iris-muted">ยังไม่เปิดขาย Perk Token ในขณะนี้</div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="แพ็ก Perk Token">
                    {packs.map((p) => (
                      <PackCard key={p.id} pack={p} selected={chosenPack?.key === p.key} disabled={busy} onSelect={() => select({ kind: 'pack', key: p.key })} />
                    ))}
                  </div>
                )}
                <p className="mt-3 text-xs text-iris-muted">Token ไม่มีวันหมดอายุ ใช้ได้กับทุกคำสั่งที่เปิดให้ใช้ด้วย Token (ราคาต่อครั้งดูได้ในตารางด้านล่าง)</p>
                <p className="mt-2 text-xs leading-5 text-amber-100">ระบบหัก Token หรือโควตาเมื่ออนุญาตให้ส่งคำสั่งเข้าเกม การหักนี้นับการเรียกคำสั่ง แม้ปลั๊กอินปลายทางจะทำงานไม่สำเร็จ เช่น เป้าหมายไม่ถูกต้องหรือยังติดคูลดาวน์</p>
              </section>

              {(chosenPlan || chosenPack) && effectiveMethod && (
                <section aria-labelledby="perks-method-title">
                  <SectionTitle index="04" id="perks-method-title">
                    วิธีชำระเงิน
                  </SectionTitle>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="วิธีชำระเงิน">
                    {methodOptions
                      .filter((m) => methods.includes(m.value))
                      .map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          role="radio"
                          aria-checked={effectiveMethod === m.value}
                          disabled={busy}
                          onClick={() => {
                            setMethod(m.value);
                            setError('');
                          }}
                          className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${
                            effectiveMethod === m.value ? 'border-iris-cyan/50 bg-iris-cyan/[0.06]' : 'border-white/10 bg-iris-river/40 hover:border-white/25'
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

                  {effectiveMethod === 'bank_slip' && (
                    <div className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-iris-river/40 p-5">
                      <p className="text-sm text-iris-muted">
                        โอนยอด <span className="font-semibold text-iris-pearl">{priceText}</span> ไปยังบัญชีด้านล่าง ชื่อบัญชี {BANK_ACCOUNT_NAME}{' '}
                        แล้วกรอกเลขอ้างอิงจากสลิป
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
                              <input type="radio" name="perks-bank" className="h-4 w-4 accent-cyan-400" checked={bank === b.code} onChange={() => setBank(b.code)} />
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
                          <input className="input" value={transferRef} maxLength={120} onChange={(e) => setTransferRef(e.target.value)} placeholder="เลขที่รายการจากสลิป" />
                        </label>
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-iris-muted">
                          หมายเหตุถึงทีมงาน (ไม่บังคับ)
                          <input className="input" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="เช่น เวลาที่โอน" />
                        </label>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>

            <aside>
              <div className="glass-card space-y-5 p-6 lg:sticky lg:top-28">
                <div>
                  <p className="eyebrow">YOUR SELECTION</p>
                  <h2 className="mt-2 text-xl">สรุปรายการ</h2>
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-iris-muted">รายการ</dt>
                    <dd className="text-right">{chosenPlan?.name ?? chosenPack?.name ?? 'ยังไม่ได้เลือก'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-iris-muted">{chosenPack ? 'จำนวน' : 'ระยะเวลา'}</dt>
                    <dd>{chosenPlan ? durationLabel(chosenPlan.periodDays) : chosenPack ? `${chosenPack.tokens.toLocaleString('th-TH')} Token` : '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-white/10 pt-3">
                    <dt className="text-iris-muted">ยอดชำระ</dt>
                    <dd className="text-2xl font-semibold text-iris-gold">{priceText}</dd>
                  </div>
                </dl>
                {!user ? (
                  <a href={`${API_URL}/auth/discord`} className="btn-primary w-full">
                    เข้าสู่ระบบเพื่อซื้อ
                  </a>
                ) : (
                  <button
                    type="button"
                    className="btn-primary w-full"
                    disabled={(!chosenPlan && !chosenPack) || !effectiveMethod || busy || steamBlocksPurchase}
                    onClick={() => void buy()}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {effectiveMethod === 'ic' ? 'ซื้อด้วย IC' : effectiveMethod === 'bank_slip' ? 'ส่งข้อมูลการโอน' : 'ไปหน้าชำระเงิน'}
                    {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </button>
                )}
                {steamBlocksPurchase && <p className="text-xs text-amber-100">เชื่อม Steam ก่อนจึงจะซื้อแพ็กเกจได้</p>}
                {(chosenPlan || chosenPack) && <p className="text-xs leading-5 text-amber-100">โควตาและ Token คิดตามคำสั่งที่ระบบอนุญาตให้เรียก การทำงานสำเร็จขึ้นอยู่กับเงื่อนไขของปลั๊กอินในเกม และอาจถูกนับแม้คำสั่งไม่สำเร็จ</p>}
                {steamMissing && chosenPack && (
                  <p className="text-xs text-amber-100">ซื้อ Token ได้เลย แต่ต้องเชื่อม Steam ก่อนจึงจะใช้ในเกมได้</p>
                )}
                {error && (
                  <p role="alert" className="text-sm leading-6 text-rose-200">
                    {error}
                  </p>
                )}
                <p className="text-xs leading-6 text-iris-muted">
                  {effectiveMethod === 'ic'
                    ? 'หัก IC จากยอดที่ใช้ได้ทันทีและเพิ่ม Token เข้าบัญชี ไม่สามารถแลกคืนเป็น IC ได้'
                    : effectiveMethod === 'bank_slip'
                      ? 'เปิดใช้งานหลังทีมงานตรวจสอบยอดโอน โดยทั่วไปภายในวันทำการ'
                      : 'ชำระบนหน้าของ Stripe เว็บไซต์ไม่เก็บหมายเลขบัตร สิทธิ์เปิดใช้งานหลังระบบยืนยันการชำระเงิน'}
                </p>
              </div>
            </aside>
          </div>

          {intent && <IntentStatus key={intent.id} intentId={intent.id} provider={intent.provider} />}

          <section className="glass-card p-6" aria-labelledby="perks-features-title">
            <div className="flex items-center gap-3">
              <Terminal className="h-5 w-5 text-iris-cyan" aria-hidden="true" />
              <h2 id="perks-features-title" className="text-base font-semibold">
                คำสั่งทั้งหมดและราคาต่อครั้ง
              </h2>
            </div>
            <p className="mt-2 text-sm text-iris-muted">
              ดูรายละเอียดการใช้แต่ละคำสั่งได้ที่{' '}
              <a href="https://www.iris-th.cloud/Command" target="_blank" rel="noopener noreferrer" className="text-iris-cyan hover:underline">
                หน้าคำสั่ง
              </a>{' '}
              ข้อความแจ้งเตือนในเกมเป็นภาษาอังกฤษ
            </p>
            {features.length === 0 ? (
              <p className="mt-4 text-sm text-iris-muted">ยังไม่มีคำสั่งที่เปิดใช้งาน</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-iris-muted">
                      <th scope="col" className="py-2 pr-3 font-semibold">
                        คำสั่ง
                      </th>
                      <th scope="col" className="py-2 pr-3 font-semibold">
                        รายละเอียด
                      </th>
                      <th scope="col" className="py-2 pr-3 text-right font-semibold">
                        Token/ครั้ง
                      </th>
                      <th scope="col" className="py-2 font-semibold">
                        รวมในแพ็กเกจ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {features.map((f) => {
                      const inPlans = plans.filter((p) => p.grants.some((g) => g.featureKey === f.key));
                      return (
                        <tr key={f.key}>
                          <td className="py-2 pr-3 align-top">
                            <CommandChips commands={f.commands} max={4} />
                          </td>
                          <td className="py-2 pr-3 align-top">
                            <span className="block text-iris-pearl">{f.name}</span>
                            {f.description && <span className="block text-xs text-iris-muted">{f.description}</span>}
                          </td>
                          <td className="py-2 pr-3 text-right align-top tabular-nums">{f.isFree ? 'ฟรี' : f.tokenCost === null ? 'ใช้ Token ไม่ได้' : f.tokenCost.toLocaleString('th-TH')}</td>
                          <td className="py-2 align-top text-xs text-iris-muted">
                            {inPlans.length
                              ? inPlans
                                  .map((p) => {
                                    const g = p.grants.find((x) => x.featureKey === f.key)!;
                                    return `${p.name} (${quotaLabel(g.quota)})`;
                                  })
                                  .join(', ')
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
