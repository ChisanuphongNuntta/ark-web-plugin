'use client';

/**
 * Shared bits for /admin/perks (contract: backend/contracts/entitlements-2026-10.md §5).
 */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { adminInputClass } from '@/components/admin';
import { perksAdminApi } from '@/lib/perksApi';
import { QUOTA_TYPE_TH, type Quota, type QuotaType } from '@/lib/perks';

export const FEATURES_KEY = 'admin-perks-features';
export const PLANS_KEY = 'admin-perks-plans';
export const PACKS_KEY = 'admin-perks-packs';
export const PROMOS_KEY = 'admin-perks-promotions';
export const USER_KEY = 'admin-perks-user';
export const USAGE_KEY = 'admin-perks-usage';
export const REVENUE_KEY = 'admin-perks-revenue';
export const ALL_PERKS_KEYS = [FEATURES_KEY, PLANS_KEY, PACKS_KEY, PROMOS_KEY, USER_KEY, USAGE_KEY, REVENUE_KEY] as const;

export const QUOTA_MAX = 100_000;

export function useAdminFeatures() {
  return useQuery({ queryKey: [FEATURES_KEY], queryFn: ({ signal }) => perksAdminApi.features.list(signal), staleTime: 15_000 });
}

export function useAdminPlans() {
  return useQuery({ queryKey: [PLANS_KEY], queryFn: ({ signal }) => perksAdminApi.plans.list(signal), staleTime: 15_000 });
}

/** Quota type select + limit input. `types` limits the options (promotions: per_day / per_week). */
export function QuotaEditor({
  value,
  onChange,
  types,
  disabled,
  label = 'โควตา',
  idPrefix,
}: {
  value: Quota;
  onChange: (q: Quota) => void;
  types: readonly QuotaType[];
  disabled?: boolean;
  label?: string;
  idPrefix: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        id={`${idPrefix}-type`}
        aria-label={`${label}: ชนิด`}
        className={`${adminInputClass} min-w-[8.5rem] pr-8`}
        disabled={disabled}
        value={value.type}
        onChange={(e) => {
          const type = e.target.value as QuotaType;
          onChange(type === 'unlimited' ? { type, limit: null } : { type, limit: value.limit ?? 1 });
        }}
      >
        {types.map((t) => (
          <option key={t} value={t}>
            {QUOTA_TYPE_TH[t]}
          </option>
        ))}
      </select>
      {value.type !== 'unlimited' && (
        <input
          id={`${idPrefix}-limit`}
          aria-label={`${label}: จำนวนครั้ง`}
          className={`${adminInputClass} w-24`}
          inputMode="numeric"
          disabled={disabled}
          value={value.limit === null ? '' : String(value.limit)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
            onChange({ type: value.type, limit: digits === '' ? null : Number(digits) });
          }}
          placeholder="ครั้ง"
        />
      )}
    </div>
  );
}

export function isQuotaValid(q: Quota): boolean {
  return q.type === 'unlimited' || (q.limit !== null && Number.isInteger(q.limit) && q.limit >= 1 && q.limit <= QUOTA_MAX);
}

/** Checkbox row in the Frozen admin style. */
export function CheckRow({
  checked,
  onChange,
  title,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-sm text-iris-pearl">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-cyan-400"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {title}
        {hint && <span className="block text-xs text-iris-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function CommandList({ commands, max = 4 }: { commands: string[]; max?: number }) {
  if (!commands.length) return <span className="text-iris-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {commands.slice(0, max).map((c) => (
        <span key={c} className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[11px] text-iris-pearl">
          {c}
        </span>
      ))}
      {commands.length > max && <span className="text-[11px] text-iris-muted">+{commands.length - max}</span>}
    </span>
  );
}

export function SummaryTile({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-iris-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-iris-pearl">{value ?? '—'}</p>
      {hint && <p className="text-[11px] text-iris-muted">{hint}</p>}
    </>
  );
  const cls = 'block rounded-xl border border-white/[0.06] bg-white/[0.03] p-3';
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-iris-cyan/30`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
