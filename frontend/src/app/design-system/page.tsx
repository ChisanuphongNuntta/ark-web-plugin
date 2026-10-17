'use client';

import * as React from 'react';
import { MoreHorizontal, Pencil, Plus, Search } from 'lucide-react';
import {
  Amount,
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Checkbox,
  CopyField,
  Dialog,
  Drawer,
  EmptyState,
  ErrorMessage,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  PageHeader,
  Pagination,
  Panel,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
  Stat,
  StatusDot,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTrigger,
  Textarea,
  useToast,
} from '@/components/ui';
import { SEASONS, SEASON_COPY, SeasonGlyph, SeasonOrnament, useSeason } from '@/components/season';
import type { Season } from '@/components/season';
import { GameModeBadge, ServerAddress } from '@/components/servers';

/**
 * Internal living style guide (noindex). Every sample here renders the real primitive,
 * so this page doubles as a visual regression check for the "IRIS Private" system.
 * Rules and usage notes: frontend/DESIGN.md.
 */

const SECTIONS = [
  { id: 'tokens', label: 'สีและโทเค็น' },
  { id: 'type', label: 'ตัวอักษร' },
  { id: 'season', label: 'ฤดูกาล' },
  { id: 'buttons', label: 'ปุ่ม' },
  { id: 'forms', label: 'ฟอร์ม' },
  { id: 'display', label: 'การแสดงผล' },
  { id: 'navigation', label: 'การนำทาง' },
  { id: 'overlays', label: 'หน้าต่างซ้อน' },
  { id: 'table', label: 'ตาราง' },
  { id: 'states', label: 'สถานะข้อมูล' },
  { id: 'servers', label: 'เซิร์ฟเวอร์' },
] as const;

const SURFACE_TOKENS = [
  { name: 'canvas', className: 'bg-canvas' },
  { name: 'surface', className: 'bg-surface' },
  { name: 'surface-2', className: 'bg-surface-2' },
  { name: 'surface-3', className: 'bg-surface-3' },
];

const TEXT_TOKENS = [
  { name: 'fg', className: 'text-fg' },
  { name: 'fg-muted', className: 'text-fg-muted' },
  { name: 'fg-subtle', className: 'text-fg-subtle' },
  { name: 'accent', className: 'text-accent' },
];

const ROLE_TOKENS = [
  { name: 'accent', className: 'bg-accent' },
  { name: 'seasonal', className: 'bg-seasonal' },
  { name: 'seasonal-2', className: 'bg-seasonal-2' },
  { name: 'success', className: 'bg-success' },
  { name: 'warning', className: 'bg-warning' },
  { name: 'danger', className: 'bg-danger' },
  { name: 'info', className: 'bg-info' },
];

const SAMPLE_ROWS = [
  { id: 'dlv_7f3a91c2', server: 'The Island', mode: 'PVE' as const, attempts: 1, status: 'completed' },
  { id: 'dlv_1b0e44d8', server: 'Ragnarok', mode: 'PVPVE' as const, attempts: 3, status: 'failed' },
  { id: 'dlv_c95d0a17', server: 'Genesis Part 2', mode: 'PVE_MOD' as const, attempts: 0, status: 'pending' },
];

const STATUS_TONE: Record<string, { tone: 'success' | 'danger' | 'neutral'; label: string }> = {
  completed: { tone: 'success', label: 'สำเร็จ' },
  failed: { tone: 'danger', label: 'ล้มเหลว' },
  pending: { tone: 'neutral', label: 'รอส่ง' },
};

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-line pt-10">
      <h2 id={`${id}-title`} className="text-lg font-semibold tracking-[-0.015em] text-fg">
        {title}
      </h2>
      {description && <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Specimen({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-2 font-mono text-xs text-fg-subtle">{label}</p>
      {children}
    </div>
  );
}

export default function DesignSystemPage() {
  const toast = useToast();
  const { season, setPreviewSeason, previewSeason } = useSeason();

  const [loading, setLoading] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [tab, setTab] = React.useState('wallet');
  const [mode, setMode] = React.useState<'PVE' | 'PVE_MOD' | 'PVPVE'>('PVE');
  const [page, setPage] = React.useState(1);
  const [switchOn, setSwitchOn] = React.useState(true);
  const [checked, setChecked] = React.useState(false);
  const [steamId, setSteamId] = React.useState('');

  // The preview is local-only; never leave it applied after leaving the guide.
  React.useEffect(() => () => setPreviewSeason(null), [setPreviewSeason]);

  const steamIdError = steamId && !/^\d{17}$/.test(steamId) ? 'Steam ID ต้องเป็นตัวเลข 17 หลัก' : undefined;

  const simulateSave = () => {
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      toast.success('บันทึกแล้ว');
    }, 700);
  };

  return (
    <div className="page-shell pb-24">
      <PageHeader
        eyebrow="ภายในทีม"
        title="IRIS Private — Style guide"
        description="ตัวอย่างจริงของ primitive ทุกตัวในระบบ ใช้ตรวจหน้าตาก่อนส่งงาน กฎทั้งหมดอยู่ใน frontend/DESIGN.md"
      />

      <nav aria-label="หมวดในหน้านี้" className="mb-10 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="text-fg-muted underline-offset-4 transition-colors duration-fast hover:text-fg hover:underline"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="space-y-14">
        <Section id="tokens" title="สีและโทเค็น" description="ทุกสีเป็นตัวแปร CSS เปลี่ยนตามฤดูกาลผ่าน html[data-season] ห้ามใช้สี Tailwind ตรง ๆ">
          <div className="grid gap-8 lg:grid-cols-3">
            <Specimen label="พื้นผิว">
              <div className="overflow-hidden rounded-card border border-line">
                {SURFACE_TOKENS.map((t) => (
                  <div key={t.name} className={`flex items-center justify-between px-4 py-3 ${t.className}`}>
                    <span className="text-sm text-fg">{t.name}</span>
                    <span className="font-mono text-xs text-fg-subtle">{t.className}</span>
                  </div>
                ))}
              </div>
            </Specimen>
            <Specimen label="ตัวอักษร">
              <Card padding="none" className="divide-y divide-line">
                {TEXT_TOKENS.map((t) => (
                  <div key={t.name} className="flex items-center justify-between px-4 py-3">
                    <span className={`text-sm ${t.className}`}>ข้อความตัวอย่าง Aa 123</span>
                    <span className="font-mono text-xs text-fg-subtle">{t.className}</span>
                  </div>
                ))}
              </Card>
            </Specimen>
            <Specimen label="บทบาท">
              <Card padding="none" className="divide-y divide-line">
                {ROLE_TOKENS.map((t) => (
                  <div key={t.name} className="flex items-center gap-3 px-4 py-2.5">
                    <span aria-hidden="true" className={`h-4 w-4 rounded-control border border-line ${t.className}`} />
                    <span className="text-sm text-fg">{t.name}</span>
                  </div>
                ))}
              </Card>
            </Specimen>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Specimen label="rounded-control · 6px">
              <div className="h-16 rounded-control border border-line-strong bg-surface" />
            </Specimen>
            <Specimen label="rounded-card · 10px">
              <div className="h-16 rounded-card border border-line bg-surface" />
            </Specimen>
            <Specimen label="rounded-dialog · 14px + shadow-overlay">
              <div className="h-16 rounded-dialog border border-line bg-surface shadow-overlay" />
            </Specimen>
          </div>
        </Section>

        <Section id="type" title="ตัวอักษร" description="IBM Plex Sans Thai ทุกข้อความ และ IBM Plex Mono สำหรับราคา รหัส และตัวเลข">
          <Card padding="lg" className="space-y-6">
            <Specimen label="h1 · text-3xl font-semibold">
              <p className="text-2xl font-semibold tracking-[-0.015em] text-fg sm:text-3xl">ของในเกม ส่งถึงเซิร์ฟเวอร์ที่คุณเลือก</p>
            </Specimen>
            <Specimen label="h2 · text-lg font-semibold">
              <p className="text-lg font-semibold text-fg">สินค้าแนะนำ</p>
            </Specimen>
            <Specimen label="body · text-base leading 1.7">
              <p className="max-w-2xl text-base text-fg-muted">
                เลือกสินค้า เลือกเซิร์ฟเวอร์ แล้วรับของในเกมได้ทันทีที่ระบบส่งสำเร็จ
                หากเซิร์ฟเวอร์ออฟไลน์ ของจะรอคิวและส่งให้อัตโนมัติเมื่อกลับมาออนไลน์
              </p>
            </Specimen>
            <Specimen label="eyebrow">
              <p className="eyebrow">คอลเลกชันฤดูหนาว</p>
            </Specimen>
            <Specimen label="mono · tabular-nums">
              <div className="flex flex-wrap items-baseline gap-6">
                <Amount value="12500" unit="IC" size="xl" />
                <Amount value="149.00" unit="IC" size="lg" tone="accent" />
                <span className="font-mono text-sm tabular-nums text-fg-muted">76561198000000000</span>
                <span className="font-mono text-sm tabular-nums text-fg-muted">203.0.113.10:7777</span>
              </div>
            </Specimen>
          </Card>
        </Section>

        <Section id="season" title="ฤดูกาล" description="ดูตัวอย่างธีมเฉพาะในเบราว์เซอร์นี้ ไม่บันทึกลงระบบ การตั้งค่าจริงอยู่ที่หน้าผู้ดูแล">
          <div className="flex flex-wrap items-center gap-4">
            <SegmentedControl<Season | 'live'>
              aria-label="ดูตัวอย่างฤดูกาล"
              value={previewSeason ?? 'live'}
              onChange={(v) => setPreviewSeason(v === 'live' ? null : v)}
              options={[
                { value: 'live', label: 'ตามระบบ' },
                ...SEASONS.map((s) => ({ value: s, label: SEASON_COPY[s].label })),
              ]}
            />
            <span className="text-sm text-fg-muted">
              กำลังแสดง: <span className="text-fg">{SEASON_COPY[season].label}</span>
            </span>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SEASONS.map((s) => (
              <Card key={s} padding="md" className="space-y-2">
                <div className="flex items-center gap-2 text-accent">
                  <SeasonGlyph season={s} size={14} />
                  <span className="text-sm font-medium text-fg">{SEASON_COPY[s].label}</span>
                </div>
                <p className="eyebrow">{SEASON_COPY[s].hero.eyebrow}</p>
                <p className="text-sm text-fg-muted">{SEASON_COPY[s].hero.title}</p>
              </Card>
            ))}
          </div>
          <SeasonOrnament className="my-10" />
        </Section>

        <Section id="buttons" title="ปุ่ม" description="หนึ่งหน้าจอมีปุ่มหลักได้ปุ่มเดียว ข้อความบนปุ่มเป็นคำกริยา">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={simulateSave} loading={loading}>
                บันทึก
              </Button>
              <Button variant="secondary">เพิ่มในตะกร้า</Button>
              <Button variant="ghost">ยกเลิก</Button>
              <Button variant="danger">ลบ</Button>
              <Button disabled>ปิดใช้งาน</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">เล็ก</Button>
              <Button size="md">กลาง</Button>
              <Button size="lg">ใหญ่</Button>
              <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}>
                เพิ่มเซิร์ฟเวอร์
              </Button>
              <IconButton aria-label="แก้ไข">
                <Pencil className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </IconButton>
              <IconButton aria-label="แก้ไข" variant="secondary">
                <Pencil className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </IconButton>
              <Spinner label="กำลังบันทึก" />
            </div>
          </div>
        </Section>

        <Section id="forms" title="ฟอร์ม" description="ป้ายกำกับ คำอธิบาย และข้อผิดพลาดเชื่อมกับ aria ให้อัตโนมัติ">
          <div className="grid gap-6 md:grid-cols-2">
            <Input
              label="Steam ID"
              mono
              inputMode="numeric"
              value={steamId}
              onChange={(e) => setSteamId(e.target.value)}
              helperText="ตัวเลข 17 หลัก ดูได้จากหน้าโปรไฟล์ Steam"
              error={steamIdError}
            />
            <Input
              label="ค้นหาสินค้า"
              placeholder="ชื่อสินค้าหรือไดโนเสาร์"
              leftIcon={<Search className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
            />
            <Select
              label="สถานะ"
              placeholder="ทั้งหมด"
              options={[
                { value: 'pending', label: 'รอส่ง' },
                { value: 'failed', label: 'ล้มเหลว' },
                { value: 'completed', label: 'สำเร็จ' },
              ]}
            />
            <Textarea label="หมายเหตุ" rows={3} placeholder="รายละเอียดเพิ่มเติม" />
            <Checkbox
              label="แสดงในรายชื่อเซิร์ฟเวอร์"
              description="ผู้เล่นจะเห็นเซิร์ฟเวอร์นี้ในหน้า /servers"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <Switch checked={switchOn} onCheckedChange={setSwitchOn} label="เปิดรับของ" description="ปิดเมื่อต้องการหยุดส่งของชั่วคราว" />
          </div>
        </Section>

        <Section id="display" title="การแสดงผล">
          <div className="space-y-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">รอส่ง</Badge>
              <Badge tone="accent">แนะนำ</Badge>
              <Badge tone="success">สำเร็จ</Badge>
              <Badge tone="warning">รอตรวจ</Badge>
              <Badge tone="danger">ล้มเหลว</Badge>
              <Badge tone="danger" outline>
                ส่งไม่ได้
              </Badge>
              <Badge tone="info">วางขาย</Badge>
              <Badge tone="seasonal">เทศกาล</Badge>
              <Badge tone="neutral" mono>
                x10
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <StatusDot status="online" label />
              <StatusDot status="offline" label />
              <StatusDot status="degraded" label />
              <StatusDot status="maintenance" label />
              <StatusDot status="unknown" label />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="สลิปรอตรวจ" value={4} />
              <Stat label="ส่งของไม่สำเร็จ" value={2} attention />
              <Stat label="เซิร์ฟเวอร์ออนไลน์" value={11} unit="/ 13" />
              <Stat label="รายได้วันนี้" value={<Amount value="18450" unit="IC" size="lg" />} loading={false} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card padding="none">
                <CardHeader divided title="Card" description="padding='none' กับ CardHeader / CardContent / CardFooter" />
                <CardContent>
                  <p className="text-sm text-fg-muted">การ์ดไม่มีเงา ใช้เส้นขอบบาง 1px เท่านั้น</p>
                </CardContent>
                <CardFooter>
                  <Button size="sm" variant="ghost">
                    ยกเลิก
                  </Button>
                  <Button size="sm">บันทึก</Button>
                </CardFooter>
              </Card>
              <Panel
                title="Panel"
                actions={
                  <Button size="sm" variant="ghost">
                    ดูทั้งหมด
                  </Button>
                }
              >
                <CopyField label="ที่อยู่เซิร์ฟเวอร์" value="203.0.113.10:7777" />
              </Panel>
            </div>
          </div>
        </Section>

        <Section id="navigation" title="การนำทาง" description="สถานะที่เลือกใช้สีตัวอักษรกับเส้นใต้ 1px ไม่ใช้กรอบเรืองแสง">
          <div className="space-y-8">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList aria-label="ส่วนของบัญชี">
                <TabsTrigger value="wallet">กระเป๋า</TabsTrigger>
                <TabsTrigger value="orders" count={3}>
                  คำสั่งซื้อ
                </TabsTrigger>
                <TabsTrigger value="security">ความปลอดภัย</TabsTrigger>
              </TabsList>
              <TabsPanel value="wallet" className="pt-4 text-sm text-fg-muted">
                ยอดคงเหลือและประวัติการเติม
              </TabsPanel>
              <TabsPanel value="orders" className="pt-4 text-sm text-fg-muted">
                คำสั่งซื้อทั้งหมดและสถานะการส่งของ
              </TabsPanel>
              <TabsPanel value="security" className="pt-4 text-sm text-fg-muted">
                อุปกรณ์ที่เข้าสู่ระบบและบัญชีที่เชื่อมไว้
              </TabsPanel>
            </Tabs>
            <SegmentedControl
              aria-label="โหมดเกม"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'PVE', label: 'PvE', count: 13 },
                { value: 'PVE_MOD', label: 'PvE Mod', count: 13 },
                { value: 'PVPVE', label: 'PvPvE', count: 26 },
              ]}
            />
            <Pagination page={page} pageSize={20} total={137} onPageChange={setPage} />
          </div>
        </Section>

        <Section id="overlays" title="หน้าต่างซ้อน" description="มี focus trap, ปิดด้วย Esc, ล็อกการเลื่อน และไม่มีเบลอพื้นหลัง">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              เปิด Dialog
            </Button>
            <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
              เปิดการยืนยัน
            </Button>
            <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
              เปิด Drawer
            </Button>
            <Menu
              label="การทำงาน"
              align="start"
              renderTrigger={(p) => (
                <IconButton {...p} variant="secondary" aria-label="การทำงานเพิ่มเติม">
                  <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </IconButton>
              )}
            >
              <MenuLabel>งานส่งของ</MenuLabel>
              <MenuItem onSelect={() => toast.info('เปิดรายละเอียด')}>ดูรายละเอียด</MenuItem>
              <MenuItem onSelect={() => toast.success('ส่งงานเข้าคิวอีกครั้งแล้ว')}>ส่งอีกครั้ง</MenuItem>
              <MenuSeparator />
              <MenuItem tone="danger" onSelect={() => toast.error('ตัวอย่างข้อผิดพลาด', 'ไม่มีการเปลี่ยนแปลงข้อมูลจริง')}>
                ยกเลิกงาน
              </MenuItem>
            </Menu>
            <Button variant="ghost" onClick={() => toast.success('บันทึกแล้ว', 'การตั้งค่าจะมีผลทันที')}>
              แสดง Toast
            </Button>
          </div>

          <Dialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            title="แก้ไขเซิร์ฟเวอร์"
            description="การเปลี่ยนแปลงมีผลกับหน้ารายชื่อเซิร์ฟเวอร์ทันที"
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  ยกเลิก
                </Button>
                <Button onClick={() => setDialogOpen(false)}>บันทึก</Button>
              </>
            }
          >
            <div className="space-y-4">
              <Input label="ชื่อที่แสดง" defaultValue="The Island" />
              <Input label="พอร์ต" mono defaultValue="7777" />
            </div>
          </Dialog>
          <Dialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            variant="warning"
            title="ส่งของอีกครั้ง?"
            description="ระบบจะส่งงานนี้เข้าคิวใหม่หนึ่งครั้ง ผู้เล่นจะได้รับของเมื่อเซิร์ฟเวอร์ออนไลน์"
            confirmText="ส่งอีกครั้ง"
            onConfirm={() => {
              setConfirmOpen(false);
              toast.success('ส่งงานเข้าคิวอีกครั้งแล้ว');
            }}
          />
          <Drawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            side="right"
            title="รายละเอียดงานส่งของ"
            description="dlv_1b0e44d8"
          >
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">เซิร์ฟเวอร์</dt>
                <dd className="text-fg">Ragnarok</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">ครั้งที่ลอง</dt>
                <dd className="font-mono tabular-nums text-fg">3</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">ข้อผิดพลาดล่าสุด</dt>
                <dd className="text-right text-danger">ผู้เล่นไม่ได้ออนไลน์</dd>
              </div>
            </dl>
          </Drawer>
        </Section>

        <Section id="table" title="ตาราง" description="ตารางในหน้าผู้ดูแล หนาแน่นแต่สงบ ตัวเลขและรหัสใช้ mono">
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>งาน</TableHeaderCell>
                  <TableHeaderCell>เซิร์ฟเวอร์</TableHeaderCell>
                  <TableHeaderCell>โหมด</TableHeaderCell>
                  <TableHeaderCell align="right">ครั้งที่ลอง</TableHeaderCell>
                  <TableHeaderCell>สถานะ</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {SAMPLE_ROWS.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell mono>{r.id}</TableCell>
                    <TableCell>{r.server}</TableCell>
                    <TableCell>
                      <GameModeBadge mode={r.mode} />
                    </TableCell>
                    <TableCell align="right" mono>
                      {r.attempts}
                    </TableCell>
                    <TableCell>
                      <Badge tone={STATUS_TONE[r.status].tone}>{STATUS_TONE[r.status].label}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>

        <Section id="states" title="สถานะข้อมูล" description="ทุกส่วนที่โหลดข้อมูลต้องมีสถานะกำลังโหลด ว่าง และผิดพลาด">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="space-y-3" aria-busy="true">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </Card>
            <EmptyState title="ยังไม่มีคำสั่งซื้อ" description="คำสั่งซื้อจะแสดงที่นี่หลังชำระเงิน" action={<Button size="sm" variant="secondary">เข้าร้านค้า</Button>} />
            <ErrorMessage message="โหลดรายการไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่" onRetry={() => toast.info('ลองโหลดใหม่')} />
          </div>
        </Section>

        <Section id="servers" title="เซิร์ฟเวอร์" description="ป้ายโหมดเกมและที่อยู่สำหรับเชื่อมต่อ ใช้ร่วมกันทั้งหน้าร้าน รายชื่อเซิร์ฟเวอร์ และหน้าผู้ดูแล">
          <div className="flex flex-wrap items-center gap-3">
            <GameModeBadge mode="PVE" />
            <GameModeBadge mode="PVE_MOD" />
            <GameModeBadge mode="PVPVE" />
          </div>
          <div className="mt-6 max-w-md">
            <ServerAddress host="203.0.113.10" port={7777} />
          </div>
        </Section>
      </div>
    </div>
  );
}
