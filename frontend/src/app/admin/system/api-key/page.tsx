'use client';

import { useQuery } from '@tanstack/react-query';
import { AdminNotice, AdminPage, AdminPageHeader, AdminPanel } from '@/components/admin';
import ApiKeyManager from '@/components/ApiKeyManager';
import { usePermissions } from '@/hooks/usePermissions';
import { userApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

const EYEBROW = 'SYSTEM KEY';
const TITLE = 'API key ของระบบ';

export default function SystemApiKeyPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const { isRoot } = usePermissions();

  const profile = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => userApi.getUserProfile().then((res) => res.data),
    enabled: !!user && isRoot,
  });

  if (authLoading) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow={EYEBROW} title={TITLE} description="กำลังตรวจสอบสิทธิ์…" />
      </AdminPage>
    );
  }

  if (!isRoot) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow={EYEBROW} title={TITLE} />
        <AdminNotice tone="danger" title="คุณไม่มีสิทธิ์เข้าถึงหน้านี้">
          เฉพาะผู้ดูแลระดับ Root เท่านั้น
        </AdminNotice>
      </AdminPage>
    );
  }

  const profileUser = profile.data?.user;

  return (
    <AdminPage>
      <AdminPageHeader eyebrow={EYEBROW} title={TITLE} description="จัดการ API key สำหรับเชื่อมต่อเซิร์ฟเวอร์ (เฉพาะ Root)" />

      {profile.isError ? (
        <AdminNotice tone="danger" title="โหลดข้อมูลไม่สำเร็จ">
          กรุณารีเฟรชหน้าแล้วลองใหม่
        </AdminNotice>
      ) : profile.isLoading ? (
        <AdminPanel>
          <p className="text-sm text-iris-muted">กำลังโหลด…</p>
        </AdminPanel>
      ) : (
        <ApiKeyManager
          apiKey={profileUser?.apiKey}
          apiKeyIp={profileUser?.apiKeyIp}
          apiKeyCreatedAt={profileUser?.apiKeyCreatedAt}
          apiKeyServerName={profileUser?.apiKeyServerName}
          apiKeyServerMap={profileUser?.apiKeyServerMap}
          apiKeyLastUsed={profileUser?.apiKeyLastUsed}
          userId={profileUser?.id}
        />
      )}
    </AdminPage>
  );
}
