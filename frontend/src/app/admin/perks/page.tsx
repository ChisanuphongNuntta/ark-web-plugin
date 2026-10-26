'use client';

import { useState } from 'react';
import { AdminAccessGate } from '@/components/admin/console/ConsoleBits';
import { AdminPage, AdminPageHeader, AdminNotice, SegmentedTabs, AdminSuspense } from '@/components/admin';
import { FeaturesPanel, PlansPanel, TokenPacksPanel, PromotionsPanel } from '@/components/admin/perks/CatalogPanels';
import { UsersPanel, UsagePanel, RevenuePanel } from '@/components/admin/perks/OperationsPanels';
import { ALL_PERKS_KEYS } from '@/components/admin/perks/shared';
import { useAdminLiveRefresh } from '@/hooks/useAdminLiveRefresh';

const tabs = [
  { value: 'features', label: 'ความสามารถ' }, { value: 'plans', label: 'แพ็กรายเดือน' },
  { value: 'tokens', label: 'แพ็ก Token' }, { value: 'promotions', label: 'โปรโมชั่น' },
  { value: 'users', label: 'สิทธิ์รายคน' }, { value: 'usage', label: 'ประวัติการใช้' }, { value: 'revenue', label: 'ยอดขาย' },
];
function PerksAdmin() {
  const [tab, setTab] = useState('features');
  const [notice, setNotice] = useState('');
  useAdminLiveRefresh(['admin:perks', 'admin:vip'], ALL_PERKS_KEYS);
  return <AdminPage>
    <AdminPageHeader eyebrow="PERKS" title="สิทธิ์และความสามารถในเกม" description="กำหนดสิทธิ์รายคำสั่ง แพ็กรายเดือน Token และโควตาโปรโมชั่นตามเวลาไทย" />
    {notice && <AdminNotice tone="success" onDismiss={() => setNotice('')}>{notice}</AdminNotice>}
    <SegmentedTabs aria-label="ส่วนจัดการสิทธิ์" value={tab} onChange={setTab} options={tabs} />
    {tab === 'features' && <FeaturesPanel onNotice={setNotice} />}
    {tab === 'plans' && <PlansPanel onNotice={setNotice} />}
    {tab === 'tokens' && <TokenPacksPanel onNotice={setNotice} />}
    {tab === 'promotions' && <PromotionsPanel onNotice={setNotice} />}
    {tab === 'users' && <UsersPanel />}
    {tab === 'usage' && <UsagePanel />}
    {tab === 'revenue' && <RevenuePanel />}
  </AdminPage>;
}
export default function Page() {
  return <AdminSuspense><AdminAccessGate allow={['admin', 'root']}><PerksAdmin /></AdminAccessGate></AdminSuspense>;
}
