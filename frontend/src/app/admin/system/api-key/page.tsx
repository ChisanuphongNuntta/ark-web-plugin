'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, EyeOff, KeyRound, RotateCcw, Trash2 } from 'lucide-react';
import {
  Button,
  CopyField,
  Dialog,
  EmptyState,
  ErrorMessage,
  IconButton,
  PageHeader,
  Panel,
  Skeleton,
  useToast,
} from '@/components/ui';
import { AdminNoAccess, DetailList, formatDateTime } from '@/components/admin';
import { adminApi, userApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';

interface ProfileUser {
  id: string;
  apiKey?: string | null;
  apiKeyIp?: string | null;
  apiKeyCreatedAt?: string | null;
  apiKeyServerName?: string | null;
  apiKeyServerMap?: string | null;
  apiKeyLastUsed?: string | null;
}

function apiErrorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (data && typeof data.message === 'string' && data.message) return data.message;
  return fallback;
}

async function blobErrorText(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string; error?: string };
      return parsed.message || parsed.error || fallback;
    } catch {
      return fallback;
    }
  }
  return apiErrorText(err, fallback);
}

function maskKey(key: string): string {
  if (key.length <= 12) return '•'.repeat(12);
  return `${key.slice(0, 6)}${'•'.repeat(20)}${key.slice(-6)}`;
}

type ConfirmKind = 'regenerate' | 'reset' | 'delete';

const CONFIRM_COPY: Record<ConfirmKind, { title: string; description: string; confirmText: string; variant: 'warning' | 'danger' }> = {
  regenerate: {
    title: 'สร้างคีย์ใหม่',
    description: 'คีย์เดิมจะใช้ไม่ได้ทันที IP ที่ลงทะเบียนจะถูกล้าง ปลั๊กอินจะหยุดทำงานจนกว่าจะใส่คีย์ใหม่ใน config',
    confirmText: 'สร้างคีย์ใหม่',
    variant: 'warning',
  },
  reset: {
    title: 'รีเซ็ต IP ที่ลงทะเบียน',
    description: 'ปลั๊กอินจะลงทะเบียน IP ใหม่อัตโนมัติเมื่อเชื่อมต่อครั้งถัดไป',
    confirmText: 'รีเซ็ต IP',
    variant: 'warning',
  },
  delete: {
    title: 'ลบคีย์ระบบ',
    description: 'ปลั๊กอินที่ใช้คีย์นี้จะเชื่อมต่อไม่ได้ทันที ต้องสร้างคีย์ใหม่และแก้ config ของเซิร์ฟเวอร์',
    confirmText: 'ลบคีย์',
    variant: 'danger',
  },
};

export default function SystemApiKeyPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const { isRoot } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [revealed, setRevealed] = React.useState(false);
  const [confirm, setConfirm] = React.useState<ConfirmKind | null>(null);

  const profile = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => userApi.getUserProfile().then((res) => res.data as { user?: ProfileUser }),
    enabled: !!user && isRoot,
  });
  const me = profile.data?.user;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['user-profile'] });

  const generateMutation = useMutation({
    mutationFn: () => userApi.generateApiKey(),
    onSuccess: async (response) => {
      setConfirm(null);
      setRevealed(true);
      invalidate();
      const key = (response.data as { apiKey?: string })?.apiKey;
      if (key) {
        try {
          await navigator.clipboard.writeText(key);
          toast.success('สร้างคีย์ใหม่แล้ว', 'คัดลอกคีย์ไว้ในคลิปบอร์ดแล้ว');
          return;
        } catch {
          /* clipboard blocked: fall through */
        }
      }
      toast.success('สร้างคีย์ใหม่แล้ว');
    },
    onError: (err) => toast.error('สร้างคีย์ไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const resetIpMutation = useMutation({
    mutationFn: () => userApi.resetIp(),
    onSuccess: () => {
      setConfirm(null);
      invalidate();
      toast.success('รีเซ็ต IP แล้ว');
    },
    onError: (err) => toast.error('รีเซ็ต IP ไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => userApi.deleteApiKey(),
    onSuccess: () => {
      setConfirm(null);
      setRevealed(false);
      invalidate();
      toast.success('ลบคีย์แล้ว');
    },
    onError: (err) => toast.error('ลบคีย์ไม่สำเร็จ', apiErrorText(err, 'ลองอีกครั้ง')),
  });

  const downloadMutation = useMutation({
    mutationFn: (userId: string) => adminApi.downloadPlugin(userId),
    onSuccess: (response) => {
      const url = window.URL.createObjectURL(new Blob([response.data as BlobPart]));
      const disposition = response.headers?.['content-disposition'] as string | undefined;
      const match = disposition?.match(/filename="?([^";]+)"?/);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', match?.[1] ?? 'HeartShop_Plugin.zip');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('เริ่มดาวน์โหลดแพ็กเกจปลั๊กอินแล้ว');
    },
    onError: async (err) => toast.error('ดาวน์โหลดไม่สำเร็จ', await blobErrorText(err, 'ลองอีกครั้ง')),
  });

  const header = (
    <PageHeader
      eyebrow="ระบบ"
      title="คีย์ระบบและปลั๊กอิน"
      description="คีย์ของบัญชีผู้ดูแลสูงสุด ใช้เชื่อมปลั๊กอิน HeartShop ในเซิร์ฟเวอร์กับระบบ"
    />
  );

  if (authLoading || !user) {
    return (
      <div className="pb-16" aria-busy="true">
        {header}
      </div>
    );
  }

  if (!isRoot) {
    return (
      <div className="pb-16">
        {header}
        <AdminNoAccess description="หน้านี้สำหรับผู้ดูแลสูงสุดเท่านั้น" />
      </div>
    );
  }

  const pendingConfirm =
    confirm === 'regenerate' ? generateMutation.isPending : confirm === 'reset' ? resetIpMutation.isPending : deleteMutation.isPending;
  const runConfirm = () => {
    if (confirm === 'regenerate') generateMutation.mutate();
    else if (confirm === 'reset') resetIpMutation.mutate();
    else if (confirm === 'delete') deleteMutation.mutate();
  };

  return (
    <div className="min-w-0 pb-16">
      {header}

      {profile.isError ? (
        <ErrorMessage
          title="โหลดข้อมูลคีย์ไม่สำเร็จ"
          message={apiErrorText(profile.error, 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')}
          onRetry={() => void profile.refetch()}
        />
      ) : profile.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !me?.apiKey ? (
        <EmptyState
          icon={<KeyRound strokeWidth={1.5} />}
          title="ยังไม่มีคีย์ระบบ"
          description="สร้างคีย์เพื่อให้ปลั๊กอินในเซิร์ฟเวอร์เชื่อมต่อกับระบบได้ คีย์จะแสดงครั้งเดียวหลังสร้างและคัดลอกให้อัตโนมัติ"
          action={
            <Button loading={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
              สร้างคีย์
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            <Panel
              title="คีย์ปัจจุบัน"
              description="เก็บเป็นความลับ อย่าแชร์ในแชทหรือภาพหน้าจอ"
              actions={
                <IconButton
                  aria-label={revealed ? 'ซ่อนคีย์' : 'แสดงคีย์'}
                  aria-pressed={revealed}
                  size="sm"
                  onClick={() => setRevealed((v) => !v)}
                >
                  {revealed ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
                </IconButton>
              }
            >
              <CopyField value={me.apiKey} display={revealed ? me.apiKey : maskKey(me.apiKey)} copyLabel="คัดลอกคีย์" />
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  leftIcon={<Download className="h-4 w-4" strokeWidth={1.5} />}
                  loading={downloadMutation.isPending}
                  onClick={() => downloadMutation.mutate(me.id)}
                >
                  ดาวน์โหลดแพ็กเกจปลั๊กอิน
                </Button>
                <Button variant="secondary" leftIcon={<KeyRound className="h-4 w-4" strokeWidth={1.5} />} onClick={() => setConfirm('regenerate')}>
                  สร้างคีย์ใหม่
                </Button>
                {me.apiKeyIp ? (
                  <Button variant="secondary" leftIcon={<RotateCcw className="h-4 w-4" strokeWidth={1.5} />} onClick={() => setConfirm('reset')}>
                    รีเซ็ต IP
                  </Button>
                ) : null}
                <Button variant="ghost" className="text-danger" leftIcon={<Trash2 className="h-4 w-4" strokeWidth={1.5} />} onClick={() => setConfirm('delete')}>
                  ลบคีย์
                </Button>
              </div>
            </Panel>

            <Panel title="การเชื่อมต่อล่าสุด">
              <DetailList
                items={[
                  { label: 'เซิร์ฟเวอร์', value: me.apiKeyServerName ?? 'ยังไม่มีการเชื่อมต่อ' },
                  { label: 'แผนที่', value: me.apiKeyServerMap },
                  { label: 'IP ที่ลงทะเบียน', value: me.apiKeyIp ?? 'รอการเชื่อมต่อครั้งแรก', mono: !!me.apiKeyIp },
                  { label: 'ใช้งานล่าสุด', value: formatDateTime(me.apiKeyLastUsed), mono: true },
                  { label: 'สร้างเมื่อ', value: formatDateTime(me.apiKeyCreatedAt), mono: true },
                ]}
              />
            </Panel>
          </div>

          <Panel title="ติดตั้งในเซิร์ฟเวอร์">
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-fg-muted marker:font-mono marker:text-fg-subtle">
              <li>คัดลอกคีย์ด้านซ้าย</li>
              <li>
                เปิดไฟล์ <code className="rounded-control border border-line bg-canvas px-1.5 py-0.5 font-mono text-xs text-fg">ark-plugin/config.json</code>
              </li>
              <li>
                วางคีย์ในช่อง <code className="rounded-control border border-line bg-canvas px-1.5 py-0.5 font-mono text-xs text-fg">ApiKey</code>
              </li>
              <li>บันทึกไฟล์แล้วรีสตาร์ทเซิร์ฟเวอร์</li>
              <li>ระบบจะบันทึก IP ของเซิร์ฟเวอร์ให้เองเมื่อปลั๊กอินเชื่อมต่อครั้งแรก</li>
            </ol>
          </Panel>
        </div>
      )}

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm ? CONFIRM_COPY[confirm].title : undefined}
        description={confirm ? CONFIRM_COPY[confirm].description : undefined}
        variant={confirm ? CONFIRM_COPY[confirm].variant : 'warning'}
        confirmText={confirm ? CONFIRM_COPY[confirm].confirmText : undefined}
        loading={pendingConfirm}
        onConfirm={runConfirm}
      />
    </div>
  );
}
