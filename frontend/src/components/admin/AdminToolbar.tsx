'use client';

import * as React from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared field class: the site's `.input` (dark field, hairline border, cyan
 * focus ring). Inside .frozen-page it also gets the 10px radius / 44px height.
 */
export const adminInputClass = 'input';

/** Minimal shape of usePaginationState/usePaginatedQuery needed to wire the search box. */
export interface AdminSearchBinding {
  searchInput: string;
  setSearchInput: (value: string) => void;
  flushSearch: () => void;
  clearSearch: () => void;
}

export interface AdminSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter key: commit immediately instead of waiting for the debounce. */
  onSubmit?: () => void;
  /** Clear button / Escape. Defaults to onChange(''). */
  onClear?: () => void;
  placeholder?: string;
  /** Accessible label (visually hidden). Default 'ค้นหา'. */
  label?: string;
  /** Shows a small spinner at the right while a request is in flight. */
  busy?: boolean;
  className?: string;
  id?: string;
}

/** Controlled search box. Debouncing lives in usePaginationState (300ms), not here. */
export function AdminSearchInput({
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder = 'ค้นหา…',
  label = 'ค้นหา',
  busy = false,
  className,
  id,
}: AdminSearchInputProps) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const clear = () => (onClear ? onClear() : onChange(''));
  return (
    <div className={cn('relative min-w-0 flex-1 basis-56', className)} role="search">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-iris-muted" aria-hidden="true" />
      <input
        id={inputId}
        type="search"
        value={value}
        maxLength={100}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit?.();
          } else if (e.key === 'Escape' && value !== '') {
            e.preventDefault();
            clear();
          }
        }}
        className={cn(adminInputClass, 'pl-10 pr-10 [&::-webkit-search-cancel-button]:appearance-none')}
      />
      <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
        {value !== '' ? (
          <button
            type="button"
            onClick={clear}
            aria-label="ล้างคำค้นหา"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-iris-muted hover:bg-white/[0.06] hover:text-iris-pearl"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : busy ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin text-iris-muted" aria-hidden="true" />
        ) : null}
      </span>
    </div>
  );
}

export interface AdminFilterOption {
  value: string;
  label: string;
}

export interface AdminFilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly AdminFilterOption[];
  /** Label of the '' (no filter) option. Pass null to omit it. Default 'ทั้งหมด'. */
  allLabel?: string | null;
  className?: string;
  disabled?: boolean;
}

/** Labelled <select> for a toolbar filter slot. '' always means "all". */
export function AdminFilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = 'ทั้งหมด',
  className,
  disabled,
}: AdminFilterSelectProps) {
  const id = React.useId();
  return (
    <div className={cn('flex min-w-[10rem] flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-semibold text-iris-muted">
        {label}
      </label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cn(adminInputClass, 'pr-8')}>
        {allLabel !== null && <option value="">{allLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface AdminToolbarProps {
  /** Wire the search box straight to a pagination hook result. */
  list?: AdminSearchBinding & { isFetching?: boolean };
  /** Or control it yourself. Omit both `list` and `searchValue` to hide the search box. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: () => void;
  onSearchClear?: () => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  /** Filter slots (AdminFilterSelect, SegmentedTabs, …) placed after the search box. */
  children?: React.ReactNode;
  /** Right-aligned slot (e.g. a reset button or a result count). */
  end?: React.ReactNode;
  /** 'inset' (default) sits at the top of a flush AdminPanel; 'card' stands alone. */
  variant?: 'inset' | 'card';
  className?: string;
}

/** Search + filters row. */
export function AdminToolbar({
  list,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  onSearchClear,
  searchPlaceholder,
  searchLabel,
  children,
  end,
  variant = 'inset',
  className,
}: AdminToolbarProps) {
  const value = list ? list.searchInput : searchValue;
  const showSearch = value !== undefined;
  return (
    <div
      className={cn(
        'flex flex-wrap items-end gap-3',
        variant === 'inset'
          ? 'relative border-b border-white/[0.06] px-5 py-4'
          : 'rounded-[18px] border border-[color:var(--line)] bg-surface-1/60 p-4',
        className,
      )}
    >
      {showSearch && (
        <AdminSearchInput
          value={value}
          onChange={list ? list.setSearchInput : (onSearchChange ?? (() => undefined))}
          onSubmit={list ? list.flushSearch : onSearchSubmit}
          onClear={list ? list.clearSearch : onSearchClear}
          placeholder={searchPlaceholder}
          label={searchLabel}
          busy={list?.isFetching}
        />
      )}
      {children}
      {end && <div className="ml-auto flex items-center gap-2">{end}</div>}
    </div>
  );
}

export interface AdminFieldProps {
  label: string;
  /** Hint under the field. */
  hint?: React.ReactNode;
  /** Error under the field (also sets aria-invalid on the control via render prop). */
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  /** Render the control with the generated id + describedby. */
  children: (field: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => React.ReactNode;
}

/** Label + control + hint/error for admin forms (dialogs). Use `className={adminInputClass}` on the control. */
export function AdminField({ label, hint, error, required, className, children }: AdminFieldProps) {
  const id = React.useId();
  const hintId = `${id}-hint`;
  const describedBy = error || hint ? hintId : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-semibold text-iris-muted">
        {label}
        {required && (
          <span className="ml-0.5 text-rose-200" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {(error || hint) && (
        <p id={hintId} className={cn('text-xs', error ? 'text-rose-200' : 'text-iris-muted')}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
