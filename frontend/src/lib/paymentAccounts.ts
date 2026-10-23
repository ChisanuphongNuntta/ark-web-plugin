/**
 * Bank transfer destinations shown to players (same accounts as the /topup page,
 * components/payments/LegacyTopup.tsx). Keep both in sync until LegacyTopup reads
 * from here.
 */
export interface BankAccount {
  code: string;
  nameTh: string;
  accountNumber: string;
}

export const BANK_ACCOUNT_NAME = 'บจก. ไอริส เอ็กซ์พีดิชั่น (IRIS EXPEDITION)';

export const BANK_ACCOUNTS: readonly BankAccount[] = [
  { code: 'KBANK', nameTh: 'ธนาคารกสิกรไทย (KBANK)', accountNumber: '095-2-88219-4' },
  { code: 'SCB', nameTh: 'ธนาคารไทยพาณิชย์ (SCB)', accountNumber: '408-1-55410-9' },
];
