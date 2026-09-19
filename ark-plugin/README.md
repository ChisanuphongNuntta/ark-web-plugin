# HeartShop ARK Plugin

## Current production path

The canonical production plugin in this repository is `ark-plugin/` and the
output DLL is `HeartShop.dll`. Build with:

```powershell
.\scripts\Build-Plugin.ps1
```

The build script performs a fresh CMake configure/build, runs all CTest suites,
and writes a packaged artifact plus `build-manifest.json` and `SHA256SUMS`.

### Production auth/TLS contract

`ApiUrl` must be HTTPS. Production TLS verification is on by default through the
Windows trust store. `Security.AllowInvalidCertificates` is only accepted for
localhost development endpoints and must remain `false` in production.

`ApiKey` is now the HMAC shared secret. It is used only to compute
`X-Signature`; it must never be sent as an identifier. Configure `KeyId`
separately with the backend-issued credential id used in `X-Plugin-Key-Id`.

```json
{
  "HeartShop": {
    "ApiUrl": "https://your-backend.example/api/plugin",
    "ApiKey": "your-hmac-shared-secret",
    "KeyId": "backend-issued-plugin-key-id",
    "ServerId": 1,
    "Security": {
      "AllowInvalidCertificates": false
    }
  }
}
```

Legacy endpoints that are not yet in the signed backend contract still use the
old bearer header; see `INTEGRATION_AUDIT.md` before changing endpoint auth.

ARK: Survival Evolved server plugin ที่เชื่อมต่อกับ HeartShop backend เพื่อให้ระบบซื้อขายไอเทมในเกม

## คุณสมบัติ

- ✅ ให้ไอเทมที่ผู้เล่นซื้อผ่านเว็บไซต์โดยอัตโนมัติ
- ✅ ระบบ Points สำหรับรางวัลตามเวลาเล่น/กิจกรรม
- ✅ คำสั่ง `/claim`, `/points`, `/shop`, `/link` ในเกม
- ✅ Heartbeat และ stats tracking แบบ real-time
- ✅ รองรับทั้ง Steam ID และ Epic ID

---

## โครงสร้างโปรเจค

```
ark-plugin/
├── src/                    # Source code
│   ├── HeartShop.cpp      # Plugin core
│   ├── Commands.cpp       # In-game commands
│   ├── HttpClient.cpp     # HTTP client สำหรับเชื่อมต่อ API
│   └── Config.cpp         # Config loader
├── deps/                   # Dependencies
│   ├── ArkServerApi/      # ARK Server API SDK
│   │   ├── include/       # Header files
│   │   └── lib/          # ArkApi.lib
│   └── json-3.12.0/       # nlohmann/json library
│       └── include/
├── config.json            # Plugin configuration
├── CMakeLists.txt         # Build configuration
└── README.md             # This file
```

---

## Dependencies

### 1. ARK Server API (AseApi)
- **Version**: 3.56+
- **Source**: https://github.com/ArkServerApi/AseApi
- **License**: MIT
- **Files ที่ต้องมี**:
  - `deps/ArkServerApi/include/` - Header files
  - `deps/ArkServerApi/lib/ArkApi.lib` - Link library

### 2. nlohmann/json
- **Version**: 3.12.0+
- **Source**: https://github.com/nlohmann/json
- **License**: MIT
- **Files ที่ต้องมี**:
  - `deps/json-3.12.0/include/nlohmann/json.hpp`

### 3. Build Tools
- **Visual Studio 2019/2022** with C++ Desktop Development
- **CMake 3.16+**
- **Windows 10/11 x64**

---

## การติดตั้ง Dependencies

Dependencies ทั้งหมดอยู่ในโฟลเดอร์ `deps/` แล้ว ไม่ต้องดาวน์โหลดเพิ่ม

หากต้องการอัปเดต:

### ARK Server API
```bash
cd deps
git clone https://github.com/ArkServerApi/AseApi.git ArkServerApi-Temp
cp -r ArkServerApi-Temp/version/Core/Public/* ArkServerApi/include/
cp ArkServerApi-Temp/out_lib/ArkApi.lib ArkServerApi/lib/
rm -rf ArkServerApi-Temp
```

### nlohmann/json
```bash
# ดาวน์โหลด single header file
curl -L -o deps/json-3.12.0/include/nlohmann/json.hpp \
  https://github.com/nlohmann/json/releases/download/v3.12.0/json.hpp
```

---

## วิธี Compile

### ขั้นตอนที่ 1: Generate Build Files

```bash
# ไปที่โฟลเดอร์ ark-plugin
cd ark-plugin

# สร้าง build directory
mkdir build
cd build

# Generate Visual Studio project
cmake .. -G "Visual Studio 17 2022" -A x64
```

**หมายเหตุ**: ถ้าใช้ Visual Studio 2019 ให้เปลี่ยนเป็น `"Visual Studio 16 2019"`

### ขั้นตอนที่ 2: Compile

**วิธีที่ 1: ใช้ CMake Command Line**
```bash
cmake --build . --config Release
```

**วิธีที่ 2: ใช้ Visual Studio**
1. เปิดไฟล์ `build/HeartShop.sln` ด้วย Visual Studio
2. เลือก Configuration เป็น `Release`
3. กด Build → Build Solution (Ctrl+Shift+B)

### ผลลัพธ์

ไฟล์ที่ได้หลัง compile:
```
build/bin/
├── HeartShop.dll     # Plugin DLL
└── config.json       # Config file (copied)
```

---

## การติดตั้งบน ARK Server

### ขั้นตอนที่ 1: ติดตั้ง ARK Server API

1. ดาวน์โหลด ARK Server API Installer จาก https://ark-server-api.com/
2. แตกไฟล์ลง `ARKServer/ShooterGame/Binaries/Win64/`
3. รัน server ครั้งแรก API จะติดตั้งอัตโนมัติ

### ขั้นตอนที่ 2: ติดตั้ง HeartShop Plugin

Copy ไฟล์ที่ compile แล้วไปที่:
```
ARKServer/ShooterGame/Binaries/Win64/ArkApi/Plugins/HeartShop/
├── HeartShop.dll
└── config.json
```

### ขั้นตอนที่ 3: ตั้งค่า config.json

แก้ไขไฟล์ `config.json`:

```json
{
  "HeartShop": {
    "ApiUrl": "https://your-backend.com/api/plugin",
    "ApiKey": "your-hmac-shared-secret",
    "KeyId": "backend-issued-plugin-key-id",
    "ServerId": 1,
    "Security": {
      "AllowInvalidCertificates": false
    },

    "PollInterval": 30,
    "StatsInterval": 300,
    "HeartbeatInterval": 60,

    "Messages": {
      "Prefix": "[HeartShop]",
      "ClaimSuccess": "You received: {item} x{quantity}",
      "ClaimEmpty": "You have no pending items to claim",
      "ClaimError": "Failed to claim items. Please try again later",
      "PointsBalance": "Your balance: {points} Points",
      "NotLinked": "Your account is not linked. Visit our website to link your Steam ID",
      "ShopUrl": "Visit {url} to purchase items"
    },

    "PointsReward": {
      "Enabled": true,
      "PlaytimeMinutes": 60,
      "PlaytimePoints": 10,
      "DinoKillPoints": 1,
      "HarvestPer1000Points": 1
    }
  }
}
```

**การตั้งค่าที่สำคัญ:**
- `ApiUrl`: URL ของ Backend API (รวม `/api/plugin`)
- `ApiKey`: HMAC shared secret ใช้สำหรับคำนวณ `X-Signature` เท่านั้น ห้ามส่งเป็น identifier
- `KeyId`: backend-issued plugin credential id ที่ส่งใน `X-Plugin-Key-Id`
- `Security.AllowInvalidCertificates`: ใช้เฉพาะ localhost development; production ต้องเป็น `false`
- `ServerId`: ID ของ server ในระบบ

### ขั้นตอนที่ 4: Restart Server

Restart ARK Server เพื่อโหลด plugin

---

## คำสั่งในเกม

ผู้เล่นสามารถใช้คำสั่งเหล่านี้ใน chat:

| คำสั่ง | คำอธิบาย |
|--------|---------|
| `/claim` | รับไอเทมที่ซื้อผ่านเว็บ |
| `/points` | ดูยอด Points ปัจจุบัน |
| `/shop` | แสดงลิงก์ไปยังร้านค้า |
| `/link` | แสดง Steam ID เพื่อลิงก์กับบัญชี |

---

## API Endpoints

Plugin จะเรียกใช้ API endpoints เหล่านี้:

### GET `/api/plugin/orders/pending`
ดึงรายการ orders ที่รอส่ง

**Response:**
```json
{
  "orders": [
    {
      "orderId": "uuid",
      "steamId": "76561198...",
      "item": {
        "blueprint": "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/Metal/PrimalItemArmor_MetalHelmet.PrimalItemArmor_MetalHelmet'",
        "quantity": 1,
        "quality": 100,
        "isBlueprint": false
      },
      "productName": "Metal Helmet"
    }
  ]
}
```

### POST `/api/plugin/orders/:orderId/deliver`
แจ้งว่าส่งไอเทมสำเร็จ

### POST `/api/plugin/orders/:orderId/fail`
แจ้งว่าส่งไอเทมล้มเหลว

**Body:**
```json
{
  "error": "Player offline"
}
```

### POST `/api/plugin/heartbeat`
ส่ง heartbeat เพื่อบอกว่า server ยังทำงานอยู่

**Body:**
```json
{
  "playerCount": 15,
  "map": "TheIsland"
}
```

### POST `/api/plugin/stats`
ส่งสถิติผู้เล่น

**Body:**
```json
{
  "players": [
    {
      "steamId": "76561198...",
      "playtimeMinutes": 5,
      "dinosKilled": 3,
      "resourcesHarvested": 150
    }
  ]
}
```

### GET `/api/plugin/player/:steamId`
ดึงข้อมูลผู้เล่น

**Response:**
```json
{
  "player": {
    "id": "uuid",
    "discordUsername": "Player#1234",
    "pointsBalance": 150,
    "steamId": "76561198...",
    "pendingOrders": 2
  }
}
```

---

## Authentication

Plugin ใช้ API Key authentication ผ่าน HTTP header:

```
X-API-Key: your-server-api-key-here
Content-Type: application/json
```

Backend จะตรวจสอบ API Key กับ database เพื่อระบุว่า request มาจาก server ไหน

---

## การทำงานของ Plugin

### 1. Initialization (Plugin_Init)
- โหลด config.json
- สร้าง HTTP client
- ลงทะเบียนคำสั่ง `/claim`, `/points`, etc.
- ติดตั้ง hooks สำหรับ player join/logout
- เริ่ม tick timer

### 2. Tick Loop (ทุก frame)
- **Poll Orders** (ทุก 30 วิ): ดึง pending orders และส่งให้ผู้เล่นที่ออนไลน์
- **Send Stats** (ทุก 5 นาที): ส่งสถิติผู้เล่นไปยัง backend
- **Heartbeat** (ทุก 60 วิ): ส่งสัญญาณว่า server ยังทำงาน

### 3. Player Events
- **Player Join**: เช็คว่ามี pending orders หรือไม่ แจ้งเตือนผู้เล่น
- **Player Logout**: บันทึกสถิติ (ถ้ามี)

### 4. Commands
- ผู้เล่นพิมพ์คำสั่ง → Plugin จับได้ → เรียก API → แสดงผล

---

## Troubleshooting

### Plugin ไม่โหลด
1. เช็คว่ามี ARK Server API ติดตั้งอยู่
2. ดู log ใน `ShooterGame/Binaries/Win64/ArkApi/Logs/`
3. ตรวจสอบว่า `HeartShop.dll` อยู่ใน `ArkApi/Plugins/HeartShop/`

### ไม่สามารถเชื่อมต่อ Backend
1. ตรวจสอบ `ApiUrl` ใน config.json
2. ตรวจสอบ `ApiKey` (HMAC secret) และ `KeyId` ว่าตรงกับ backend-issued credential
3. ดู backend logs เช็ค authentication errors

### ผู้เล่นไม่ได้รับไอเทม
1. ตรวจสอบว่า Blueprint path ถูกต้อง
2. เช็คว่าผู้เล่นมี inventory space เหลือ
3. ดู plugin logs หา error messages

### Compile Error
1. ตรวจสอบว่ามี Visual Studio พร้อม C++ tools
2. เช็คว่า `deps/` มี headers และ lib files ครบ
3. ลอง clean build: `rm -rf build && mkdir build`

---

## Development

### โครงสร้าง Code

```cpp
// HeartShop.cpp - Plugin core
void Init()               // Initialize plugin
void Unload()            // Cleanup
void OnTick()            // Main loop
void PollPendingOrders() // ดึง orders จาก backend
void SendPlayerStats()   // ส่งสถิติผู้เล่น
void SendHeartbeat()     // ส่ง heartbeat

// Commands.cpp - In-game commands
void ClaimCommand()      // /claim
void PointsCommand()     // /points
void ShopCommand()       // /shop
void LinkCommand()       // /link

// HttpClient.cpp - HTTP requests
void GetPendingOrders()
void MarkDelivered()
void MarkFailed()
void SendHeartbeat()
void UpdatePlayerStats()
void GetPlayerInfo()

// Config.cpp - Configuration
bool Load()              // โหลด config.json
FString GetMessage()     // ดึง message templates
```

### เพิ่ม Feature ใหม่

1. เพิ่ม function ใน `HeartShop.cpp` หรือ `Commands.cpp`
2. ถ้าต้องเพิ่ม API endpoint ใหม่ เพิ่มใน `HttpClient.cpp`
3. Compile ตาม steps ด้านบน
4. Test บน test server ก่อน deploy จริง

---

## License

MIT License - ดู LICENSE file สำหรับรายละเอียด

---

## Support

- **Discord**: https://discord.gg/your-server
- **GitHub Issues**: https://github.com/your-repo/issues
- **ARK Server API Docs**: https://ark-server-api.com/
- **ARK Modding Discord**: https://discord.gg/2uRNp99M9r

---

## Credits

- **ARK Server API**: https://github.com/ArkServerApi/AseApi
- **nlohmann/json**: https://github.com/nlohmann/json
- **HeartShop Team**: Backend และ Frontend development
