# HeartShop Backend API

Backend API สำหรับระบบ HeartShop - ร้านค้าไอเทมสำหรับ ARK: Survival Evolved

## Requirements

- Node.js 18+
- PostgreSQL 14+
- Redis (optional, for caching)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

สร้างไฟล์ `.env`:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/heartshop"
REDIS_URL="redis://localhost:6379"

# Server
PORT=3001
NODE_ENV=development

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d

# Discord OAuth
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_CALLBACK_URL=http://localhost:3001/api/auth/discord/callback

# Steam OAuth
STEAM_API_KEY=your-steam-api-key
STEAM_REALM=http://localhost:3000
STEAM_RETURN_URL=http://localhost:3001/api/auth/steam/callback

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000

# Plugin Authentication
PLUGIN_MASTER_KEY=change-this-to-a-secure-key
```

### 3. Database Setup

```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database (optional)
npx prisma db seed
```

### 4. Start Development Server

```bash
npm run dev
```

---

## ARK Server Management

### วิธีที่ 1: ใช้ Admin API (แนะนำ)

**สร้าง Server ใหม่:**
```http
POST /api/admin/servers
Authorization: Bearer <jwt-token>

{
  "name": "My ARK Server",
  "map": "TheIsland"
}
```

**ดู Server ทั้งหมด:**
```http
GET /api/admin/servers
Authorization: Bearer <jwt-token>
```

**สร้าง API Key ใหม่:**
```http
POST /api/admin/servers/:id/regenerate-key
Authorization: Bearer <jwt-token>
```

**📖 ดูเอกสารเต็มที่:** [ADMIN_API.md](../ADMIN_API.md)

### วิธีที่ 2: ใช้ Script

**สร้าง ARK Server ใหม่:**

```bash
npx tsx scripts/create-server.ts "My ARK Server" "TheIsland"
```

**Output:**
```
✅ Server created successfully!

Server Details:
================
ID: 1
Name: My ARK Server
Map: TheIsland
API Key: abc123xyz789...

📝 Add this to your ark-plugin/config.json:
================
{
  "HeartShop": {
    "ApiUrl": "http://localhost:3001/api/plugin",
    "ApiKey": "abc123xyz789...",
    "ServerId": 1
  }
}
```

### ดูรายการ Servers ทั้งหมด

```bash
npx tsx scripts/list-servers.ts
```

**Output:**
```
📋 ARK Servers
================

ID: 1
Name: My ARK Server
Map: TheIsland
API Key: abc123xyz789...
Status: 🟢 Active
Last Heartbeat: 2025-12-20 00:35:22
Webhook: Not set
---
```

### สร้าง API Key ใหม่

```bash
npx tsx scripts/regenerate-apikey.ts <server-id>
```

**Example:**
```bash
npx tsx scripts/regenerate-apikey.ts 1
```

---

## API Endpoints

### Public Endpoints

```
GET  /api/health              - Health check
GET  /api/products            - ดูรายการสินค้า
GET  /api/products/:id        - ดูรายละเอียดสินค้า
```

### User Endpoints (ต้อง Authentication)

```
GET  /api/auth/me             - ดูข้อมูลผู้ใช้ปัจจุบัน
GET  /api/auth/logout         - ออกจากระบบ

GET  /api/orders              - ดูประวัติคำสั่งซื้อ
POST /api/orders              - สั่งซื้อสินค้า

GET  /api/points/balance      - ดูยอด Points
GET  /api/points/transactions - ดูประวัติ Points
```

### ARK Plugin Endpoints (ต้อง API Key)

```
GET  /api/plugin/orders/pending         - ดึงรายการ orders ที่รอส่ง
POST /api/plugin/orders/:id/deliver     - แจ้งว่าส่งไอเทมสำเร็จ
POST /api/plugin/orders/:id/fail        - แจ้งว่าส่งไอเทมล้มเหลว
POST /api/plugin/heartbeat              - ส่ง heartbeat
POST /api/plugin/stats                  - ส่งสถิติผู้เล่น
GET  /api/plugin/player/:steamId        - ดึงข้อมูลผู้เล่น
```

### Admin Endpoints (ต้อง Admin Role)

```
GET    /api/admin/users              - จัดการผู้ใช้
POST   /api/admin/products           - สร้างสินค้า
PUT    /api/admin/products/:id       - แก้ไขสินค้า
DELETE /api/admin/products/:id       - ลบสินค้า
GET    /api/admin/orders             - ดูคำสั่งซื้อทั้งหมด
```

---

## Plugin Authentication

ARK Plugin ใช้ **API Key** authentication ผ่าน HTTP Header:

```http
X-API-Key: your-server-api-key-here
Content-Type: application/json
```

**ตัวอย่าง Request:**

```bash
curl -X GET http://localhost:3001/api/plugin/orders/pending \
  -H "X-API-Key: abc123xyz789..." \
  -H "Content-Type: application/json"
```

---

## Database Schema

### Server Model

```prisma
model Server {
  id            Int       @id @default(autoincrement())
  name          String
  map           String?
  apiKey        String    @unique
  webhookUrl    String?
  isActive      Boolean   @default(true)
  lastHeartbeat DateTime?

  orders        Order[]
  playerStats   PlayerStats[]
}
```

### User Model

```prisma
model User {
  id              String   @id @default(uuid())
  steamId         String?  @unique
  epicId          String?  @unique
  discordId       String   @unique
  discordUsername String?
  pointsBalance   BigInt   @default(0)
  isAdmin         Boolean  @default(false)
  isBanned        Boolean  @default(false)

  orders          Order[]
  pointTransactions PointTransaction[]
}
```

### Order Model

```prisma
model Order {
  id          String    @id @default(uuid())
  userId      String
  productId   Int
  serverId    Int
  quantity    Int
  totalPrice  Int
  status      String    @default("pending")

  user        User      @relation(...)
  product     Product   @relation(...)
  server      Server    @relation(...)
}
```

---

## Development

### Run Tests

```bash
npm test
```

### Lint Code

```bash
npm run lint
```

### Format Code

```bash
npm run format
```

### Database Migration

```bash
# Create migration
npx prisma migrate dev --name your_migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (⚠️ WARNING: Deletes all data!)
npx prisma migrate reset
```

---

## Deployment

### Build

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start dist/index.js --name heartshop-api

# Save PM2 config
pm2 save

# Setup PM2 startup
pm2 startup
```

---

## Troubleshooting

### Database Connection Error

1. ตรวจสอบ `DATABASE_URL` ใน `.env`
2. ตรวจสอบว่า PostgreSQL รันอยู่
3. ลอง `npx prisma db push` เพื่อ sync schema

### Plugin Authentication Failed

1. ตรวจสอบว่า API Key ถูกต้อง
2. ตรวจสอบว่า Server active (`isActive = true`)
3. ตรวจสอบ header `X-API-Key` ถูกส่งมา

### CORS Error

1. ตรวจสอบ `FRONTEND_URL` ใน `.env`
2. ตรวจสอบ CORS config ใน `src/index.ts`

---

## License

MIT
