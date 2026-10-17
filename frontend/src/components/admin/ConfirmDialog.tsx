'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { AdminDialog } from './AdminDialog';
import { AdminButton } from './AdminButton';
import { adminInputClass } from './AdminToolbar';

export interface ConfirmDialogProps {
  open: boolean;
  /** Close without confirming (Escape, backdrop, cancel). Also called after a successful confirm. */
  onClose: () => void;
  /**
   * The action. If it returns a promise the dialog shows a spinner, ignores
   * Escape/backdrop until it settles, closes on success and shows the error
   * (staying open) on failure.
   */
  onConfirm: () => void | Promise<unknown>;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Extra details (e.g. which rows will be affected). */
  children?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 'danger' = rose confirm button + warning icon; focus starts on Cancel. */
  tone?: 'danger' | 'default';
  /** Type-to-confirm: the confirm button stays disabled until this exact text is typed. */
  confirmPhrase?: string;
  /** External busy flag (e.g. a mutation's isPending) if onConfirm is not async. */
  loading?: boolean;
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { response?: { data?: { error?: unknown; message?: unknown } }; message?: unknown };
    const fromApi = e.response?.data?.error ?? e.response?.data?.message;
    if (typeof fromApi === 'string' && fromApi) return fromApi;
    if (typeof e.message === 'string' && e.message) return e.message;
  }
  return 'ทำรายการไม่สำเร็จ โปรดลองอีกครั้ง';
}

/** Confirmation for destructive or irreversible actions (delete, revoke, regenerate key…). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  tone = 'danger',
  confirmPhrase,
  loading = false,
}: ConfirmDialogProps) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [typed, setTyped] = React.useState('');
  const [wasOpen, setWasOpen] = React.useState(open);
  const phraseId = React.useId();

  // Fresh state every time the dialog opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPending(false);
      setError(null);
      setTyped('');
    }
  }

  const busy = pending || loading;
  const phraseOk = !confirmPhrase || typed.trim() === confirmPhrase;

  const handleConfirm = async () => {
    if (busy || !phraseOk) return;
    setError(null);
    let result: void | Promise<unknown>;
    try {
      result = onConfirm();
    } catch (err) {
      setError(errorText(err));
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      setPending(true);
      try {
        await result;
        setPending(false);
        onClose();
      } catch (err) {
        setPending(false);
        setError(errorText(err));
      }
    } else {
      onClose();
    }
  };

  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      busy={busy}
      size="sm"
      role="alertdialog"
      title={
        <span className="inline-flex items-center gap-2.5">
          {tone === 'danger' && <AlertTriangle className="h-5 w-5 shrink-0 text-rose-200" aria-hidden="true" />}
          {title}
        </span>
      }
      description={description}
      initialFocusRef={confirmPhrase ? undefined : tone === 'danger' ? cancelRef : confirmRef}
      footer={
        <>
          <AdminButton ref={cancelRef} variant="ghost" onClick={onClose} disabled={busy}>
            {cancelText}
          </AdminButton>
          <AdminButton
            ref={confirmRef}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={busy}
            disabled={!phraseOk}
          >
            {confirmText}
          </AdminButton>
        </>
      }
    >
      {(children || confirmPhrase || error) && (
        <div className="space-y-4">
          {children && <div className="text-iris-muted">{children}</div>}
          {confirmPhrase && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={phraseId} className="text-xs font-semibold text-iris-muted">
                พิมพ์ <span className="font-mono text-iris-pearl">{confirmPhrase}</span> เพื่อยืนยัน
              </label>
              <input
                id={phraseId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleConfirm();
                  }
                }}
                autoComplete="off"
                spellCheck={false}
                className={adminInputClass}
                data-autofocus
              />
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-rose-300/30 bg-rose-400/[0.08] px-3 py-2 text-sm text-rose-100">
              {error}
            </p>
          )}
        </div>
      )}
    </AdminDialog>
  );
}
