import type { Metadata } from 'next';
import { LegacyTopupPage } from '@/components/payments/LegacyTopup';

export const metadata: Metadata = {
  title: 'เติมเหรียญ IRIS Coin | HeartShop ARK Ecosystem',
  description: 'เติมเงิน IRIS Coin สะดวก รวดเร็ว ผ่านบัตรเครดิต/เดบิต (Stripe), สแกนพร้อมเพย์/โอนธนาคาร หรือโหมดทดสอบ Sandbox',
};

export default function TopupPage() {
  return <LegacyTopupPage />;
}

