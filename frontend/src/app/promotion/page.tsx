import type { Metadata } from 'next';
import { ContentJournal } from '@/components/ContentJournal';

export const metadata: Metadata = {
  title: 'โปรโมชั่น',
  description: 'โปรโมชั่นและสิทธิพิเศษจากร้านค้า IRIS Thailand พร้อมระยะเวลาและเงื่อนไข',
  alternates: { canonical: '/promotion' },
};

export default function PromotionPage() {
  return <ContentJournal kind="promotion" />;
}
