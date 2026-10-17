import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ศูนย์ช่วยเหลือ',
  description: 'คำถามที่พบบ่อยและวิธีแจ้งปัญหาการเติมเงิน การส่งของ และบัญชีกับทีม IRIS Thailand',
  alternates: { canonical: '/support' },
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
