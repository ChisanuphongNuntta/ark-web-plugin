'use client';

import * as React from 'react';
import { Button, Dialog, Input } from '@/components/ui';

export interface ConfirmByNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  /** Text the admin must type exactly to enable the confirm button. */
  confirmValue: string;
  confirmText: string;
  loading?: boolean;
  onConfirm: () => void;
}

/**
 * Strong confirmation for irreversible server actions: the confirm button
 * stays disabled until the exact name is typed.
 */
export function ConfirmByNameDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmValue,
  confirmText,
  loading = false,
  onConfirm,
}: ConfirmByNameDialogProps) {
  const [typed, setTyped] = React.useState('');
  const matches = typed.trim() === confirmValue;

  const handleOpenChange = (next: boolean) => {
    if (!next) setTyped('');
    onOpenChange(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      variant="danger"
      size="md"
      loading={loading}
      dismissible={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={() => handleOpenChange(false)} disabled={loading}>
            ยกเลิก
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={!matches} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (matches && !loading) onConfirm();
        }}
      >
        <div className="text-sm text-fg-muted">{description}</div>
        <Input
          label={
            <>
              พิมพ์ <span className="font-mono text-fg">{confirmValue}</span> เพื่อยืนยัน
            </>
          }
          mono
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </form>
    </Dialog>
  );
}

export default ConfirmByNameDialog;
