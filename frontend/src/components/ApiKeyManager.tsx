'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, Eye, EyeOff, Key, RefreshCw, Trash2 } from 'lucide-react';
import { userApi, adminApi } from '@/lib/api';
import {
  AdminButton,
  AdminIconButton,
  AdminNotice,
  AdminPanel,
  ConfirmDialog,
  StatusBadge,
} from '@/components/admin';

interface ApiKeyManagerProps {
  apiKey?: string | null;
  apiKeyIp?: string | null;
  apiKeyCreatedAt?: string | null;
  apiKeyServerName?: string | null;
  apiKeyServerMap?: string | null;
  apiKeyLastUsed?: string | null;
  userId?: string;
}

type Message = { tone: 'success' | 'danger' | 'info'; text: string };
type PendingAction = 'regenerate' | 'resetIp' | 'delete' | null;

function apiErrorText(error: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const e = error as { response?: { data?: { error?: unknown; message?: unknown } } } | undefined;
  const fromApi = e?.response?.data?.error ?? e?.response?.data?.message;
  return typeof fromApi === 'string' && fromApi ? fromApi : fallback;
}

function formatThaiDate(value: string, dateStyle: 'short' | 'medium' = 'medium'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('th-TH', { dateStyle, timeStyle: 'short' });
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 6)}${'•'.repeat(16)}${key.slice(-6)}`;
}

/** Plugin API key card (Frozen admin kit). Used on /admin/system/api-key. */
export default function ApiKeyManager({
  apiKey,
  apiKeyIp,
  apiKeyCreatedAt,
  apiKeyServerName,
  apiKeyServerMap,
  apiKeyLastUsed,
  userId,
}: ApiKeyManagerProps) {
  const queryClient = useQueryClient();
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = (tone: Message['tone'], text: string) => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setMessage({ tone, text });
    messageTimer.current = setTimeout(() => setMessage(null), 5000);
  };

  const copyText = async (text: string, successText: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showMessage('success', successText);
    } catch {
      showMessage('danger', 'คัดลอกไม่สำเร็จ โปรดคัดลอกด้วยตนเอง');
    }
  };

  const generateMutation = useMutation({
    mutationFn: () => userApi.generateApiKey(),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      setShowKey(true);
      const newKey: unknown = response.data?.apiKey;
      if (typeof newKey === 'string' && newKey) {
        await copyText(newKey, 'สร้าง API key แล้ว และคัดลอกไปยังคลิปบอร์ดเรียบร้อย');
      } else {
        showMessage('success', 'สร้าง API key แล้ว');
      }
    },
  });

  const resetIpMutation = useMutation({
    mutationFn: () => userApi.resetIp(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      showMessage('success', 'รีเซ็ต IP แล้ว');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => userApi.deleteApiKey(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      setShowKey(false);
      showMessage('info', 'ลบ API key แล้ว');
    },
  });

  const downloadMutation = useMutation({
    mutationFn: (variables: { userId: string; serverId?: number }) =>
      adminApi.downloadPlugin(variables.userId, variables.serverId),
    onSuccess: (response) => {
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const contentDisposition: string | undefined = response.headers['content-disposition'];
      const match = contentDisposition?.match(/filename="(.+)"/);
      link.setAttribute('download', match?.[1] ?? 'HeartShop_Plugin.zip');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showMessage('success', 'เริ่มดาวน์โหลดปลั๊กอินแล้ว');
    },
    onError: (error: any) => {
      const data = error?.response?.data;
      if (data instanceof Blob) {
        data
          .text()
          .then((text) => {
            try {
              const parsed = JSON.parse(text);
              showMessage('danger', parsed.message || parsed.error || 'ดาวน์โหลดไม่สำเร็จ');
            } catch {
              showMessage('danger', 'ดาวน์โหลดไม่สำเร็จ');
            }
          })
          .catch(() => showMessage('danger', 'ดาวน์โหลดไม่สำเร็จ'));
      } else {
        showMessage('danger', apiErrorText(error, 'ดาวน์โหลดไม่สำเร็จ'));
      }
    },
  });

  const confirmAction = async () => {
    if (pendingAction === 'regenerate') await generateMutation.mutateAsync();
    else if (pendingAction === 'resetIp') await resetIpMutation.mutateAsync();
    else if (pendingAction === 'delete') await deleteMutation.mutateAsync();
  };

  const confirmCopy: Record<Exclude<PendingAction, null>, { title: string; confirmText: string; tone: 'danger' | 'default'; body: React.ReactNode }> = {
    regenerate: {
      title: 'สร้าง API key ใหม่?',
      confirmText: 'สร้างใหม่',
      tone: 'danger',
      body: (
        <ul className="list-inside list-disc space-y-1 text-sm text-iris-muted">
          <li>key เดิมจะใช้งานไม่ได้ทันที</li>
          <li>ปลั๊กอิน ARK จะหยุดทำงานจนกว่าจะใส่ key ใหม่</li>
          <li>IP ที่ลงทะเบียนไว้จะถูกรีเซ็ต</li>
        </ul>
      ),
    },
    resetIp: {
      title: 'รีเซ็ต IP ที่ลงทะเบียน?',
      confirmText: 'รีเซ็ต IP',
      tone: 'default',
      body: <p className="text-sm text-iris-muted">ปลั๊กอินจะลงทะเบียน IP ใหม่อัตโนมัติเมื่อเชื่อมต่อครั้งถัดไป</p>,
    },
    delete: {
      title: 'ลบ API key?',
      confirmText: 'ลบ key',
      tone: 'danger',
      body: (
        <p className="text-sm text-iris-muted">
          ปลั๊กอิน ARK จะใช้งานไม่ได้ทันที ต้องสร้าง key ใหม่และแก้ไขค่าในไฟล์ config ของเซิร์ฟเวอร์
        </p>
      ),
    },
  };
  const activeConfirm = pendingAction ? confirmCopy[pendingAction] : null;

  return (
    <div className="space-y-5">
      {message && (
        <AdminNotice tone={message.tone} onDismiss={() => setMessage(null)}>
          {message.text}
        </AdminNotice>
      )}

      {apiKey ? (
        <>
          <AdminPanel
            title="API key ของคุณ"
            description="ใช้เชื่อมต่อปลั๊กอิน ARK กับระบบร้านค้า"
            actions={
              <div className="flex flex-wrap gap-2">
                {userId && (
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    icon={<Download />}
                    loading={downloadMutation.isPending}
                    onClick={() => downloadMutation.mutate({ userId })}
                  >
                    ดาวน์โหลดปลั๊กอิน
                  </AdminButton>
                )}
                <AdminButton
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCw />}
                  loading={generateMutation.isPending}
                  onClick={() => setPendingAction('regenerate')}
                >
                  สร้าง key ใหม่
                </AdminButton>
              </div>
            }
          >
            <div className="flex items-center gap-2">
              <code className="input flex min-h-11 flex-1 items-center overflow-x-auto whitespace-nowrap font-mono text-sm text-iris-pearl">
                {showKey ? apiKey : maskKey(apiKey)}
              </code>
              <AdminIconButton
                aria-label={showKey ? 'ซ่อน API key' : 'แสดง API key'}
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? <EyeOff /> : <Eye />}
              </AdminIconButton>
              <AdminIconButton aria-label="คัดลอก API key" onClick={() => copyText(apiKey, 'คัดลอก API key แล้ว')}>
                <Copy />
              </AdminIconButton>
            </div>

            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="eyebrow">IP ที่ลงทะเบียน</dt>
                <dd className="mt-1.5 flex items-center gap-2">
                  {apiKeyIp ? (
                    <>
                      <span className="font-mono text-iris-pearl">{apiKeyIp}</span>
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        loading={resetIpMutation.isPending}
                        onClick={() => setPendingAction('resetIp')}
                      >
                        รีเซ็ต
                      </AdminButton>
                    </>
                  ) : (
                    <StatusBadge tone="neutral">รอปลั๊กอินเชื่อมต่อ</StatusBadge>
                  )}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">สร้างเมื่อ</dt>
                <dd className="mt-1.5 text-iris-pearl">{apiKeyCreatedAt ? formatThaiDate(apiKeyCreatedAt) : '—'}</dd>
              </div>
              <div>
                <dt className="eyebrow">ใช้งานล่าสุด</dt>
                <dd className="mt-1.5 text-iris-pearl">
                  {apiKeyLastUsed ? formatThaiDate(apiKeyLastUsed, 'short') : '—'}
                </dd>
              </div>
            </dl>
          </AdminPanel>

          {(apiKeyServerName || apiKeyServerMap) && (
            <AdminPanel title="เซิร์ฟเวอร์ที่เชื่อมต่อ" description="ข้อมูลล่าสุดที่ปลั๊กอินรายงาน">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="eyebrow">ชื่อเซิร์ฟเวอร์</dt>
                  <dd className="mt-1.5 text-iris-pearl">{apiKeyServerName || 'ไม่ทราบ'}</dd>
                </div>
                <div>
                  <dt className="eyebrow">แมพ</dt>
                  <dd className="mt-1.5 text-iris-pearl">{apiKeyServerMap || 'ไม่ทราบ'}</dd>
                </div>
              </dl>
            </AdminPanel>
          )}

          <AdminPanel title="วิธีใช้งาน">
            <ol className="list-inside list-decimal space-y-2 text-sm text-iris-muted marker:text-iris-cyan">
              <li>คัดลอก API key ด้านบน</li>
              <li>
                เปิดไฟล์ <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-iris-pearl">ark-plugin/config.json</code>
              </li>
              <li>
                วาง key ลงในช่อง <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-iris-pearl">&quot;ApiKey&quot;</code>
              </li>
              <li>บันทึกไฟล์แล้วรีสตาร์ทเซิร์ฟเวอร์ ARK</li>
              <li>IP จะถูกบันทึกอัตโนมัติเมื่อปลั๊กอินเชื่อมต่อครั้งแรก</li>
            </ol>
          </AdminPanel>

          <AdminPanel title="ลบ API key" description="ปลั๊กอินที่ใช้ key นี้จะหยุดทำงานทันที">
            <AdminButton
              variant="danger"
              size="sm"
              icon={<Trash2 />}
              loading={deleteMutation.isPending}
              onClick={() => setPendingAction('delete')}
            >
              ลบ API key
            </AdminButton>
          </AdminPanel>
        </>
      ) : (
        <AdminPanel>
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-iris-cyan">
              <Key className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-iris-pearl">ยังไม่มี API key</h3>
              <p className="mt-1 max-w-md text-sm text-iris-muted">สร้าง API key เพื่อเชื่อมต่อปลั๊กอิน ARK กับระบบร้านค้า</p>
            </div>
            <AdminButton
              icon={<Key />}
              loading={generateMutation.isPending}
              onClick={() =>
                generateMutation.mutate(undefined, {
                  onError: (error) => showMessage('danger', apiErrorText(error)),
                })
              }
            >
              สร้าง API key
            </AdminButton>
          </div>
        </AdminPanel>
      )}

      <ConfirmDialog
        open={activeConfirm !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={confirmAction}
        title={activeConfirm?.title ?? ''}
        confirmText={activeConfirm?.confirmText}
        tone={activeConfirm?.tone ?? 'danger'}
      >
        {activeConfirm?.body}
      </ConfirmDialog>
    </div>
  );
}
