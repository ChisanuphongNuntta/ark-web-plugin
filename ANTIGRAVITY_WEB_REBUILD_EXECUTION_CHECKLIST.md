# IRIS Web Rebuild — Antigravity Execution Checklist

เอกสารนี้ใช้คู่กับ `ANTIGRAVITY_WEB_REBUILD_MASTER_PLAN_TH.md`

## Working protocol

- ทำทีละ work package
- ก่อนแก้: บันทึก baseline, affected routes, affected contracts และ rollback path
- หลังแก้: lint, build, targeted E2E, screenshots และ console/network check
- ห้ามรวม visual refactor กับ Backend/Plugin contract change
- ห้าม mark complete หากมี mock success, fake payment provider หรือ fixture production fallback

## Phase 0

- [ ] WEB-RB-001 Route/screenshot baseline automation
- [ ] บันทึกผล E2E ปัจจุบัน
- [ ] บันทึก bundle/build baseline
- [ ] สรุป console/network errors ทุก route
- [ ] WEB-RB-002 เชื่อม payment packages จริง
- [ ] ซ่อน/disable unsupported payment providers
- [ ] เพิ่ม UI V2 feature flag และ rollback note
- [ ] Gate 0 ผ่าน

## Phase 1

- [ ] WEB-RB-003 สร้าง semantic tokens
- [ ] Retire token ใหม่ที่อ้าง raw `ark-*`
- [ ] ตั้ง typography และ numeric rules
- [ ] WEB-RB-004 สร้าง icon registry
- [ ] ทำ legacy category icon adapter
- [ ] แทน emoji ใน Shop/Top-up/Login/Packs/Chat/Ranking/Admin
- [ ] WEB-RB-005 สร้าง canonical primitives
- [ ] Button/Surface/Field/Select/Badge/Status/Dialog/Tabs/Tooltip/Skeleton/Empty/Error
- [ ] Update design-system QA page
- [ ] WEB-RB-006 สร้าง Public/Account/Admin shells
- [ ] Keyboard, contrast และ reduced-motion tests
- [ ] Gate 1 ผ่าน

## Phase 2

- [ ] WEB-RB-007 รวม typed API clients และ query keys
- [ ] WEB-RB-008 Rebuild catalog
- [ ] WEB-RB-009 Rebuild product detail
- [ ] WEB-RB-010 Rebuild cart/checkout
- [ ] WEB-RB-011 Rebuild order timeline
- [ ] Commerce E2E ผ่าน
- [ ] 409/offline/incompatible/error paths ผ่าน
- [ ] Gate 2 ผ่าน

## Phase 3

- [ ] WEB-RB-012 Account shell
- [ ] WEB-RB-013 Wallet/ledger
- [ ] WEB-RB-014 Payment sandbox integration
- [ ] Steam linking flow
- [ ] Active sessions/revoke flow
- [ ] Protection status
- [ ] Support diagnostics
- [ ] Gate 3 ผ่าน

## Phase 4

- [ ] WEB-RB-015 Marketplace routes
- [ ] Capability/asset-lock fail-closed behavior
- [ ] WEB-RB-016 Event/promotion/packs/ranking/support cleanup
- [ ] Chat widget icon cleanup
- [ ] In-game command documentation
- [ ] Gate 4 ผ่าน

## Phase 5

- [ ] WEB-RB-017 Admin shell and permission navigation
- [ ] WEB-RB-018 Split admin monoliths
- [ ] Products/categories
- [ ] Orders/refunds
- [ ] Servers/plugin health/capabilities
- [ ] Users/roles/API keys
- [ ] Protection/chat ranks
- [ ] Content builder
- [ ] Audit and destructive confirmations
- [ ] Gate 5 ผ่าน

## Phase 6

- [ ] WEB-RB-019 Accessibility audit
- [ ] WEB-RB-020 Performance budgets
- [ ] WEB-RB-021 Full E2E + visual regression
- [ ] ไม่มี emoji icon ใน production UI
- [ ] ไม่มี `Laser*` imports
- [ ] ไม่มี `ark-*` classes
- [ ] ไม่มี unsupported payment method active
- [ ] ไม่มี browser call ไป `/api/plugin/**`
- [ ] WEB-RB-022 Canary deploy
- [ ] Rollback test
- [ ] Remove UI V1 flag/fallback หลัง stabilization
- [ ] Gate 6 ผ่าน

## Required report per work package

```text
Work package:
Scope/routes:
Contracts touched:
Files changed:
Behavior before:
Behavior after:
Tests run and results:
Screenshots:
Accessibility checks:
Performance impact:
Known risks:
Rollback:
Next package:
```

## Stop conditions

หยุดและรายงานเจ้าของระบบก่อนทำต่อ หาก:

- ต้องเปลี่ยน Backend/Plugin contract เพื่อให้ UI ผ่าน
- พบ money calculation ฝั่ง frontend
- พบ production payment provider ยังไม่มีจริง
- พบ marketplace เปิดขายก่อน durable asset lock พร้อม
- ต้องเปลี่ยน auth/OAuth domain
- migration มีโอกาสทำให้ order/delivery ซ้ำหรือสูญหาย
- tests เดิมที่ปกป้อง checkout, wallet, order หรือ delivery ไม่ผ่าน
