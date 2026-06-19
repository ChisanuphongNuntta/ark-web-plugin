# การติดตั้ง HeartShop

---

## Quick Start

### Development

```bash
# 1. Clone และตั้งค่า
cp .env.example .env
# แก้ไข .env ใส่ credentials

# 2. รัน Development Stack
docker compose --profile dev up -d

# 3. เข้าใช้งาน
# Frontend: http://localhost:3000
# Backend:  http://localhost:3001
# Adminer:  http://localhost:8080
```

### Production

```bash
# 1. Generate SSL Certificates
cd docker/scripts
bash generate-certs.sh

# 2. ตั้งค่า Production Environment
cp .env.production.example .env
# แก้ไข .env ใส่ค่าจริง

# 3. รัน Production Stack
docker compose --profile prod up -d

# 4. เข้าใช้งาน
# https://your-domain.com
```

---

## รายละเอียดการติดตั้ง

### ขั้นตอนที่ 1: ตั้งค่า Environment

```bash
# สร้างไฟล์ .env
cp .env.example .env
```

แก้ไขค่าเหล่านี้:

```env
# Database
POSTGRES_USER=heartshop
POSTGRES_PASSWORD=your_secure_password

# Discord OAuth (https://discord.com/developers/applications)
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_secret

# Steam API (https://steamcommunity.com/dev/apikey)
STEAM_API_KEY=your_steam_key

# JWT Secret (generate: openssl rand -base64 64)
JWT_SECRET=your_jwt_secret
```

---

### ขั้นตอนที่ 2: เลือก Profile

| Profile | Use Case | Command |
|---------|----------|---------|
| `dev` | Development, localhost | `docker compose --profile dev up -d` |
| `prod` | Production, TLS, HA | `docker compose --profile prod up -d` |

#### Development Profile
- ไม่มี TLS (HTTP only)
- Single instance
- Debug logging
- Adminer UI

#### Production Profile
- TLS 1.3 ทุกการเชื่อมต่อ
- PostgreSQL Primary/Replica
- Redis Sentinel
- Certificate rotation ทุก 7 วัน
- AI Anomaly Detection
- Fail2Ban

---

### ขั้นตอนที่ 3: รัน Docker Compose

```bash
# Development
docker compose --profile dev up -d

# Production (ต้อง generate certs ก่อน)
docker compose --profile prod up -d

# ดู logs
docker compose logs -f backend

# หยุด
docker compose down

# Reset database
docker compose down -v
docker compose --profile dev up -d
```

---

### ขั้นตอนที่ 4: สร้าง ARK Server

```bash
# เข้า container
docker exec -it heartshop-backend-dev sh

# สร้าง server
bunx tsx scripts/create-server.ts "My ARK Server" "TheIsland"
```

บันทึก API Key ที่ได้

---

### ขั้นตอนที่ 5: ติดตั้ง ARK Plugin

1. **Build Plugin** (ถ้ายังไม่มี)
   ```bash
   cd ark-plugin
   mkdir build && cd build
   cmake .. -G "Visual Studio 17 2022" -A x64
   cmake --build . --config Release
   ```

2. **Configure Plugin**
   แก้ไข `ark-plugin/config.json`:
   ```json
   {
     "HeartShop": {
       "ApiUrl": "http://your-server:3001/api/plugin",
       "ApiKey": "your-api-key-from-step-4"
     }
   }
   ```

3. **Deploy to ARK Server**
   ```
   ARKServer/ShooterGame/Binaries/Win64/ArkApi/Plugins/HeartShop/
   ├── HeartShop.dll
   ├── config.json
   └── PluginInfo.json
   ```

4. **Restart ARK Server**

---

## Docker Services

### Development (`--profile dev`)

| Service | Port | Description |
|---------|------|-------------|
| postgres | 5433 | Database |
| redis | 6379 | Cache |
| backend-dev | 3001 | API Server |
| frontend-dev | 3000 | Web UI |
| adminer | 8080 | Database UI |

### Production (`--profile prod`)

| Service | Port | Description |
|---------|------|-------------|
| nginx | 80, 443 | Reverse Proxy (TLS) |
| postgres-primary | 5433 | Database Primary |
| postgres-replica | - | Database Replica |
| redis-primary | 6379 | Cache Primary (TLS) |
| redis-sentinel | - | HA Sentinel |
| backend | - | API (2 replicas) |
| frontend | - | Web (2 replicas) |
| cert-manager | - | Certificate Rotation |
| anomaly-detector | - | Security Monitoring |
| fail2ban | - | Intrusion Prevention |

---

## Production Security

### SSL Certificates

```bash
# Generate certificates (ครั้งแรก)
cd docker/scripts
bash generate-certs.sh

# Certificates จะ rotate อัตโนมัติทุก 7 วัน
```

### Security Features

| Feature | Description |
|---------|-------------|
| TLS 1.3 | เข้ารหัสทุกการเชื่อมต่อ |
| mTLS | PostgreSQL, Redis ใช้ client certificates |
| HSTS | Force HTTPS |
| Rate Limiting | ป้องกัน DDoS |
| Fail2Ban | Block malicious IPs |
| AI Detection | ตรวจจับ SQL Injection, XSS |

### Generate Secrets

```bash
# JWT Secret
openssl rand -base64 64

# Encryption Key
openssl rand -base64 32

# Plugin Master Key
openssl rand -base64 32

# Database Password
openssl rand -base64 32
```

---

## คำสั่งที่ใช้บ่อย

```bash
# ดู logs ทั้งหมด
docker compose logs -f

# ดู logs เฉพาะ service
docker compose logs -f backend

# เข้า shell
docker exec -it heartshop-backend-dev sh

# Prisma Studio (Database UI)
docker exec -it heartshop-backend-dev bunx prisma studio

# ดู Server ทั้งหมด
docker exec -it heartshop-backend-dev bunx tsx scripts/list-servers.ts

# สร้าง API Key ใหม่
docker exec -it heartshop-backend-dev bunx tsx scripts/regenerate-apikey.ts 1

# Run migrations
docker exec -it heartshop-backend-dev bunx prisma migrate deploy
```

---

## Troubleshooting

### Database Connection Failed
```bash
# ตรวจสอบ PostgreSQL
docker compose logs postgres

# Reset database
docker compose down -v
docker compose --profile dev up -d
```

### Plugin ไม่เชื่อมต่อ Backend
1. ตรวจสอบ API Key ถูกต้อง
2. ตรวจสอบ URL ใน config.json
3. ตรวจสอบ Firewall

### Certificate Errors (Production)
```bash
# Re-generate certificates
docker exec heartshop-cert-manager /app/generate-certs.sh

# Restart services
docker compose --profile prod restart
```

---

## Backup & Restore

### Backup Database
```bash
docker exec heartshop-postgres-primary pg_dump -U heartshop heartshop > backup.sql
```

### Restore Database
```bash
cat backup.sql | docker exec -i heartshop-postgres-primary psql -U heartshop heartshop
```

---

## Monitoring

### View Security Alerts
```bash
docker logs heartshop-anomaly-detector
```

### View Blocked IPs
```bash
docker exec heartshop-fail2ban fail2ban-client status
```

### Run Security Tests
```bash
cd tests/security
bash run-tests.sh
```
