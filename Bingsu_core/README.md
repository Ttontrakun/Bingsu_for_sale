<div align="center">

# บิงซูบอท · Ask AA

**Hybrid-RAG Chatbot ภาษาไทย** สำหรับตอบคำถามจากเอกสารองค์กร

ราคา · อำนาจอนุมัติ · Super PM คำนวณจากสูตร/DB · ค้นเอกสารแบบ Hybrid · อ้างอิงแหล่งที่มา

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Qdrant](https://img.shields.io/badge/Qdrant-Vector-DC244C?style=for-the-badge)](https://qdrant.tech/)
[![React](https://img.shields.io/badge/React-Tailwind-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)

<br/>

| User Web | Supportadmin | API |
|:---:|:---:|:---:|
| [localhost:8083](http://localhost:8083) | [localhost:3014](http://localhost:3014) | [localhost:5052](http://localhost:5052) |

</div>

---

## สารบัญ

1. [ความสามารถ](#ความสามารถ)
2. [สถาปัตยกรรม](#สถาปัตยกรรม)
3. [เริ่มใช้งาน (Docker)](#เริ่มใช้งาน-docker)
4. [Deploy & ดูแลระบบ](#deploy--ดูแลระบบ)
5. [ฟีเจอร์แอดมิน](#ฟีเจอร์แอดมิน-supportadmin)
6. [ความปลอดภัย](#ความปลอดภัย)
7. [คำสั่ง · พอร์ต · โครงสร้าง · แก้ปัญหา](#คำสั่ง--พอร์ต--โครงสร้าง--แก้ปัญหา)

---

## ความสามารถ

| หัวข้อ | รายละเอียด |
|:---|:---|
| Hybrid RAG | ค้นผสม dense (vector) + keyword + rerank |
| อัปโหลดเอกสาร | PDF (text / สแกน+OCR), Word, Excel — chunk + embed อัตโนมัติ |
| ราคา / อำนาจอนุมัติ | ตอบจากสูตร + ตารางใน DB — ไม่ให้ AI เดา |
| Super PM / PM | ตอบชื่อตามโครงสร้างบริการ |
| Synonyms | เชื่อมภาษาพูด ↔ คำทางการ (แอดมินแก้ได้) |
| หลายคำถามในข้อความเดียว | แยกค้น ตอบครบ |
| อ้างอิงแหล่งที่มา | การ์ดอ้างอิง + กรองแหล่งที่ไม่ตรง |
| โหมดส่วนตัว | `/สั่ง` วิธีตอบ · `/จำ` ข้อมูล |
| ปิด PII | เซ็นเซอร์บัตร ปชช. / เบอร์ / อีเมล (ไม่โดนเลขราคา) |

---

## สถาปัตยกรรม

**เส้นทางตอบคำถาม**

```text
ผู้ใช้ถาม
   │
   ├─ (1) Deterministic ──► ราคา / อำนาจอนุมัติ / Super PM  → สูตร + DB
   │
   └─ (2) RAG pipeline
          ├─ Query expansion   (synonyms · multi-hop · แยกหลายคำถาม)
          ├─ Dense retrieval   → Qdrant
          ├─ Keyword retrieval → คำตรงตัว
          ├─ Merge → Rerank
          ├─ Evidence gate
          └─ LLM ตอบ + การ์ดอ้างอิง
```

**บริการ**

```text
  User Web :8083  ──┐
                    ├──►  API (legacy) :5052  ──►  Postgres · Redis · Qdrant · OCR
  Supportadmin :3014┘
```

> Data-plane (Postgres / Redis / Qdrant / OCR) ผูกแค่ `127.0.0.1` — ไม่เปิดออกอินเทอร์เน็ตโดยตรง

### Tech stack

| ชั้น | เทคโนโลยี |
|:---|:---|
| Backend | Node.js 20 · Express |
| ORM / DB | Prisma · PostgreSQL |
| Queue / Vector | Redis · Qdrant |
| Embedding / Rerank | `text-embedding-3-small` · `bge-reranker-v2-m3` |
| OCR | Typhoon (ภายนอก) หรือ self-host ผ่าน `OCR_API_URL` |
| Frontend | React · Tailwind |

---

## เริ่มใช้งาน (Docker)

```bash
# 1) สร้างไฟล์ env
cp Backend/env.sample Backend/.env
# Windows:  copy Backend\env.sample Backend\.env

# 2) เติมคีย์ใน Backend/.env
#    - คีย์แชท + embedding (+ OCR ถ้าใช้สแกน)
#    - REDIS_PASSWORD · QDRANT_API_KEY · OCR_SERVICE_API_KEY  (แนะนำ production)
#    - SEED_ADMIN_* / SEED_SUPPORT_*

# 3) รัน stack
docker compose up -d --build

# 4) seed แอดมิน (ครั้งแรก)
docker compose exec legacy node server/scripts/seed-admins.js
```

เปิดใช้งาน:

| หน้า | URL |
|:---|:---|
| User | http://localhost:8083 |
| Supportadmin | http://localhost:3014 |
| API | http://localhost:5052 |

> **อย่า commit** ไฟล์ `Backend/.env`

<details>
<summary><b>เข้าจากเครื่องอื่นใน LAN</b></summary>

<br/>

เปิด `http://<IP-เซิร์ฟเวอร์>:8083`  
ถ้าเข้าไม่ได้ (PowerShell แบบ Admin):

```powershell
New-NetFirewallRule -DisplayName "Bingsu User Web"     -Direction Inbound -Protocol TCP -LocalPort 8083 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Bingsu Supportadmin" -Direction Inbound -Protocol TCP -LocalPort 3014 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Bingsu Backend API"  -Direction Inbound -Protocol TCP -LocalPort 5052 -Action Allow -Profile Private
```

ไม่ต้องเปิด Firewall ให้ Postgres / Redis / Qdrant / OCR

</details>

<details>
<summary><b>ติดตั้งแบบ Local (dev)</b></summary>

<br/>

```bash
docker compose up -d postgres redis qdrant ocr

cd Backend
cp env.sample .env.local
# แก้ DATABASE_URL / REDIS_URL (มีรหัส) / QDRANT_URL → localhost
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run seed:admins
npm run dev:legacy
```

Frontend:

```bash
cd Frontend/User
npm install && npm start
# REACT_APP_API_BASE_URL=http://localhost:5052
```

</details>

<details>
<summary><b>Environment variables สำคัญ</b></summary>

<br/>

ตั้งใน `Backend/.env`

| ตัวแปร | ความหมาย |
|:---|:---|
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | คีย์โมเดลแชท |
| `EMBEDDING_API_KEY` · `EMBEDDING_BASE_URL` · `EMBEDDING_MODEL` | embedding |
| `DATABASE_URL` | Postgres (Docker compose จะชี้ host `postgres`) |
| `REDIS_URL` · `REDIS_PASSWORD` | Redis — ค่าต้องตรงกัน |
| `QDRANT_URL` · `QDRANT_API_KEY` · `QDRANT__SERVICE__API_KEY` | Qdrant — key สองตัวควรตรงกัน |
| `OCR_API_URL` · `OCR_SERVICE_API_KEY` | OCR self-host + auth |
| `TYPHOON_OCR_API_KEY` · `TYPHOON_OCR_API_URL` | OCR ภายนอก (ถ้าใช้) |
| `SEED_ADMIN_EMAIL` · `SEED_ADMIN_PASSWORD` | seed admin |
| `SEED_SUPPORT_EMAIL` · `SEED_SUPPORT_PASSWORD` | seed support |
| `INGEST_WEBHOOK_API_KEY` · `INGEST_WEBHOOK_USER_ID` | webhook ingest — บังคับทั้งคู่ |
| `UPLOAD_QUEUE_MODE` | `redis` (Docker) / `memory` (Local) |

</details>

---

## Deploy & ดูแลระบบ

```bash
docker compose build legacy && docker compose up -d legacy                 # Backend
docker compose build web && docker compose up -d web                       # User FE
docker compose build supportadmin && docker compose up -d supportadmin     # Supportadmin
```

| สถานการณ์ | ทำอะไร |
|:---|:---|
| แก้ schema | rebuild `legacy` → migration รันเอง |
| แก้เอกสาร / Excel ใน pipeline | อัปโหลดไฟล์ใหม่ |
| เปลี่ยนโมเดล embedding | re-index ทั้งชุด |
| ลืมรหัส admin / support | ใช้ `reset-password.js` |
| สำรองข้อมูล | `.\ops\backup.ps1` หรือ Task `BingsuDailyBackup` |

<details>
<summary><b>รีเซ็ตรหัส admin / support</b></summary>

<br/>

```bash
docker compose exec legacy node server/scripts/reset-password.js --list
docker compose exec -e RESET_EMAIL=support@example.com -e RESET_PASSWORD="NewPass123!" \
  legacy node server/scripts/reset-password.js
```

</details>

<details>
<summary><b>Backup</b></summary>

<br/>

```powershell
.\ops\backup.ps1

# ลงทะเบียนรันอัตโนมัติทุกวัน 02:00
.\ops\register-backup-task.ps1
```

ผลลัพธ์: `backups/<timestamp>/` (Postgres dump + Qdrant snapshot)

</details>

---

## ฟีเจอร์แอดมิน (Supportadmin)

เข้าที่ **http://localhost:3014**

| เมนู | ทำอะไร |
|:---|:---|
| Manual | คู่มือ / แบบฟอร์ม — admin แก้และอัปโหลด PDF ได้ (เก็บใน DB) |
| Knowledge | สร้างชุดความรู้ + อัปโหลดเอกสาร |
| Bots | สร้าง / แก้บอท · ตั้ง prompt · เลือก Knowledge |
| Support Panel | จัดการผู้ใช้ / อนุมัติ |
| System → ประกาศ | แถบประกาศในหน้าแชทผู้ใช้ |
| System → Synonyms | คำพ้อง |
| System → Service Rates | อัตราค่าบริการสำหรับเครื่องคำนวณ |
| System → อำนาจอนุมัติ | ตารางกฎอนุมัติ (structured) |
| System → Super PM / PM | รายชื่อตามบริการ |
| Logs | ประวัติการกระทำ / ล็อกอินล้มเหลว |
| Feedback | ความคิดเห็นจากผู้ใช้ |

คู่มือผู้ดูแล: [`คู่มือใช้งาน-Supportadmin.docx`](./คู่มือใช้งาน-Supportadmin.docx)

---

## ความปลอดภัย

| รายการ | สถานะ |
|:---|:---|
| Postgres / Redis / Qdrant / OCR | bind `127.0.0.1` เท่านั้น |
| Redis / Qdrant / OCR | ต้องมีรหัสหรือ API key |
| Manual PDF | ดาวน์โหลดผ่าน API ที่ล็อกอินแล้วเท่านั้น |
| System prompt ของบอทร่วม | ไม่ส่งให้ user ทั่วไป |
| Webhook ingest | ต้องมี API key + `INGEST_WEBHOOK_USER_ID` |
| `/api/health` สาธารณะ | บอกแค่ขึ้น/ลง — รายละเอียดที่ `/api/health/detailed` (แอดมิน) |
| Backup / restore ในแอป | ปิดแล้ว (410) — ใช้ `ops/backup.ps1` |

| ตรวจอะไร | ที่ไหน |
|:---|:---|
| เหตุการณ์ในแอป | Supportadmin → **Logs** |
| Log เซิร์ฟเวอร์ | `docker compose logs -f legacy` |

---

## คำสั่ง · พอร์ต · โครงสร้าง · แก้ปัญหา

<details open>
<summary><b>คำสั่งที่ใช้บ่อย</b></summary>

<br/>

| คำสั่ง | ความหมาย |
|:---|:---|
| `docker compose up -d --build` | รันทั้ง stack |
| `docker compose ps` | สถานะ container |
| `docker compose logs -f legacy` | ตาม log Backend |
| `docker compose down` | ปิด stack |

</details>

<details>
<summary><b>พอร์ต</b></summary>

<br/>

| บริการ | พอร์ต | การเข้าถึง |
|:---|:---|:---|
| User | `8083` | โฮสต์ / LAN (ตาม Firewall) |
| Supportadmin | `3014` | โฮสต์ / LAN |
| API (legacy) | `5052` | โฮสต์ / LAN |
| Postgres | `127.0.0.1:5436` | localhost เท่านั้น |
| Redis | `127.0.0.1:6382` | localhost + รหัส |
| Qdrant | `127.0.0.1:6336` | localhost + API key |
| OCR | `127.0.0.1:8001` | localhost + API key |

</details>

<details>
<summary><b>โครงสร้างโปรเจกต์</b></summary>

<br/>

```text
Bingsu_core/
├── Docker-compose.yml
├── Dockerfile.web
├── ops/                      # backup.ps1, schedule scripts
├── Backend/
│   ├── env.sample
│   ├── prisma/
│   └── server/
│       ├── routes/
│       ├── services/         # rag, excel, approvalAuthorityDb, ...
│       └── scripts/
└── Frontend/
    ├── User/                 # แชทผู้ใช้
    └── Supportadmin/         # แอดมิน
```

</details>

<details>
<summary><b>แก้ปัญหาเบื้องต้น</b></summary>

<br/>

| อาการ | แนวทางแก้ |
|:---|:---|
| เชื่อม backend ไม่ได้ | `docker compose ps` ตรวจ `legacy` + `web` · เปิดพอร์ต `5052` |
| ล็อกอิน admin ไม่ได้ | seed หรือ `reset-password.js` |
| Redis ต่อไม่ได้หลังอัปเดต | ให้ `REDIS_PASSWORD` ตรงกับ `REDIS_URL` |
| Qdrant 401 | ให้ `QDRANT_API_KEY` ตรงกับ `QDRANT__SERVICE__API_KEY` |
| OCR 401 | ตั้ง `OCR_SERVICE_API_KEY` ทั้งฝั่ง OCR และ legacy |
| อัปโหลดแล้วไม่ประมวลผล | `UPLOAD_QUEUE_MODE=redis` + Redis รันอยู่ |
| แชท / embedding error | เช็คคีย์ใน `Backend/.env` |
| PDF สแกนอ่านไม่ออก | `TYPHOON_OCR_API_KEY` หรือ OCR self-host |

</details>

---

<div align="center">

[Ttontrakun/Bingsu_for_sale](https://github.com/Ttontrakun/Bingsu_for_sale)

<sub>Ask AA — Hybrid RAG for NT</sub>

</div>
