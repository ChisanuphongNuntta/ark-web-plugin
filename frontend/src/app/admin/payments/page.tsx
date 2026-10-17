'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import {
  Amount,
  Button,
  Dialog,
  Drawer,
  ErrorMessage,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableLoadingRows,
  TableRow,
  Textarea,
  formatAmount,
  useToast,
} from '@/components/ui';
import {
  ADMIN_QUERY_OPTIONS,
  AdminNoAccess,
  AdminToolbar,
  Baht,
  DetailList,
  DrawerSection,
  MonoId,
  adminKeys,
  approveSlip,
  errorText,
  formatDateTime,
  listPendingSlips,
  rejectSlip,
} from '@/components/admin';
import { usePermissions } from '@/hooks/usePermissions';
import type { SlipTopupSubmission } from '@/lib/contracts/types';

const REJECT_PRESETS = ['ไม่พบยอดเงินเข้าบัญชี', 'ยอดโอนไม่ตรงกับแพ็กเกจ', 'สลิปไม่ชัดหรือถูกแก้ไข', 'สลิปนี้เคยใช้แล้ว'];

export default function AdminPaymentsPage() {
  const { canManageOrders } = usePermissions();
  if (!canManageOrders) return <AdminNoAccess />;
  return <PaymentsScreen />;
}

function PaymentsScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const slips = useQuery({ queryKey: adminKeys.pendingSlips, queryFn: listPendingSlips, ...ADMIN_QUERY_OPTIONS });

  const [viewing, setViewing] = React.useState<SlipTopupSubmission | null>(null);
  const [approving, setApproving] = React.useState<SlipTopupSubmission | null>(null);
  const [rejecting, setRejecting] = React.useState<SlipTopupSubmission | null>(null);
  const [notes, setNotes] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [reasonError, setReasonError] = React.useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.pendingSlips });
    void queryClient.invalidateQueries({ queryKey: adminKeys.stats });
  };

  const approve = useMutation({
    mutationFn: (slip: SlipTopupSubmission) => approveSlip(slip.id, notes.trim() || undefined),
    onSuccess: (res, slip) => {
      if (res.alreadyApproved) {
        toast.info('สลิปนี้อนุมัติไปแล้ว', 'ระบบไม่เติม IC ซ้ำ');
      } else {
        toast.success('อนุมัติแล้ว', `เติม ${formatAmount(res.creditedPoints ?? slip.pointsToCredit)} IC ให้ ${slip.userName}`);
      }
      setApproving(null);
      setViewing(null);
      setNotes('');
      refresh();
    },
    onError: (err) => toast.error('อนุมัติไม่สำเร็จ', errorText(err)),
  });

  const reject = useMutation({
    mutationFn: (slip: SlipTopupSubmission) => rejectSlip(slip.id, reason.trim()),
    onSuccess: (res) => {
      toast.success(res.alreadyRejected ? 'สลิปนี้ถูกปฏิเสธไปแล้ว' : 'ปฏิเสธสลิปแล้ว', 'ผู้เล่นจะเห็นเหตุผลที่บันทึกไว้');
      setRejecting(null);
      setViewing(null);
      setReason('');
      refresh();
    },
    onError: (err) => toast.error('ปฏิเสธไม่สำเร็จ', errorText(err)),
  });

  const openReject = (slip: SlipTopupSubmission) => {
    setReason('');
    setReasonError(null);
    setRejecting(slip);
  };

  const confirmReject = () => {
    if (!rejecting) return;
    if (reason.trim().length < 3) {
      setReasonError('ระบุเหตุผลอย่างน้อย 3 ตัวอักษร ผู้เล่นจะเห็นข้อความนี้');
      return;
    }
    reject.mutate(rejecting);
  };

  const items = slips.data ?? [];

  return (
    <div>
      <PageHeader
        title="การชำระเงินและสลิป"
        description="ตรวจสลิปโอนเงินกับยอดเข้าบัญชีก่อนอนุมัติ ระบบจะเติม IC ให้ผู้เล่นทันทีที่อนุมัติ"
      />

      <AdminToolbar
        actions={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />}
            onClick={() => void slips.refetch()}
            loading={slips.isFetching && !slips.isLoading}
          >
            โหลดใหม่
          </Button>
        }
      >
        <p className="text-sm text-fg-muted">
          รอตรวจ <span className="font-mono text-fg">{slips.isLoading ? '—' : formatAmount(items.length)}</span> รายการ
        </p>
      </AdminToolbar>

      {slips.isError ? (
        <ErrorMessage message={errorText(slips.error, 'โหลดรายการสลิปไม่สำเร็จ')} onRetry={() => void slips.refetch()} />
      ) : (
        <TableContainer aria-busy={slips.isLoading || undefined}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>ผู้เล่น</TableHeaderCell>
                <TableHeaderCell>แพ็กเกจ</TableHeaderCell>
                <TableHeaderCell align="right">ยอดโอน</TableHeaderCell>
                <TableHeaderCell align="right">เครดิต</TableHeaderCell>
                <TableHeaderCell>ธนาคาร / อ้างอิง</TableHeaderCell>
                <TableHeaderCell>เวลาโอน</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">การทำงาน</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {slips.isLoading ? (
                <TableLoadingRows columns={7} />
              ) : !items.length ? (
                <TableEmptyRow colSpan={7} title="ไม่มีสลิปรอตรวจ" description="เมื่อผู้เล่นส่งสลิปโอนเงิน รายการจะแสดงที่นี่" />
              ) : (
                items.map((slip) => (
                  <TableRow key={slip.id}>
                    <TableCell className="max-w-[12rem]">
                      <span className="block truncate">{slip.userName}</span>
                      <MonoId value={slip.userId} className="text-xs text-fg-subtle" />
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate" muted>
                      {slip.packageName}
                    </TableCell>
                    <TableCell align="right">
                      <Baht value={slip.amountThb} />
                    </TableCell>
                    <TableCell align="right">
                      <Amount value={slip.pointsToCredit} size="sm" />
                    </TableCell>
                    <TableCell className="max-w-[12rem]">
                      <span className="block truncate text-fg-muted">{slip.transferBank}</span>
                      {slip.transferRef ? <span className="block truncate font-mono text-xs text-fg-subtle">{slip.transferRef}</span> : null}
                    </TableCell>
                    <TableCell muted className="whitespace-nowrap text-xs">
                      {formatDateTime(slip.transferredAt)}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="sm" variant="secondary" onClick={() => setViewing(slip)}>
                        ตรวจสลิป
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Slip detail */}
      <Drawer
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        size="lg"
        title="ตรวจสลิปโอนเงิน"
        description={viewing ? `${viewing.userName} · ${viewing.packageName}` : undefined}
        footer={
          viewing ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="danger" onClick={() => openReject(viewing)}>
                ปฏิเสธ
              </Button>
              <Button
                onClick={() => {
                  setNotes('');
                  setApproving(viewing);
                }}
              >
                อนุมัติและเติม IC
              </Button>
            </div>
          ) : null
        }
      >
        {viewing ? (
          <>
            <DrawerSection title="หลักฐานการโอน">
              <div className="overflow-hidden rounded-card border border-line bg-canvas">
                {/* Slip images may be data: URIs or external uploads — plain img is intentional. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={viewing.slipImageUrl}
                  alt={`สลิปโอนเงินของ ${viewing.userName}`}
                  className="mx-auto max-h-[60dvh] w-auto object-contain"
                />
              </div>
            </DrawerSection>
            <DrawerSection title="รายละเอียด">
              <DetailList
                items={[
                  { label: 'ยอดโอน', value: <Baht value={viewing.amountThb} /> },
                  { label: 'เครดิตที่จะเติม', value: <Amount value={viewing.pointsToCredit} size="sm" /> },
                  { label: 'ธนาคาร', value: viewing.transferBank },
                  { label: 'เลขอ้างอิง', value: viewing.transferRef, mono: true },
                  { label: 'เวลาโอน', value: formatDateTime(viewing.transferredAt) },
                  { label: 'ส่งเข้าระบบ', value: formatDateTime(viewing.createdAt) },
                  { label: 'ผู้เล่น', value: viewing.userName },
                  { label: 'User ID', value: viewing.userId, mono: true },
                  { label: 'รหัสรายการ', value: viewing.id, mono: true, wide: true },
                ]}
              />
            </DrawerSection>
          </>
        ) : null}
      </Drawer>

      {/* Approve confirmation */}
      <Dialog
        open={!!approving}
        onOpenChange={(o) => !o && setApproving(null)}
        title="อนุมัติสลิปนี้?"
        description={
          approving
            ? `ระบบจะเติม ${formatAmount(approving.pointsToCredit)} IC ให้ ${approving.userName} ทันที และยกเลิกไม่ได้จากหน้านี้`
            : undefined
        }
        onConfirm={() => approving && approve.mutate(approving)}
        confirmText="อนุมัติและเติม IC"
        loading={approve.isPending}
        variant="warning"
      >
        <Textarea
          label="บันทึกภายใน (ไม่บังคับ)"
          rows={2}
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          helperText="เช่น ตรวจยอดกับ statement แล้ว"
        />
      </Dialog>

      {/* Reject with reason */}
      <Dialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title="ปฏิเสธสลิปนี้?"
        description={rejecting ? `${rejecting.userName} จะไม่ได้รับ IC และจะเห็นเหตุผลด้านล่าง` : undefined}
        onConfirm={confirmReject}
        confirmText="ปฏิเสธสลิป"
        loading={reject.isPending}
        variant="danger"
        dismissible={!reason}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="เหตุผลที่ใช้บ่อย">
            {REJECT_PRESETS.map((preset) => (
              <Button
                key={preset}
                size="sm"
                variant={reason === preset ? 'secondary' : 'ghost'}
                aria-pressed={reason === preset}
                onClick={() => {
                  setReason(preset);
                  setReasonError(null);
                }}
              >
                {preset}
              </Button>
            ))}
          </div>
          <Textarea
            label="เหตุผล"
            required
            rows={3}
            maxLength={500}
            value={reason}
            error={reasonError}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError(null);
            }}
          />
        </div>
      </Dialog>
    </div>
  );
}
