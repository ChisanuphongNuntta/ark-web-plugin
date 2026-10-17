'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ImagePlus, X } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { paymentApi, toContractError, walletContractApi } from '@/lib/contracts/client';
import type { PaymentPackage } from '@/lib/contracts/types';
import {
  Amount,
  Badge,
  Button,
  Card,
  CopyField,
  EmptyState,
  ErrorMessage,
  Input,
  PageHeader,
  Skeleton,
  buttonVariants,
  formatAmount,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { SlipImageError, slipToDataUrl, validateSlipFile } from './slipImage';

/* ------------------------------------------------------------------------ */
/* Static config                                                            */
/* ------------------------------------------------------------------------ */

type Method = 'bank_slip' | 'stripe' | 'sandbox';

/**
 * Sandbox auto-credit is a developer tool. Never offer it in production builds
 * unless explicitly enabled for a staging deployment.
 */
const SANDBOX_ENABLED =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_SANDBOX_TOPUP === 'true';

/** Receiving accounts (unchanged from the previous top-up page). */
const BANK_ACCOUNTS = [
  { id: 'KBANK', bank: 'ธนาคารกสิกรไทย', short: 'KBANK', number: '095-2-88219-4' },
  { id: 'SCB', bank: 'ธนาคารไทยพาณิชย์', short: 'SCB', number: '408-1-55410-9' },
] as const;
const ACCOUNT_NAME = 'บจก. ไอริส เอ็กซ์พีดิชั่น (IRIS EXPEDITION)';

const METHODS: { value: Method; title: string; description: string }[] = [
  { value: 'bank_slip', title: 'โอนเงินและแนบสลิป', description: 'ทีมงานตรวจสลิปแล้วเติมให้ โดยปกติภายในไม่กี่นาที' },
  { value: 'stripe', title: 'บัตรเครดิต / เดบิต', description: 'ชำระบนหน้า Stripe เว็บนี้ไม่เห็นหมายเลขบัตร' },
  ...(SANDBOX_ENABLED
    ? [{ value: 'sandbox' as const, title: 'Sandbox (ทดสอบ)', description: 'สำหรับนักพัฒนา เติมยอดทดสอบทันที ไม่ใช้เงินจริง' }]
    : []),
];

type Result =
  | { kind: 'slip'; id: string; points: string; amountThb: string }
  | { kind: 'stripe'; points: string | null; credited: boolean }
  | { kind: 'sandbox'; reference: string; points: string };

function newKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `topup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function baht(value: string | number) {
  return `฿${formatAmount(value)}`;
}

/* ------------------------------------------------------------------------ */
/* Page                                                                      */
/* ------------------------------------------------------------------------ */

export function TopupFlow() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [packageId, setPackageId] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<Method>('bank_slip');
  const [bank, setBank] = React.useState<string>(BANK_ACCOUNTS[0].id);
  const [transferRef, setTransferRef] = React.useState('');
  const [slipFile, setSlipFile] = React.useState<File | null>(null);
  const [slipPreview, setSlipPreview] = React.useState<string | null>(null);
  const [slipError, setSlipError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const attempt = React.useRef<{ packageId: string; key: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const packagesQuery = useQuery({
    queryKey: ['payment-packages'],
    queryFn: async () => {
      const res = await paymentApi.getPackages();
      const list = (res.packages ?? (res as unknown as { data?: { packages?: PaymentPackage[] } }).data?.packages ?? []) as PaymentPackage[];
      return list.filter((p) => p.isActive !== false);
    },
    retry: 1,
  });

  const walletQuery = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: () => walletContractApi.getBalance(),
    enabled: Boolean(user),
  });

  const packages = React.useMemo(() => packagesQuery.data ?? [], [packagesQuery.data]);
  const chosen =
    packages.find((p) => p.id === packageId) ?? packages.find((p) => p.isPopular) ?? packages[0] ?? null;

  // Revoke the local preview URL when it changes / unmounts.
  React.useEffect(() => {
    return () => {
      if (slipPreview) URL.revokeObjectURL(slipPreview);
    };
  }, [slipPreview]);

  // Return from Stripe Checkout: verify the session with the backend (never trust the redirect).
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const checkoutState = params.get('checkout');
    if (checkoutState === 'cancelled') {
      window.history.replaceState({}, '', '/topup');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time notice read from the return URL
      setMethod('stripe');
      setError('ยกเลิกการชำระบน Stripe แล้ว ยังไม่มีการตัดเงิน');
      return;
    }
    if (!sessionId && checkoutState !== 'returned') return;
    window.history.replaceState({}, '', '/topup');
    void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    if (!sessionId) return;
    paymentApi
      .verifyStripeSession(sessionId)
      .then((res) => {
        void queryClient.invalidateQueries({ queryKey: ['wallet'] });
        setResult({ kind: 'stripe', points: res?.points ?? null, credited: res?.credited !== false && res?.success !== false });
      })
      .catch((err) => {
        setError(toContractError(err, 'ยังยืนยันการชำระผ่าน Stripe ไม่ได้ ยอดจะเข้าเมื่อระบบยืนยันแล้ว').message);
      });
  }, [queryClient]);

  /* ------------------------------ actions ------------------------------ */

  const clearSlip = () => {
    setSlipFile(null);
    setSlipPreview(null);
    setSlipError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const problem = validateSlipFile(file);
    if (problem) {
      setSlipError(problem);
      return;
    }
    setSlipError(null);
    setSlipFile(file);
    setSlipPreview(URL.createObjectURL(file));
  };

  const submitSlip = async () => {
    if (!chosen) return;
    if (!slipFile) {
      setSlipError('แนบรูปสลิปการโอนก่อนส่ง');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const slipImageUrl = await slipToDataUrl(slipFile);
      const res = await paymentApi.submitSlip({
        packageId: String(chosen.id),
        packageName: chosen.name || `Pack ${formatAmount(chosen.totalPoints)} IC`,
        amountThb: Number(chosen.priceThb),
        pointsToCredit: Number(chosen.totalPoints),
        transferBank: bank,
        transferRef: transferRef.trim() || `TRX-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        slipImageUrl,
      });
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setResult({ kind: 'slip', id: res.submission.id, points: chosen.totalPoints, amountThb: chosen.priceThb });
      clearSlip();
      setTransferRef('');
    } catch (err) {
      setError(err instanceof SlipImageError ? err.message : toContractError(err, 'ส่งสลิปไม่สำเร็จ ลองอีกครั้ง').message);
    } finally {
      setBusy(false);
    }
  };

  const startStripe = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    if (!attempt.current || attempt.current.packageId !== chosen.id) {
      attempt.current = { packageId: chosen.id, key: newKey() };
    }
    try {
      const res = await paymentApi.createIntent({ packageId: String(chosen.id), provider: 'stripe' }, attempt.current.key);
      const url = new URL(res.intent?.paymentUrl || '');
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('invalid checkout url');
      window.location.assign(url.href);
    } catch (err) {
      setError(toContractError(err, 'เปิดหน้าชำระเงิน Stripe ไม่ได้ ยังไม่มีการตัดเงิน ลองอีกครั้ง').message);
      setBusy(false);
    }
  };

  const runSandbox = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const res = await paymentApi.createIntent({ packageId: String(chosen.id), provider: 'sandbox', autoCredit: true });
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setResult({ kind: 'sandbox', reference: res.intent?.reference ?? '—', points: chosen.totalPoints });
    } catch (err) {
      setError(toContractError(err, 'เติมยอดทดสอบไม่สำเร็จ').message);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (method === 'bank_slip') void submitSlip();
    else if (method === 'stripe') void startStripe();
    else void runSandbox();
  };

  const ctaLabel = method === 'bank_slip' ? 'ส่งสลิปให้ทีมงานตรวจ' : method === 'stripe' ? 'ไปหน้าชำระเงิน Stripe' : 'เติมยอดทดสอบ';

  /* ------------------------------- render ------------------------------- */

  if (result) {
    return (
      <div className="page-shell pb-16">
        <div className="mx-auto max-w-xl pt-10 sm:pt-14">
          <TopupSteps current={3} className="mb-8" />
          <ResultCard result={result} onAgain={() => setResult(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell pb-16">
      <PageHeader
        eyebrow="กระเป๋า"
        title="เติม Iris Coin"
        description="เลือกแพ็กเกจ เลือกวิธีชำระ แล้วติดตามสถานะได้ในหน้าบัญชี"
        actions={
          user ? (
            <div className="text-right">
              <p className="text-xs text-fg-muted">ยอดที่ใช้ได้</p>
              {walletQuery.isLoading ? (
                <Skeleton className="mt-1 h-6 w-24" />
              ) : (
                <Amount value={walletQuery.data?.accounts.available ?? null} size="lg" />
              )}
            </div>
          ) : (
            <Link href="/login" className={buttonVariants({ variant: 'secondary' })}>
              เข้าสู่ระบบ
            </Link>
          )
        }
      >
        <TopupSteps current={method === 'bank_slip' && slipFile ? 2 : chosen ? 1 : 0} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-10">
          {/* 1 — package */}
          <Section index={1} title="เลือกแพ็กเกจ" id="topup-packages">
            {packagesQuery.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-28" />
                ))}
              </div>
            ) : packagesQuery.isError ? (
              <ErrorMessage
                title="โหลดแพ็กเกจไม่สำเร็จ"
                message="ราคาแพ็กเกจมาจากระบบหลังบ้านเท่านั้น ลองโหลดใหม่อีกครั้ง"
                onRetry={() => void packagesQuery.refetch()}
              />
            ) : packages.length === 0 ? (
              <EmptyState title="ยังไม่มีแพ็กเกจเปิดขาย" description="ทีมงานกำลังเตรียมแพ็กเกจ ติดตามประกาศใน Discord" />
            ) : (
              <div role="radiogroup" aria-labelledby="topup-packages" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {packages.map((pkg) => {
                  const selected = chosen?.id === pkg.id;
                  const hasBonus = pkg.bonusPoints && pkg.bonusPoints !== '0';
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPackageId(pkg.id)}
                      disabled={busy}
                      className={cn(
                        'relative rounded-card border bg-surface p-4 text-left transition-colors duration-fast disabled:opacity-60',
                        selected ? 'border-accent' : 'border-line hover:border-line-strong'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-fg-muted">{pkg.name}</span>
                        {selected ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-on-accent" aria-hidden="true">
                            <Check className="h-3 w-3" strokeWidth={2} />
                          </span>
                        ) : pkg.isPopular ? (
                          <Badge tone="accent">ยอดนิยม</Badge>
                        ) : null}
                      </div>
                      <p className="mt-3">
                        <Amount value={pkg.totalPoints} size="lg" />
                      </p>
                      <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-mono tabular-nums text-fg">{baht(pkg.priceThb)}</span>
                        {hasBonus ? (
                          <span className="text-xs text-fg-muted">
                            รวมโบนัส <span className="font-mono">{formatAmount(pkg.bonusPoints)}</span>
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Section>

          {/* 2 — method */}
          <Section index={2} title="เลือกวิธีชำระ" id="topup-methods">
            <div role="radiogroup" aria-labelledby="topup-methods" className="grid gap-3 sm:grid-cols-2">
              {METHODS.map((m) => {
                const selected = method === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setMethod(m.value);
                      setError(null);
                    }}
                    disabled={busy}
                    className={cn(
                      'flex items-start gap-3 rounded-card border bg-surface p-4 text-left transition-colors duration-fast disabled:opacity-60',
                      selected ? 'border-accent' : 'border-line hover:border-line-strong'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                        selected ? 'border-accent' : 'border-line-strong'
                      )}
                      aria-hidden="true"
                    >
                      {selected ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-fg">{m.title}</span>
                      <span className="mt-0.5 block text-xs text-fg-muted">{m.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* 3 — pay */}
          <Section index={3} title={method === 'bank_slip' ? 'โอนเงินและแนบสลิป' : 'ชำระเงิน'} id="topup-pay">
            {method === 'bank_slip' ? (
              <Card padding="none">
                <div className="border-b border-line p-5">
                  <p className="text-sm text-fg-muted">ยอดที่ต้องโอน</p>
                  <p className="mt-1 font-mono text-3xl font-medium tabular-nums text-fg">
                    {chosen ? baht(chosen.priceThb) : '—'}
                  </p>
                  <p className="mt-1 text-xs text-fg-subtle">โอนให้ตรงยอด เพื่อให้ทีมงานตรวจได้เร็ว</p>
                </div>

                <div className="space-y-3 border-b border-line p-5">
                  <p className="text-sm font-medium text-fg" id="topup-bank">
                    บัญชีรับโอน
                  </p>
                  <div role="radiogroup" aria-labelledby="topup-bank" className="grid gap-3 sm:grid-cols-2">
                    {BANK_ACCOUNTS.map((acc) => {
                      const selected = bank === acc.id;
                      return (
                        <div
                          key={acc.id}
                          className={cn(
                            'rounded-control border p-3 transition-colors duration-fast',
                            selected ? 'border-accent bg-surface-2' : 'border-line'
                          )}
                        >
                          <button
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setBank(acc.id)}
                            className="flex w-full items-center justify-between gap-2 text-left"
                          >
                            <span className="text-sm text-fg">
                              {acc.bank} <span className="text-fg-subtle">({acc.short})</span>
                            </span>
                            <span
                              className={cn(
                                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                                selected ? 'border-accent' : 'border-line-strong'
                              )}
                              aria-hidden="true"
                            >
                              {selected ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
                            </span>
                          </button>
                          <CopyField value={acc.number} size="sm" className="mt-2" copyLabel="คัดลอกเลขบัญชี" />
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-fg-muted">ชื่อบัญชี {ACCOUNT_NAME}</p>
                </div>

                <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-fg-muted">รูปสลิปการโอน</p>
                    {slipPreview ? (
                      <div className="flex items-center gap-3 rounded-control border border-line-strong p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                        <img src={slipPreview} alt="ตัวอย่างสลิปที่แนบ" className="h-14 w-14 shrink-0 rounded-[4px] object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-fg">{slipFile?.name ?? 'สลิปการโอน'}</p>
                          <p className="text-xs text-fg-subtle">พร้อมส่ง</p>
                        </div>
                        <button
                          type="button"
                          onClick={clearSlip}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-control text-fg-muted transition-colors duration-fast hover:bg-surface-2 hover:text-fg"
                          aria-label="นำรูปสลิปออก"
                        >
                          <X className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                      </div>
                    ) : (
                      <label
                        className={cn(
                          'flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed px-3 py-4 text-center transition-colors duration-fast focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
                          slipError ? 'border-danger/50' : 'border-line-strong hover:border-fg-subtle'
                        )}
                      >
                        <ImagePlus className="h-5 w-5 text-fg-muted" strokeWidth={1.5} aria-hidden="true" />
                        <span className="text-sm text-fg">เลือกรูปสลิป</span>
                        <span className="text-xs text-fg-subtle">JPG, PNG หรือ WEBP ไม่เกิน 10 MB</span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={onFileChange}
                          className="sr-only"
                          aria-describedby={slipError ? 'slip-error' : undefined}
                        />
                      </label>
                    )}
                    {slipError ? (
                      <p id="slip-error" className="mt-1.5 text-xs text-danger" role="alert">
                        {slipError}
                      </p>
                    ) : null}
                  </div>
                  <Input
                    label="เลขอ้างอิงในสลิป"
                    helperText="ไม่บังคับ ช่วยให้ทีมงานตรวจเร็วขึ้น"
                    mono
                    value={transferRef}
                    onChange={(e) => setTransferRef(e.target.value)}
                    maxLength={64}
                  />
                </div>
              </Card>
            ) : method === 'stripe' ? (
              <Card padding="md" className="space-y-2 text-sm text-fg-muted">
                <p>
                  ระบบจะพาไปหน้าชำระเงินของ Stripe เมื่อชำระเสร็จจะกลับมาที่หน้านี้และยืนยันยอดกับระบบหลังบ้านก่อนเติมเหรียญ
                </p>
                <p className="text-xs text-fg-subtle">การกลับมาจาก Stripe ยังไม่ถือว่าชำระสำเร็จ จนกว่าหน้านี้จะแจ้งผลยืนยัน</p>
              </Card>
            ) : (
              <Card padding="md" className="space-y-2 text-sm text-fg-muted">
                <p>โหมดทดสอบสำหรับนักพัฒนา เติมยอดเข้ากระเป๋าทันทีโดยไม่ใช้เงินจริง</p>
                <p className="text-xs text-warning">ห้ามเปิดโหมดนี้บนระบบที่ใช้งานจริง</p>
              </Card>
            )}
          </Section>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="สรุปการเติม">
          <Card padding="none">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-base font-semibold text-fg">สรุป</h2>
            </div>
            <dl className="space-y-3 px-5 py-4 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-fg-muted">แพ็กเกจ</dt>
                <dd className="truncate text-fg">{chosen?.name ?? '—'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-fg-muted">ได้รับ</dt>
                <dd>{chosen ? <Amount value={chosen.totalPoints} /> : '—'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-fg-muted">วิธีชำระ</dt>
                <dd className="text-fg">{METHODS.find((m) => m.value === method)?.title}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
                <dt className="font-medium text-fg">ยอดชำระ</dt>
                <dd className="font-mono text-xl tabular-nums text-fg">{chosen ? baht(chosen.priceThb) : '—'}</dd>
              </div>
            </dl>
            <div className="space-y-3 px-5 pb-5">
              {error ? <ErrorMessage variant="inline" message={error} /> : null}
              {user ? (
                <Button fullWidth size="lg" loading={busy} disabled={!chosen || busy} onClick={submit}>
                  {ctaLabel}
                </Button>
              ) : (
                <Link href="/login" className={buttonVariants({ size: 'lg', fullWidth: true })}>
                  เข้าสู่ระบบเพื่อเติม
                </Link>
              )}
              <p className="text-xs leading-relaxed text-fg-subtle">
                เหรียญเข้ากระเป๋าหลังระบบยืนยันการชำระเท่านั้น เก็บเลขอ้างอิงไว้ใช้ติดต่อทีมงาน
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Pieces                                                                    */
/* ------------------------------------------------------------------------ */

const STEP_LABELS = ['แพ็กเกจ', 'วิธีชำระ', 'ชำระ / แนบสลิป', 'สถานะ'] as const;

function TopupSteps({ current, className }: { current: 0 | 1 | 2 | 3; className?: string }) {
  return (
    <ol className={cn('flex flex-wrap items-center gap-x-6 gap-y-2 text-xs', className)} aria-label="ขั้นตอนการเติม">
      {STEP_LABELS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className={cn('inline-flex items-center gap-2', active ? 'text-fg' : done ? 'text-fg-muted' : 'text-fg-subtle')}
          >
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[11px]',
                active ? 'border-accent text-accent' : done ? 'border-line-strong text-fg-muted' : 'border-line'
              )}
              aria-hidden="true"
            >
              {done ? <Check className="h-3 w-3" strokeWidth={2} /> : index + 1}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function Section({ index, title, id, children }: { index: number; title: string; id: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-4 flex items-baseline gap-3 text-lg font-semibold tracking-[-0.015em] text-fg">
        <span className="font-mono text-xs font-normal text-accent" aria-hidden="true">
          {String(index).padStart(2, '0')}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ResultCard({ result, onAgain }: { result: Result; onAgain: () => void }) {
  const pendingReview = result.kind === 'slip';
  const title =
    result.kind === 'slip'
      ? 'ส่งสลิปแล้ว รอทีมงานตรวจ'
      : result.kind === 'stripe'
        ? result.credited
          ? 'ชำระเงินสำเร็จ'
          : 'รับรายการแล้ว กำลังยืนยัน'
        : 'เติมยอดทดสอบแล้ว';

  return (
    <Card padding="lg" aria-live="polite">
      <span
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full border',
          pendingReview ? 'border-line-strong text-fg-muted' : 'border-success/30 text-success'
        )}
      >
        <Check className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-[-0.015em] text-fg">{title}</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {result.kind === 'slip'
          ? 'เหรียญจะเข้ากระเป๋าเมื่อทีมงานตรวจสลิปเรียบร้อย ดูสถานะได้ในประวัติกระเป๋า'
          : result.kind === 'stripe'
            ? result.credited
              ? 'ระบบยืนยันการชำระกับ Stripe และเติมเหรียญเข้ากระเป๋าแล้ว'
              : 'ระบบได้รับรายการแล้ว เหรียญจะเข้าเมื่อ Stripe ยืนยันการชำระ'
            : 'ยอดทดสอบเข้ากระเป๋าแล้ว ไม่มีการใช้เงินจริง'}
      </p>

      <dl className="mt-6 divide-y divide-line rounded-card border border-line">
        {result.kind === 'slip' ? (
          <>
            <ResultRow label="ยอดโอน">
              <span className="font-mono tabular-nums">{baht(result.amountThb)}</span>
            </ResultRow>
            <ResultRow label="จะได้รับ">
              <Amount value={result.points} />
            </ResultRow>
            <ResultRow label="สถานะ">
              <Badge tone="warning">รอตรวจสอบ</Badge>
            </ResultRow>
            <div className="px-4 py-3">
              <CopyField label="เลขที่รายการ" value={result.id} size="sm" />
            </div>
          </>
        ) : result.kind === 'stripe' ? (
          <ResultRow label="เติมแล้ว">{result.points ? <Amount value={result.points} /> : <span className="text-fg-muted">รอยืนยัน</span>}</ResultRow>
        ) : (
          <>
            <ResultRow label="เติมแล้ว">
              <Amount value={result.points} />
            </ResultRow>
            <ResultRow label="อ้างอิง">
              <span className="break-all font-mono text-xs">{result.reference}</span>
            </ResultRow>
          </>
        )}
      </dl>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/profile?tab=wallet" className={buttonVariants()}>
          ดูกระเป๋าและประวัติ
        </Link>
        <Button variant="secondary" onClick={onAgain}>
          เติมเพิ่ม
        </Button>
      </div>
    </Card>
  );
}

function ResultRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

export default TopupFlow;
