'use client';

import * as React from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Amount,
  Button,
  Checkbox,
  Dialog,
  Drawer,
  ErrorMessage,
  Input,
  PageHeader,
  Pagination,
  Select,
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
  ADMIN_PAGE_SIZE,
  ADMIN_QUERY_OPTIONS,
  AdminNoAccess,
  AdminToolbar,
  CodeBlock,
  DetailList,
  DrawerSection,
  MonoId,
  ORDER_STATUS_OPTIONS,
  StatusBadge,
  adminKeys,
  errorText,
  formatDateTime,
  listAdminOrders,
  refundAdminOrder,
  type AdminOrderRow,
  type OrderQuery,
} from '@/components/admin';
import { usePermissions } from '@/hooks/usePermissions';

/** Statuses the backend accepts for an admin refund (display hint only; backend decides). */
const REFUNDABLE = new Set(['failed', 'delivered']);

export default function AdminOrdersPage() {
  const { canManageOrders } = usePermissions();
  if (!canManageOrders) return <AdminNoAccess />;
  return <OrdersScreen />;
}

function OrdersScreen() {
  const [query, setQuery] = React.useState<OrderQuery>({ page: 1, pageSize: ADMIN_PAGE_SIZE });
  const [selected, setSelected] = React.useState<AdminOrderRow | null>(null);
  const [refunding, setRefunding] = React.useState<AdminOrderRow | null>(null);

  const list = useQuery({
    queryKey: adminKeys.orders(query),
    queryFn: () => listAdminOrders(query),
    placeholderData: keepPreviousData,
    ...ADMIN_QUERY_OPTIONS,
  });
  const rows = list.data?.items ?? [];

  return (
    <div>
      <PageHeader title="คำสั่งซื้อ" description="คำสั่งซื้อทั้งหมดจากร้านค้า เรียงจากล่าสุด เปิดดูรายละเอียดการส่งของหรือคืนเงินได้จากแต่ละรายการ" />

      <AdminToolbar>
        <Select
          label="สถานะ"
          placeholder="ทุกสถานะ"
          options={ORDER_STATUS_OPTIONS}
          value={query.status ?? ''}
          onChange={(e) => setQuery((q) => ({ ...q, status: e.target.value || undefined, page: 1 }))}
          wrapperClassName="w-48"
        />
      </AdminToolbar>

      {list.isError ? (
        <ErrorMessage message={errorText(list.error, 'โหลดคำสั่งซื้อไม่สำเร็จ')} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <TableContainer aria-busy={list.isFetching || undefined}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>คำสั่งซื้อ</TableHeaderCell>
                  <TableHeaderCell>ผู้เล่น</TableHeaderCell>
                  <TableHeaderCell>สินค้า</TableHeaderCell>
                  <TableHeaderCell>เซิร์ฟเวอร์</TableHeaderCell>
                  <TableHeaderCell align="right">ยอด</TableHeaderCell>
                  <TableHeaderCell>สถานะ</TableHeaderCell>
                  <TableHeaderCell>สร้างเมื่อ</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {list.isLoading ? (
                  <TableLoadingRows columns={7} />
                ) : !rows.length ? (
                  <TableEmptyRow
                    colSpan={7}
                    title={query.status ? 'ไม่มีคำสั่งซื้อในสถานะนี้' : 'ยังไม่มีคำสั่งซื้อ'}
                    description={query.status ? 'ลองเลือกสถานะอื่น หรือดูทุกสถานะ' : 'คำสั่งซื้อจะแสดงที่นี่เมื่อผู้เล่นชำระเงิน'}
                  />
                ) : (
                  rows.map((o) => (
                    <TableRow
                      key={o.id}
                      interactive
                      selected={selected?.id === o.id}
                      onClick={() => setSelected(o)}
                    >
                      <TableCell>
                        <button
                          type="button"
                          className="rounded-[4px] text-left text-fg hover:text-accent"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(o);
                          }}
                          aria-label={`ดูคำสั่งซื้อ ${o.id}`}
                        >
                          <MonoId value={o.id} />
                        </button>
                      </TableCell>
                      <TableCell className="max-w-[10rem]">
                        <span className="block truncate">{o.user?.discordUsername ?? '—'}</span>
                        {o.user?.steamId ? <span className="block font-mono text-xs text-fg-subtle">{o.user.steamId}</span> : null}
                      </TableCell>
                      <TableCell className="max-w-[14rem]" muted>
                        <span className="block truncate">{o.product?.name ?? `#${o.productId}`}</span>
                        {o.quantity > 1 ? <span className="font-mono text-xs text-fg-subtle">× {o.quantity}</span> : null}
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate" muted>
                        {o.server?.name ?? `#${o.serverId}`}
                      </TableCell>
                      <TableCell align="right">
                        <Amount value={o.totalPrice} size="sm" />
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="order" status={o.status} />
                      </TableCell>
                      <TableCell muted className="whitespace-nowrap text-xs">
                        {formatDateTime(o.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <Pagination
            className="mt-4"
            page={query.page}
            pageSize={query.pageSize}
            total={list.data?.total ?? 0}
            onPageChange={(page) => setQuery((q) => ({ ...q, page }))}
          />
        </>
      )}

      <OrderDrawer order={selected} onClose={() => setSelected(null)} onRefund={(o) => setRefunding(o)} />
      <RefundDialog
        key={refunding?.id ?? 'none'}
        order={refunding}
        onClose={() => setRefunding(null)}
        onDone={() => {
          setRefunding(null);
          setSelected(null);
        }}
      />
    </div>
  );
}

function OrderDrawer({
  order,
  onClose,
  onRefund,
}: {
  order: AdminOrderRow | null;
  onClose: () => void;
  onRefund: (o: AdminOrderRow) => void;
}) {
  const refundable = !!order && REFUNDABLE.has(order.status);
  return (
    <Drawer
      open={!!order}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="รายละเอียดคำสั่งซื้อ"
      description={order ? <span className="font-mono">{order.id}</span> : undefined}
      footer={
        order ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-fg-muted">
              {refundable
                ? 'คืนเงินเข้ายอดที่คืนได้ของผู้เล่นผ่านบัญชีกระเป๋า'
                : order.status === 'refunded'
                  ? 'คืนเงินคำสั่งซื้อนี้แล้ว'
                  : 'คืนเงินได้เฉพาะคำสั่งซื้อที่ส่งไม่สำเร็จหรือส่งแล้ว'}
            </p>
            <Button variant="danger" disabled={!refundable} onClick={() => onRefund(order)}>
              คืนเงิน
            </Button>
          </div>
        ) : null
      }
    >
      {order ? (
        <>
          <DrawerSection title="สรุป">
            <DetailList
              items={[
                { label: 'สถานะ', value: <StatusBadge kind="order" status={order.status} /> },
                { label: 'ยอด', value: <Amount value={order.totalPrice} size="sm" /> },
                { label: 'สินค้า', value: order.product?.name ?? `#${order.productId}` },
                { label: 'จำนวน', value: order.quantity, mono: true },
                { label: 'ผู้เล่น', value: order.user?.discordUsername },
                { label: 'Steam ID', value: order.user?.steamId, mono: true },
                { label: 'เซิร์ฟเวอร์', value: order.server?.name ?? `#${order.serverId}` },
                { label: 'User ID', value: order.userId, mono: true },
              ]}
            />
          </DrawerSection>
          <DrawerSection title="ลำดับเวลา">
            <DetailList
              items={[
                { label: 'สร้างเมื่อ', value: formatDateTime(order.createdAt) },
                { label: 'ชำระเงิน', value: order.paidAt ? formatDateTime(order.paidAt) : null },
                { label: 'เข้าคิวส่งของ', value: order.queuedAt ? formatDateTime(order.queuedAt) : null },
                { label: 'ส่งสำเร็จ', value: order.deliveredAt ? formatDateTime(order.deliveredAt) : null },
                { label: 'คืนเงิน', value: order.refundedAt ? formatDateTime(order.refundedAt) : null },
                { label: 'อัปเดตล่าสุด', value: formatDateTime(order.updatedAt) },
              ]}
            />
          </DrawerSection>
          <DrawerSection title="การส่งของ">
            <DetailList
              items={[
                { label: 'จำนวนครั้งที่ส่ง', value: order.deliveryAttempts, mono: true },
                { label: 'Checkout session', value: order.checkoutSessionId, mono: true },
                {
                  label: 'ข้อผิดพลาดล่าสุด',
                  value: order.lastError ? <CodeBlock tone="danger">{order.lastError}</CodeBlock> : null,
                  wide: true,
                },
              ]}
            />
          </DrawerSection>
        </>
      ) : null}
    </Drawer>
  );
}

function RefundDialog({ order, onClose, onDone }: { order: AdminOrderRow | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = React.useState('');
  const [reclaimed, setReclaimed] = React.useState(false);
  const [receipt, setReceipt] = React.useState('');
  const [errors, setErrors] = React.useState<{ reclaimed?: string; receipt?: string }>({});
  const delivered = order?.status === 'delivered';

  const refund = useMutation({
    mutationFn: (o: AdminOrderRow) =>
      refundAdminOrder(
        o.id,
        o.status === 'delivered'
          ? { reason: reason.trim() || undefined, inventoryReclaimed: true, reclaimReceipt: receipt.trim() }
          : { reason: reason.trim() || undefined }
      ),
    onSuccess: (res, o) => {
      toast.success('คืนเงินแล้ว', `คืน ${formatAmount(res.refundedAmount ?? o.totalPrice)} IC ให้ผู้เล่น`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      void queryClient.invalidateQueries({ queryKey: adminKeys.stats });
      onDone();
    },
    onError: (err) => toast.error('คืนเงินไม่สำเร็จ', errorText(err)),
  });

  const confirm = () => {
    if (!order) return;
    if (delivered) {
      const next: typeof errors = {};
      if (!reclaimed) next.reclaimed = 'ต้องเก็บของคืนจากในเกมก่อนคืนเงินคำสั่งซื้อที่ส่งแล้ว';
      if (receipt.trim().length < 8) next.receipt = 'ใส่เลขอ้างอิงการเก็บคืนอย่างน้อย 8 ตัวอักษร';
      setErrors(next);
      if (next.reclaimed || next.receipt) return;
    }
    refund.mutate(order);
  };

  return (
    <Dialog
      open={!!order}
      onOpenChange={(o) => !o && onClose()}
      title="คืนเงินคำสั่งซื้อนี้?"
      description={
        order
          ? `ระบบจะคืน ${formatAmount(order.totalPrice)} IC เข้ายอดที่คืนได้ของ ${order.user?.discordUsername ?? 'ผู้เล่น'} และเปลี่ยนสถานะเป็นคืนเงินแล้ว ทำซ้ำไม่ได้`
          : undefined
      }
      onConfirm={confirm}
      confirmText="คืนเงิน"
      variant="danger"
      loading={refund.isPending}
      dismissible={!reason && !receipt}
    >
      <div className="flex flex-col gap-4">
        {delivered ? (
          <>
            <p className="text-sm text-fg-muted">
              คำสั่งซื้อนี้ส่งของเข้าเกมแล้ว ต้องเก็บของคืนจากตัวละครของผู้เล่นและบันทึกเลขอ้างอิงก่อนคืนเงิน
            </p>
            <Checkbox
              label="เก็บของคืนจากในเกมเรียบร้อยแล้ว"
              checked={reclaimed}
              onChange={(e) => {
                setReclaimed(e.target.checked);
                setErrors((x) => ({ ...x, reclaimed: undefined }));
              }}
            />
            {errors.reclaimed ? <p className="-mt-2 text-xs text-danger">{errors.reclaimed}</p> : null}
            <Input
              label="เลขอ้างอิงการเก็บคืน"
              required
              mono
              value={receipt}
              error={errors.receipt}
              onChange={(e) => {
                setReceipt(e.target.value);
                setErrors((x) => ({ ...x, receipt: undefined }));
              }}
              helperText="เช่น เลขตั๋วใน Discord หรือรหัสบันทึกจากเซิร์ฟเวอร์"
            />
          </>
        ) : null}
        <Textarea
          label="เหตุผล (ไม่บังคับ)"
          rows={2}
          maxLength={240}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          helperText="บันทึกไว้ในประวัติกระเป๋าของผู้เล่น"
        />
      </div>
    </Dialog>
  );
}
