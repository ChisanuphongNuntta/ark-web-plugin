'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import {
  Badge,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTrigger,
  buttonVariants,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { RANKING_CATEGORIES, SAMPLE_RANKINGS, type RankingCategory, type RankingEntry } from './sampleRankings';

/**
 * Sample rows are a development aid only (see sampleRankings.ts). Production
 * has no ranking endpoint yet, so it shows a clear "not open yet" state.
 */
const SHOW_SAMPLE = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_USE_FIXTURES === 'always';

const ALL_SERVERS = 'all';

export default function RankingPage() {
  const [category, setCategory] = React.useState<RankingCategory>('playtime');
  const [server, setServer] = React.useState(ALL_SERVERS);
  const [query, setQuery] = React.useState('');

  return (
    <div className="page-shell pb-20">
      <PageHeader
        eyebrow="ชุมชน"
        title="อันดับผู้เล่น"
        description="จัดอันดับจากสถิติที่เซิร์ฟเวอร์ IRIS ส่งเข้าระบบ แยกตามเวลาเล่น การฝึกสัตว์ และชนเผ่า"
        actions={SHOW_SAMPLE ? <Badge tone="warning" outline>ข้อมูลตัวอย่าง</Badge> : undefined}
      />

      <Tabs value={category} onValueChange={(v) => setCategory(v as RankingCategory)}>
        <TabsList aria-label="ประเภทอันดับ">
          {RANKING_CATEGORIES.map((c) => (
            <TabsTrigger key={c.value} value={c.value}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {RANKING_CATEGORIES.map((c) => (
          <TabsPanel key={c.value} value={c.value}>
            <p className="text-sm text-fg-muted">{c.description}</p>
            {SHOW_SAMPLE ? (
              <RankingTable
                rows={SAMPLE_RANKINGS[c.value]}
                scoreLabel={c.scoreLabel}
                unit={c.unit}
                isTribe={c.value === 'tribes'}
                server={server}
                onServerChange={setServer}
                query={query}
                onQueryChange={setQuery}
              />
            ) : (
              <EmptyState
                className="mt-6"
                title="ตารางอันดับยังไม่เปิด"
                description="ทีมงานกำลังเชื่อมสถิติจากเซิร์ฟเวอร์ เมื่อพร้อม อันดับจะแสดงที่นี่โดยอัตโนมัติ ระหว่างนี้ติดตามกิจกรรมได้ที่หน้ากิจกรรม"
                action={
                  <Link href="/event" className={buttonVariants({ variant: 'secondary' })}>
                    ดูกิจกรรม
                  </Link>
                }
              />
            )}
          </TabsPanel>
        ))}
      </Tabs>
    </div>
  );
}

function RankingTable({
  rows,
  scoreLabel,
  unit,
  isTribe,
  server,
  onServerChange,
  query,
  onQueryChange,
}: {
  rows: RankingEntry[];
  scoreLabel: string;
  unit: string;
  isTribe: boolean;
  server: string;
  onServerChange: (value: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const servers = Array.from(new Set(rows.map((r) => r.server))).sort();
  const needle = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (server === ALL_SERVERS || r.server === server) &&
      (!needle || r.name.toLowerCase().includes(needle) || (r.tribe ?? '').toLowerCase().includes(needle))
  );

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end">
        <Input
          label={isTribe ? 'ค้นหาชนเผ่า' : 'ค้นหาผู้เล่นหรือชนเผ่า'}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="พิมพ์ชื่อ"
          leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
          wrapperClassName="sm:w-72"
        />
        <Select
          label="แผนที่"
          value={server}
          onChange={(e) => onServerChange(e.target.value)}
          options={[{ value: ALL_SERVERS, label: 'ทุกแผนที่' }, ...servers.map((s) => ({ value: s, label: s }))]}
          wrapperClassName="sm:w-56"
        />
      </div>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-16">อันดับ</TableHeaderCell>
              <TableHeaderCell>{isTribe ? 'ชนเผ่า' : 'ผู้เล่น'}</TableHeaderCell>
              {!isTribe ? <TableHeaderCell className="hidden sm:table-cell">ชนเผ่า</TableHeaderCell> : null}
              <TableHeaderCell className="hidden md:table-cell">แผนที่</TableHeaderCell>
              <TableHeaderCell align="right">{scoreLabel}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.length === 0 ? (
              <TableEmptyRow colSpan={isTribe ? 4 : 5} title="ไม่พบรายชื่อที่ค้นหา" description="ลองพิมพ์ชื่อให้สั้นลง หรือเลือกทุกแผนที่" />
            ) : (
              visible.map((r) => (
                <TableRow key={`${r.rank}-${r.name}`}>
                  <TableCell mono className={cn(r.rank <= 3 ? 'text-accent' : 'text-fg-muted')}>
                    {String(r.rank).padStart(2, '0')}
                  </TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  {!isTribe ? (
                    <TableCell muted className="hidden sm:table-cell">
                      {r.tribe ?? '—'}
                    </TableCell>
                  ) : null}
                  <TableCell muted className="hidden md:table-cell">
                    {r.server}
                  </TableCell>
                  <TableCell align="right" mono>
                    {r.score.toLocaleString('th-TH')} <span className="text-xs text-fg-subtle">{unit}</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
