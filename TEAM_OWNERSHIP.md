# IRIS Enterprise Commerce — Team Ownership & Working Rules

ทีมพัฒนาแบ่งเป็น 3 owner ที่ทำงานขนานกันแบบ agent-to-agent ผ่าน orchestrator
อ่านไฟล์นี้ + `ENTERPRISE_REDESIGN_PLAN_TH.md` ก่อนแก้ไขใด ๆ เสมอ

## Ownership (เขียนได้เฉพาะของตัวเอง)

| Team | รับผิดชอบ | เขียนได้ |
|---|---|---|
| **Backend** | Database, API, Wallet, Payment, Cart, Order, Promotion, Escrow, RBAC, **contract กลาง** | `backend/**` (รวม `backend/contracts/**`, `backend/prisma/**`) |
| **Frontend** | Design system, Store, Cart, Checkout, Account, Admin UI, SEO | `frontend/**` |
| **Plugin** | Game delivery, P2P asset lock, idempotency, TLS, build, integration test | `ark-plugin/**`, `HeartShop/**` |

## กติกาบังคับ

1. **Backend เป็น single source of truth** ของ API + event contract — เก็บไว้ใน `backend/contracts/` (openapi.yaml, events/, fixtures/)
2. **Frontend ห้ามแก้** Prisma หรือ backend route; ระหว่างรอ API ให้ใช้ **typed fixture จาก `backend/contracts/fixtures/`** — ห้ามคำนวณราคาสุดท้าย/business rule ใน frontend
3. **Plugin ห้ามต่อฐานข้อมูลโดยตรง** — คุยผ่าน API ที่ Backend กำหนดเท่านั้น
4. โฟลเดอร์ทีมอื่น **อ่านได้ แต่ห้ามแก้/ห้ามลบ**
5. ถ้าต้องเปลี่ยน contract → **เสนอกลับ Backend** อย่าแก้เอง
6. อ่าน `git status` ก่อนแก้เสมอ; ห้ามลบการเปลี่ยนแปลงของทีมอื่น
7. ทุก delivery ต้องพิสูจน์ได้ว่า duplicate request ไม่ทำให้ผู้เล่นได้รับของซ้ำ (idempotency)

## Merge order
`Backend contract` → `Frontend / Plugin implementation` → `Integration verification`

## Milestone sequence (เดินพร้อมกันทั้ง 3 ทีม)
1. Baseline build ผ่าน  ← **ปัจจุบัน**
2. IRIS ID & Wallet
3. Cart / Checkout & Delivery
4. Auto Top-up
5. P2P Escrow
6. Unified notifications
7. Production verification
