# IRIS HeartShop — Master Completion Plan

อัปเดตจากการตรวจ workspace วันที่ 11 กรกฎาคม 2026

## 1. เป้าหมายของแผน

ทำให้ IRIS HeartShop เป็น **plugin-first commerce platform ของ ARK cluster** ที่เราเป็นเจ้าของและใช้แทน ARK Shop เดิม โดยผู้เล่นซื้อ ขาย แลก รับของ และจัดการ account/economy จากในเกมได้ครบ ส่วน Backend เป็น cluster control plane และ Web/Discord เป็น companion surfaces

รายละเอียด product/architecture เป้าหมายอยู่ใน [IRIS Cluster Commerce Platform Specification](IRIS_CLUSTER_COMMERCE_PLATFORM_SPEC_TH.md) และถือเป็นเอกสารกำหนดทิศทางร่วมกับ master plan นี้

คำว่า “สมบูรณ์” ในแผนนี้หมายถึง:

- เส้นทางหลักของผู้เล่นทำงานครบจากในเกมตั้งแต่ identity, wallet, ค้นสินค้า, quote, ซื้อ/ขาย/แลก, รับของ, ติดตามสถานะ และขอความช่วยเหลือ
- plugin ทุก server ทำหน้าที่เป็น trusted game agent ภายใต้ catalog, wallet, policy และ state machine กลางของ cluster
- รองรับการย้ายข้อมูลและ command compatibility จาก ARK Shop เดิมโดยแต้ม kit และประวัติสำคัญไม่สูญหาย
- เงินและสินทรัพย์ในเกมไม่เพิ่ม หาย หรือถูกส่งซ้ำจาก retry, timeout, crash หรือ concurrent request
- ทุก mutation สำคัญมี idempotency, audit trail, reconciliation และ recovery path
- ไม่มี mock, placeholder, default secret หรือ manual-only happy path หลุดเข้าสู่ production
- ระบบ deploy, rollback, monitor, backup และกู้คืนได้โดยมี runbook ที่ทดสอบแล้ว
- มีหลักฐานจาก automated tests และ staging verification ก่อนเลื่อนสถานะเป็น production-ready

## 2. สถานะจริง ณ วันที่ตรวจ

| พื้นที่ | สถานะ | หลักฐาน/ช่องว่าง |
|---|---|---|
| M1 Foundation | ใช้งานต่อได้ | design tokens, typed contracts และ baseline architecture มีแล้ว |
| M2 IRIS ID & Wallet | ใช้งานต่อได้ แต่ยังต้อง production hardening | ledger และ plugin credential มี unit coverage แต่ secret/encryption และ live DB gate ยังไม่ครบ |
| Plugin-first cluster shell | ยังไม่เริ่มครบตาม vision | `/shop` และ `/market` ยังชี้ไปเว็บ, `/iris` ยัง read-only; ต้องเพิ่ม cluster agent, capability manifest, in-game browse/quote/cart/trade/order/support |
| M3 Cart/Checkout/Delivery | มีโค้ดจำนวนมาก รอ integration closure | unit tests ของ cart/order/delivery ผ่าน แต่ working tree ยังไม่ถูกจัดเป็น release baseline, in-game checkout ยังไม่ครบ และ integration environment ไม่ทำงาน |
| M4 Auto Top-up | prototype ที่ดี แต่ยังไม่ใช่เงินจริง | มี intent, webhook idempotency และ ledger credit; provider รองรับเฉพาะ `sandbox` ยังไม่มี PromptPay/card adapter, reconciliation, refund/chargeback |
| Promotion | backend foundation มีแล้ว | มี schema, migration, service และ unit tests แต่ยังต้องผูกกับ checkout/admin/UX และทดสอบ allocation จริง |
| M5 P2P Escrow | ห้ามเปิด production | `/sell` ยังมี critical crash window; prepare/confirm/abort/return protocol ยังไม่ atomic และไม่ครบ |
| M6 Notifications | มีฐาน chat/WebSocket/Discord บางส่วน | ยังไม่มี durable notification domain, outbox, preference, retry, inbox และ transaction timeline ครบช่องทาง |
| Frontend quality | typecheck/lint ผ่าน | `tsc --noEmit` ผ่าน, lint ผ่านพร้อม warnings; ยังมี mock ใน event, promotion, packs, ranking และ support |
| Backend quality | unit ผ่าน, integration ยังไม่มีหลักฐาน | unit 147/147 ผ่าน; integration 28 เคสเชื่อม `https://localhost` ไม่ได้เพราะ environment/Docker ไม่พร้อม |
| Plugin quality | binary test บางส่วนผ่าน | CTest จาก build เดิมผ่าน 3/3; ต้อง fresh configure/build และยืนยัน RequestSigning test ใน canonical gate |
| Delivery pipeline | ยังไม่พร้อม | ไม่มี `.github` CI workflow, Docker Desktop ไม่ทำงานในวันที่ตรวจ และ Bun path ยังไม่มี tracked lockfile |
| Security | มีช่องว่าง P0 | JWT มี fallback secret, WebSocket ยอมรับ token ผิดเป็น guest, encryption ใช้ static IV/default key และ security report เดิมรันไม่จบ |

หมายเหตุ: working tree มีการเปลี่ยนแปลงมากกว่า 140 ไฟล์เมื่อรวม source, migration, generated build, Playwright artifacts และ monitoring database จึงต้องทำ baseline recovery ก่อนเพิ่ม feature ใหม่

## 3. หลักการจัดลำดับ

1. **P0 — Integrity/Security:** ถ้าผิดแล้วเงินหรือ asset เสียหาย, ข้อมูลรั่ว หรือย้อนคืนยาก ต้องทำก่อน
2. **P1 — Core journey:** งานที่ทำให้ผู้เล่นซื้อ จ่าย รับของ และติดตามได้ครบ
3. **P2 — Operations/UX:** งานที่ทำให้ทีมดูแลระบบและผู้เล่นใช้งานได้ดี
4. **P3 — Optimization/Growth:** performance, analytics, personalization และ conversion optimization

ห้ามเริ่มเงินจริงหรือ P2P pilot หาก P0 gate ของ domain นั้นยังไม่ผ่าน

## 4. Roadmap หลัก

### Phase 0 — Recover และสร้าง Verified Baseline

เป้าหมาย: เปลี่ยน working tree ปัจจุบันให้เป็นชุดงานที่ review, test, rollback และส่งต่อได้

งาน:

- ทำ inventory ของ modified/untracked files และแยก source ออกจาก generated artifacts
- เพิ่ม ignore rules สำหรับ build directory, Playwright report/test results, SQLite runtime DB, logs และ local secrets
- แยก commit ตามลำดับ: contracts/schema → backend M3 → frontend M3 → plugin M3 → payment/promotion → docs/verification
- ห้ามรวม `.env`, credential, runtime DB หรือ artifact ที่ตรวจแหล่งที่มาไม่ได้
- สร้าง fresh build directories; ไม่ใช้ผล CTest จาก stale build เป็น release evidence
- ทำ root verification commands ให้รันซ้ำได้ และแยก unit, integration, E2E, plugin, security อย่างชัดเจน
- อัปเดต `PROJECT.md`, `PROGRESS.md`, contract status และ migration ledger ให้ตรงโค้ดจริง

Exit gate:

- `git status` ไม่มี generated noise และทุก source change มีเจ้าของ/วัตถุประสงค์
- backend/frontend typecheck ผ่าน
- backend unit ผ่านทั้งหมด
- plugin fresh Release build + CTest ครบทุก canonical test
- integration environment start ได้ด้วยคำสั่งเดียวและ health checks ผ่าน

### Phase 1 — Production Foundation และ Security Closure

เป้าหมาย: ทำให้ระบบ fail closed, deploy ซ้ำได้ และมีหลักฐานจากฐานข้อมูลจริง

งาน P0:

- ลบ fallback ของ `JWT_SECRET`, `ENCRYPTION_KEY`, plugin secret และ provider webhook secret; startup ต้องหยุดทันทีเมื่อค่าขาดหรืออ่อนเกินไป
- เปลี่ยน sensitive-field encryption เป็น authenticated encryption เช่น AES-256-GCM พร้อม random nonce, key version และ blind index/HMAC สำหรับ lookup
- เขียน migration/rotation path สำหรับ ciphertext เดิม พร้อม rollback และ verification count
- WebSocket: token ผิดต้องถูกปฏิเสธ, แยก guest namespace/permission ให้ชัด, authorize room join และ rate-limit events
- ปิด legacy `keyId == secret` หลัง credential rollout ครบทุก server
- ทำ live Postgres/Redis integration suite โดยใช้ database แยกต่อ run; ไม่ mock Prisma ใน integration gate
- ตรวจ migration ทุกชุดทั้ง deploy, backfill, constraint validation และ rollback rehearsal
- เพิ่ม CI สำหรับ typecheck, lint, unit, integration, frontend build, Playwright smoke, C++ build/test, dependency scan และ secret scan
- pin runtime/dependencies; เพิ่ม Bun lockfile หาก production Docker ใช้ Bun หรือเปลี่ยน production path ให้ใช้ npm lockfile เพียงชุดเดียว
- กำหนด structured logs, correlation ID, audit actor, metrics, tracing และ error reporting โดยห้าม log token/secret/payment payload เต็ม
- ทำ backup/restore ของ Postgres, Redis policy และ plugin journal; ทดสอบ restore จริง

Exit gate:

- ไม่มี default secret หรือ static-IV encryption ใน production code path
- CI จาก clean checkout ผ่านทั้งหมด
- real DB integration และ migration rehearsal ผ่าน
- restore drill ผ่านตาม RPO/RTO ที่ตกลง
- security baseline report รันจบและไม่มี unresolved Critical/High

### Phase 2 — ปิด In-Game Commerce Shell และ M3 Cart, Checkout, Order, Delivery

เป้าหมาย: เส้นทาง IC purchase ทำงานครบและทน retry/crash

Backend:

- ให้ server cart เป็น source of truth หลัง login และกำหนด merge rule กับ local cart
- snapshot product, price, quantity, server compatibility, promotion allocation และ currency ลง order items
- checkout ใช้ idempotency key ต่อ user + cart version และป้องกัน replay กับ payload ต่างกัน
- รวม wallet debit, order transition, stock/reservation และ delivery enqueue ใน serializable transaction/outbox boundary
- บังคับ order state machine; ห้าม controller เปลี่ยน status แบบอิสระ
- ทำ cancel, refund, partial failure, retry, dead-letter และ operator reconciliation
- ย้ายทุก money path ออกจาก direct `pointsBalance` write ไป `walletService.post`

Frontend:

- cart sync/merge/conflict UX, compatibility errors, insufficient balance และ price-changed confirmation
- checkout review → confirmation → processing → success/failure ที่ refresh แล้วไม่เสีย state
- orders list/detail พร้อม timeline, retry guidance, receipt และ support deep-link
- loading/empty/error/offline states และ accessibility ของ keyboard/focus/screen reader

Plugin:

- ทำ `/iris shop`, product detail, quote, confirmation, cart, orders และ help ให้ core purchase flow จบในเกมได้โดยไม่ต้องเปิดเว็บ
- เพิ่ม command session, pagination, short code, typo-safe search, localization และ aliases ของ ARK Shop เดิม
- ส่ง server/map/mod/capability context ให้ backend ตรวจ product compatibility และ delivery routing
- claim lease เฉพาะผู้เล่น online และ release เมื่อ offline
- journal state `prepared → applied → acknowledged`; duplicate key ต้องไม่ mutate game ซ้ำ
- crash หลัง game mutation แต่ก่อน backend ack ต้องเข้า manual reconciliation ไม่ spawn ซ้ำ
- signed request, nonce/replay protection, timeout/backoff/jitter และ safe shutdown
- delivery receipt เก็บ server, player, job, payload hash และ game result ที่ audit ได้

Exit gate:

- ผู้เล่น browse → quote → confirm → pay → claim → track order ได้ครบด้วย server plugin เพียงอย่างเดียว
- E2E purchase ผ่านบน staging ด้วย Postgres/Redis จริงและ canonical plugin
- ทดสอบ duplicate click, retry, timeout, process crash, DB deadlock และ lost acknowledgement
- wallet ledger balance, order totals, fulfillment count และ plugin journal reconcile เป็นศูนย์ความคลาดเคลื่อน
- ไม่มี duplicate delivery ใน fault-injection suite

### Phase 3 — ปิด M4 Auto Top-up และ Financial Operations

เป้าหมาย: รับเงินจริงอย่างปลอดภัยและตรวจบัญชีได้

งาน:

- เลือก provider จริงและทำ adapter แยก PromptPay/card ตาม official contract
- เก็บ raw webhook bytes ก่อน JSON parsing และ verify signature/timestamp ตาม provider
- map provider event/state เป็น internal state machine โดยไม่ผูก domain กับชื่อ provider
- ตรวจ amount, currency, reference, merchant account, expiry และ event freshness
- idempotency ทั้ง create intent, provider event, ledger posting และ client retry
- expiry worker, payment status polling fallback และ stuck-intent recovery
- daily settlement/reconciliation ระหว่าง provider, payment intents, ledger และ bank statement
- refund, partial refund, chargeback, dispute, negative/debt balance และ manual review
- admin portal สำหรับค้น payment/ref, retry reconciliation, refund พร้อม maker-checker approval และ audit
- Top-up UX แสดง package, QR/payment link, expiry countdown, real-time/polling status, receipt และ recovery เมื่อปิดหน้า
- PDPA retention สำหรับ payment metadata และห้ามเก็บ card data ที่ทำให้ระบบเข้า PCI scope โดยไม่จำเป็น

Exit gate:

- provider sandbox/UAT certification ผ่าน
- duplicate/reordered/forged/mismatched webhook tests ผ่าน
- reconciliation จากชุดข้อมูลจำลองและ UAT ได้ยอดต่าง 0
- refund/chargeback end-to-end ผ่านโดยไม่แก้ ledger เก่า
- เปิด pilot ด้วยวงเงิน/ผู้ใช้จำกัดและ kill switch

### Phase 4 — ปิด M5 P2P Asset Escrow

เป้าหมาย: ไม่มีช่วงเวลาที่ dino ตัวเดียว “ยังอยู่ในเกมและขายได้” หรือ “หายโดยไม่มีทางคืน”

Protocol ขั้นต่ำ:

1. plugin สร้าง asset fingerprint + payload hash + idempotency key
2. backend `prepare-lock` แบบ idempotent และ unique ต่อ server/fingerprint
3. plugin ตรวจ ownership อีกครั้งบน game thread แล้ว journal ก่อน remove
4. plugin remove/serialize asset และเก็บ durable receipt
5. backend `confirm-lock` ทำ lock confirmation + listing creation ใน transaction เดียว
6. purchase ทำ conditional state transition + wallet hold atomically
7. delivery สำเร็จจึง release escrow ให้ seller/platform
8. cancel/expiry/failure สร้าง return/compensation job เพียงครั้งเดียว

งานเพิ่มเติม:

- state machine สำหรับ asset lock, listing, purchase, delivery, settlement, return และ dispute
- lease/expiry/recovery worker และ reconciliation dashboard
- moderation hold, listing validation, seller restriction, fraud/risk signals และ price limits
- exactly-once effect ผ่าน idempotent state machine ทั้งฝั่ง backend และ plugin ไม่อ้างว่า network ทำ exactly-once ได้
- return journal และ duplicate-return protection
- frontend seller wizard, ownership status, fee preview, buyer confirmation, escrow timeline และ dispute entry
- ทำ acceptance tests ทั้ง 12 ข้อใน `ark-plugin/P2P_SAFETY_AUDIT.md`

Exit gate:

- CR-PLUGIN-004 ถูกปิดครบและ `/sell` legacy ถูก disable หรือ route ไป protocol ใหม่
- fault injection ทุก transition ผ่าน รวม disconnect, crash, timeout, ownership transfer, dino death และ server shutdown
- escrow clearing account, listing state, delivery และ trade history reconcile ได้ 100%
- เริ่ม pilot เฉพาะ server/test users และมี global kill switch

### Phase 5 — ปิด M6 Unified Notifications

เป้าหมาย: ผู้ใช้เห็นสถานะสำคัญเหมือนกันบน Web, Discord และในเกม โดยไม่หายเมื่อ service ใด service หนึ่งล่ม

งาน:

- เพิ่ม `DomainEvent`/outbox ใน transaction เดียวกับ payment, order, delivery และ marketplace mutation
- notification worker แบบ retry + exponential backoff + dead-letter
- notification inbox ในเว็บ มี unread/read, severity, action URL, pagination และ retention
- WebSocket ใช้เป็น delivery channel ไม่ใช่ source of truth; reconnect แล้วดึง missed events ได้
- preference/consent ต่อ event type และ channel พร้อม quiet hours
- Discord template, mention policy, rate limits และ fallback
- in-game message queue/polling พร้อม idempotency และ localization ไทย/อังกฤษ
- transaction timeline ใช้ข้อมูล event เดียวกันกับ notification
- operator dashboard สำหรับ failed delivery/replay โดยไม่ส่งซ้ำแบบไร้การควบคุม

Exit gate:

- ปิด WebSocket/Discord/plugin ระหว่าง transaction แล้วเปิดใหม่ ต้องส่ง/ดึง event ที่ตกหล่นได้
- duplicate event ไม่สร้าง notification effect ซ้ำ
- ผู้ใช้ opt-out ได้ตาม policy ยกเว้นข้อความบริการที่จำเป็นและระบุชัด

### Phase 6 — Product Surface, Admin และ Content Completeness

เป้าหมาย: ไม่มีหน้าสวยแต่ทำงานจริงไม่ได้

งาน:

- แทน mock Event, Promotion, Packs, Ranking และ Support ด้วย API/CMS จริง
- สร้าง Ticket domain: category, SLA, attachment scanning, conversation, assignment, escalation และ order/payment linkage
- admin RBAC ระดับ action, server-side route guard, step-up auth สำหรับเงิน/credential และ maker-checker สำหรับงานเสี่ยง
- CMS publish workflow, preview, revision, rollback, media lifecycle และ alt text
- product/catalog bulk import, validation, image optimization, category/variant/compatibility และ audit
- global search ที่นำไปยัง product, help, order และ content ได้จริง
- SEO: metadata รายหน้า, canonical, sitemap, robots, Open Graph, structured data และ `lang=th`
- accessibility WCAG 2.2 AA สำหรับเส้นทางหลัก
- responsive QA บน desktop/mobile และ browser matrix ที่กำหนด
- performance budgets สำหรับ Core Web Vitals, API p95, image size และ JS bundle
- ลบ claim certification ที่ไม่มีหลักฐานและตรวจข้อความกฎหมาย/นโยบายทั้งหมด

Exit gate:

- production build ไม่มี mock/placeholder action ใน user-facing route
- ทุก admin mutation มี permission + audit + confirmation/recovery ตามระดับความเสี่ยง
- accessibility, SEO, visual regression และ performance budget ผ่าน
- support ticket end-to-end และ SLA alert ทำงานจริง

### Phase 7 — Production Readiness, Cutover และ Stabilization

เป้าหมาย: เปิดระบบแบบควบคุมความเสี่ยงและย้อนกลับได้

งาน:

- แยก dev/staging/production account, database, Redis, secrets, OAuth, payment merchant และ Discord bot
- infrastructure as code หรือ deployment manifests ที่ versioned และ reproducible
- blue/green หรือ rolling deployment พร้อม backward-compatible migrations
- feature flags/kill switches สำหรับ payment, checkout, delivery, P2P และ notifications
- load/soak tests สำหรับ checkout burst, webhook burst, WebSocket reconnect และ plugin polling หลาย server
- threat model, penetration test, dependency/container scan และ remediation
- runbooks: payment mismatch, wallet invariant breach, duplicate/uncertain delivery, stuck escrow, provider outage, DB failover, credential compromise
- on-call alerts, escalation matrix, status page และ incident template
- UAT โดย owner/admin/player จริง พร้อม sign-off
- canary rollout → limited pilot → full rollout → 7/14/30-day review

Exit gate:

- rollback และ restore drill ผ่านใน staging ด้วยทีมที่ไม่ได้เขียน feature นั้น
- dashboard/alerts ครอบคลุม SLO และ business invariants
- ไม่มี Critical/High ที่ไม่ได้รับการแก้หรือ risk acceptance เป็นลายลักษณ์อักษร
- production checklist มีผู้อนุมัติครบก่อน cutover

## 5. Cross-cutting Workstreams

### Financial integrity

- ผลรวม ledger entries ต่อ transaction ต้องเท่ากับศูนย์
- balance projection ต้องสร้างใหม่จาก ledger ได้
- ทุก external payment มี internal reference เดียวและ reconcile ได้
- ห้าม update/delete ledger history; correction ใช้ reversing transaction
- admin credit/refund ต้องผ่าน wallet service, permission, reason, idempotency และ audit

### Asset integrity

- asset fingerprint unique ตาม server/type/identity ที่ออกแบบ
- payload hash ถูกตรวจทุก boundary
- ทุก game mutation มี journal ก่อนทำ, receipt หลังทำ และ deterministic recovery
- uncertain state ต้องหยุดอัตโนมัติและเข้าคิวตรวจสอบ

### Privacy and security

- data inventory, retention, consent version, export/delete workflow และ legal hold
- secret rotation, least privilege, network segmentation และ production access logging
- OAuth account linking ป้องกัน account takeover และมี recovery flow
- upload validation/virus scan, CSP, CSRF policy, rate limit และ abuse controls

### Reliability and operations

- health/readiness checks แยกกัน และ readiness ต้องสะท้อน dependency ที่จำเป็น
- background jobs มี lease, retry, dead-letter, poison-message handling และ metrics
- schema migration เป็น backward compatible ระหว่าง rolling deploy
- ทุก critical invariant มี scheduled reconciliation และ alert

## 6. Proposed SLO และ Business Invariants

ค่าต่อไปนี้เป็น baseline ที่เสนอและต้องยืนยันก่อน production:

| ตัวชี้วัด | เป้าหมายเสนอ |
|---|---|
| API availability | 99.9% ต่อเดือน ยกเว้นประกาศ maintenance |
| API read p95 | ต่ำกว่า 300 ms ใน steady state |
| Checkout mutation p95 | ต่ำกว่า 1,000 ms ไม่รวม provider redirect |
| Duplicate wallet credit/debit | 0 |
| Duplicate game delivery/return | 0 |
| Unreconciled payment หลัง 24 ชม. | 0 หรือมี incident owner ทุกเคส |
| Notification durable enqueue | 99.99% สำหรับ transaction events |
| Database RPO | ไม่เกิน 5 นาที |
| Service RTO | ไม่เกิน 60 นาที |
| Critical audit coverage | 100% ของ admin/payment/wallet/asset mutations |

## 7. Release Gates

| Gate | เงื่อนไข |
|---|---|
| G0 Verified Baseline | clean/reviewable tree, reproducible build, unit/type/lint/plugin tests ผ่าน |
| G1 Commerce Staging | M3 E2E + real DB + plugin fault tests ผ่าน |
| G2 Payment Pilot | provider UAT, reconciliation, refund/chargeback, kill switch ผ่าน |
| G3 Marketplace Pilot | CR-PLUGIN-004, 12 safety tests, escrow reconciliation ผ่าน |
| G4 Unified Beta | notifications, support, admin ops, observability และ runbooks พร้อม |
| G5 Production | security/load/DR/UAT/cutover checklist ผ่านและมี sign-off |

## 8. ลำดับงาน 15 รายการถัดไป

1. Freeze feature ใหม่ชั่วคราวและทำ inventory working tree
2. ตรวจ MySQL source ตาม ARK Shop config, inventory schema/table/writers/commands และ snapshot โดยไม่เปิดเผย secret
3. แยก generated/runtime files ออกจาก source และปรับ `.gitignore`
4. สร้าง fresh baseline branch/commits ตาม domain โดยไม่ทำลายงานเดิม
5. ทำ one-command verification และ fresh plugin Release build
6. เพิ่ม cluster agent identity, capability heartbeat, protocol version และ drain mode
7. เปิด integration stack แล้วแก้ integration tests ให้ self-contained
8. ปิด default secrets, JWT/WebSocket fail-open และ encryption migration
9. ตั้ง CI จาก clean checkout พร้อม real DB service
10. ทำ `/iris` commerce shell และปิด M3 state/invariant gaps พร้อม E2E/fault injection
11. สร้าง catalog/points/kits converter และ shadow reconciliation สำหรับแทน ARK Shop
12. audit ทุก direct balance/status write และบังคับ service/state machine boundary
13. ทำ payment provider จริง + reconciliation + refund/chargeback ก่อนเปิดเงินจริง
14. ทำ P2P asset-lock/trade protocol, outbox และ notification channels
15. ปิด mock/admin/support แล้วทำ security/load/restore/UAT/canary ก่อน cutover

## 9. วิธีรายงานสถานะต่อจากนี้

ทุก work item ต้องมีสถานะหนึ่งในสี่แบบเท่านั้น:

- **Planned:** มี scope และ acceptance criteria แต่ยังไม่มีโค้ด
- **Implemented:** มีโค้ดแล้ว แต่ยังไม่ผ่าน verification ครบ
- **Verified:** ผ่าน automated/integration gates ใน environment ที่ระบุ
- **Production-ready:** ผ่าน security, operations, rollback, monitoring และ sign-off แล้ว

ห้ามใช้คำว่า Done จาก unit tests อย่างเดียว และห้ามนับ mock/sandbox เป็น production-ready

## 10. Definition of Done ต่อ Pull Request/Change Set

- contract/schema/state transition ระบุชัดและ backward compatibility ถูกตรวจ
- success, validation, authorization, concurrency, retry และ failure paths มี test
- migration มี deploy/rollback หรือ roll-forward plan
- log/metric/audit เพียงพอและไม่เปิดเผยข้อมูลลับ
- docs/runbook/config example อัปเดต
- ไม่มี generated artifact หรือ secret ปะปน
- ผ่าน CI จาก clean checkout
- มีหลักฐาน staging สำหรับ change ที่แตะเงิน, asset, auth, plugin หรือ infrastructure

## 11. การประมาณระยะเวลา

ระยะเวลาขึ้นกับจำนวนคนและการอนุมัติ provider โดยตรง จึงควรวางเป็นช่วง:

- Phase 0–2: 3–5 สัปดาห์
- Phase 3: 3–6 สัปดาห์ ไม่รวมเวลารอ provider/UAT
- Phase 4: 4–7 สัปดาห์ เพราะต้องทดสอบกับเกมจริงและ fault injection
- Phase 5–6: 3–6 สัปดาห์
- Phase 7: 2–3 สัปดาห์

สำหรับทีม 3–4 คนที่แบ่ง Backend/Frontend/Plugin/QA-Ops ได้ คาด 12–20 สัปดาห์แบบมี buffer; หากทำคนเดียวควรคาด 24–36 สัปดาห์ และเปิดใช้เป็น gate/pilot ทีละส่วนแทน big-bang launch

## 12. Decisions ที่ต้องล็อกก่อน Phase 3–7

- payment provider และ merchant account ที่จะใช้จริง
- currency/IC conversion, bonus, refund และ chargeback policy
- marketplace fee, asset eligibility, dispute SLA และ compensation ceiling
- production hosting, DNS, certificate, backup region และ log retention
- SLO/RPO/RTO และผู้รับผิดชอบ on-call
- PDPA retention/legal basis และข้อความ policy ที่ผ่านการตรวจ
- browser/device support และ localization scope
- pilot servers/users และเกณฑ์หยุด rollout
