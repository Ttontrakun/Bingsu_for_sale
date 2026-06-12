/**
 * API client สำหรับ Supportadmin ต่อ backend bb
 * ใช้ REACT_APP_API_BASE_URL ใน .env (เช่น http://localhost:5052 หรือ http://localhost:8080)
 */
const SESSION_KEY = 'supportadmin_token';
const USER_KEY = 'supportadmin_user';

export const getStoredToken = () => localStorage.getItem(SESSION_KEY);
export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const setSession = (token, user) => {
  if (token) localStorage.setItem(SESSION_KEY, token);
  else localStorage.removeItem(SESSION_KEY);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
};

const getApiBaseURL = () => {
  const envBase = String(process.env.REACT_APP_API_BASE_URL || '').trim();
  const browserOrigin =
    (typeof window !== 'undefined' && window.location?.origin) || '';
  const browserHost =
    (typeof window !== 'undefined' && window.location?.hostname) || '';
  const isBrowserLocal =
    browserHost === 'localhost' || browserHost === '127.0.0.1';
  const isEnvLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
    envBase
  );

  // เปิดผ่าน public URL (เช่น ngrok) ให้ใช้ origin เดียวกับหน้าเว็บเพื่อยิงผ่าน nginx /api proxy
  if (browserOrigin && (!envBase || (isEnvLocal && !isBrowserLocal))) {
    return browserOrigin.replace(/\/$/, '');
  }
  if (envBase) return envBase.replace(/\/$/, '');
  if (isBrowserLocal) return 'http://localhost:5052';
  return browserOrigin ? browserOrigin.replace(/\/$/, '') : 'http://localhost:5052';
};

/** ข้อความสั้นเมื่อเชื่อมต่อ backend ไม่ได้ (ลงทะเบียน/ล็อกอิน) */
const CONNECTION_ERROR_MSG =
  'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบว่า backend รันอยู่ และใน .env ตั้ง REACT_APP_API_BASE_URL ให้ชี้ไปพอร์ตที่ backend รัน (เช่น 5052 หรือ 8083) แล้ว restart แอป';

/** ตรวจว่าเป็นข้อความ error ที่เกี่ยวกับ network/vector/docker ที่ไม่ควรโชว์ให้ user */
const isConfusingErrorMessage = (s) => {
  const str = s != null && typeof s === 'object' ? (s.message || s.error || String(s)) : String(s || '');
  return (
    /network\s*error|แปลง\s*vector|docker\s*compose|backend\s*ล้ม|บันทึก.*vector|legacy\s*และ\s*api|ถ้าเกิดตอนกดบันทึก|ดู\s*docker|logs\s*legacy/i.test(str) ||
    (str.includes('Vector') && str.includes('backend'))
  );
};

/** ดึงข้อความจาก response body (รองรับทั้ง string และ object) */
const getResponseErrorText = (data) => {
  if (!data) return '';
  const raw = data.error ?? data.message ?? data.detail;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && typeof raw.message === 'string') return raw.message;
  if (raw && typeof raw === 'object' && typeof raw.error === 'string') return raw.error;
  return String(raw || '');
};

const request = async (path, options = {}) => {
  const token = getStoredToken();
  const url = `${getApiBaseURL()}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(url, { ...options, headers, credentials: 'include' });
  } catch (err) {
    const rawMsg = err?.message || '';
    if (isConfusingErrorMessage(rawMsg)) {
      throw new Error(CONNECTION_ERROR_MSG);
    }
    const base = getApiBaseURL() || (typeof window !== 'undefined' ? window.location?.origin : '') || '';
    const hint = base ? ` (เรียก ${base})` : '';
    throw new Error(
      `เชื่อมต่อ backend ไม่ได้${hint} — ตรวจสอบว่า backend รันอยู่ แล้วตั้ง REACT_APP_API_BASE_URL ใน .env ของ Supportadmin ให้ชี้ไปพอร์ตที่ backend รัน (เช่น http://localhost:5052) แล้ว restart แอป`
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = getResponseErrorText(data) || `HTTP ${res.status}`;
    if (typeof msg !== 'string') msg = String(msg);
    if (res.status === 401 && /invalid|expired|session|not authenticated/i.test(msg)) {
      setSession(null, null);
      throw new Error('SESSION_EXPIRED');
    }
    if (isConfusingErrorMessage(msg)) {
      msg = CONNECTION_ERROR_MSG;
    }
    throw new Error(msg);
  }
  return data;
};

export const api = {
  login: async (email, password) => {
    const data = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setSession(data.token ?? null, data.user ?? null);
    return data;
  },
  signup: async (name, email, password) => {
    const data = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    return data;
  },
  logout: () => setSession(null, null),
  getMe: () => request('/api/auth/me'),
  getReport: () => request('/api/support/report'),
  getMetrics: () => request('/api/admin/metrics'),
  getAdminActivity: (days = 14) => request(`/api/admin/activity?days=${encodeURIComponent(days)}`),
  getFaqCategories: (scope = 'all', days = 30) =>
    request(`/api/admin/faq-categories?scope=${encodeURIComponent(scope)}&days=${encodeURIComponent(days)}`),
  getTokenUsage: (scope = 'all', days = 7) =>
    request(`/api/admin/token-usage?scope=${encodeURIComponent(scope)}&days=${encodeURIComponent(days)}`),
  getUserRoleDistribution: () => request('/api/admin/user-role-distribution'),
  getHealth: () => request('/api/health'),
  getPendingUsers: () => request('/api/support/pending-users'),
  /** ลูกค้าที่ลงทะเบียน (รออนุมัติ + อนุมัติแล้ว) พร้อมอีเมล — สำหรับบทบาท Support */
  getSupportCustomers: () => request('/api/support/customers'),
  updatePendingUser: (userId, approvalStatus) =>
    request(`/api/support/pending-users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ approvalStatus }),
    }),
  renewUserExpiry: (userId, extendDays = 30) =>
    request(`/api/support/users/${userId}/renew`, {
      method: 'POST',
      body: JSON.stringify({ extendDays }),
    }),
  getLogs: (opts = {}) => {
    const sp = new URLSearchParams();
    const take = opts.take ?? 300;
    sp.set('take', String(Math.min(500, Math.max(1, Number(take) || 300))));
    if (opts.event && String(opts.event).trim()) sp.set('event', String(opts.event).trim());
    if (opts.q && String(opts.q).trim()) sp.set('q', String(opts.q).trim());
    if (opts.from && String(opts.from).trim()) sp.set('from', String(opts.from).trim());
    if (opts.to && String(opts.to).trim()) sp.set('to', String(opts.to).trim());
    if (opts.message && String(opts.message).trim()) sp.set('message', String(opts.message).trim());
    return request(`/api/support/logs?${sp.toString()}`);
  },
  getAdminUsers: () => request('/api/admin/users'),
  getAdminBots: () => request('/api/admin/bots'),
  getAdminGroups: () => request('/api/admin/groups'),
  createAdminGroup: (payload) =>
    request('/api/admin/groups', { method: 'POST', body: JSON.stringify(payload || {}) }),
  updateAdminGroup: (id, payload) =>
    request(`/api/admin/groups/${encodeURIComponent(String(id || ''))}`, {
      method: 'PATCH',
      body: JSON.stringify(payload || {}),
    }),
  updateAdminGroupMembers: (id, memberIds) =>
    request(`/api/admin/groups/${encodeURIComponent(String(id || ''))}/members`, {
      method: 'PUT',
      body: JSON.stringify({ memberIds: Array.isArray(memberIds) ? memberIds : [] }),
    }),
  deleteAdminGroup: (id) =>
    request(`/api/admin/groups/${encodeURIComponent(String(id || ''))}`, { method: 'DELETE' }),
  createAdminBot: (payload) =>
    request('/api/admin/bots', { method: 'POST', body: JSON.stringify(payload || {}) }),
  getAdminDocuments: () => request('/api/admin/documents'),
  getAdminDocument: (id) => request(`/api/admin/documents/${id}`),
  updateAdminBot: (id, payload) =>
    request(`/api/admin/bots/${id}`, { method: 'PATCH', body: JSON.stringify(payload || {}) }),
  getGuide: () => request('/api/admin/guide'),
  updateGuide: (text, mode = 'replace') =>
    request('/api/admin/guide', { method: 'PATCH', body: JSON.stringify({ text, mode }) }),
  deleteBot: (id) => request(`/api/admin/bots/${id}`, { method: 'DELETE' }),
  deleteDocument: (id) => request(`/api/admin/documents/${id}`, { method: 'DELETE' }),
  patchAdminUser: (id, payload) =>
    request(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload || {}) }),
  deleteAdminUser: (id) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),
};

// Credential API functions
export const credentialAPI = {
  // Change password
  changePassword: async (oldPassword, newPassword) => {
    return request('/api/credentials/change-password', {
      method: 'POST',
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
      }),
    });
  },
};

// User API functions
export const userAPI = {
  // Get current user profile
  getCurrentUser: async () => {
    const data = await request('/api/auth/me');
    return data?.user ?? data;
  },

  // Update current user profile
  updateProfile: async (profileData) => {
    const payload = {};
    if (profileData?.name !== undefined) payload.name = String(profileData.name ?? '');
    if (profileData?.avatarUrl !== undefined) payload.avatarUrl = String(profileData.avatarUrl ?? '');
    if (Object.keys(payload).length === 0) {
      throw new Error('At least one field (name or avatarUrl) must be provided');
    }
    const data = await request('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return data?.user ?? data;
  },
};

const ROLE_LABELS = {
  user: 'ผู้ใช้งาน',
  support: 'ผู้ดูแล',
  admin: 'แอดมิน',
  admin_metrics: 'แอดมิน (รายงาน)',
};

/** แปลง role จาก DB / ค่าเก่า ให้ตรงคีย์ใน UI (ป้ายสี, filter) */
export function normalizeDashboardRole(role) {
  const s = String(role ?? '').toLowerCase().trim();
  if (s === 'moderator' || s === 'staff' || s === 'csr') return 'support';
  if (['user', 'support', 'admin', 'admin_metrics', 'pending'].includes(s)) return s;
  return s || 'user';
}

/**
 * แปลง user จาก backend (pending-users) เป็นรูปแบบที่หน้า Support ใช้แสดง
 */
export function mapPendingUserToDisplay(backendUser) {
  const name = backendUser.name || backendUser.email || '-';
  const createdAt = backendUser.createdAt
    ? new Date(backendUser.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '-';
  return {
    id: backendUser.id,
    username: name,
    name,
    email: backendUser.email || '',
    role: 'รอดำเนินการ',
    roleType: 'pending',
    lastActive: '-',
    createdAt,
    expiresAt: '-',
    isEnabled: false,
    avatar: (name.charAt(0) || '?').toUpperCase(),
    avatarColor: 'bg-gray-400',
    approvalStatus: backendUser.approvalStatus,
  };
}

/**
 * แปลง user จาก backend (admin/users) เป็นรูปแบบที่หน้า Support ใช้แสดง (ไม่เปลี่ยน UI)
 */
function formatThaiLastActivity(iso) {
  if (!iso) return 'ยังไม่มีข้อมูล';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortThaiDateFromIso(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String((d.getFullYear() + 543) % 100).padStart(2, '0');
  return `${day}/${month}/${year}`;
}

export function mapAdminUserToDisplay(backendUser) {
  const name = backendUser.name || backendUser.email || '-';
  const createdAt = backendUser.createdAt
    ? new Date(backendUser.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '-';
  const roleType =
    backendUser.approvalStatus === 'pending' ? 'pending' : normalizeDashboardRole(backendUser.role);
  const role =
    roleType === 'pending' ? 'รอดำเนินการ' : (ROLE_LABELS[roleType] || backendUser.role || roleType);
  return {
    id: backendUser.id,
    username: name,
    name,
    email: backendUser.email || '',
    role,
    roleType,
    lastActive: formatThaiLastActivity(backendUser.lastActivityAt),
    createdAt,
    expiresAt: backendUser.role === 'user' ? formatShortThaiDateFromIso(backendUser.expiresAt) : '-',
    isEnabled: !!backendUser.isActive,
    avatar: (name.charAt(0) || '?').toUpperCase(),
    avatarColor: 'bg-gray-400',
    approvalStatus: backendUser.approvalStatus,
  };
}

const DEFAULT_AVATAR_COLORS = [
  'bg-blue-400', 'bg-purple-400', 'bg-pink-400', 'bg-indigo-400',
  'bg-green-400', 'bg-yellow-400', 'bg-red-400', 'bg-teal-400',
  'bg-orange-400', 'bg-cyan-400', 'bg-lime-400', 'bg-rose-400',
  'bg-violet-400', 'bg-fuchsia-400', 'bg-emerald-400', 'bg-amber-400',
];

/**
 * แปลง bot จาก backend (admin/bots) เป็นรูปแบบที่หน้า Bots ใช้แสดง (ไม่เปลี่ยน UI)
 */
export function mapBotToDisplay(backendBot, index = 0, avatarColors = DEFAULT_AVATAR_COLORS) {
  const username = backendBot.owner?.name || backendBot.owner?.email || '-';
  const knowledge = (backendBot.documents || []).map((d) => d.displayName || d.name || '-');
  const color = avatarColors[index % avatarColors.length] || 'bg-blue-400';
  return {
    id: backendBot.id,
    name: backendBot.name || '-',
    description: backendBot.description || '',
    prompt: backendBot.prompt || '',
    username,
    enabled: backendBot?.enabled !== false,
    knowledge,
    groups: [],
    color,
  };
}

/**
 * แปลง document จาก backend (admin/documents) เป็นรูปแบบที่หน้า Knowledge ใช้แสดง (ไม่เปลี่ยน UI)
 */
export function mapDocumentToDisplay(backendDoc) {
  const username = backendDoc.owner?.name || backendDoc.owner?.email || '-';
  return {
    id: backendDoc.id,
    name: backendDoc.displayName || backendDoc.name || '-',
    description: backendDoc.displayName || '',
    username,
    groups: [],
  };
}

export function getErrorMessage(err) {
  if (err == null) return 'เกิดข้อผิดพลาด';
  const msg = err?.message ?? err?.error;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  try {
    return String(err);
  } catch {
    return 'เกิดข้อผิดพลาด';
  }
}

/** เรียก /api/documents/* แบบเดียวกับ User (หลัง backend ให้ support/admin เข้าถึงเอกสารใดก็ได้) */
export const supportDocuments = {
  getDocument: async (documentId) => {
    const id = documentId != null ? String(documentId).trim() : '';
    if (!id || id === 'undefined' || id === 'null') throw new Error('Invalid document ID');
    return request(`/api/documents/${encodeURIComponent(id)}`);
  },
  updateDocument: async (documentId, documentData) => {
    const id = documentId != null ? String(documentId).trim() : '';
    if (!id || id === 'undefined' || id === 'null') throw new Error('Invalid document ID');
    return request(`/api/documents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(documentData || {}),
    });
  },
  processFileWithOCR: async (documentId, file, options = {}) => {
    const id = documentId != null ? String(documentId).trim() : '';
    if (!id || id === 'undefined' || id === 'null') throw new Error('Invalid document ID');
    const formData = new FormData();
    formData.append('file', file);
    if (options.provider === 'typhoon') {
      formData.append('provider', 'typhoon');
    }
    const token = getStoredToken();
    const url = `${getApiBaseURL()}/api/documents/${encodeURIComponent(id)}/files/ocr`;
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { method: 'POST', headers, body: formData, credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      let msg = getResponseErrorText(data) || `HTTP ${res.status}`;
      if (typeof msg !== 'string') msg = String(msg);
      if (res.status === 401) {
        setSession(null, null);
        throw new Error('SESSION_EXPIRED');
      }
      throw new Error(msg);
    }
    return data;
  },
  structureOcrWithAi: async (documentId, text) => {
    const id = documentId != null ? String(documentId).trim() : '';
    if (!id || id === 'undefined' || id === 'null') throw new Error('Invalid document ID');
    return request(`/api/documents/${encodeURIComponent(id)}/files/ocr/structure-text`, {
      method: 'POST',
      body: JSON.stringify({ text: typeof text === 'string' ? text : '' }),
    });
  },
  createDocument: async (documentData) => {
    return request('/api/documents', {
      method: 'POST',
      body: JSON.stringify(documentData || {}),
    });
  },
  deleteDocument: async (documentId) => {
    const id = documentId != null ? String(documentId).trim() : '';
    if (!id || id === 'undefined' || id === 'null') throw new Error('Invalid document ID');
    return request(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
