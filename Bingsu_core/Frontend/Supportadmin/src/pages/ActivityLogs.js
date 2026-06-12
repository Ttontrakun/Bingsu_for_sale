import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { HiRefresh, HiClipboardList, HiFilter, HiChevronDown, HiChevronUp } from 'react-icons/hi';
import { api } from '../services/api';

const EVENT_LABEL_TH = {
  'auth.login': 'เข้าสู่ระบบ',
  'auth.logout': 'ออกจากระบบ',
  'auth.email.verified': 'ยืนยันอีเมล',
  'auth.email.resend': 'ส่งอีเมลยืนยันอีกครั้ง',
  'auth.password.reset.requested': 'ขอรีเซ็ตรหัสผ่าน',
  'auth.password.reset': 'รีเซ็ตรหัสผ่านแล้ว',
  'auth.password.changed': 'เปลี่ยนรหัสผ่านแล้ว',
  'user.profile.updated': 'อัปเดตโปรไฟล์',
  'user.signup.pending': 'สมัครสมาชิก',
  'user.approval.updated': 'อนุมัติ/ปฏิเสธบัญชี',
  'user.expiry.renewed': 'ต่ออายุการใช้งาน',
  'http.error': 'ข้อผิดพลาดระบบ (HTTP)',
  'http.exception': 'ข้อผิดพลาดระบบ (Exception)',
  'integration.line.updated': 'ตั้งค่า LINE Integration',
  'integration.updated': 'ตั้งค่า Integration',
  'integration.update.failed': 'ตั้งค่า Integration (ล้มเหลว)',
  'document.created': 'สร้าง Knowledge / เอกสาร',
  'document.updated': 'อัปเดต Knowledge / เอกสาร',
  'document.vectorize.failed': 'แปลงเป็น Vector (ล้มเหลว)',
  'document.deleted': 'ลบเอกสาร',
  'upload.batch.completed': 'อัปโหลดไฟล์ (ครบชุด)',
  'admin.user.deleted': 'ลบผู้ใช้ (แอดมิน)',
  'bot.created': 'สร้างบอท',
  'bot.updated': 'แก้ไขบอท',
  'admin.bot.updated': 'แก้ไขบอท (แอดมิน)',
  'admin.guide.updated': 'แก้ไขคู่มือ (แอดมิน)',
  'bot.deleted': 'ลบบอท',
  'admin.restore': 'กู้คืนข้อมูล',
  'admin.restore.failed': 'กู้คืนข้อมูล (ล้มเหลว)',
};

const POLL_MS = 8000;

const APPROVAL_TH = {
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
  pending: 'รออนุมัติ',
};

const ROLE_TH = {
  user: 'ผู้ใช้งาน',
  support: 'ผู้ดูแล',
  admin: 'แอดมิน',
  admin_metrics: 'แอดมิน (รายงาน)',
};

const META_OMIT_KEYS = new Set(['ip', 'requestId']);

/** ชื่อประเภทในตาราง — ภาษาไทย; ถ้ายังไม่มีในรายการแสดงคำอธิบายสั้นๆ */
function typeLabelTh(messageKey) {
  if (!messageKey) return '—';
  return EVENT_LABEL_TH[messageKey] || `รายการอื่น (${messageKey})`;
}

function isErrorEvent(messageKey) {
  const key = String(messageKey || '').toLowerCase();
  return key === 'http.error' || key === 'http.exception' || key.endsWith('.failed');
}

/** สรุปการแก้บอท — แสดงว่าแก้ prompt / ชื่อ / Knowledge ฯลฯ */
function formatBotEditSummary(meta, byAdmin) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const q = (s) => (s == null || s === '' ? '' : `「${String(s)}」`);
  const botNm = m.botName || m.name;
  const labels = Array.isArray(m.changeLabels) ? m.changeLabels.filter(Boolean) : [];
  const kc = m.knowledgeCount != null ? m.knowledgeCount : m.documentCount;
  const head = byAdmin ? 'แอดมินแก้ไขบอท' : 'แก้ไขบอท';
  const nameStr = botNm ? ` ชื่อ ${q(botNm)}` : '';
  const changes =
    labels.length > 0
      ? ` — สิ่งที่ปรับ: ${labels.join(' · ')}`
      : ' — ปรับการตั้งค่าบอท (บันทึกเก่าอาจไม่ระบุรายการ)';
  const tail =
    kc != null && Number.isFinite(Number(kc))
      ? ` — หลังบันทึก ผูก Knowledge ${Number(kc)} ชุด`
      : '';
  return `${head}${nameStr}${changes}${tail}`;
}

/** สรุปเป็นประโยคภาษาไทยให้แอดมินเข้าใจว่าเกิดอะไรขึ้น */
function formatAdminSummary(eventMessage, meta) {
  const m = meta && typeof meta === 'object' ? { ...meta } : {};
  delete m.ip;

  const q = (s) => (s == null || s === '' ? '' : `「${String(s)}」`);
  const botNm = m.botName || m.name;
  const know = m.displayName;
  const url = m.url;

  switch (eventMessage) {
    case 'auth.login':
      return m.role
        ? `เข้าสู่ระบบ ในฐานะ ${ROLE_TH[m.role] || m.role}${m.email ? ` (${m.email})` : ''}`
        : 'เข้าสู่ระบบ';
    case 'auth.logout':
      return m.email
        ? `ออกจากระบบ — บัญชี ${m.email}`
        : 'ออกจากระบบ';
    case 'auth.email.verified':
      return m.email ? `ยืนยันอีเมลสำเร็จ — ${m.email}` : 'ยืนยันอีเมลสำเร็จ';
    case 'auth.email.resend':
      return 'ส่งอีเมลยืนยันอีกครั้ง';
    case 'auth.password.reset.requested':
      return 'มีการขอรีเซ็ตรหัสผ่านทางอีเมล';
    case 'auth.password.reset':
      return 'รีเซ็ตรหัสผ่านสำเร็จ';
    case 'auth.password.changed':
      return 'เปลี่ยนรหัสผ่านสำเร็จ';
    case 'user.profile.updated': {
      const changed = m.changed && typeof m.changed === 'object' ? m.changed : {};
      const labels = [];
      if (changed.name) labels.push('ชื่อ');
      if (changed.avatarUrl) labels.push('รูปโปรไฟล์');
      const what = labels.length ? `ปรับ: ${labels.join(' · ')}` : 'อัปเดตข้อมูลโปรไฟล์';
      const to = m.avatar?.to ? ` → ${q(m.avatar.to)}` : '';
      return `อัปเดตโปรไฟล์ผู้ใช้ — ${what}${to}`;
    }
    case 'user.signup.pending':
      return [m.name && `มีผู้สมัครใหม่ ชื่อ ${m.name}`, m.email && `อีเมล ${m.email}`]
        .filter(Boolean)
        .join(' — ') || 'มีผู้สมัครสมาชิกใหม่ (รออนุมัติ)';
    case 'user.approval.updated': {
      const st = APPROVAL_TH[m.approvalStatus || m.status] || m.approvalStatus || m.status || '—';
      const who = [m.name, m.email].filter(Boolean).join(' · ');
      return who
        ? `พิจารณาบัญชีผู้ใช้ ${who} → ผลลัพธ์: ${st}`
        : `พิจารณาบัญชีผู้ใช้ → ผลลัพธ์: ${st}`;
    }
    case 'user.expiry.renewed': {
      const who = [m.name, m.email].filter(Boolean).join(' · ');
      const days = m.extendDays != null ? Number(m.extendDays) : null;
      const to = m.to ? ` → หมดอายุใหม่ ${q(m.to)}` : '';
      const dayStr = days != null && Number.isFinite(days) ? ` (+${days} วัน)` : '';
      return who ? `ต่ออายุการใช้งาน ${who}${dayStr}${to}` : `ต่ออายุการใช้งาน${dayStr}${to}`;
    }
    case 'http.error': {
      const status = m.status != null ? Number(m.status) : null;
      const method = m.method ? String(m.method).toUpperCase() : '';
      const statusStr = status != null && Number.isFinite(status) ? `HTTP ${status}` : 'HTTP error';
      const where = [method && url ? `${method} ${url}` : url].filter(Boolean).join('');
      const base = where ? `${statusStr} — ${where}` : statusStr;
      const rid = m.requestId ? ` — requestId: ${m.requestId}` : '';
      return `${base}${rid}`;
    }
    case 'http.exception': {
      const where = url ? `ที่ ${url}` : '';
      const rid = m.requestId ? ` (requestId: ${m.requestId})` : '';
      const msg = m.error ? String(m.error).slice(0, 180) : '—';
      return `ระบบเกิดข้อผิดพลาด${where}${rid} — ${msg}`;
    }
    case 'integration.line.updated': {
      const enabled = m.enabled === true ? 'เปิดใช้งาน' : m.enabled === false ? 'ปิดใช้งาน' : 'อัปเดต';
      const botId = m.botId ? String(m.botId) : null;
      const botHint = botId ? ` — botId: ${botId}` : '';
      const secret = m.hasChannelSecret === true ? 'มี secret' : 'ไม่มี secret';
      const token = m.hasChannelAccessToken === true ? 'มี access token' : 'ไม่มี access token';
      return `ตั้งค่า LINE Integration — ${enabled}${botHint} — ${secret} · ${token}`;
    }
    case 'integration.updated': {
      const enabled = m.enabled === true ? 'เปิดใช้งาน' : m.enabled === false ? 'ปิดใช้งาน' : 'อัปเดต';
      return `ตั้งค่า Integration — ${enabled}`;
    }
    case 'integration.update.failed': {
      const msg = m.error ? String(m.error).slice(0, 180) : '—';
      return `ตั้งค่า Integration ไม่สำเร็จ — ${msg}`;
    }
    case 'document.created':
      return know
        ? `สร้าง Knowledge ใหม่ ชื่อ ${q(know)} — ระบบนำไปจัดทำดัชนีค้นหา`
        : 'สร้าง Knowledge / เอกสารใหม่';
    case 'document.updated': {
      const changed = m.changed && typeof m.changed === 'object' ? m.changed : {};
      const labels = [];
      if (changed.displayName) labels.push('ชื่อ');
      if (changed.sourceFiles) labels.push('ไฟล์/ข้อมูล');
      if (changed.tags) labels.push('แท็ก');
      if (changed.link) labels.push('ลิงก์');
      const what = labels.length ? ` — ปรับ: ${labels.join(' · ')}` : '';
      const n = m.sourceFileCount != null ? Number(m.sourceFileCount) : null;
      const fileCount = n != null && Number.isFinite(n) ? ` — จำนวนไฟล์: ${n}` : '';
      return know ? `อัปเดต Knowledge ชื่อ ${q(know)}${what}${fileCount}` : `อัปเดต Knowledge${what}${fileCount}`;
    }
    case 'document.vectorize.failed': {
      const msg = m.error ? String(m.error).slice(0, 180) : '—';
      return know ? `แปลงเป็น Vector ไม่สำเร็จ — Knowledge ${q(know)} — ${msg}` : `แปลงเป็น Vector ไม่สำเร็จ — ${msg}`;
    }
    case 'document.deleted':
      return know
        ? `ลบ Knowledge ชื่อ ${q(know)} ออกจากระบบ`
        : 'ลบเอกสาร / Knowledge ออกจากระบบ';
    case 'upload.batch.completed': {
      const n = m.fileCount != null ? Number(m.fileCount) : null;
      const files =
        n != null && Number.isFinite(n) ? `จำนวน ${n} ไฟล์` : 'ครบทุกไฟล์ในชุด';
      return know
        ? `อัปโหลดชุดไฟล์เสร็จ ชื่อ ${q(know)} — ${files} กำลังเข้าคิวประมวลผลต่อ`
        : `อัปโหลดชุดไฟล์เสร็จ — ${files} กำลังเข้าคิวประมวลผลต่อ`;
    }
    case 'bot.created': {
      const n = m.knowledgeCount != null ? Number(m.knowledgeCount) : m.documentCount != null ? Number(m.documentCount) : null;
      if (!botNm) return 'สร้างบอทใหม่';
      if (n != null && Number.isFinite(n) && n > 0) {
        return `สร้างบอทใหม่ ชื่อ ${q(botNm)} — ผูก Knowledge ${n} ชุดตั้งแต่แรก`;
      }
      return `สร้างบอทใหม่ ชื่อ ${q(botNm)} — ยังไม่ผูก Knowledge`;
    }
    case 'bot.updated':
      return formatBotEditSummary(m, false);
    case 'admin.bot.updated':
      return formatBotEditSummary(m, true);
    case 'bot.deleted':
      return botNm
        ? `ลบบอท ${q(botNm)} ออกจากระบบ`
        : 'ลบบอทออกจากระบบ';
    case 'admin.user.deleted': {
      const who = [m.name, m.email].filter(Boolean).join(' · ');
      return who ? `ลบบัญชีผู้ใช้ ${who} ออกจากระบบ` : 'ลบบัญชีผู้ใช้ออกจากระบบ';
    }
    case 'admin.guide.updated':
      return know
        ? `อัปเดตเนื้อหาคู่มือ — เอกสาร ${q(know)}`
        : 'อัปเดตเนื้อหาคู่มือการใช้งาน';
    case 'admin.restore':
      return 'เริ่มกู้คืนข้อมูลจากสำรอง (backup)';
    case 'admin.restore.failed':
      return m.error
        ? `กู้คืนข้อมูลไม่สำเร็จ — ${String(m.error).slice(0, 160)}`
        : 'กู้คืนข้อมูลไม่สำเร็จ';
    default:
      break;
  }

  if (know) return `เกี่ยวกับ Knowledge ชื่อ ${q(know)}`;
  if (botNm) return `เกี่ยวกับบอท ชื่อ ${q(botNm)}`;
  if (m.fileCount != null) return `เกี่ยวกับการอัปโหลด จำนวน ${m.fileCount} ไฟล์`;
  if (m.email) return `เกี่ยวกับบัญชี ${m.email}`;
  return '—';
}

/** จัด meta เป็น key-value สำหรับอ่านใน panel รายละเอียด */
function buildMetaEntries(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
  return Object.entries(meta)
    .filter(([key, value]) => !META_OMIT_KEYS.has(key) && value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
    }));
}

/** กลุ่มประเภทในตัวกรอง — ชื่อกลุ่มและรายการเป็นภาษาไทยทั้งหมด */
const EVENT_FILTER_GROUPS = [
  {
    label: 'ปัญหา/ข้อผิดพลาดระบบ',
    keys: ['http.error', 'http.exception'],
  },
  {
    label: 'การเข้าใช้และรหัสผ่าน',
    keys: [
      'auth.login',
      'auth.logout',
      'auth.email.verified',
      'auth.email.resend',
      'auth.password.reset.requested',
      'auth.password.reset',
      'auth.password.changed',
    ],
  },
  {
    label: 'สมัครสมาชิกและการอนุมัติ',
    keys: ['user.signup.pending', 'user.approval.updated', 'user.expiry.renewed'],
  },
  {
    label: 'Knowledge และการอัปโหลด',
    keys: ['document.created', 'document.updated', 'document.vectorize.failed', 'document.deleted', 'upload.batch.completed'],
  },
  {
    label: 'Integrations',
    keys: ['integration.line.updated', 'integration.updated', 'integration.update.failed'],
  },
  {
    label: 'บอทและการดูแลระบบ',
    keys: [
      'bot.created',
      'bot.updated',
      'admin.bot.updated',
      'bot.deleted',
      'admin.user.deleted',
      'admin.guide.updated',
      'admin.restore',
      'admin.restore.failed',
    ],
  },
];

function ActivityLogs({ userRole }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastSynced, setLastSynced] = useState(null);
  const [eventFilter, setEventFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedRowIds, setExpandedRowIds] = useState(() => new Set());

  const allowed = userRole === 'admin' || userRole === 'admin_metrics';

  const activeFilterCount = [
    eventFilter,
    keyword.trim(),
    fromDate,
    toDate,
  ].filter(Boolean).length;

  const load = useCallback(
    async (opts = {}) => {
      const silent = opts.silent === true;
      const f = opts.filters;
      const event = f !== undefined ? f.event : eventFilter;
      const q = f !== undefined ? f.q : keyword;
      const from = f !== undefined ? f.from : fromDate;
      const to = f !== undefined ? f.to : toDate;
      if (!silent) {
        setLoading(true);
        setError('');
      }
      try {
        const data = await api.getLogs({
          take: 500,
          event: String(event || '').trim() || undefined,
          q: String(q || '').trim() || undefined,
          from: String(from || '').trim() || undefined,
          to: String(to || '').trim() || undefined,
        });
        setRows(Array.isArray(data) ? data : []);
        setLastSynced(new Date());
        setError('');
      } catch (e) {
        if (!silent) {
          setError(e?.message || 'โหลดไม่สำเร็จ');
          setRows([]);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [eventFilter, keyword, fromDate, toDate],
  );

  const resetFilters = () => {
    setEventFilter('');
    setKeyword('');
    setFromDate('');
    setToDate('');
    load({ silent: false, filters: { event: '', q: '', from: '', to: '' } });
  };

  const toggleExpanded = (id) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!allowed) return;
    load({ silent: false });
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load({ silent: true });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [allowed, load]);

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="w-full h-full p-6 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
            <HiClipboardList className="text-white text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">กิจกรรมระบบ (Logs)</h1>
            <p className="text-sm text-gray-600">
              เรียลไทม์ — อัปเดตอัตโนมัติทุก {POLL_MS / 1000} วินาที (เมื่อแท็บนี้เปิดอยู่)
              {lastSynced ? (
                <span className="text-gray-500">
                  {' '}
                  · ล่าสุด{' '}
                  {lastSynced.toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className={`inline-flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtersOpen || activeFilterCount
                ? 'border-[#F5C200] bg-[#FFF9E6] text-gray-900'
                : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
            }`}
          >
            <HiFilter className="text-lg" />
            ตัวกรอง
            {activeFilterCount > 0 ? (
              <span className="bg-[#F5C200] text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            ) : null}
            {filtersOpen ? <HiChevronUp /> : <HiChevronDown />}
          </button>
          <button
            type="button"
            onClick={() => load({ silent: false })}
            className="inline-flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700"
          >
            <HiRefresh className={loading ? 'animate-spin' : ''} />
            รีเฟรช
          </button>
        </div>
      </div>

      {filtersOpen ? (
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <p className="text-sm font-semibold text-gray-800 mb-3">ตั้งค่าตัวกรอง (ชื่อประเภทเป็นภาษาไทยตามกลุ่มด้านล่าง)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            <span>ประเภทเหตุการณ์ (ภาษาไทย)</span>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">ทั้งหมด — แสดงทุกประเภท</option>
              {EVENT_FILTER_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.keys.map((key) =>
                    EVENT_LABEL_TH[key] ? (
                      <option key={key} value={key}>
                        {EVENT_LABEL_TH[key]}
                      </option>
                    ) : null,
                  )}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600 md:col-span-2">
            <span>คำค้น (ข้อความเหตุการณ์ / อีเมล / ชื่อผู้ใช้)</span>
            <input
              type="search"
              placeholder="เช่น login, auth, @domain"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load({ silent: false })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            <span>ตั้งแต่วันที่</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            <span>ถึงวันที่</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </label>
          <div className="flex flex-wrap gap-2 pb-0.5">
            <button
              type="button"
              onClick={() => load({ silent: false })}
              className="border border-gray-800 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700"
            >
              ใช้ตัวกรอง
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="border border-gray-300 bg-white text-gray-800 px-4 py-2 rounded-lg text-sm hover:bg-gray-100"
            >
              ล้างตัวกรอง
            </button>
          </div>
        </div>
      </div>
      ) : null}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="max-h-[72vh] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5C200] border-b border-[#E6B800] text-left text-gray-900 shadow-sm sticky top-0 z-10">
                <th className="px-4 py-3 font-bold whitespace-nowrap">เวลา</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">ประเภท</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">ผู้ดำเนินการ / บัญชีที่เกี่ยวข้อง</th>
                <th className="px-4 py-3 font-bold min-w-[360px]">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                    ไม่มีข้อมูล
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const u = row.user;
                  const who = u
                    ? `${u.name || '—'} · ${u.email || ''}`
                    : row.meta?.email
                      ? String(row.meta.email)
                      : '—';
                  const label = typeLabelTh(row.message);
                  const errorType = isErrorEvent(row.message);
                  const detail = formatAdminSummary(row.message, row.meta);
                  const metaEntries = buildMetaEntries(row.meta);
                  const isExpanded = expandedRowIds.has(row.id);
                  const isLong = typeof detail === 'string' && detail.length > 180;
                  return (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-[#FFFBF0]/80">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap align-top">
                        {row.createdAt
                          ? new Date(row.createdAt).toLocaleString('th-TH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${
                            errorType
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : 'border-gray-200 bg-gray-50 text-gray-800'
                          }`}
                        >
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 align-top max-w-[220px] break-words">{who}</td>
                      <td className="px-4 py-3 text-gray-800 align-top text-sm leading-relaxed">
                        <div className="space-y-2">
                          <div className={isExpanded ? 'whitespace-pre-wrap' : 'whitespace-nowrap overflow-hidden text-ellipsis'}>
                            {detail}
                          </div>
                          {(isLong || metaEntries.length > 0) ? (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(row.id)}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8B8680] hover:text-[#5f5a53]"
                              title="สลับการแสดงรายละเอียด"
                            >
                              {isExpanded ? <HiChevronUp /> : <HiChevronDown />}
                              {isExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
                            </button>
                          ) : null}
                          {isExpanded ? (
                            <div className="rounded-lg border border-[#F3E3A3] bg-[#FFFDF5] p-3 max-h-72 overflow-auto">
                              <div className="text-xs font-semibold text-gray-700 mb-2">รายละเอียดเพิ่มเติม</div>
                              {metaEntries.length === 0 ? (
                                <p className="text-xs text-gray-500">ไม่มีข้อมูลเพิ่มเติม</p>
                              ) : (
                                <div className="space-y-2">
                                  {metaEntries.map((entry) => (
                                    <div key={`${row.id}-${entry.key}`} className="text-xs">
                                      <p className="font-semibold text-gray-700">{entry.key}</p>
                                      <pre className="mt-0.5 whitespace-pre-wrap break-words text-gray-600 font-mono">
                                        {entry.value}
                                      </pre>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ActivityLogs;
