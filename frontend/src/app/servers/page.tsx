import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ServerDirectory } from '@/components/servers/ServerDirectory';

export const metadata: Metadata = {
  title: 'เซิร์ฟเวอร์',
  description: 'รายชื่อเซิร์ฟเวอร์ ARK: Survival Evolved ของ IRIS Thailand พร้อมสถานะสด รายชื่อผู้เล่น และปุ่มเข้าเกมผ่าน Steam',
};

export default function ServersPage() {
  return (
    <Suspense fallback={<div className="page-shell py-16 text-sm text-iris-muted">กำลังโหลดรายชื่อเซิร์ฟเวอร์…</div>}>
      <ServerDirectory />
    </Suspense>
  );
}
