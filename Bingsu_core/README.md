<div align="center">

# บิงซูบอท · Ask AA

**ระบบ Hybrid-RAG Chatbot ภาษาไทยสำหรับตอบคำถามจากเอกสารองค์กร**

ค้นแบบผสม (dense + keyword + rerank) · คำนวณราคา/อำนาจอนุมัติแบบเป๊ะ · อ้างอิงแหล่งที่มา

<br>

![Node](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)
![Postgres](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Qdrant](https://img.shields.io/badge/Qdrant-Vector_DB-DC244C?style=flat-square)
![React](https://img.shields.io/badge/React-Tailwind-61DAFB?style=flat-square&logo=react&logoColor=white)

</div>

---

## ความสามารถ

| | |
|---|---|
| **Hybrid RAG** | ค้นผสม dense (vector) + keyword + rerank |
| **อัปโหลดหลายรูปแบบ** | PDF (text + สแกน/OCR), Word, Excel — chunk + embed อัตโนมัติ |
| **ราคา / อำนาจอนุมัติ** | ตอบจากสูตร + ตารางใน DB (ไม่ให้ AI เดา) |
| **Super PM / PM** | ตอบชื่อ Super PM / PM ตามโครงสร้างบริการ |
| **Synonyms** | เชื่อมภาษาพูด ↔ คำทางการ (แอดมินแก้ได้) |
| **แยกคำถามหลายข้อ** | ถามหลายเรื่องในข้อความเดียว — ค้นแยก ตอบครบ |
| **อ้างอิงแหล่งที่มา** | การ์ดอ้างอิง + กรองแหล่งที่ไม่ตรงคำถาม |
| **โหมดส่วนตัว** | สั่งวิธีตอบ / ให้จำ ด้วย `/สั่ง` และ `/จำ` |
| **ปิดข้อมูล PII** | เซ็นเซอร์บัตร ปชช. / เบอร์ / อีเมล (ไม่โดนเลขราคา) |

---

## สถาปัตยกรรม

```
ผู้ใช้ถาม
   │
   ├─(1) Deterministic ──── ราคา / อำนาจอนุมัติ / Super PM → สูตร + DB
   │
   └─(2) RAG pipeline
        ├─ Query expansion (synonyms · multi-hop · แยกหลายคำถาม)
        ├─ Dense retrieval   → Qdrant
        ├─ Keyword retrieval → คำตรงตัว
        ├─ Merge → Rerank
        ├─ Evidence gate
        └─ LLM ตอบ + การ์ดอ้างอิง
```

```
 Web (User) :8083 ─┐
                   ├─► Legacy API :5052 ─► Postgres · Redis · Qdrant · OCR
 Supportadmin :3014 ┘
```

> Data-plane (Postgres / Redis / Qdrant / OCR) เปิดเฉพาะ `127.0.0.1` — ไม่เปิดออกอินเทอร์เน็ตโดยตรง

---

## Tech Stack

| ชั้น | เทคโนโลยี |
|---|---|
| Backend | Node.js 20 · Express |
| ORM / DB | Prisma · PostgreSQL |
| Queue / Vector | Redis · Qdrant |
| Embedding / Rerank | text-embedding-3-small · bge-reranker-v2-m3 |
| OCR | Typhoon (external) หรือ self-host ผ่าน `OCR_API_URL` |
| Frontend | React · Tailwind |

---

## เริ่มใช้งาน (Docker)

```bash
cp Backend/env.sample Backend/.env      # Windows: copy Backend\env.sample Backend\.env
# เติมคีย์แชท + embedding + (ถ้าใช้สแกน) คีย์ OCR
# ตั้ง REDIS_PASSWORD · QDRANT_API_KEY · OCR_SERVICE_API_KEY (แนะนำสำหรับ production)
docker compose up -d --build
docker compose exec legacy node server/scripts/seed-admins.js   # ครั้งแรก
```

| User | Supportadmin | API |
|:---:|:---:|:---:|
| http://localhost:8083 | http://localhost:3014 | http://localhost:5052 |

> ตั้งค่า `SEED_ADMIN_*` / `SEED_SUPPORT_*` ใน `.env` ก่อนรัน seed · **อย่า commit `.env`**

<details>
<summary><b>เข้าจากเครื่องอื่นใน LAN</b></summary>

<br>

หา IP เซิร์ฟเวอร์ แล้วเปิด `http://<IP>:8083`  
ถ้าเข้าไม่ได้ เปิด Windows Firewall (PowerShell แบบ Admin):

```powershell
New-NetFirewallRule -DisplayName "Bingsu User Web"     -Direction Inbound -Protocol TCP -LocalPort 8083 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Bingsu Supportadmin" -Direction Inbound -Protocol TCP -LocalPort 3014 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Bingsu Backend API"  -Direction Inbound -Protocol TCP -LocalPort 5052 -Action Allow -Profile Private
```

ไม่ต้องเปิด Firewall ให้พอร์ต Postgres / Redis / Qdrant / OCR (ผูกแค่ localhost)

</details>

<details>
<summary><b>ติดตั้งแบบ Local (dev)</b></summary>

<br>

```bash
docker compose up -d postgres redis qdrant ocr

cd Backend
cp env.sample .env.local
# แก้ DATABASE_URL / REDIS_URL (มีรหัส) / QDRANT_URL ให้ชี้ localhost
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
<summary><b>Environment Variables ที่สำคัญ</b></summary>

<br>

ตั้งใน `Backend/.env`

| ตัวแปร | ความหมาย |
|---|---|
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | คีย์โมเดลแชท |
| `EMBEDDING_API_KEY` · `EMBEDDING_BASE_URL` · `EMBEDDING_MODEL` | embedding |
| `DATABASE_URL` | Postgres (ใน Docker compose จะ override เป็น host `postgres`) |
| `REDIS_URL` · `REDIS_PASSWORD` | Redis (ต้องตรงกัน) |
| `QDRANT_URL` · `QDRANT_API_KEY` · `QDRANT__SERVICE__API_KEY` | Qdrant (ค่า key สองตัวควรตรงกัน) |
| `OCR_API_URL` · `OCR_SERVICE_API_KEY` | OCR self-host + auth |
| `TYPHOON_OCR_API_KEY` · `TYPHOON_OCR_API_URL` | OCR ภายนอก (ถ้าใช้) |
| `SEED_ADMIN_EMAIL` · `SEED_ADMIN_PASSWORD` | seed admin |
| `SEED_SUPPORT_EMAIL` · `SEED_SUPPORT_PASSWORD` | seed support |
| `INGEST_WEBHOOK_API_KEY` · `INGEST_WEBHOOK_USER_ID` | webhook ingest (ถ้าใช้ — บังคับทั้งคู่) |
| `UPLOAD_QUEUE_MODE` | `redis` (Docker) / `memory` (Local) |

</details>

---

## Deploy & ดูแลระบบ

```bash
# Backend
docker compose build legacy && docker compose up -d legacy

# User FE
docker compose build web && docker compose up -d web

# Supportadmin
docker compose build supportadmin && docker compose up -d supportadmin
```

| สถานการณ์ | ต้องทำ |
|---|---|
| แก้ schema | rebuild `legacy` → migration รันเอง |
| แก้เอกสาร/Excel ใน pipeline | อัปโหลดไฟล์ใหม่ |
| เปลี่ยนโมเดล embedding | re-index ทั้งหมด |
| ลืมรหัส admin/support | ใช้ `reset-password.js` |
| สำรองข้อมูล | `.\ops\backup.ps1` หรือ Task `BingsuDailyBackup` |

<details>
<summary><b>รีเซ็ตรหัส admin/support</b></summary>

<br>

```bash
docker compose exec legacy node server/scripts/reset-password.js --list
docker compose exec -e RESET_EMAIL=support@example.com -e RESET_PASSWORD="NewPass123!" \
  legacy node server/scripts/reset-password.js
```

</details>

<details>
<summary><b>Backup</b></summary>

<br>

```powershell
.\ops\backup.ps1
# หรือลงทะเบียนรันอัตโนมัติทุกวัน 02:00
.\ops\register-backup-task.ps1
```

ผลลัพธ์อยู่ที่ `backups/<timestamp>/` (Postgres dump + Qdrant snapshot)

</details>

---

## ฟีเจอร์แอดมิน (Supportadmin)

เข้าที่ http://localhost:3014

| เมนู | ทำอะไร |
|---|---|
| **Manual** | คู่มือ/แบบฟอร์มในแอดมิน — admin แก้/อัปโหลด PDF ได้ (บันทึกใน DB) |
| **Knowledge** | สร้างชุดความรู้ + อัปโหลดเอกสาร |
| **Bots** | สร้าง/แก้บอท ตั้ง prompt เลือก Knowledge |
| **Support Panel** | จัดการผู้ใช้ / อนุมัติ |
| **System → ประกาศ** | ประกาศแถบในหน้าแชทผู้ใช้ |
| **System → Synonyms** | คำพ้อง |
| **System → Service Rates** | อัตราค่าบริการที่เครื่องคำนวณใช้ |
| **System → อำนาจอนุมัติ** | ตารางกฎอนุมัติ (structured) |
| **System → Super PM / PM** | รายชื่อ Super PM / PM ตามบริการ |
| **Logs** | ประวัติการกระทำ / ล็อกอินล้มเหลว |
| **Feedback** | ความคิดเห็นจากผู้ใช้ |

> คู่มือผู้ดูแล: `คู่มือใช้งาน-Supportadmin.docx`

---

## ความปลอดภัย (สรุป)

| รายการ | สถานะ |
|---|---|
| พอร์ต Postgres / Redis / Qdrant / OCR | bind `127.0.0.1` เท่านั้น |
| Redis / Qdrant / OCR | ต้องมีรหัสหรือ API key |
| Manual PDF | ดาวน์โหลดผ่าน API ที่ล็อกอินแล้วเท่านั้น |
| System prompt ของบอทร่วม | ไม่ส่งให้ user ทั่วไป |
| Webhook ingest | ต้องมี API key + `INGEST_WEBHOOK_USER_ID` คงที่ |
| `/api/health` สาธารณะ | บอกแค่ขึ้น/ลง — รายละเอียดที่ `/api/health/detailed` (แอดมิน) |
| Backup/restore ในแอป | ปิดแล้ว (410) — ใช้ `ops/backup.ps1` |

**ตรวจเหตุการณ์ในแอป:** Supportadmin → **Logs**  
**ดู log เซิร์ฟเวอร์:** `docker compose logs -f legacy`

---

<details>
<summary><b>คำสั่งที่ใช้บ่อย · พอร์ต</b></summary>

<br>

| คำสั่ง | ความหมาย |
|---|---|
| `docker compose up -d --build` | รันทั้ง stack |
| `docker compose ps` | สถานะ container |
| `docker compose logs -f legacy` | log Backend |
| `docker compose down` | ปิด stack |

**พอร์ตที่เปิดออกโฮสต์**

| บริการ | พอร์ต | หมายเหตุ |
|---|---|---|
| User | `8083` | สาธารณะในเครื่อง/LAN ตาม Firewall |
| Supportadmin | `3014` | เช่นกัน |
| API (legacy) | `5052` | เช่นกัน |
| Postgres | `127.0.0.1:5436` | เฉพาะ localhost |
| Redis | `127.0.0.1:6382` | เฉพาะ localhost + รหัส |
| Qdrant | `127.0.0.1:6336` | เฉพาะ localhost + API key |
| OCR | `127.0.0.1:8001` | เฉพาะ localhost + API key |

</details>

<details>
<summary><b>โครงสร้างโปรเจกต์</b></summary>

<br>

```
Bingsu_core/
├── Docker-compose.yml
├── Dockerfile.web
├── ops/                     ← backup.ps1, schedule scripts
├── Backend/
│   ├── env.sample
│   ├── prisma/
│   └── server/
│       ├── routes/
│       ├── services/        ← rag, excel, approvalAuthorityDb, productManagersDb ...
│       └── scripts/
└── Frontend/
    ├── User/                ← แชทผู้ใช้
    └── Supportadmin/        ← แอดมิน
```

</details>

<details>
<summary><b>แก้ปัญหาเบื้องต้น</b></summary>

<br>

| อาการ | แนวทางแก้ |
|---|---|
| เชื่อม backend ไม่ได้ | `docker compose ps` ว่า `legacy` + `web` รัน · เปิดพอร์ต 5052 |
| ล็อกอิน admin ไม่ได้ | seed หรือ `reset-password.js` |
| Redis ต่อไม่ได้หลังอัปเดต | ตั้ง `REDIS_PASSWORD` ให้ตรงกับ `REDIS_URL` |
| Qdrant 401 | ตั้ง `QDRANT_API_KEY` และ `QDRANT__SERVICE__API_KEY` ให้ตรงกัน |
| OCR 401 | ตั้ง `OCR_SERVICE_API_KEY` ทั้งฝั่ง OCR และ legacy |
| อัปโหลดแล้วไม่ประมวลผล | `UPLOAD_QUEUE_MODE=redis` + Redis รัน |
| แชท/embedding error | เช็คคีย์ใน `Backend/.env` |
| PDF สแกนอ่านไม่ออก | `TYPHOON_OCR_API_KEY` หรือ OCR self-host |

</details>

---

<div align="center">

Repo: [Ttontrakun/Bingsu_for_sale](https://github.com/Ttontrakun/Bingsu_for_sale)

<sub>Ask AA — Hybrid RAG for NT</sub>

</div>
