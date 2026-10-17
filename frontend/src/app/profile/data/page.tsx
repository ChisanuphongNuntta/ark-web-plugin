'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { pdpaApi } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorMessage,
  Input,
  PageHeader,
  Skeleton,
  Spinner,
  buttonVariants,
  useToast,
  type BadgeTone,
} from '@/components/ui';

const DELETE_PHRASE = 'DELETE_MY_DATA';

const REQUEST_TYPES = [
  { type: 'access', label: 'ขอเข้าถึงข้อมูล', description: 'ขอดูข้อมูลส่วนบุคคลทั้งหมดที่เราเก็บไว้' },
  { type: 'rectification', label: 'ขอแก้ไขข้อมูล', description: 'แจ้งแก้ข้อมูลที่ไม่ถูกต้อง' },
  { type: 'objection', label: 'คัดค้านการประมวลผล', description: 'ขอให้หยุดใช้ข้อมูลบางประเภท' },
];

const REQUEST_LABEL: Record<string, string> = {
  access: 'ขอเข้าถึงข้อมูล',
  rectification: 'ขอแก้ไขข้อมูล',
  deletion: 'ขอลบข้อมูล',
  portability: 'ขอโอนย้ายข้อมูล',
  objection: 'คัดค้านการประมวลผล',
};

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'รอดำเนินการ', tone: 'neutral' },
  processing: { label: 'กำลังดำเนินการ', tone: 'warning' },
  completed: { label: 'เสร็จแล้ว', tone: 'success' },
  rejected: { label: 'ปฏิเสธ', tone: 'danger' },
};

interface DataRequest {
  id: string | number;
  requestType: string;
  status: string;
  createdAt: string;
  response?: string | null;
}

export default function DataManagementPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const toast = useToast();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState('');

  const requests = useQuery({
    queryKey: ['my-data-requests'],
    queryFn: () => pdpaApi.getMyRequests().then((res) => res.data as { requests?: DataRequest[] }),
    enabled: Boolean(user),
  });

  const exportData = useMutation({
    mutationFn: () => pdpaApi.exportData(),
    onSuccess: (response) => {
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iris-my-data-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('เตรียมไฟล์ข้อมูลแล้ว');
    },
    onError: () => toast.error('ส่งออกข้อมูลไม่สำเร็จ', 'ลองอีกครั้งในอีกสักครู่'),
  });

  const createRequest = useMutation({
    mutationFn: ({ type, description }: { type: string; description?: string }) =>
      pdpaApi.createRequest(type, description),
    onSuccess: () => {
      void requests.refetch();
      toast.success('ส่งคำขอแล้ว', 'ทีมงานจะตอบกลับในประวัติคำขอด้านล่าง');
    },
    onError: () => toast.error('ส่งคำขอไม่สำเร็จ', 'ลองอีกครั้ง'),
  });

  const deleteAccount = useMutation({
    mutationFn: () => pdpaApi.deleteData(DELETE_PHRASE),
    onSuccess: () => {
      window.location.href = '/';
    },
    onError: () => toast.error('ลบบัญชีไม่สำเร็จ', 'ติดต่อทีมงานผ่าน Discord'),
  });

  if (!user) {
    return (
      <div className="page-shell pb-16">
        <PageHeader eyebrow="บัญชีของฉัน" title="ข้อมูลส่วนบุคคล" />
        {authLoading ? (
          <Spinner label="กำลังตรวจสอบการเข้าสู่ระบบ" />
        ) : (
          <EmptyState
            title="เข้าสู่ระบบเพื่อจัดการข้อมูล"
            description="ส่งออก ขอแก้ไข หรือขอลบข้อมูลส่วนบุคคลของคุณได้หลังเข้าสู่ระบบ"
            action={
              <Link href="/login" className={buttonVariants()}>
                เข้าสู่ระบบ
              </Link>
            }
          />
        )}
      </div>
    );
  }

  const history = requests.data?.requests ?? [];

  const closeDelete = () => {
    setDeleteOpen(false);
    setConfirmation('');
  };

  return (
    <div className="page-shell pb-16">
      <PageHeader
        eyebrow="บัญชีของฉัน"
        title="ข้อมูลส่วนบุคคล"
        description="สิทธิของคุณตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล ส่งออก ขอแก้ไข หรือขอลบข้อมูลได้จากหน้านี้"
      />

      <div className="max-w-3xl space-y-6">
        <Card padding="lg" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-fg">ดาวน์โหลดข้อมูลของคุณ</h2>
            <p className="mt-1 text-sm text-fg-muted">รับสำเนาข้อมูลส่วนบุคคลทั้งหมดเป็นไฟล์ JSON</p>
          </div>
          <Button
            onClick={() => exportData.mutate()}
            loading={exportData.isPending}
            leftIcon={<Download className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
          >
            ดาวน์โหลด
          </Button>
        </Card>

        <Card padding="none">
          <div className="border-b border-line px-6 py-4">
            <h2 className="text-base font-semibold text-fg">ส่งคำขอเกี่ยวกับข้อมูล</h2>
          </div>
          <ul>
            {REQUEST_TYPES.map((rt) => (
              <li
                key={rt.type}
                className="flex flex-col gap-3 border-b border-line px-6 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-fg">{rt.label}</p>
                  <p className="text-sm text-fg-muted">{rt.description}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={createRequest.isPending && createRequest.variables?.type === rt.type}
                  disabled={createRequest.isPending}
                  onClick={() => createRequest.mutate({ type: rt.type })}
                >
                  ส่งคำขอ
                </Button>
              </li>
            ))}
          </ul>
        </Card>

        <section aria-labelledby="request-history" className="space-y-3">
          <h2 id="request-history" className="text-lg font-semibold tracking-[-0.015em] text-fg">
            ประวัติคำขอ
          </h2>
          {requests.isLoading ? (
            <Card padding="md" aria-busy>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-2 h-3 w-24" />
            </Card>
          ) : requests.isError ? (
            <ErrorMessage message="โหลดประวัติคำขอไม่สำเร็จ" onRetry={() => void requests.refetch()} />
          ) : history.length === 0 ? (
            <EmptyState bare title="ยังไม่มีคำขอ" description="คำขอที่คุณส่งและคำตอบจากทีมงานจะแสดงที่นี่" />
          ) : (
            <Card padding="none">
              <ul>
                {history.map((req) => {
                  const status = STATUS_META[req.status] ?? { label: req.status, tone: 'neutral' as BadgeTone };
                  return (
                    <li key={req.id} className="space-y-1 border-b border-line px-6 py-4 last:border-b-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-fg">{REQUEST_LABEL[req.requestType] ?? req.requestType}</span>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                      <p className="text-xs text-fg-subtle">
                        {new Date(req.createdAt).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                      </p>
                      {req.response && <p className="text-sm text-fg-muted">{req.response}</p>}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </section>

        <Card padding="lg" className="border-danger/30">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-danger">ลบบัญชีและข้อมูล</h2>
              <p className="mt-1 max-w-xl text-sm text-fg-muted">
                ลบข้อมูลส่วนบุคคลถาวร รวมถึง Iris Coin ที่เหลือและประวัติการซื้อ กู้คืนไม่ได้
              </p>
            </div>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              ลบบัญชี
            </Button>
          </div>
        </Card>
      </div>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => !open && closeDelete()}
        title="ยืนยันการลบบัญชี"
        description="สิ่งที่จะเกิดขึ้นทันที และกู้คืนไม่ได้"
        footer={
          <>
            <Button variant="ghost" onClick={closeDelete}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              loading={deleteAccount.isPending}
              disabled={confirmation !== DELETE_PHRASE}
              onClick={() => deleteAccount.mutate()}
            >
              ลบบัญชีถาวร
            </Button>
          </>
        }
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
          <li>ลบข้อมูลส่วนบุคคลทั้งหมดของคุณ</li>
          <li>ลบ Iris Coin ที่เหลืออยู่ทั้งหมด</li>
          <li>บัญชีนี้จะเข้าสู่ระบบไม่ได้อีก</li>
        </ul>
        <Input
          wrapperClassName="mt-5"
          label={
            <>
              พิมพ์ <span className="font-mono">{DELETE_PHRASE}</span> เพื่อยืนยัน
            </>
          }
          mono
          autoComplete="off"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={DELETE_PHRASE}
        />
      </Dialog>
    </div>
  );
}
