# HeartShop

ระบบร้านค้าครบวงจรสำหรับเซิร์ฟเวอร์ ARK: Survival Evolved

---

## Features

### Core
- **Web Shop** - ซื้อไอเทมผ่านเว็บ (Laser Flow Theme)
- **Discord + Steam Auth** - เชื่อมบัญชี
- **Multi-Server** - รองรับหลายเซิร์ฟเวอร์
- **Points System** - ได้จากการเล่น + ซื้อเพิ่ม
- **In-Game Commands** - `/claim`, `/points`, `/shop`, `/sell`

### Advanced
- **Dino Marketplace** - ตลาดซื้อขายไดโนเสาร์
- **New Player Protection** - ป้องกันผู้เล่นใหม่ 7 วัน
- **Real-time Chat** - แชทข้ามเซิร์ฟเวอร์ + Discord + เว็บ
- **Chat Ranks** - ระบบยศและสีแชท

### Admin
- **Admin Panel** - จัดการสินค้า ผู้ใช้ คำสั่งซื้อ
- **CMS** - สร้างหน้าเนื้อหา Dynamic
- **Audit Logs** - บันทึกการกระทำทั้งหมด

---

## Architecture

```
HeartShop/
├── backend/          # Express + TypeScript API
├── frontend/         # Next.js 14 Web UI
├── ark-plugin/       # C++ ARK Server Plugin
├── docker/           # Docker configurations
└── docker-compose.yml
```

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS                                    │
└───────────────┬─────────────────────────────────┬───────────────┘
                │                                 │
        ┌───────▼───────┐                 ┌───────▼───────┐
        │   Web Browser │                 │  ARK Server   │
        │  (Port 3000)  │                 │   (Plugin)    │
        └───────┬───────┘                 └───────┬───────┘
                │                                 │
                └────────────┬────────────────────┘
                             │
                     ┌───────▼───────┐
                     │    Nginx      │  ← Production (TLS 1.3)
                     └───────┬───────┘
                             │
                     ┌───────▼───────┐
                     │  Backend API  │
                     │  (Port 3001)  │
                     └───┬───────┬───┘
                         │       │
                 ┌───────▼─┐   ┌─▼───────┐
                 │PostgreSQL│   │  Redis  │
                 │ (5433)   │   │ (6379)  │
                 └──────────┘   └─────────┘
```

### Data Flow

```
Login:      Discord OAuth → Backend → JWT → Frontend
Purchase:   Frontend → API → Order → Plugin → Deliver Items
Chat:       Game → Plugin → API → Socket.IO → Web/Discord
Points:     Playtime → Plugin → Backend → Points Added
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Backend | Bun + TypeScript + Express + Prisma |
| Frontend | Next.js 14 + React 18 + Tailwind CSS |
| Real-time | Socket.IO |
| Auth | Discord OAuth2 + Steam OpenID + JWT |
| Plugin | C++ + ARK Server API |
| Container | Docker Compose |

---

## Database Models

| Model | Description |
|-------|-------------|
| User | ผู้ใช้ (Discord + Steam + Points) |
| Product | สินค้า |
| Category | หมวดหมู่ |
| Order | คำสั่งซื้อ |
| Server | เซิร์ฟเวอร์ ARK |
| DinoListing | รายการขายไดโน |
| ChatMessage | ข้อความแชท |
| ChatRank | ยศแชท |
| PlayerProtection | ป้องกันผู้เล่นใหม่ |
| AuditLog | บันทึกการกระทำ |

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/discord` | Discord OAuth |
| GET | `/api/auth/steam` | Steam OAuth |
| GET | `/api/auth/me` | Current user |

### Shop
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products |
| POST | `/api/orders` | Create order |

### Plugin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plugin/orders/pending` | Pending orders |
| POST | `/api/plugin/orders/:id/deliver` | Mark delivered |
| GET | `/api/plugin/chat/messages` | Poll chat |

---

## Security (Production)

| Feature | Description |
|---------|-------------|
| TLS 1.3 | ทุกการเชื่อมต่อ encrypted |
| Certificate Rotation | ทุก 7 วัน |
| AI Anomaly Detection | ตรวจจับการโจมตี |
| Fail2Ban | Block IP อัตโนมัติ |
| Rate Limiting | ป้องกัน DDoS |
| HA Setup | PostgreSQL Replica, Redis Sentinel |

---

## Project Structure

```
backend/
├── src/
│   ├── controllers/    # 12 controllers
│   ├── routes/         # 13 route files
│   ├── middlewares/    # Auth, Error
│   ├── services/       # Business logic
│   └── websocket/      # Socket.IO
└── prisma/schema.prisma

frontend/
├── src/
│   ├── app/            # 29 pages
│   ├── components/     # 11 components
│   └── lib/            # API, Store

ark-plugin/
├── src/                # C++ source
├── deps/               # ARK API, JSON
└── CMakeLists.txt

docker/
├── nginx/              # Reverse proxy
├── postgres/           # SSL config
├── redis/              # TLS config
├── scripts/            # Cert rotation
└── monitoring/         # Anomaly detection
```

---

## Documentation

| File | Description |
|------|-------------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | วิธีการติดตั้งและรัน |
| [USER_GUIDE.md](USER_GUIDE.md) | คู่มือการใช้งาน |

---

## License

MIT
