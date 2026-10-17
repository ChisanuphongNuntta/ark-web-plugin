import type { Metadata } from 'next';
import { TopupFlow } from '@/components/payments/TopupFlow';

export const metadata: Metadata = {
  title: 'เติม Iris Coin',
  description: 'เติม Iris Coin ด้วยการโอนเงินและแนบสลิป หรือชำระด้วยบัตรผ่าน Stripe',
};

export default function TopupPage() {
  return <TopupFlow />;
}
