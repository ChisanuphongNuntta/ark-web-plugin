'use client';

import * as React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import {
  Amount,
  Drawer,
  ErrorMessage,
  PageHeader,
  Pagination,
  SegmentedControl,
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
import {
  ADMIN_PAGE_SIZE,
  ADMIN_QUERY_OPTIONS,
  AdminNoAccess,
  AdminToolbar,
  DetailList,
  DrawerSection,
  LISTING_STATUS_OPTIONS,
  MonoId,
  StatusBadge,
  adminKeys,
  errorText,
  formatDateTime,
  type MarketRowFull,
} from '@/components/admin';
import { usePermissions } from '@/hooks/usePermissions';
import { adminConsoleApi } from '@/lib/contracts/console';
import type { MarketListingStatus } from '@/lib/contracts/types';

type StatusFilter = 'all' | MarketListingStatus;

const GENDER_LABEL: Record<string, string> = { Male: 'ผู้', Female: 'เมีย', male: 'ผู้', female: 'เมีย' };

export default function AdminMarketPage() {
  const { canViewOperations } = usePermissions();
  if (!canViewOperations) return <AdminNoAccess />;
  return <MarketScreen />;
}

function MarketScreen() {
  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<MarketRowFull | null>(null);

  const query = { status: status === 'all' ? undefined : status, page, pageSize: ADMIN_PAGE_SIZE };
  const list = useQuery({
    queryKey: adminKeys.market(query),
    queryFn: () => adminConsoleApi.listMarketListings(query),
    placeholderData: keepPreviousData,
    ...ADMIN_QUERY_OPTIONS,
  });
  const rows = (list.data?.items ?? []) as MarketRowFull[];

  return (
    <div>
      <PageHeader
        title="ตลาด P2P"
        description="รายการขายสัตว์ระหว่างผู้เล่น ดูสถานะการขาย มัดจำ และการส่งของ"
      />

      <div className="mb-6 flex items-start gap-3 rounded-card border border-line bg-surface px-4 py-3 text-sm text-fg-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" strokeWidth={1.5} aria-hidden="true" />
        <p>
          หน้านี้ดูได้อย่างเดียว ผู้ดูแลยังยกเลิกรายการแทนผู้ขายไม่ได้ เพราะระบบยังไม่มีขั้นตอนยกเลิกที่คืนเงินมัดจำอย่างปลอดภัย
        </p>
      </div>

      <AdminToolbar>
        <SegmentedControl<StatusFilter>
          aria-label="สถานะรายการ"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[{ value: 'all', label: 'ทั้งหมด' }, ...LISTING_STATUS_OPTIONS.map((o) => ({ value: o.value as MarketListingStatus, label: o.label }))]}
        />
      </AdminToolbar>

      {list.isError ? (
        <ErrorMessage message={errorText(list.error, 'โหลดรายการตลาดไม่สำเร็จ')} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <TableContainer aria-busy={list.isFetching || undefined}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>สัตว์</TableHeaderCell>
                  <TableHeaderCell align="right">เลเวล</TableHeaderCell>
                  <TableHeaderCell align="right">ราคา</TableHeaderCell>
                  <TableHeaderCell>ผู้ขาย</TableHeaderCell>
                  <TableHeaderCell>ผู้ซื้อ</TableHeaderCell>
                  <TableHeaderCell>สถานะ</TableHeaderCell>
                  <TableHeaderCell>ลงขายเมื่อ</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {list.isLoading ? (
                  <TableLoadingRows columns={7} />
                ) : !rows.length ? (
                  <TableEmptyRow
                    colSpan={7}
                    title={status === 'all' ? 'ยังไม่มีรายการในตลาด' : 'ไม่มีรายการในสถานะนี้'}
                    description="รายการจะแสดงที่นี่เมื่อผู้เล่นลงขายสัตว์จากในเกม"
                  />
                ) : (
                  rows.map((l) => (
                    <TableRow key={l.id} interactive selected={selected?.id === l.id} onClick={() => setSelected(l)}>
                      <TableCell className="max-w-[14rem]">
                        <button
                          type="button"
                          className="rounded-[4px] text-left hover:text-accent block max-w-full text-fg"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(l);
                          }}
                          aria-label={`ดูรายการ ${l.species}`}
                        >
                          <span className="block truncate">{l.species}</span>
                        </button>
                        {l.dinoName ? <span className="block truncate text-xs text-fg-subtle">{l.dinoName}</span> : null}
                      </TableCell>
                      <TableCell align="right" mono>
                        {l.level}
                      </TableCell>
                      <TableCell align="right">
                        <Amount value={l.price} size="sm" />
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate">{l.seller?.discordUsername ?? (l.seller ? <MonoId value={l.seller.id} /> : '—')}</TableCell>
                      <TableCell className="max-w-[10rem] truncate" muted>
                        {l.buyer?.discordUsername ?? (l.buyer ? <MonoId value={l.buyer.id} /> : '—')}
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="listing" status={l.status} />
                      </TableCell>
                      <TableCell muted className="whitespace-nowrap text-xs">
                        {formatDateTime(l.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <Pagination className="mt-4" page={page} pageSize={ADMIN_PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
        </>
      )}

      <Drawer
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        size="lg"
        title={selected ? `${selected.species}${selected.dinoName ? ` · ${selected.dinoName}` : ''}` : 'รายละเอียดรายการ'}
        description={selected ? <span className="font-mono">{selected.id}</span> : undefined}
      >
        {selected ? (
          <>
            <DrawerSection title="สัตว์">
              <DetailList
                items={[
                  { label: 'สถานะ', value: <StatusBadge kind="listing" status={selected.status} /> },
                  { label: 'ราคา', value: <Amount value={selected.price} size="sm" /> },
                  { label: 'สายพันธุ์', value: selected.species },
                  { label: 'ชื่อ', value: selected.dinoName },
                  { label: 'เลเวล', value: selected.level, mono: true },
                  { label: 'เพศ', value: GENDER_LABEL[selected.gender] ?? selected.gender },
                ]}
              />
            </DrawerSection>
            <DrawerSection title="ผู้ซื้อและผู้ขาย">
              <DetailList
                items={[
                  { label: 'ผู้ขาย', value: selected.seller?.discordUsername },
                  { label: 'Steam ID ผู้ขาย', value: selected.seller?.steamId, mono: true },
                  { label: 'User ID ผู้ขาย', value: selected.seller?.id, mono: true, wide: true },
                  { label: 'ผู้ซื้อ', value: selected.buyer?.discordUsername },
                  { label: 'Steam ID ผู้ซื้อ', value: selected.buyer?.steamId, mono: true },
                  { label: 'User ID ผู้ซื้อ', value: selected.buyer?.id, mono: true, wide: true },
                ]}
              />
            </DrawerSection>
            <DrawerSection title="การส่งและเวลา">
              <DetailList
                items={[
                  { label: 'สถานะการส่ง', value: selected.deliveryStatus, mono: true },
                  { label: 'เซิร์ฟเวอร์ต้นทาง', value: selected.originServerId ? `#${selected.originServerId}` : null, mono: true },
                  { label: 'เซิร์ฟเวอร์ปลายทาง', value: selected.deliveryServerId ? `#${selected.deliveryServerId}` : null, mono: true },
                  { label: 'ลงขาย', value: formatDateTime(selected.createdAt) },
                  { label: 'ขายได้', value: selected.soldAt ? formatDateTime(selected.soldAt) : null },
                  { label: 'ส่งสำเร็จ', value: selected.deliveredAt ? formatDateTime(selected.deliveredAt) : null },
                  { label: 'หมดอายุ', value: selected.expiresAt ? formatDateTime(selected.expiresAt) : null },
                ]}
              />
            </DrawerSection>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
