'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronRight, KeyRound, ReceiptText, Server, Truck, Users } from 'lucide-react';
import {
  Amount,
  Card,
  ErrorMessage,
  PageHeader,
  Panel,
  Skeleton,
  Stat,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableLoadingRows,
  TableRow,
  buttonVariants,
  formatAmount,
} from '@/components/ui';
import {
  ADMIN_QUERY_OPTIONS,
  Baht,
  MonoId,
  StatusBadge,
  adminKeys,
  errorText,
  fetchDashboardStats,
  formatCount,
  formatDateTime,
  listPendingSlips,
} from '@/components/admin';
import { usePermissions } from '@/hooks/usePermissions';
import { serverDirectoryApi } from '@/lib/contracts/console';
import type { ServerSummary } from '@/lib/contracts/types';
import { cn } from '@/lib/utils';

export default function AdminOverviewPage() {
  const { canManageOrders } = usePermissions();
  // /admin/stats and slips are admin|root; server admins get their own overview.
  if (!canManageOrders) return <ServerAdminOverview />;
  return <WebsiteOverview />;
}

/* ------------------------------------------------------------------------ */
/* admin | root                                                             */
/* ------------------------------------------------------------------------ */

function WebsiteOverview() {
  const stats = useQuery({ queryKey: adminKeys.stats, queryFn: fetchDashboardStats, ...ADMIN_QUERY_OPTIONS });
  const slips = useQuery({ queryKey: adminKeys.pendingSlips, queryFn: listPendingSlips, ...ADMIN_QUERY_OPTIONS });
  const servers = useQuery({
    queryKey: adminKeys.publicServers,
    queryFn: () => serverDirectoryApi.listServers(),
    ...ADMIN_QUERY_OPTIONS,
  });

  const s = stats.data?.stats;
  const loading = stats.isLoading;
  // Never show made-up zeros: a value only falls back to 0/empty after a successful load.
  const statsFailed = stats.isError && !s;
  const pendingSlips = s?.pendingSlips ?? slips.data?.length;
  const failedDeliveries = s?.failedDeliveries;
  const showCount = (n: number | undefined, failed: boolean) => (failed || n === undefined ? '—' : formatCount(n));
  // Servers that shop delivery targets right now but that have no recent heartbeat.
  const offlineDeliverable = (servers.data ?? []).filter((x) => x.deliverable && !x.online);
  const drained = (servers.data ?? []).filter((x) => x.drainMode === true);

  return (
    <div>
      <PageHeader
        title="ภาพรวม"
        description="งานที่ต้องจัดการและตัวเลขสำคัญของวันนี้ นับวันตามเวลาประเทศไทย"
      />

      {stats.isError ? (
        <ErrorMessage
          className="mb-6"
          message={errorText(stats.error, 'โหลดสถิติไม่สำเร็จ')}
          onRetry={() => void stats.refetch()}
        />
      ) : null}

      <section aria-label="ตัวเลขหลัก" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="สลิปรอตรวจ"
          value={showCount(pendingSlips, pendingSlips === undefined && (statsFailed || slips.isError))}
          unit="รายการ"
          href="/admin/payments"
          attention={(pendingSlips ?? 0) > 0}
          loading={loading && slips.isLoading}
        />
        <Stat
          label="ส่งของไม่สำเร็จ"
          value={showCount(failedDeliveries, statsFailed)}
          unit="งาน"
          hint="รวมงานที่หยุดลองแล้ว"
          href="/admin/deliveries?status=failed"
          attention={(failedDeliveries ?? 0) > 0}
          loading={loading}
        />
        <Stat
          label="เซิร์ฟเวอร์ออนไลน์"
          value={showCount(s?.onlineServers, statsFailed)}
          unit="เครื่อง"
          hint="มีสัญญาณภายใน 3 นาที"
          loading={loading}
        />
        <Stat
          label="ยอดสั่งซื้อวันนี้"
          value={statsFailed || s?.todayRevenue === undefined ? '—' : formatAmount(s.todayRevenue)}
          unit="IC"
          hint={s?.todayTopupThb !== undefined ? <>เติมเงินวันนี้ <Baht value={s.todayTopupThb} className="text-xs text-fg-muted" /></> : undefined}
          loading={loading}
        />
      </section>

      <section aria-label="ตัวเลขสะสม" className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MiniStat label="ผู้ใช้ทั้งหมด" value={formatCount(s?.totalUsers)} loading={loading} />
        <MiniStat label="คำสั่งซื้อทั้งหมด" value={formatCount(s?.totalOrders)} loading={loading} />
        <MiniStat label="คำสั่งซื้อรอดำเนินการ" value={formatCount(s?.pendingOrders)} loading={loading} />
        <MiniStat
          label="ยอดขายสะสม (ไม่รวมคืนเงิน)"
          value={s?.totalRevenue === undefined ? '—' : <Amount value={s.totalRevenue} unit="IC" size="sm" />}
          loading={loading}
        />
      </section>

      <div className="mt-10 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Panel title="ต้องจัดการ" description="รายการที่รอผู้ดูแลอยู่ตอนนี้" className="xl:col-span-2" flush>
          <ul className="divide-y divide-line">
            <AttentionRow
              icon={<ReceiptText className="h-4 w-4" strokeWidth={1.5} />}
              title="สลิปโอนเงินรอตรวจ"
              count={pendingSlips}
              loading={slips.isLoading && loading}
              href="/admin/payments"
              okText="ไม่มีสลิปค้าง"
            />
            <AttentionRow
              icon={<Truck className="h-4 w-4" strokeWidth={1.5} />}
              title="งานส่งของที่ล้มเหลว"
              count={failedDeliveries}
              loading={loading}
              href="/admin/deliveries?status=failed"
              okText="ส่งของปกติ"
            />
            <AttentionRow
              icon={<Server className="h-4 w-4" strokeWidth={1.5} />}
              title="เซิร์ฟเวอร์ที่รับของแต่ออฟไลน์"
              count={servers.isError ? undefined : offlineDeliverable.length}
              loading={servers.isLoading}
              okText="ทุกเครื่องที่รับของออนไลน์อยู่"
              detail={
                offlineDeliverable.length ? (
                  <ServerNames servers={offlineDeliverable} />
                ) : servers.isError ? (
                  <span className="text-danger">โหลดสถานะเซิร์ฟเวอร์ไม่สำเร็จ</span>
                ) : drained.length ? (
                  <span>พักรับของอยู่ {formatCount(drained.length)} เครื่อง</span>
                ) : null
              }
            />
          </ul>
        </Panel>

        <Panel
          title="คำสั่งซื้อล่าสุด"
          className="xl:col-span-3"
          flush
          actions={
            <Link href="/admin/orders" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              ดูทั้งหมด
            </Link>
          }
        >
          <TableContainer className="rounded-none border-0">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>คำสั่งซื้อ</TableHeaderCell>
                  <TableHeaderCell>ผู้เล่น</TableHeaderCell>
                  <TableHeaderCell>สินค้า</TableHeaderCell>
                  <TableHeaderCell align="right">ยอด</TableHeaderCell>
                  <TableHeaderCell>สถานะ</TableHeaderCell>
                  <TableHeaderCell>เวลา</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableLoadingRows columns={6} rows={5} />
                ) : !stats.data ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6">
                      <ErrorMessage
                        variant="inline"
                        message={errorText(stats.error, 'โหลดคำสั่งซื้อล่าสุดไม่สำเร็จ')}
                      />
                    </td>
                  </tr>
                ) : !stats.data.recentOrders.length ? (
                  <TableEmptyRow colSpan={6} title="ยังไม่มีคำสั่งซื้อ" description="คำสั่งซื้อใหม่จะแสดงที่นี่ทันทีที่ผู้เล่นชำระเงิน" />
                ) : (
                  stats.data.recentOrders.slice(0, 8).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <MonoId value={o.id} />
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate">{o.user?.discordUsername ?? '—'}</TableCell>
                      <TableCell className="max-w-[14rem] truncate" muted>
                        {o.product?.name ?? '—'}
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
        </Panel>
      </div>
    </div>
  );
}

function MiniStat({ label, value, loading }: { label: string; value: React.ReactNode; loading?: boolean }) {
  return (
    <div className="min-w-0 rounded-card border border-line px-4 py-3">
      <p className="truncate text-xs text-fg-muted">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-4 w-16" />
      ) : (
        <p className="mt-1 font-mono text-base tabular-nums text-fg">{value}</p>
      )}
    </div>
  );
}

function AttentionRow({
  icon,
  title,
  count,
  loading,
  href,
  okText,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  count: number | undefined;
  loading?: boolean;
  href?: string;
  okText: string;
  detail?: React.ReactNode;
}) {
  const needs = (count ?? 0) > 0;
  const body = (
    <>
      <span className={cn('mt-0.5 shrink-0', needs ? 'text-warning' : 'text-fg-subtle')} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-fg">{title}</span>
        <span className="mt-0.5 block text-xs text-fg-muted">
          {loading ? (
            'กำลังตรวจสอบ'
          ) : count === undefined ? (
            'ไม่มีข้อมูล'
          ) : needs ? (
            <span className="text-warning">{formatCount(count)} รายการรอจัดการ</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" strokeWidth={1.5} aria-hidden="true" />
              {okText}
            </span>
          )}
        </span>
        {detail ? <span className="mt-1.5 block text-xs text-fg-muted">{detail}</span> : null}
      </span>
      {href && needs ? <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.5} aria-hidden="true" /> : null}
    </>
  );
  return (
    <li>
      {href && needs ? (
        <Link href={href} className="flex items-start gap-3 px-5 py-4 transition-colors duration-fast hover:bg-surface-2 sm:px-6">
          {body}
        </Link>
      ) : (
        <div className="flex items-start gap-3 px-5 py-4 sm:px-6">{body}</div>
      )}
    </li>
  );
}

function ServerNames({ servers }: { servers: ServerSummary[] }) {
  const shown = servers.slice(0, 6);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <AlertTriangle className="h-3.5 w-3.5 text-warning" strokeWidth={1.5} aria-hidden="true" />
      {shown.map((x, i) => (
        <span key={x.id}>
          {x.displayName}
          {i < shown.length - 1 ? ',' : ''}
        </span>
      ))}
      {servers.length > shown.length ? <span>และอีก {formatCount(servers.length - shown.length)} เครื่อง</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* server_admin                                                             */
/* ------------------------------------------------------------------------ */

function ServerAdminOverview() {
  const links = [
    {
      href: '/admin/users',
      icon: <Users className="h-[18px] w-[18px]" strokeWidth={1.5} />,
      title: 'ผู้ใช้',
      description: 'ค้นหาผู้เล่น ดูยอด IC และปรับสถานะบัญชีในเซิร์ฟเวอร์ที่คุณดูแล',
    },
    {
      href: '/admin/api-keys',
      icon: <KeyRound className="h-[18px] w-[18px]" strokeWidth={1.5} />,
      title: 'คีย์ API',
      description: 'รีเซ็ต IP หรือยกเลิกคีย์ปลั๊กอินของผู้ใช้',
    },
  ];
  return (
    <div>
      <PageHeader title="ภาพรวม" description="เครื่องมือสำหรับผู้ดูแลเซิร์ฟเวอร์" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="block rounded-card">
            <Card interactive className="h-full">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-fg-subtle" aria-hidden="true">
                  {l.icon}
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-fg">{l.title}</h2>
                  <p className="mt-1 text-sm text-fg-muted">{l.description}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
