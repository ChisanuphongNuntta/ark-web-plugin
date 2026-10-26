import type { Metadata } from 'next';
import { TekPassExperience } from '@/components/pass/TekPassExperience';

export const metadata: Metadata = { title: 'IRIS Pass | TEK Expedition' };

export default function PassPage() {
  return <TekPassExperience />;
}
