<div align="center">

# 🫐 บิงซูบอท · Ask AA

**ระบบ Hybrid-RAG Chatbot ภาษาไทยสำหรับตอบคำถามจากเอกสารองค์กร**

ค้นแบบผสม (dense + keyword + rerank) · คำนวณราคาแบบเป๊ะ 100% · อ้างอิงแหล่งที่มา

<br>

![Node](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)
![Postgres](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Qdrant](https://img.shields.io/badge/Qdrant-Vector_DB-DC244C?style=flat-square)
![React](https://img.shields.io/badge/React-Tailwind-61DAFB?style=flat-square&logo=react&logoColor=white)

</div>

---

## ✨ ความสามารถ

| | |
|---|---|
| 🔍 **Hybrid RAG** | ค้นผสม dense (vector) + keyword + rerank แม่นทั้งความหมายและคำเฉพาะ |
| 📄 **อัปโหลดหลายรูปแบบ** | PDF (text + สแกน/OCR), Word, Excel — chunk + embed อัตโนมัติ |
| 🎯 **คำนวณราคาเป๊ะ** | ราคา/ส่วนลด/อำนาจอนุมัติ ตอบจากสูตร + อัตราใน DB ไม่ให้ AI เดา |
| 🔗 **Synonyms** | เชื่อม "ภาษาพูด ↔ คำทางการ" (แอดมินเพิ่มเองได้) |
| 🧩 **แยกคำถามหลายข้อ** | ถามหลายเรื่องในข้อความเดียว — ค้นแยก ตอบครบ |
| 📌 **อ้างอิงแหล่งที่มา** | แนบการ์ดอ้างอิง + กรองแหล่งที่ไม่ตรงคำถามออก |
| 🔒 **โหมดส่วนตัว** | สั่งวิธีตอบ/ให้จำข้อมูล ด้วย `/สั่ง` และ `/จำ` |
| 🛡️ **ปิดข้อมูล PII** | เซ็นเซอร์บัตร ปชช./เบอร์/อีเมล (ไม่โดนเลขราคา) |

---

## 🏗️ สถาปัตยกรรม

```
ผู้ใช้ถาม
   │
   ├─(1) Deterministic ──── คำถามราคา/อำนาจอนุมัติ → ตอบจากสูตร + DB (เป๊ะ 100%)
   │
   └─(2) RAG pipeline
        ├─ Query expansion (synonyms · multi-hop · แยกหลายคำถาม)
        ├─ Dense retrieval   → Qdrant
        ├─ Keyword retrieval → คำตรงตัว (ตัวเลข/รุ่น/ชื่อ)
        ├─ Merge → Rerank (bge-reranker-v2-m3)
        ├─ Evidence gate     → ไม่มีหลักฐานจริงก็ไม่มั่ว
        └─ LLM ตอบ + การ์ดอ้างอิง
```

<div align="center">

```
 Web (User) :8083 ─┐
                   ├─► Legacy API :5052 ─► Postgres · Redis · Qdrant
 Supportadmin :3014 ┘
```

</div>

---

## 🧱 Tech Stack

| ชั้น | เทคโนโลยี |
|---|---|
| Backend | Node.js 20 · Express |
| ORM / DB | Prisma · PostgreSQL |
| Queue / Vector | Redis · Qdrant |
| Embedding / Rerank | text-embedding-3-small · bge-reranker-v2-m3 |
| OCR | Typhoon (external) หรือ self-host ผ่าน `OCR_API_URL` |
| Frontend | React · Tailwind |

---

## 🚀 เริ่มใช้งาน (Docker)

```bash
cd bb                                   # เข้าโฟลเดอร์ Bingsu_core
cp Backend/env.sample Backend/.env      # เตรียม .env (Windows: copy)
#  ↳ เติมคีย์แชท + embedding + (ถ้าใช้สแกน) คีย์ OCR ใน Backend/.env
docker compose up -d --build            # รันทั้ง stack (migration รันเองอัตโนมัติ)
docker compose exec legacy node server/scripts/seed-admins.js   # สร้างแอดมิน (ครั้งแรก)
```

<div align="center">

| 🌐 User | 🛠️ Supportadmin | ⚙️ API |
|:---:|:---:|:---:|
| http://localhost:8083 | http://localhost:3014 | http://localhost:5052 |

</div>

> 💡 ตั้งค่า `SEED_ADMIN_*` / `SEED_SUPPORT_*` ใน `.env` ก่อนรัน seed

<details>
<summary><b>🌐 เข้าจากเครื่องอื่นใน LAN</b></summary>

<br>

หา IP เครื่องเซิร์ฟเวอร์ (`ipconfig` / `ip addr`) แล้วเปิด `http://<IP>:8083`
ถ้าเข้าไม่ได้ เปิด Windows Firewall (PowerShell แบบ Admin):

```powershell
New-NetFirewallRule -DisplayName "bb User Web"     -Direction Inbound -Protocol TCP -LocalPort 8083 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "bb Supportadmin" -Direction Inbound -Protocol TCP -LocalPort 3014 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "bb Backend API"  -Direction Inbound -Protocol TCP -LocalPort 5052 -Action Allow -Profile Private
```

</details>

<details>
<summary><b>⚙️ ติดตั้งแบบ Local (สำหรับ dev)</b></summary>

<br>

รัน Backend/Frontend บนเครื่อง ใช้ Docker เฉพาะ infra

```bash
cd bb
docker compose up -d postgres redis qdrant        # 1) infra

cd Backend
cp env.sample .env.local                           # 2) แก้ DATABASE_URL/REDIS_URL/QDRANT_URL ให้ชี้ localhost
npm install
npm run prisma:generate
npm run prisma:migrate:deploy                      # 3) เตรียม DB
npm run seed:admins                                # (ครั้งแรก)
npm run dev:legacy                                 # 4) Backend :5052
```

Frontend (อีก terminal):
```bash
cd bb/Frontend/User
npm install && npm start                           # :3000 · ตั้ง REACT_APP_API_BASE_URL=http://localhost:5052
```

</details>

<details>
<summary><b>🔑 Environment Variables ที่สำคัญ</b></summary>

<br>

ตั้งใน `Backend/.env` (Docker) หรือ `Backend/.env.local` (Local)

| ตัวแปร | ความหมาย |
|---|---|
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | คีย์โมเดลแชท |
| `EMBEDDING_API_KEY` · `EMBEDDING_BASE_URL` · `EMBEDDING_MODEL` | ตั้งค่า embedding |
| `DATABASE_URL` · `REDIS_URL` · `QDRANT_URL` | เชื่อม infra (Docker override ให้แล้ว) |
| `SEED_ADMIN_EMAIL` · `SEED_ADMIN_PASSWORD` | บัญชี admin ตอน seed |
| `SEED_SUPPORT_EMAIL` · `SEED_SUPPORT_PASSWORD` | บัญชี support ตอน seed |
| `TYPHOON_OCR_API_KEY` · `TYPHOON_OCR_API_URL` | OCR สแกน (external) |
| `OCR_API_URL` | OCR service ที่ self-host เอง (แทน Typhoon) |
| `UPLOAD_QUEUE_MODE` | `redis` (Docker) / `memory` (Local) |
| `QDRANT_TOP_K` | จำนวน chunk ต่อคำถาม (ดีฟอลต์ 12) |

> ⚠️ `env.sample` ไม่มี key — copy ไปเป็น `.env` แล้วเติมค่าจริง · **อย่า commit `.env`**

</details>

---

## 🔄 Deploy & ดูแลระบบ

```bash
# หลังแก้โค้ด Backend
docker compose build legacy && docker compose up -d legacy

# หลังแก้โค้ด Frontend (User)
docker compose build web && docker compose up -d web
```

| สถานการณ์ | ต้องทำ |
|---|---|
| แก้ schema ฐานข้อมูล | rebuild `legacy` → migration รันเองอัตโนมัติ |
| แก้ pipeline Excel/เอกสาร | **อัปโหลดไฟล์ใหม่** (ของเดิม embed ไปแล้ว) |
| เปลี่ยนโมเดล embedding | **re-index ทั้งหมด** (มิติเวกเตอร์ต่างกัน) |
| ลืมรหัส admin/support | รีเซ็ตด้วยสคริปต์ (ดูด้านล่าง) |

<details>
<summary><b>🔐 รีเซ็ตรหัส admin/support</b></summary>

<br>

รหัสใน DB เป็น bcrypt (ถอดกลับไม่ได้) — รีเซ็ตแทน:

```bash
docker compose exec legacy node server/scripts/reset-password.js --list          # ดูอีเมลที่มี
docker compose exec -e RESET_EMAIL=support@example.com -e RESET_PASSWORD="NewPass123!" \
  legacy node server/scripts/reset-password.js
```

</details>

---

## 🛠️ ฟีเจอร์แอดมิน (Supportadmin)

เข้าที่ http://localhost:3014 · บัญชี role `admin`

| เมนู | ทำอะไร |
|---|---|
| **Knowledge** | สร้างชุดความรู้ + อัปโหลดเอกสาร |
| **Bots** | สร้าง/แก้บอท ตั้ง prompt เลือก Knowledge |
| **Synonyms** | เพิ่มคำพ้อง เชื่อมภาษาพูด ↔ คำในเอกสาร |
| **Service Rates** | แก้อัตราค่าบริการที่เครื่องคำนวณใช้ (ไม่ต้องแตะโค้ด) |
| **Activity Logs** | ประวัติการกระทำในระบบ |

> 📘 คู่มือละเอียดสำหรับผู้ดูแล: `คู่มือใช้งาน-Supportadmin.docx`

<details>
<summary><b>📟 คำสั่งที่ใช้บ่อย · Debug · พอร์ต</b></summary>

<br>

| คำสั่ง | ความหมาย |
|---|---|
| `docker compose up -d --build` | รันทั้ง stack |
| `docker compose ps` | ดูสถานะ container |
| `docker compose logs -f legacy` | ดู log Backend |
| `docker compose down` | ปิด stack |

**Debug คำตอบไม่ตรง:** `GET /api/chat/:conversationId/debug-context?message=<คำถาม>`
(แนบ `Authorization: Bearer ...`) → คืน `groundingChunks` · `references` · `usedFallback`

**พอร์ต:** User `8083` · Supportadmin `3014` · Backend `5052` · Postgres `5436` · Redis `6382` · Qdrant `6336`

</details>

<details>
<summary><b>📁 โครงสร้างโปรเจกต์</b></summary>

<br>

```
bb/  (Bingsu_core)
├── README.md                    ← คู่มือนี้
├── Docker-compose.yml           ← รันทั้ง stack
├── Dockerfile.web               ← build Frontend User + nginx
├── คู่มือใช้งาน-Supportadmin.docx ← คู่มือผู้ดูแล (non-dev)
├── Backend/
│   ├── env.sample               ← เทมเพลต .env (ไม่มี key)
│   ├── prisma/                  ← schema + migrations
│   └── server/
│       ├── routes/              ← auth, conversations, documents, support ...
│       ├── services/            ← rag.js, excel.js, rerank.js, uploadQueue.js ...
│       ├── lib/                 ← privacy.js (PII mask) ฯลฯ
│       └── scripts/             ← seed-admins.js, reset-password.js ...
└── Frontend/
    ├── User/                    ← หน้าเว็บผู้ใช้
    └── Supportadmin/            ← หน้าแอดมิน
```

**ไฟล์บริการหลัก:** `rag.js` (hybrid retrieval) · `excel.js` (parse ตาราง) · `rerank.js` · `uploadQueue.js` (OCR/structure) · `ntCorpPricingDb.js` (คำนวณราคา)

</details>

<details>
<summary><b>🩹 แก้ปัญหาเบื้องต้น</b></summary>

<br>

| อาการ | แนวทางแก้ |
|---|---|
| เชื่อม backend ไม่ได้ / อัปโหลดไม่ได้ | เช็ค `docker compose ps` ว่า `legacy` + `web` รัน · พอร์ต 8083 ชนใช้ `docker-compose.port8080.yml` |
| ล็อกอิน admin ไม่ได้ | seed ก่อน หรือ reset ด้วย `reset-password.js` |
| เปิดจาก LAN ต่อ backend ไม่ได้ | เปิด Firewall พอร์ต 8083, 3014, **5052** |
| อัปโหลดแล้วไม่ประมวลผล | Docker ต้องใช้ `UPLOAD_QUEUE_MODE=redis` + Redis รัน |
| แชท/embedding error เรื่อง key | เช็คคีย์ใน `Backend/.env` |
| Excel ตอบไม่ตรง | ลบเอกสารเดิมแล้วอัปใหม่ |
| PDF สแกนอ่านไม่ออก | ตั้ง `TYPHOON_OCR_API_KEY` หรือ `OCR_API_URL` |

**สคริปต์ช่วยตรวจ:** `.\check-worker.ps1` (หรือ `.bat`)

</details>

---

<div align="center">

**ลิงก์:** [Backend](Backend/README.md) · [Frontend User](Frontend/User/README.md) · [Supportadmin](Frontend/Supportadmin/README.md) · คู่มือผู้ดูแล `.docx`

<sub>🫐 Ask AA — Hybrid RAG for NT</sub>

</div>
