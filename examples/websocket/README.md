# WebSocket Mock Example

Mock HTTP + WebSocket จาก OpenAPI spec ด้วย SpecShot dashboard แบบ real-time

## Quick Start

```bash
npm install

# Terminal 1 — Start mock server + dashboard
npm run specshot:mock

# Terminal 2 — Open WebSocket client
npm run specshot:client
```

## Step by Step

### 1. `npm install`

ติดตั้ง specshot จากโปรเจกต์หลัก

### 2. `npm run specshot:mock`

เริ่ม mock API server (port 3457) และ dashboard (port 3456)

### 3. โหลด OpenAPI Spec ใน Dashboard

เปิด `http://localhost:3456` → tab **Configuration**:

- ใส่ `openapi.json` ในช่อง "OpenAPI URL or file path"
- กด **Load Spec**
- จะเห็น endpoints จาก Petstore spec (CRUD pets, users, store)

### 4. เลือก Endpoints ที่ต้องการ Mock

- กด toggle เปิด/ปิด endpoint ตามต้องการ
- ตั้งค่า status code, delay, mock data ได้

### 5. ตั้งค่า WebSocket Endpoint

สลับไป tab **WebSocket**:

- Path: `/ws/events`
- Description: `Real-time event stream`
- กด **Add Endpoint**

### 6. เปิด Mock Server

กด **Start Server** — mock server เริ่มที่ `http://localhost:3457`

- HTTP endpoints → `GET http://localhost:3457/pets/1`
- WebSocket endpoint → `ws://localhost:3457/ws/events`

### 7. `npm run specshot:client`

เปิด `client.html` — ต่อ `ws://localhost:3457/ws/events`

กด **Connect** → ไฟเขียว แสดงว่า connected

### 8. ส่ง Event จาก Dashboard

ใน dashboard tab **WebSocket**:

- การ์ด `/ws/events` แสดง **1 connected**
- กด **Trigger Event**
- พิมพ์ข้อความ JSON:
  ```json
  { "type": "pet_created", "id": 1, "name": "Buddy" }
  ```
- กด **Send Event**

ข้อความโผล่ใน client ทันที

## Working Together

| ฟีเจอร์ | วิธีใช้ |
|---------|--------|
| HTTP Mock | โหลด OpenAPI spec → เปิด endpoints → `GET /pets/1` ตอบ mock JSON |
| WebSocket | ตั้ง path ใน tab WebSocket → client connect → dashboard push event แบบ real-time |
| Proxy | เปิด `proxyEnabled` → request ที่ไม่มี mock forward ไป real server |
| Generate | กด **Save & Generate** → ได้ MSW handlers + Zod types |

## Architecture

```
┌──────────────────────────────────────┐
│         Dashboard (port 3456)         │
│  Configuration | Test API | WebSocket │
│                                      │
│  POST /api/websocket/trigger ──────┐ │
└────────────────────────────────────┘ │
                                       ▼
┌──────────────────────────────────────┐
│     Mock API Server (port 3457)      │
│  HTTP: mock JSON from openapi.json   │
│  WS:   ws://localhost:3457/ws/events │
└──────────┬───────────────────────────┘
           │
    ┌──────▼──────┐
    │ client.html │  ← WebSocket real-time events
    └─────────────┘
```
