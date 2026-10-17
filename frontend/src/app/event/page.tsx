import type { Metadata } from 'next';
import { ContentJournal } from '@/components/ContentJournal';

export const metadata: Metadata = {
  title: 'กิจกรรม',
  description: 'กิจกรรมในเกมและประกาศจากทีม IRIS Thailand พร้อมวันเวลาและเงื่อนไขการเข้าร่วม',
  alternates: { canonical: '/event' },
};

export default function EventPage() {
  return <ContentJournal kind="event" />;
}
