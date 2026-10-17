import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ServerDirectoryView } from './ServerDirectoryView';

export const metadata: Metadata = {
  title: 'เซิร์ฟเวอร์ IRIS',
  description: 'รายชื่อแมพ ARK ของ IRIS Thailand ทั้งโหมด PvE, PvE Mod, PvPvE และ Pre-Aqua พร้อมที่อยู่สำหรับเข้าเกมและสถานะล่าสุด',
};

export default function ServersPage() {
  return (
    <Suspense fallback={<div className="page-shell min-h-[60vh] pb-16" aria-busy="true" />}>
      <ServerDirectoryView />
    </Suspense>
  );
}
