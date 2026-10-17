import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'อันดับผู้เล่น',
  description: 'ตารางอันดับผู้เล่นและชนเผ่าของเซิร์ฟเวอร์ IRIS Thailand',
  alternates: { canonical: '/ranking' },
};

export default function RankingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
