# คู่มือการใช้งาน HeartShop

---

## สำหรับผู้เล่น

### เริ่มต้นใช้งาน

1. **เข้าเว็บไซต์** HeartShop
2. **Login ด้วย Discord** - คลิกปุ่ม "Login with Discord"
3. **เชื่อม Steam** - ไปที่ Profile > Link Steam Account
4. **เริ่มช้อปปิ้ง!**

---

### การซื้อสินค้า

1. เลือกสินค้าจากหน้า **Shop**
2. คลิก **ซื้อ** และยืนยันการสั่งซื้อ
3. Points จะถูกหักอัตโนมัติ
4. เข้าเกม ARK แล้วพิมพ์ `/claim`

---

### คำสั่งในเกม

| คำสั่ง | การใช้งาน |
|--------|-----------|
| `/claim` | รับไอเทมที่ซื้อแล้ว |
| `/points` | ดูยอด Points ของตัวเอง |
| `/shop` | รับ URL ร้านค้า |
| `/sell` | ขายไดโนเสาร์ในตลาด |
| `/link` | รับ Steam ID สำหรับเชื่อมบัญชี |

---

### การได้รับ Points

| วิธี | จำนวน Points |
|------|--------------|
| เล่นเกม (ทุก 30 นาที) | 10 Points |
| Vote เซิร์ฟเวอร์ | 50 Points |
| ซื้อ Points | ตามราคา |

---

### ตลาดไดโนเสาร์

#### ขายไดโน
1. ขี่ไดโนที่ต้องการขาย
2. พิมพ์ `/sell <ราคา>`
3. ไดโนจะถูกลงรายการในตลาด

#### ซื้อไดโน
1. เข้าหน้า **Market** บนเว็บ
2. เลือกไดโนที่ต้องการ
3. คลิก **ซื้อ**
4. เข้าเกมแล้วพิมพ์ `/claim`

---

### ระบบป้องกันผู้เล่นใหม่

ผู้เล่นใหม่จะได้รับการป้องกัน **7 วัน**:
- ไม่ถูก raid
- ไม่ถูกโจมตีจาก tribe อื่น
- ไดโนและฐานได้รับการป้องกัน

---

### แชท

สามารถแชทได้ 3 ช่องทาง:
- **ในเกม** - พิมพ์ในแชทปกติ
- **บนเว็บ** - Chat Widget มุมขวาล่าง
- **Discord** - ช่อง #game-chat

ทั้ง 3 ช่องทางเชื่อมต่อกัน!

---

## สำหรับ Admin

### เข้าหน้า Admin

1. Login ด้วยบัญชีที่มีสิทธิ์ Admin
2. ไปที่ `/admin`

---

### จัดการสินค้า

| หน้า | การใช้งาน |
|------|-----------|
| `/admin/products` | เพิ่ม/แก้ไข/ลบสินค้า |
| `/admin/categories` | จัดการหมวดหมู่ |

#### เพิ่มสินค้าใหม่
1. ไปที่ Products > Add Product
2. กรอกข้อมูล:
   - **Name**: ชื่อสินค้า
   - **Price**: ราคา (Points)
   - **Blueprint**: ARK Blueprint Path
   - **Quantity**: จำนวนต่อครั้ง
   - **Category**: หมวดหมู่
3. คลิก **Save**

---

### จัดการผู้ใช้

| หน้า | การใช้งาน |
|------|-----------|
| `/admin/users` | ดู/แก้ไขข้อมูลผู้ใช้ |

สามารถ:
- ดูประวัติการซื้อ
- เพิ่ม/ลด Points
- แบน/ปลดแบน
- เปลี่ยน Role

---

### จัดการ Server

| หน้า | การใช้งาน |
|------|-----------|
| `/admin/servers` | จัดการ ARK Servers |

สามารถ:
- เพิ่ม Server ใหม่
- ดู API Key
- Regenerate API Key
- ดู Status และ Heartbeat

---

### จัดการ Chat Ranks

| หน้า | การใช้งาน |
|------|-----------|
| `/admin/chat-ranks` | จัดการยศแชท |

สามารถ:
- สร้างยศใหม่
- กำหนดสีและ prefix
- กำหนดเงื่อนไข (Points, Playtime)

---

### จัดการเนื้อหา (CMS)

| หน้า | การใช้งาน |
|------|-----------|
| `/admin/content` | สร้าง/แก้ไขหน้าเนื้อหา |

สามารถ:
- สร้างหน้าข่าวสาร
- สร้างหน้ากิจกรรม
- แก้ไข Terms of Service
- แก้ไข Privacy Policy

---

### ดู Logs

| หน้า | การใช้งาน |
|------|-----------|
| `/admin/logs` | ดูประวัติการกระทำ |

บันทึก:
- การ Login
- การซื้อสินค้า
- การเปลี่ยนแปลงข้อมูล
- Security Events

---

## API สำหรับนักพัฒนา

### User API Key

ผู้ใช้สามารถสร้าง API Key เพื่อเข้าถึง API ได้:

1. ไปที่ **Profile** > **API Keys**
2. คลิก **Generate New Key**
3. ใช้ Key ใน Header: `X-User-API-Key: your-key`

### Endpoints

```bash
# ดูข้อมูลตัวเอง
curl -H "X-User-API-Key: YOUR_KEY" https://api.example.com/api/users/me

# ดู Points
curl -H "X-User-API-Key: YOUR_KEY" https://api.example.com/api/users/points

# ดู Orders
curl -H "X-User-API-Key: YOUR_KEY" https://api.example.com/api/orders
```

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| General API | 100 req/15min |
| Auth | 5 req/min |
| Plugin API | 60 req/min |

---

## FAQ

### Q: ทำไมซื้อสินค้าแล้ว /claim ไม่ได้?
**A:** ตรวจสอบว่า:
1. Steam ID เชื่อมกับบัญชีแล้ว
2. เข้าเกมด้วย Steam ID เดียวกัน
3. Order สถานะ "pending"

### Q: Points หายไปไหน?
**A:** ดูประวัติ Points ที่หน้า Profile > Transaction History

### Q: ไดโนที่ขายไม่เห็นในตลาด?
**A:** ตรวจสอบว่า:
1. ขายสำเร็จ (ได้รับข้อความยืนยัน)
2. รอ 1-2 นาทีให้ระบบ sync

### Q: ลืม API Key?
**A:** ไปที่ Profile > API Keys > Regenerate

### Q: เชื่อม Discord ผิดบัญชี?
**A:** ติดต่อ Admin เพื่อ unlink

---

## ติดต่อ

- **Discord**: discord.gg/xxxxx
- **Email**: support@example.com
