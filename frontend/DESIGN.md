# IRIS Private — Frontend Design Brief

The brief for every page team. Restrained, premium and editorial: it should read like a well-made
product, not a template. When in doubt, take something away.

- Tokens: `tailwind.config.ts` + `src/app/globals.css`
- Primitives: `src/components/ui` (import from `@/components/ui`)
- Seasons: `src/components/season` (import from `@/components/season`)
- Servers: `src/components/servers` (import from `@/components/servers`)
- Data: `src/lib/contracts/console.ts` (typed clients) + `src/lib/contracts/types.ts`

---

## 1. Rules that are never broken

**Banned everywhere** (the review will reject the page):

| Banned | Use instead |
|---|---|
| lucide `Sparkles`, `Wand*`, `Stars` or any decorative icon | No icon, or a functional icon (16–18px, `strokeWidth={1.5}`) |
| Glow shadows `shadow-[0_0_…]`, neon, `drop-shadow` glows | Hairline border `border-line` |
| Gradient text (`bg-clip-text`), animated gradients, aurora/prism backgrounds | Solid `text-fg` / `text-accent` |
| `animate-*` loops: pulse, shimmer, float, bounce, scan, border-glow, spin (except loaders) | Static UI; 120–180ms colour/opacity/border transitions only |
| Snow or any particle overlay | Static seasonal ribbon / ornament (section 4) |
| Glassmorphism: `backdrop-blur*`, translucent card stacks | Solid `bg-surface` / `bg-surface-2` |
| `hover:-translate-y-*`, `hover:scale-*`, `active:scale-*` | `hover:border-line-strong` or `hover:bg-surface-2` |
| Emoji in UI chrome (nav, buttons, headings, badges) | Words |
| Hard-coded Tailwind hues (`emerald-*`, `cyan-*`, `amber-*`, `rose-*`, `sky-*`, `slate-*` …) or hex in classes | Semantic tokens (section 2) |
| Rainbow / multi-accent palettes | One accent per season + status colours |
| Marketing fluff: "10/10", "supreme", "ultimate", "AAA", "strategic directives", "magical" | Short, specific Thai (section 9) |
| Pill-shaped active nav with glow | Text colour + 1px accent underline |
| `framer-motion` entrances on page content | Nothing — content is just there |

Grep guard before you hand off (must print nothing for your files):

```bash
grep -nE "Sparkles|Wand|backdrop-blur|shadow-\[0_0|bg-clip-text|animate-(pulse|bounce|ping|float|shimmer)|hover:-translate|hover:scale|(emerald|cyan|amber|rose|sky|teal|slate|violet|purple)-[0-9]|iris-|ark-|font-display|font-serif" <your files>
```

---

## 2. Tokens

Every colour is a CSS variable (RGB triplet) on `:root`, re-themed by `<html data-season="…">`.
Components use **only** these Tailwind names (alpha works: `bg-accent/10`, `border-danger/40`):

| Token | Use | default value |
|---|---|---|
| `canvas` | page background, input fields | `#0B0C0E` |
| `surface` | cards, panels, header, dialogs | `#121316` |
| `surface-2` | nested blocks, hover/selected fills, table head | `#18191D` |
| `surface-3` | pressed fills (rare) | `#1F2025` |
| `line` | all hairlines (white @ 8%) | — |
| `line-strong` | control borders, hover borders (white @ 16%) | — |
| `fg` | primary text | `#ECE8E1` |
| `fg-muted` | secondary text, inactive nav | `#98948C` |
| `fg-subtle` | meta text, placeholders, units | `#88847C` |
| `accent` / `accent-hover` | primary button, active marker, links, eyebrow | champagne `#C8A96A` |
| `on-accent` | text on accent | `#14110A` |
| `seasonal` / `seasonal-2` | **only** small seasonal marks (ribbon line, ornament, badge) | = accent |
| `success` `warning` `danger` `info` | status only, usually as `text-*` or `bg-*/10` + `border-*/25` | muted, never neon |

Season palettes (UI stays dark in all of them):

| Season | canvas / surface / surface-2 | fg | accent | seasonal / seasonal-2 |
|---|---|---|---|---|
| default | `#0B0C0E` `#121316` `#18191D` | `#ECE8E1` | champagne `#C8A96A` | champagne |
| winter | `#0A0E12` `#10161C` `#161E26` | `#E7EDF1` | ice `#A9D3E3` | champagne / ice |
| christmas | `#0C0E0C` `#131613` `#1A1E1A` | `#EEE9DF` | gold `#C9A96A` | crimson `#9E2B2B` / pine `#2E4F3E` |
| easter | `#0E0D10` `#151419` `#1C1A21` | `#EEEAF0` | lilac `#C6B6E6` | sage `#A9BFA0` / lilac |

Crimson and pine are **marks only** — never fills for buttons, cards or text blocks.

**Typography** — IBM Plex Sans Thai (400/500/600) for everything; IBM Plex Mono (`font-mono`) for
prices, amounts, IPs/ports, IDs, counts, codes — always tabular. Headings `font-semibold`,
`tracking-[-0.015em]`. Body `text-sm`/`text-base`, line-height 1.7 (set in the scale). No serif, no
`font-display`/`font-serif` (removed), no `font-black`/`font-extrabold`, no UPPERCASE Thai.

| Role | Classes |
|---|---|
| Page title (h1) | `text-2xl sm:text-3xl font-semibold` (use `PageHeader`) |
| Section title (h2) | `text-lg font-semibold` |
| Card title (h3) | `text-base font-semibold` |
| Body | `text-sm text-fg` / `text-fg-muted` |
| Meta / label | `text-xs text-fg-muted` or `text-fg-subtle` |
| Eyebrow | `.eyebrow` (12px, accent, 0.08em tracking) |
| Numbers | `font-mono tabular-nums` (or `<Amount/>`) |

**Shape** — `rounded-control` 6px (buttons, inputs, badges), `rounded-card` 10px (cards, panels,
tables), `rounded-dialog` 14px (dialogs, bottom sheets). 1px hairlines. **No shadows on cards**;
`shadow-overlay` only on floating layers (menu, dialog, toast).

**Spacing & layout** — 8px grid (Tailwind 2/4/6/8/10/12/16). Content max width 1240px via
`.page-shell` (16/24/32px gutters). Vertical rhythm between page sections: `mt-10`–`mt-16`.
Mobile first; nothing may scroll horizontally at 360px (wide tables live inside `TableContainer`).

**Motion** — `transition-colors duration-fast` (120ms) for hover/focus; nothing else moves.
`prefers-reduced-motion` is honoured globally.

**Focus** — global 2px accent outline, 2px offset. Never remove it without a replacement.

---

## 3. Page skeleton

Every page (except home and admin, which own their chrome) follows this pattern. The root layout
already renders the season ribbon, header, breadcrumb trail (`PageFrame`) and footer.

```tsx
import { PageHeader, Button, Card, EmptyState, ErrorMessage, Skeleton } from '@/components/ui';

export default function OrdersPage() {
  return (
    <div className="page-shell pb-16">
      <PageHeader
        eyebrow="บัญชีของฉัน"
        title="คำสั่งซื้อ"
        description="ติดตามสถานะการส่งของเข้าเกมของทุกคำสั่งซื้อ"
        actions={<Button variant="secondary">ส่งออก CSV</Button>}
      />
      {/* content: Cards / Panels / Table — loading, empty and error states are required */}
    </div>
  );
}
```

Every data region handles **loading** (`Skeleton`/`TableLoadingRows`, `aria-busy`),
**empty** (`EmptyState` — say what will appear and how to get it) and **error**
(`ErrorMessage` with `onRetry`).

---

## 4. Seasons

`<SeasonProvider>` is mounted in `app/layout.tsx`. It reads `GET /api/site/settings`, sets
`<html data-season>`, caches the setting for the pre-paint script, and falls back to the date rule
(Asia/Bangkok) if the API fails: christmas Dec 1–Jan 2 · winter Oct 15–Nov 30 and Jan 3–Feb end ·
easter 14 days before → 7 days after Easter Sunday · otherwise default.

Pages never branch on season for colour — tokens re-theme automatically. Use the season only for
copy and the artwork slot:

```tsx
import { useSeason, SeasonOrnament, SeasonArtwork } from '@/components/season';

const { season, copy } = useSeason();         // copy = SEASON_COPY[season]
copy.hero.eyebrow / copy.hero.title / copy.hero.subtitle
copy.hero.primaryCta / copy.hero.secondaryCta // { label, href }
<SeasonArtwork className="w-full" />           // season image if set, else a static plate
<SeasonOrnament className="my-12" />           // hairline — glyph — hairline divider
```

- `SeasonRibbon` (already in layout): thin static notice; shows the admin announcement, else the
  season line; dismissible per season + text.
- `SeasonGlyph season=… size=…`: tiny static mark (diamond / flake / star / egg).
- Admin settings page: `setPreviewSeason(season | null)` previews locally without saving;
  `SEASON_SETTING_LABELS`, `SEASON_SETTINGS` for the selector; save with
  `adminConsoleApi.updateSiteSettings({ season, announcement })` then
  `queryClient.invalidateQueries({ queryKey: SITE_SETTINGS_QUERY_KEY })`.
- Art: put images in `public/images/seasons/` and ask Foundation to set `SEASON_COPY[x].artwork`.

---

## 5. Primitives catalog (`@/components/ui`)

```tsx
// Buttons — one primary per view. Link styled as a button: buttonVariants().
<Button>ตรวจยอดและชำระ</Button>                      // primary: solid accent
<Button variant="secondary">เพิ่มในตะกร้า</Button>     // hairline outline
<Button variant="ghost">ยกเลิก</Button>                // text
<Button variant="danger" loading={m.isPending}>ลบ</Button>
<Button size="sm|md|lg" leftIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />} fullWidth />
<Link href="/shop" className={buttonVariants({ variant: 'secondary' })}>เข้าร้านค้า</Link>
<IconButton aria-label="แก้ไข" size="sm"><Pencil className="h-4 w-4" strokeWidth={1.5} /></IconButton>
<Spinner label="กำลังบันทึก" />

// Forms — label + helper/error wired to aria. All accept className + wrapperClassName.
<Input label="Steam ID" mono helperText="ตัวเลข 17 หลัก" error={err} leftIcon={<Search … />} />
<Select label="สถานะ" placeholder="ทั้งหมด" options={[{ value: 'failed', label: 'ล้มเหลว' }]} />
<Textarea label="เหตุผล" rows={3} />
<Checkbox label="แสดงในรายชื่อ" description="ผู้เล่นจะเห็นเซิร์ฟเวอร์นี้" />
<Switch checked={v} onCheckedChange={setV} label="เปิดรับของ" />

// Overlays — portal, focus trap + restore, Esc, scroll lock, no blur.
<Dialog open={o} onOpenChange={setO} title="ลองส่งอีกครั้ง?" description="…"
        onConfirm={retry} confirmText="ส่งอีกครั้ง" loading={m.isPending} variant="danger|warning" />
<Dialog open={o} onOpenChange={setO} title="แก้ไขเซิร์ฟเวอร์" size="lg"
        footer={<><Button variant="ghost">ยกเลิก</Button><Button>บันทึก</Button></>}>…form…</Dialog>
<Drawer open={o} onOpenChange={setO} side="right" title="รายละเอียดงานส่งของ">…</Drawer>
<Menu label="การทำงาน" align="end" renderTrigger={(p) => <IconButton {...p} aria-label="เพิ่มเติม">…</IconButton>}>
  <MenuItem onSelect={…}>ลองส่งอีกครั้ง</MenuItem><MenuSeparator /><MenuItem tone="danger">…</MenuItem>
</Menu>
const toast = useToast(); toast.success('บันทึกแล้ว'); toast.error('บันทึกไม่สำเร็จ', err.message);

// Navigation & choice
<Tabs value={t} onValueChange={setT}>
  <TabsList aria-label="ส่วนของบัญชี"><TabsTrigger value="wallet" count={3}>กระเป๋า</TabsTrigger></TabsList>
  <TabsPanel value="wallet">…</TabsPanel>
</Tabs>
<SegmentedControl aria-label="โหมดเกม" value={m} onChange={setM}
  options={[{ value: 'PVE', label: 'PvE', count: 13 }]} />
<Breadcrumbs items={[{ label: 'ผู้ดูแล', href: '/admin' }, { label: 'การส่งของ' }]} />
<Pagination page={p} pageSize={20} total={data.total} onPageChange={setP} />

// Display
<Card padding="md|sm|lg|none" interactive tone="inset">…</Card>
<Card padding="none"><CardHeader divided title="…" description="…" actions={…} /><CardContent>…</CardContent><CardFooter>…</CardFooter></Card>
<Panel title="ล่าสุด" actions={<Button size="sm" variant="ghost">ดูทั้งหมด</Button>} flush>…table…</Panel>
<Badge tone="neutral|accent|success|warning|danger|info|seasonal" outline mono>ล้มเหลว</Badge>
<StatusDot status="online|offline|degraded|maintenance|unknown" label />
<Stat label="ส่งของไม่สำเร็จ" value={12} attention href="/admin/deliveries?status=failed" />
<Amount value="12500" unit="IC" size="lg" />       // decimal-string safe, no arithmetic
<CopyField label="ที่อยู่เซิร์ฟเวอร์" value="ark.iris-th.cloud:28014" />
<EmptyState title="ยังไม่มีคำสั่งซื้อ" description="…" action={<Link className={buttonVariants()} …/>} />
<ErrorMessage message={err.message} onRetry={refetch} />   // variant="inline" for forms
<Skeleton className="h-4 w-40" />                        // static, never shimmering
<PageHeader eyebrow title description actions />         // section 3
```

Removed at integration (2026-10-17): `GlassCard`, `Surface`, `PrismaticRiverGate`, the legacy
CSS classes (`.glass-card .btn-primary .btn-secondary .input .text-gradient-* .frozen-*`) and the
`iris-* / ark-* / primary-*` and raw-hue Tailwind colour aliases. Use the primitives above and the
semantic colour tokens only.

---

## 6. Servers (`@/components/servers`)

```tsx
const servers = useServers();               // GET /servers → ServerSummary[] (all active)
const deliverable = useDeliverableServers(); // GET /servers?deliverable=true
const directory = useServerDirectory();     // GET /servers/directory → { groups, statusPages }

<ServerPicker servers={servers.data ?? []} value={id} onChange={(id, s) => setId(id)}
  loading={servers.isLoading} error={servers.isError ? 'ลองอีกครั้ง' : null} onRetry={servers.refetch}
  disabledReason={(s) => (isDino && s.supportsDinoDelivery === false ? 'ยังไม่รองรับการส่งสัตว์' : null)} />
<GameModeBadge mode="PVPVE" />
<ServerAddress host={s.connect?.host} port={s.connect?.port} />   // copy + steam://connect
serverStatusKind(s) / serverStatusText(s) / deliveryBlockReason(s) / GAME_MODE_LABEL / GAME_MODE_ORDER
```

`ServerPicker` groups by game mode (PvE / PvE Mod / PvPvE tabs) and cluster (sticky headings such as
"PvPvE X10 Mod (Pre-Aqua)"), searches across all modes, disables non-deliverable rows with a reason,
remembers the last choice, auto-selects only when exactly one server qualifies, and shows
"ยังไม่มีเซิร์ฟเวอร์ที่รับของได้ตอนนี้" when nothing can receive delivery. `deliverable` is
backend-authoritative — never re-derive it.

Server list page (`/servers`): one section per game mode → one table per cluster (map, status dot,
players mono, `ServerAddress`, rates). Unavailable servers stay visible with "ปิดให้บริการ".
Link the `statusPages` URLs as "หน้าสถานะภายนอก".

---

## 7. Data layer

- Typed clients (normalize envelopes; prefer these): `serverDirectoryApi`, `siteApi`,
  `adminConsoleApi` from `@/lib/contracts/console`. Types from `@/lib/contracts/types`.
- `adminConsoleApi`: `updateSiteSettings`, `listClusters` / `createCluster` / `updateCluster`,
  `listServers` / `createServer` / `updateServer`, `listDeliveries(query)` / `retryDelivery(id)`,
  `listAuditLogs(query)`, `listMarketListings(query)` (read-only; the backend has no escrow-safe
  admin cancel, so there is no cancel call), `getStats()`. Paginated calls return `Paginated<T>` = `{ items, total, page, pageSize }`.
- Raw axios equivalents exist on `adminApi` / `siteRawApi` in `@/lib/api` (legacy pages only).
- Final shapes: `backend/contracts/ui-redesign-2026-10.md` (Backend owns them).
- **Money rule**: never compute final prices, totals, discounts or eligibility. Display backend
  numbers with `<Amount/>`. A client-side "ยอดโดยประมาณ" must be labelled as an estimate.

---

## 8. Admin console pattern

Admin owns its chrome via `app/admin/layout.tsx` (PageFrame renders nothing under `/admin`):
left rail on desktop (`Drawer side="left"` on mobile), `PageHeader` per screen, dense calm tables.
Gate the UI with `usePermissions()` (`canSeeAdminConsole`, `canManageSiteSettings`,
`canViewOperations`, `canManageServers` = root). The backend enforces; the UI only hides.

```tsx
const [query, setQuery] = useState<DeliveryQuery>({ page: 1, pageSize: 20, status: 'failed' });
const list = useQuery({ queryKey: ['admin', 'deliveries', query], queryFn: () => adminConsoleApi.listDeliveries(query) });

<div className="flex flex-wrap items-end gap-3 pb-4">               {/* filters row */}
  <Select label="สถานะ" … wrapperClassName="w-44" />  <Input label="ค้นหา Steam ID" mono … />
</div>
<TableContainer>
  <Table>
    <TableHead><TableRow>
      <TableHeaderCell>งาน</TableHeaderCell><TableHeaderCell>เซิร์ฟเวอร์</TableHeaderCell>
      <TableHeaderCell align="right">ครั้งที่ลอง</TableHeaderCell>
      <TableHeaderCell sortDirection={dir} onSort={toggle}>อัปเดต</TableHeaderCell>
      <TableHeaderCell><span className="sr-only">การทำงาน</span></TableHeaderCell>
    </TableRow></TableHead>
    <TableBody>
      {list.isLoading ? <TableLoadingRows columns={5} /> :
       !list.data?.items.length ? <TableEmptyRow colSpan={5} title="ไม่มีงานที่ล้มเหลว" description="งานส่งของทั้งหมดสำเร็จ" /> :
       list.data.items.map((d) => (
         <TableRow key={d.id}>
           <TableCell mono>{d.id.slice(0, 8)}</TableCell>
           <TableCell>{d.serverName}</TableCell>
           <TableCell align="right" mono>{d.attempts}</TableCell>
           <TableCell muted>{formatDate(d.updatedAt)}</TableCell>
           <TableCell align="right"><Button size="sm" variant="secondary" onClick={() => ask(d)}>ส่งอีกครั้ง</Button></TableCell>
         </TableRow>))}
    </TableBody>
  </Table>
</TableContainer>
<Pagination className="mt-4" page={query.page!} pageSize={query.pageSize!} total={list.data?.total ?? 0}
  onPageChange={(page) => setQuery((q) => ({ ...q, page }))} />
```

- Destructive or delivery-affecting actions: confirm `Dialog` (say exactly what will happen) →
  mutation → `toast` → invalidate the list. Show backend error text; never swallow it.
- Status → Badge tone: completed `success`, pending/leased `neutral`, failed `danger`,
  dead_letter `danger outline`, listed `info`, sold `success`, cancelled/expired `neutral`.
- Dates: `toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })`, IDs/IPs mono.
- Overview: a row of `Stat`s (pending slips, failed deliveries, online servers, today's revenue)
  linking to the filtered list, then `Panel`s with recent items.

---

## 9. Copy

- Thai first, natural and short. One idea per sentence. English only for proper nouns and map
  names (The Island, Genesis Part 2, PvE, Steam, Discord, IRIS ID).
- Specific beats grand: "ส่งเข้าเซิร์ฟเวอร์ที่คุณเลือกภายในไม่กี่นาที" not "ประสบการณ์ระดับตำนาน".
- Buttons are verbs: เพิ่มในตะกร้า · ตรวจยอดและชำระ · ส่งอีกครั้ง · บันทึก · ยกเลิก.
- Empty states say what will appear and the next step. Errors say what failed and what to do.
- No exclamation marks, no emoji, no ALL CAPS, no "10/10", "supreme", "ultimate", "AAA".
- Currency: Iris Coin is `IC` after the number (mono). Baht is `฿` before.

---

## 10. Accessibility checklist

- One `h1` per page (PageHeader). Logical heading order.
- Every icon-only control has a Thai `aria-label`; decorative icons `aria-hidden`.
- Dialogs, drawers, menus, tabs and the server picker are keyboard-complete — don't rebuild them.
- Text contrast ≥ 4.5:1: use `fg`, `fg-muted`, `fg-subtle` on surface tokens only.
- Status is never colour-only: StatusDot/Badge carry text (visible or `sr-only`).
- Touch targets ≥ 40px on mobile; check 360px width with no horizontal scroll.

---

## 11. Migration aliases (removed)

All migration aliases were removed at integration on 2026-10-17: the `iris-*`, `ark-*`,
`primary-*`, `background`, `foreground` and raw-hue colour aliases, the `rounded-xl/2xl/3xl` clamps,
`font-display`/`font-serif`, and the "LEGACY COMPATIBILITY" CSS block. Tailwind's default palette is
still present (it is `extend`ed), so the grep guard in section 1 is the enforcement: raw hues,
`white`/`black` fills and `rounded-xl+` must not appear in `src/`.
