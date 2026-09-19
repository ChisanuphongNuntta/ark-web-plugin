# IRIS — Local rebuild and Stripe sandbox

## สถานะจริง

รอบนี้ทำหน้าเติมเหรียญใหม่และเชื่อม Stripe test Checkout แล้ว ไม่ใช่การประกาศว่า rebuild เว็บทุกหน้าหรือเชื่อม Plugin ใหม่ครบแล้ว ระบบเดิมบน HTTPS และเกมเซิร์ฟเวอร์ไม่ได้ถูกแทนที่

- เว็บ preview: http://localhost:3100/topup
- API sandbox: http://127.0.0.1:3201/health
- ฐานข้อมูลและ Redis แยกใน Docker project `iris-sandbox` ไม่มีการใช้ volume หรือบัญชีผู้เล่นจากระบบเดิม
- คีย์เก็บใน `.env.stripe.local` ซึ่ง Git ignore แล้ว ไม่ได้ใช้ publishable/restricted key เพราะ hosted Checkout ไม่จำเป็นต้องส่ง key ให้ frontend
- Stripe account แสดงชื่อร้านใน Checkout ว่า “แซนด์บ็อกซ์ Mega Rust” ตามการตั้งค่าของบัญชี ยังไม่ได้เปลี่ยน branding ใน Stripe

## ผลทดสอบ

- Backend build ผ่าน; frontend production build ผ่าน
- Backend test suite 208 tests / 28 files ผ่าน
- สร้าง Session จริงใน Stripe test mode: THB 35.00, reference ถูกต้อง, idempotent retry ได้ Session เดิม; ปิด Session smoke test แล้ว
- ใช้ browser กรอกบัตรทดสอบของ Stripe และชำระ 35 บาททดสอบสำเร็จ ไม่เคลื่อนเงินจริง
- Webhook จริงถึง API แต่ครั้งแรกพบ fresh-database bootstrap ไม่มี system issuance account ทำให้ค้าง processing
- แก้ bootstrap system accounts และ ledger constraints/triggers; ตรวจ event จาก Stripe แล้ว replay แบบ signed ใน sandbox เท่านั้น
- replay ครั้งแรกเพิ่ม 100 IC, replay ซ้ำตอบ duplicate, ยอดคง 100 IC; สถานะ completed
- ตรวจภาพ desktop 1440 และ mobile 390px; mobile scrollWidth เท่ากับ viewport 390px; UI ไม่มี emoji แทน icon และแสดง loading/error/empty/status แยกชัดเจน
- ยังไม่ได้ทดสอบสินค้าเข้าเกม, การโอนข้าม cluster, การซื้อซ้ำพร้อมกันในเกม หรือ load test

## การเปลี่ยนสำคัญ

1. `/topup` ใช้ UI ใหม่จาก `StripeTopup.tsx`; เก็บงานสลิปเดิมไว้ที่ `LegacyTopup.tsx` โดยไม่เปิดผ่าน route เพราะ API สลิปไม่ได้พร้อมตาม UI
2. แพ็กเกจ/ราคา/จำนวนเหรียญมาจาก backend; ไม่ใช้แพ็กเกจสมมติเมื่อ API ล้ม
3. ตรวจ Stripe-Signature จาก raw body; ปฏิเสธ live key/live event, สกุลเงินหรือ reference ไม่ตรง, completed ที่ยัง unpaid
4. ใช้ idempotency และ ledger เดิม; redirect กลับเว็บไม่เพิ่มเหรียญ
5. production ไม่ใช้ fixture แม้ตั้ง `NEXT_PUBLIC_USE_FIXTURES=always`; ค่า default เป็น live-only
6. แก้ fresh database baseline ให้สร้างบัญชีกลางและ wallet SQL guards ก่อนบันทึก migration history
7. local proxy เปิดเฉพาะ development + `IRIS_LOCAL_API_PROXY=1`, ส่งไป port 3201 เท่านั้น

## เปิดชุดทดสอบอีกครั้ง

จาก root:

```powershell
docker compose -f docker-compose.sandbox.yml up -d --build
docker compose -f docker-compose.sandbox.yml exec -T sandbox-api npx tsx scripts/seed-local-sandbox.ts
```

คำสั่ง seed ใช้ได้เฉพาะ DB `iris_sandbox` บน `sandbox-postgres`; สร้างแพ็กเกจและบัญชี user สำหรับทดสอบ พร้อมคืน session token อายุ 2 ชั่วโมง ห้ามนำ token ไปใส่ Git/รายงาน ต้องตั้ง cookie `token` ใน browser ทดสอบเท่านั้น ไม่มีการสร้าง admin หรือ bypass OAuth ใน production

เปิด terminal อีกอันใน frontend:

```powershell
$env:NEXT_PUBLIC_API_URL='/api'
$env:NEXT_PUBLIC_USE_FIXTURES='never'
$env:IRIS_LOCAL_API_PROXY='1'
npm run dev -- --port 3100 --hostname 127.0.0.1
```

listener ใช้ secret จาก `stripe listen --print-secret` ของคีย์ test เดียวกัน หากเปลี่ยนคีย์หรือ secret ต้องสร้าง container ใหม่ ห้ามเปิด checkout โดยไม่มี listener ระบบนี้ไม่มี automatic background reconciliation เมื่อ listener หยุดนาน จึงยังไม่พร้อมรับเงินจริง

หยุดเฉพาะ sandbox โดยไม่ลบข้อมูล:

```powershell
docker compose -f docker-compose.sandbox.yml down
```

## Plugin ZIP ใหม่

SHA256 ZIP: `625EB176D615A2711C11DB8DAC12D7EE0856A066BF7F35114DF52D0064D070BF`

| Module | หลักฐานจากแพ็กเกจ | สิ่งที่ต้องมีเพื่อเชื่อมเว็บจริง |
|---|---|---|
| IrisDefender | x64 DLL; config anti-exploit/anti-cheat, Discord webhook และ file log | event schema + signed telemetry endpoint; ห้ามแสดงผลตรวจจับปลอม |
| IrisItemUpload | x64 DLL; SQL config, upload/download/check commands, cloud slots | SQL DDL, ownership/lease/restore semantics และรายการสถานะย้ายของ |
| IrisNameProtect | x64 DLL; blocklist config | config schema/version และ reload mechanism |
| IrisPlayerProtect | x64 DLL; SQL config, SeasonID, protection options | SQL DDL, expiry semantics และวิธี sync กับ protection service ของเว็บ |

แพ็กเกจไม่มี HeartShop.dll และไม่มี source code ไม่มีหลักฐาน API/DDL เพียงพอให้ยืนยันว่าตัวใหม่ใช้ protocol เดิมได้ Metadata บางตัวระบุ MinApiVersion 3.54 การตรวจ PE ยืนยันเพียง architecture ไม่ยืนยันว่าโหลดหรือทำงานในเกมได้ ห้ามแทน HeartShop ด้วย ZIP นี้ทั้งหมดหรือโหลด backup DLL/PDB ไปพร้อมตัวหลัก

## งานที่ยังต้องทำก่อนเรียกว่า ecosystem พร้อมจริง

- ขอ source/API contract/SQL schema ของ 4 Plugin ใหม่ หรือสิทธิ์ read-only ใน DB ทดสอบของ Plugin แล้วทำ integration adapter โดยไม่เดา schema
- จัด integration tests ป้องกัน dupe, item ownership, lease, offline delivery และ cluster transfer
- ย้ายหน้า Home/Shop/Profile/Market/Admin ให้ใช้ design system เดียวกันตามแผน Antigravity เดิม; รอบนี้เสร็จเฉพาะ top-up vertical slice
- เพิ่ม webhook monitoring/reconciliation, refund flow และจัดการ chargeback ก่อน live mode
- ตรวจ fresh-baseline invariants ของ migration อื่นเพิ่มเติม; `db push` ไม่สร้าง raw SQL ทุกอย่าง
- npm audit ระหว่างติดตั้งพบ 14 findings (9 moderate, 5 high); ยังไม่ได้อัปเกรด dependencies แบบเหมารวม
- หลังทดสอบควร rotate คีย์ที่เคยส่งในแชต และเก็บ deployment secrets ใน secret manager ก่อนเปิดจริง

## แหล่งอ้างอิง

- https://docs.stripe.com/checkout/fulfillment — fulfill หลังตรวจสอบ payment status
- https://docs.stripe.com/webhooks/signature — raw body และลายเซ็น
- https://docs.stripe.com/testing — test cards ไม่เคลื่อนเงินจริง
- https://github.com/stripe/stripe-cli/releases/tag/v1.50.11 — CLI ที่ใช้กับ listener local
