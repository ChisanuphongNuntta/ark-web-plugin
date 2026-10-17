'use client';

import React, { ReactNode } from 'react';
import Dialog from '@/components/ui/Dialog';

interface LaserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  children: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger' | 'warning' | 'success';
  loading?: boolean;
  singleButton?: boolean;
}

/**
 * @deprecated LaserModal is deprecated in favor of canonical Dialog component.
 */
export default function LaserModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  variant = 'default',
  loading = false,
  singleButton = false,
}: LaserModalProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      confirmText={confirmText}
      cancelText={cancelText}
      variant={variant}
      loading={loading}
      singleButton={singleButton}
    >
      {children}
    </Dialog>
  );
}
