'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Amount,
  Badge,
  Drawer,
  ErrorMessage,
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
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { AdminNoAccess, AdminToolbar, CodeBlock, DetailList, DrawerSection, formatCount, formatDateTime } from '@/components/admin';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';

/** GET /admin/promotions — read-only (backend/contracts/ui-redesign-2026-10.md). Money fields are decimal strings. */
interface Promotion {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  currency: string;
  discountType: string;
  discountValue: string;
  maxDiscount: string | null;
  minSubtotal: string;
  minQuantity: number;
  priority: number;
  stackable: boolean;
  exclusive: boolean;
  requiresVoucher: boolean;
  usageLimitTotal: number | null;
  usageLimitPerUser: number | null;
  redeemedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  scopes: unknown;
  createdAt: string;
  updatedAt: string;
  voucherCount: number;
  redemptionCount: number;
}

interface PromotionsResponse {
  items: Promotion[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 25;

const STATUS_LOOK: Record<string, { label: string; tone: BadgeTone; outline?: boolean }> = {
  active: { label: 'ใช้งาน', tone: 'success' },
  draft: { label: 'ร่าง', tone: 'neutral' },
  scheduled: { label: 'ตั้งเวลา', tone: 'info' },
  paused: { label: 'พักไว้', tone: 'warning' },
  ended: { label: 'จบแล้ว', tone: 'neutral', outline: true },
  expired: { label: 'หมดอายุ', tone: 'neutral', outline: true },
  archived: { label: 'เก็บถาวร', tone: 'neutral', outline: true },
};

const STATUS_FILTER = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'active', label: 'ใช้งาน' },
  { value: 'draft', label: 'ร่าง' },
  { value: 'paused', label: 'พักไว้' },
  { value: 'ended', label: 'จบแล้ว' },
];

function apiErrorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (data && typeof data.message === 'string' && data.message) return data.message;
  return fallback;
}

function normalize(data: unknown, page: number): PromotionsResponse {
  const d = (data ?? {}) as Partial<PromotionsResponse> & { data?: Partial<PromotionsResponse> };
  const src = Array.isArray(d.items) ? d : d.data ?? {};
  return {
    items: Array.isArray(src.items) ? src.items : [],
    total: typeof src.total === 'number' ? src.total : 0,
    page: typeof src.page === 'number' ? src.page : page,
    pageSize: typeof src.pageSize === 'number' ? src.pageSize : PAGE_SIZE,
  };
}

function StatusBadge({ status }: { status: string }) {
  const look = STATUS_LOOK[status] ?? { label: status, tone: 'neutral' as BadgeTone };
  return (
    <Badge tone={look.tone} outline={look.outline}>
      {look.label}
    </Badge>
  );
}

/** Display only — the backend evaluates every discount. */
function Discount({ p }: { p: Promotion }) {
  if (p.discountType === 'percentage') return <span className="font-mono tabular-nums text-fg">{p.discountValue}%</span>;
  if (p.discountType === 'percentage_bps')
    return (
      <span className="font-mono tabular-nums text-fg">
        {p.discountValue} <span className="text-xs text-fg-subtle">bps</span>
      </span>
    );
  if (p.discountType === 'fixed_amount') return <Amount value={p.discountValue} unit={p.currency} size="sm" />;
  return <span className="font-mono text-fg-muted">{p.discountValue}</span>;
}

function usage(p: Promotion): string {
  const used = formatCount(p.redeemedCount);
  return p.usageLimitTotal ? `${used} / ${formatCount(p.usageLimitTotal)}` : used;
}

function period(p: Promotion): string {
  if (!p.startsAt && !p.endsAt) return 'ไม่จำกัดเวลา';
  return `${p.startsAt ? formatDateTime(p.startsAt) : 'ตั้งแต่สร้าง'} – ${p.endsAt ? formatDateTime(p.endsAt) : 'ไม่มีกำหนด'}`;
}

export default function AdminPromotionsPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const { isAdmin } = usePermissions();
  const [status, setStatus] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Promotion | null>(null);

  const query = useQuery({
    queryKey: ['admin-promotions', status, page],
    queryFn: () =>
      api.get('/admin/promotions', { params: { status: status || undefined, page, pageSize: PAGE_SIZE } }).then((res) => normalize(res.data, page)),
    enabled: isAdmin,
    placeholderData: (prev) => prev,
  });

  const header = (
    <PageHeader
      eyebrow="การขาย"
      title="โปรโมชั่น"
      description="แคมเปญส่วนลดและโค้ดที่ระบบใช้คำนวณตอนชำระเงิน หน้านี้แสดงผลอย่างเดียว ยังไม่มี API สำหรับแก้ไข"
    />
  );

  if (authLoading || !user) {
    return (
      <div className="pb-16" aria-busy="true">
        {header}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="pb-16">
        {header}
        <AdminNoAccess description="หน้านี้สำหรับผู้ดูแลเว็บไซต์และผู้ดูแลสูงสุด" />
      </div>
    );
  }

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pageSize = query.data?.pageSize ?? PAGE_SIZE;

  return (
    <div className="min-w-0 pb-16">
      {header}

      <AdminToolbar>
        <Select
          label="สถานะ"
          hideLabel
          size="sm"
          wrapperClassName="w-full sm:w-44"
          value={status}
          options={STATUS_FILTER}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        />
      </AdminToolbar>

      {query.isError ? (
        <ErrorMessage
          title="โหลดโปรโมชั่นไม่สำเร็จ"
          message={apiErrorText(query.error, 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <TableContainer aria-busy={query.isFetching || undefined}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>แคมเปญ</TableHeaderCell>
                  <TableHeaderCell>สถานะ</TableHeaderCell>
                  <TableHeaderCell align="right">ส่วนลด</TableHeaderCell>
                  <TableHeaderCell align="right">ขั้นต่ำ</TableHeaderCell>
                  <TableHeaderCell align="right">ใช้ไปแล้ว</TableHeaderCell>
                  <TableHeaderCell>ช่วงเวลา</TableHeaderCell>
                  <TableHeaderCell align="right">ลำดับ</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.isLoading ? (
                  <TableLoadingRows columns={7} rows={5} />
                ) : rows.length === 0 ? (
                  <TableEmptyRow
                    colSpan={7}
                    title={status ? 'ไม่มีแคมเปญในสถานะนี้' : 'ยังไม่มีแคมเปญโปรโมชั่น'}
                    description="แคมเปญถูกสร้างจากฝั่งระบบหลังบ้าน"
                  />
                ) : (
                  rows.map((p) => (
                    <TableRow key={p.id} interactive onClick={() => setSelected(p)}>
                      <TableCell className="min-w-[220px]">
                        <button
                          type="button"
                          className="rounded-[4px] text-left hover:text-accent"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(p);
                          }}
                          aria-label={`ดูแคมเปญ ${p.name}`}
                        >
                          <span className="block font-medium text-fg">{p.name}</span>
                        </button>
                        <p className="mt-0.5 font-mono text-xs text-fg-subtle">{p.code}</p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell align="right">
                        <Discount p={p} />
                      </TableCell>
                      <TableCell align="right">
                        {p.minSubtotal && p.minSubtotal !== '0' ? <Amount value={p.minSubtotal} unit={p.currency} size="sm" tone="muted" /> : <span className="text-fg-subtle">—</span>}
                      </TableCell>
                      <TableCell align="right" mono muted>
                        {usage(p)}
                      </TableCell>
                      <TableCell muted className="whitespace-nowrap text-xs">
                        {period(p)}
                      </TableCell>
                      <TableCell align="right" mono muted>
                        {p.priority}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {total > pageSize ? <Pagination className="mt-4" page={page} pageSize={pageSize} total={total} onPageChange={setPage} /> : null}
        </>
      )}

      <Drawer
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.name}
        description={selected ? <span className="font-mono">{selected.code}</span> : undefined}
        size="md"
      >
        {selected ? (
          <>
            <DrawerSection title="เงื่อนไข">
              <DetailList
                items={[
                  { label: 'สถานะ', value: <StatusBadge status={selected.status} /> },
                  { label: 'ส่วนลด', value: <Discount p={selected} /> },
                  { label: 'ส่วนลดสูงสุด', value: selected.maxDiscount ? <Amount value={selected.maxDiscount} unit={selected.currency} size="sm" /> : null },
                  { label: 'ยอดขั้นต่ำ', value: <Amount value={selected.minSubtotal} unit={selected.currency} size="sm" /> },
                  { label: 'จำนวนชิ้นขั้นต่ำ', value: selected.minQuantity || null, mono: true },
                  { label: 'ลำดับการใช้', value: selected.priority, mono: true },
                  { label: 'ใช้ร่วมกับโปรอื่น', value: selected.stackable ? 'ได้' : 'ไม่ได้' },
                  { label: 'ใช้เดี่ยวเท่านั้น', value: selected.exclusive ? 'ใช่' : 'ไม่' },
                  { label: 'ต้องใช้โค้ด', value: selected.requiresVoucher ? 'ใช่' : 'ไม่' },
                  { label: 'คำอธิบาย', value: selected.description, wide: true },
                ]}
              />
            </DrawerSection>
            <DrawerSection title="การใช้งาน">
              <DetailList
                items={[
                  { label: 'ใช้ไปแล้ว', value: usage(selected), mono: true },
                  { label: 'จำกัดต่อผู้ใช้', value: selected.usageLimitPerUser ?? 'ไม่จำกัด', mono: !!selected.usageLimitPerUser },
                  { label: 'จำนวนโค้ด', value: formatCount(selected.voucherCount), mono: true },
                  { label: 'รายการที่ใช้ส่วนลด', value: formatCount(selected.redemptionCount), mono: true },
                  { label: 'เริ่ม', value: formatDateTime(selected.startsAt), mono: true },
                  { label: 'สิ้นสุด', value: formatDateTime(selected.endsAt), mono: true },
                ]}
              />
            </DrawerSection>
            {selected.scopes ? (
              <DrawerSection title="ขอบเขตสินค้า">
                <CodeBlock>{JSON.stringify(selected.scopes, null, 2)}</CodeBlock>
              </DrawerSection>
            ) : null}
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
