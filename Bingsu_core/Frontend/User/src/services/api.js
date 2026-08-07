import axios from 'axios';
import API_CONFIG from '../config/api';

const api = axios.create({
    baseURL: API_CONFIG.baseURL,
    timeout: API_CONFIG.timeout,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor - add auth token to requests
api.interceptors.request.use(
    (config) => {
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Helper function to extract error message from error response
export const getErrorMessage = (error) => {
    if (!error) {
        return 'เกิดข้อผิดพลาด';
    }

    // Handle 429 Too Many Requests (Rate Limiting)
    if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        if (retryAfter) {
            const seconds = parseInt(retryAfter, 10);
            if (Number.isFinite(seconds) && seconds > 0) {
                const minutes = Math.ceil(seconds / 60);
                return `ส่งคำขอบ่อยเกินไป — กรุณารอ ${minutes} นาที แล้วลองอีกครั้ง`;
            }
        }
        const data = error.response?.data;
        if (data?.error && typeof data.error === 'string') {
            const msg = data.error.toLowerCase();
            if (msg.includes('chat quota') || msg.includes('daily chat')) return 'โควต้าแชทรายวันหมดแล้ว — ลองใหม่พรุ่งนี้';
            if (msg.includes('token quota') || msg.includes('daily token')) return 'โควต้าโทเค็นรายวันหมดแล้ว — ลองใหม่พรุ่งนี้';
            if (msg.includes('rate limit')) return 'ส่งข้อความบ่อยเกินไป — กรุณารอสักครู่แล้วลองอีกครั้ง';
        }
        return 'ส่งคำขอบ่อยเกินไป — กรุณารอสักครู่แล้วลองอีกครั้ง';
    }

    // If error has response data
    if (error.response?.data) {
        const data = error.response.data;
        
        // Handle FastAPI validation errors (array of objects)
        if (Array.isArray(data.detail)) {
            return data.detail.map(err => {
                // Handle validation error object with type, loc, msg fields
                if (typeof err === 'object' && err.msg) {
                    const field = Array.isArray(err.loc) ? err.loc.slice(1).join('.') : '';
                    return field ? `${field}: ${err.msg}` : err.msg;
                }
                return typeof err === 'string' ? err : JSON.stringify(err);
            }).join(', ');
        }
        
        // Handle string detail
        if (typeof data.detail === 'string') {
            return data.detail;
        }
        
        // Handle object detail
        if (typeof data.detail === 'object') {
            return data.detail.msg || data.detail.message || JSON.stringify(data.detail);
        }
        
        // Handle message field
        if (data.message) {
            return data.message;
        }
        // Backend (FastAPI/Node) often returns { error: "..." }
        if (data.error && typeof data.error === 'string') {
            return data.error;
        }
    }

    // Timeout (การบันทึก/แปลงเป็น vector ใช้เวลานาน)
    if (error.code === 'ECONNABORTED' || (error.message && String(error.message).toLowerCase().includes('timeout'))) {
        return 'การประมวลผลใช้เวลานานเกินไป — ลองลดขนาดไฟล์หรือจำนวนหน้า แล้วกดบันทึกอีกครั้ง (หรือดู docker compose logs legacy)';
    }

    // Handle request error (no response) — อาจเป็น backend ล้มหรือตัดการเชื่อมต่อ
    if (error.request) {
        return 'Network error. ถ้าเกิดตอนกดบันทึก/แปลง Vector: อาจใช้เวลานานหรือ backend ล้ม — ดู docker compose logs legacy และ api';
    }

    // ไม่มี response (เช่น เรียก fetch โดยตรง แล้วได้ 429)
    const msg = (error?.message || '').toLowerCase();
    if (msg.includes('rate limit') || msg.includes('too many requests')) {
        return 'ส่งข้อความบ่อยเกินไป — กรุณารอสักครู่แล้วลองอีกครั้ง';
    }

    return error.message || 'เกิดข้อผิดพลาด';
};

// Response interceptor - handle errors globally
api.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        // Handle 401 Unauthorized - clear token and redirect to login
        if (error.response?.status === 401) {
            const publicPaths = ['/auth', '/verifying', '/forgot-password', '/reset-password', '/create-password'];
            const currentPath = window.location.pathname;
            
            // Clear cached user data
            localStorage.removeItem('user');
            
            // Only redirect if not on a public page
            if (!publicPaths.some(path => currentPath.startsWith(path))) {
                // Use setTimeout to avoid redirect during render
                setTimeout(() => {
                    const newPath = window.location.pathname;
                    // Double check we're not on a public path before redirecting
                    if (!publicPaths.some(path => newPath.startsWith(path)) && newPath !== '/auth') {
                        window.location.href = '/auth';
                    }
                }, 100);
            }
        }
        
        // 429 — ใส่ข้อความที่เป็นมิตรใน error.message ด้วย เพื่อไม่ให้ที่ไหนก็ตามที่แสดง err.message เห็น "Request failed with status code 429"
        if (error.response?.status === 429) {
            error.message = getErrorMessage(error);
        }
        return Promise.reject(error);
    }
);

// Auth API functions
export const authAPI = {
    // Login
    login: async (email, password) => {
        const response = await api.post('/auth/login', {
            email,
            password,
        });
        if (response.data.user?.id) {
            localStorage.setItem('user', JSON.stringify({ id: response.data.user.id }));
        }
        return response.data;
    },

    // Register
    register: async (email, fullName, acceptedTerms) => {
        const response = await api.post('/users/register', {
            email,
            fullName,
            acceptedTerms,
        });
        return response.data;
    },

    // Verify email
    verifyEmail: async (token) => {
        const response = await api.post('/auth/verify-email', {
            token,
        });
        return response.data;
    },

    // Set password
    setPassword: async (token, password) => {
        const response = await api.post('/auth/set-password', {
            token,
            password,
            newPassword: password,
        });
        return response.data;
    },

    // Resend verification email
    resendVerification: async (email) => {
        const response = await api.post('/auth/resend-verification', {
            email,
        });
        return response.data;
    },

    // Forgot password - request password reset
    forgotPassword: async (email) => {
        const response = await api.post('/auth/forgot-password', {
            email,
        });
        return response.data;
    },

    // Reset password with token
    resetPassword: async (token, password) => {
        const response = await api.post('/auth/reset-password', {
            token,
            password,
            newPassword: password,
        });
        return response.data;
    },

    // Get current user
    getCurrentUser: async () => {
        const response = await api.get('/auth/me');
        return response.data;
    },

    // Logout — ลบ session ฝั่งเซิร์ฟเวอร์ + เคลียร์ cookie
    logout: async () => {
        try {
            await api.post('/auth/logout');
        } catch (_) {
            /* still clear local state */
        }
        localStorage.removeItem('user');
    },
};

// Credential API functions
export const credentialAPI = {
    // Change password
    changePassword: async (oldPassword, newPassword) => {
        const response = await api.post('/auth/change-password', {
            currentPassword: oldPassword,
            newPassword,
        });
        return response.data;
    },
};

// User API functions
export const userAPI = {
    // Get current user profile
    getCurrentUser: async () => {
        const response = await api.get('/auth/me');
        // bb backend returns { user: {...} }
        return response.data?.user ?? response.data;
    },

    // Update current user profile (convenience method)
    // Uses /auth/me endpoint (bb backend) — no user_id needed, uses current user from token
    updateProfile: async (profileData) => {
        const payload = {};

        if (profileData?.name !== undefined) {
            const n = profileData.name == null ? '' : String(profileData.name);
            payload.name = n;
        }
        if (profileData?.avatarUrl !== undefined) {
            const a = profileData.avatarUrl == null ? '' : String(profileData.avatarUrl);
            payload.avatarUrl = a;
        }

        if (Object.keys(payload).length === 0) {
            throw new Error('At least one field (name or avatarUrl) must be provided');
        }

        const response = await api.patch('/auth/me', payload);
        return response.data?.user ?? response.data;
    },

    // Token quota (today)
    getTokenQuotaToday: async () => {
        const response = await api.get('/auth/quota');
        return response.data;
    },

    /** ลบบัญชีตัวเอง — ต้องส่งรหัสผ่านยืนยัน */
    deleteAccount: async (password) => {
        const response = await api.post('/auth/delete-account', { password });
        return response.data;
    },

    // Update user profile by ID (admin only)
};

// Conversations API (backend ใช้ /api/conversations — chat = conversation)
export const conversationsAPI = {
    list: async () => {
        const response = await api.get('/conversations');
        return response.data;
    },
    get: async (id) => {
        const sid = id != null ? String(id).trim() : '';
        if (!sid || sid === 'undefined' || sid === 'null') throw new Error('Invalid conversation ID');
        const response = await api.get(`/conversations/${encodeURIComponent(sid)}`);
        return response.data;
    },
    create: async (documentId, botId = null, isPrivate = false) => {
        const payload = { documentId };
        if (botId) payload.botId = botId;
        if (isPrivate) payload.private = true;
        const response = await api.post('/conversations', payload);
        return response.data;
    },
    updateTitle: async (id, title) => {
        const sid = id != null ? String(id).trim() : '';
        if (!sid || sid === 'undefined' || sid === 'null') throw new Error('Invalid conversation ID');
        const response = await api.patch(`/conversations/${encodeURIComponent(sid)}`, { title });
        return response.data;
    },
    updatePinned: async (id, pinned) => {
        const sid = id != null ? String(id).trim() : '';
        if (!sid || sid === 'undefined' || sid === 'null') throw new Error('Invalid conversation ID');
        const response = await api.patch(`/conversations/${encodeURIComponent(sid)}`, { pinned: pinned === true });
        return response.data;
    },
    delete: async (id) => {
        const sid = id != null ? String(id).trim() : '';
        if (!sid || sid === 'undefined' || sid === 'null') throw new Error('Invalid conversation ID');
        const response = await api.delete(`/conversations/${encodeURIComponent(sid)}`);
        return response.data;
    },
};

// Chat API (map ไป conversations + รูปแบบที่ Sidebar/Chat ใช้)
export const chatAPI = {
    getChats: async () => {
        const list = await conversationsAPI.list();
        return (list || []).map((c) => ({ id: c.id, name: c.title || 'New Chat', ...c }));
    },
    getChat: async (chatId) => {
        const c = await conversationsAPI.get(chatId);
        return { ...c, name: c.title };
    },
    createChat: async (_name, _userIds, botId, documentId, isPrivate = false) => {
        if (!documentId) throw new Error('documentId is required to create conversation');
        return conversationsAPI.create(documentId, botId || null, isPrivate === true);
    },
    updateChat: async (chatId, name) => {
        return conversationsAPI.updateTitle(chatId, name);
    },
    setChatPinned: async (chatId, pinned) => {
        return conversationsAPI.updatePinned(chatId, pinned);
    },
    deleteChat: async (chatId) => {
        return conversationsAPI.delete(chatId);
    },
};

// Chat Message API (backend: /api/conversations/:id/messages, POST /api/chat สำหรับ bot response)
export const chatMessageAPI = {
    getMessages: async (chatId, skip = 0, limit = 100) => {
        const sid = chatId != null ? String(chatId).trim() : '';
        if (!sid || sid === 'undefined' || sid === 'null') throw new Error('Invalid chat ID');
        const response = await api.get(`/conversations/${encodeURIComponent(sid)}/messages`, {
            params: { skip, limit }
        });
        return response.data;
    },

    getMessage: async (chatId, messageId) => {
        const sid = chatId != null ? String(chatId).trim() : '';
        const mid = messageId != null ? String(messageId).trim() : '';
        if (!sid || !mid) throw new Error('Invalid chat ID or message ID');
        const response = await api.get(`/conversations/${encodeURIComponent(sid)}/messages/${encodeURIComponent(mid)}`);
        return response.data;
    },

    // Debug: ดู context/chunks ที่ระบบใช้ตอบคำถามใน conversation นี้
    getDebugContext: async (chatId, message) => {
        const sid = chatId != null ? String(chatId).trim() : '';
        if (!sid || sid === 'undefined' || sid === 'null') throw new Error('Invalid chat ID');
        const text = typeof message === 'string' ? message.trim() : '';
        if (!text) throw new Error('message is required');
        const response = await api.get(`/chat/${encodeURIComponent(sid)}/debug-context`, {
            params: { message: text },
        });
        return response.data;
    },

    createMessage: async (chatId, message) => {
        const sid = chatId != null ? String(chatId).trim() : '';
        if (!sid || sid === 'undefined' || sid === 'null') throw new Error('Invalid chat ID');
        const response = await api.post('/messages', {
            conversationId: sid,
            role: 'user',
            content: typeof message === 'string' ? message : (message?.content ?? ''),
        });
        return response.data;
    },

    updateMessage: async (chatId, messageId, message, correction = null) => {
        const sid = chatId != null ? String(chatId).trim() : '';
        const mid = messageId != null ? String(messageId).trim() : '';
        if (!sid || !mid) throw new Error('Invalid chat ID or message ID');
        const body = {
            content: typeof message === 'string' ? message : (message?.content ?? ''),
            message: typeof message === 'string' ? message : (message?.content ?? ''),
        };
        if (correction && typeof correction === 'object' && (correction.from != null || correction.to != null)) {
            body.correction = { from: correction.from ?? '', to: correction.to ?? '' };
        }
        const response = await api.put(`/conversations/${encodeURIComponent(sid)}/messages/${encodeURIComponent(mid)}`, body);
        return response.data;
    },

    deleteMessage: async (chatId, messageId) => {
        const sid = chatId != null ? String(chatId).trim() : '';
        const mid = messageId != null ? String(messageId).trim() : '';
        if (!sid || !mid) throw new Error('Invalid chat ID or message ID');
        const response = await api.delete(`/conversations/${encodeURIComponent(sid)}/messages/${encodeURIComponent(mid)}`);
        return response.data;
    },

    /** ขอคำถามต่อเนื่อง (follow-up suggestions) จากคำถาม-คำตอบล่าสุด — คืน array ของ string */
    getFollowUpSuggestions: async (chatId, question, answer) => {
        const sid = chatId != null ? String(chatId).trim() : '';
        if (!sid || sid === 'undefined' || sid === 'null') throw new Error('Invalid chat ID');
        const response = await api.post(
            `/conversations/${encodeURIComponent(sid)}/followup-suggestions`,
            { question, answer },
        );
        return Array.isArray(response.data?.suggestions) ? response.data.suggestions : [];
    },

    /** แก้ไขข้อความผู้ใช้แบบ Gemini: ลบข้อความนี้และข้อความทั้งหมดที่ตามมา แล้วค่อยส่งข้อความใหม่ */
    truncateFromMessage: async (chatId, messageId) => {
        const sid = chatId != null ? String(chatId).trim() : '';
        const mid = messageId != null ? String(messageId).trim() : '';
        if (!sid || !mid) throw new Error('Invalid chat ID or message ID');
        const response = await api.delete(
            `/conversations/${encodeURIComponent(sid)}/messages/${encodeURIComponent(mid)}/from-here`,
        );
        return response.data;
    },

    /** โหวตคำตอบบอท (up/down) — backend: POST /api/messages/:id/feedback */
    submitFeedback: async (messageId, rating, comment = null) => {
        const mid = messageId != null ? String(messageId).trim() : '';
        if (!mid) throw new Error('Invalid message ID');
        const body = { rating: ['up', 'down', 'none'].includes(rating) ? rating : 'up' };
        if (comment != null && String(comment).trim()) body.comment = String(comment).trim().slice(0, 500);
        const response = await api.post(`/messages/${encodeURIComponent(mid)}/feedback`, body);
        return response.data;
    },

    // ส่งข้อความผู้ใช้ + ได้คำตอบจากบอท (backend: POST /api/chat)
    createBotResponse: async (chatId, message, _documentIds = null, opts = {}) => {
        const sid = chatId != null ? String(chatId).trim() : '';
        if (!sid || sid === 'undefined' || sid === 'null') throw new Error('Invalid chat ID');
        const { privateMode = false, privateContent = '' } = opts || {};
        const response = await api.post('/chat', {
            conversationId: sid,
            message: typeof message === 'string' ? message : (message?.content ?? message ?? ''),
            privateMode: privateMode === true,
            ...(privateMode ? { privateContent } : {}),
        });
        return response.data;
    },

    // Streaming: ส่งข้อความ + ได้คำตอบทีละส่วน (onChunk ถูกเรียกทุกครั้งที่มี chunk ใหม่)
    createBotResponseStream: async (chatId, message, { onChunk, onDone, signal, privateMode = false, privateContent = '', mode = 'detailed' } = {}) => {
        const sid = chatId != null ? String(chatId).trim() : '';
        if (!sid || sid === 'undefined' || sid === 'null') throw new Error('Invalid chat ID');
        const baseURL = API_CONFIG.baseURL;
        const res = await fetch(`${baseURL}/chat/stream`, {
            method: 'POST',
            credentials: 'include',
            signal,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                conversationId: sid,
                message: typeof message === 'string' ? message : (message?.content ?? message ?? ''),
                privateMode: privateMode === true,
                mode: mode === 'fast' ? 'fast' : 'detailed',
                ...(privateMode ? { privateContent } : {}),
            }),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || res.statusText || 'Stream failed');
        }
        const contentType = String(res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            const data = await res.json().catch(() => ({}));
            const reply = data?.reply != null ? String(data.reply) : '';
            if (reply && typeof onChunk === 'function') onChunk(reply);
            if (typeof onDone === 'function') {
                onDone({
                    done: true,
                    reply,
                    references: data?.references,
                    groundingChunks: data?.groundingChunks,
                    messageId: data?.messageId,
                });
            }
            return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let doneEventReceived = false;
        const processLine = (line) => {
            if (!line.startsWith('data: ')) return;
            const raw = line.slice(6).trim();
            if (!raw) return;
            try {
                const data = JSON.parse(raw);
                if (data.content && typeof onChunk === 'function') onChunk(data.content);
                if (data.done && typeof onDone === 'function') {
                    doneEventReceived = true;
                    onDone(data);
                }
            } catch (_) {}
        };
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (value) buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) processLine(line);
                if (done) {
                    if (buffer.trim()) processLine(buffer);
                    if (!doneEventReceived && typeof onDone === 'function') onDone({});
                    break;
                }
            }
        } finally {
            reader.releaseLock();
        }
    },
};

// ประกาศจาก admin — แสดงเป็น banner ในหน้าแชท
export const announcementAPI = {
    getActive: async () => {
        const response = await api.get('/announcements/active');
        return Array.isArray(response.data?.announcements) ? response.data.announcements : [];
    },
};

// Private Context API (โหมดส่วนตัว — เนื้อหาที่ผู้ใช้กรอกเอง เก็บระดับ user)
export const privateContextAPI = {
    get: async () => {
        const response = await api.get('/private-context');
        return response.data;
    },
    // save รองรับ 2 รูปแบบ:
    //  - save({ instructions, content, enabled })  (แนะนำ)
    //  - save(content, enabled)                      (เดิม — backward compat)
    save: async (arg, enabledArg) => {
        let payload;
        if (arg && typeof arg === 'object') {
            payload = {};
            if (typeof arg.instructions === 'string') payload.instructions = arg.instructions;
            if (typeof arg.content === 'string') payload.content = arg.content;
            if (typeof arg.enabled === 'boolean') payload.enabled = arg.enabled;
        } else {
            payload = {
                content: typeof arg === 'string' ? arg : '',
                ...(typeof enabledArg === 'boolean' ? { enabled: enabledArg } : {}),
            };
        }
        const response = await api.put('/private-context', payload);
        return response.data;
    },
};

// Bot API functions
export const botAPI = {
    // Get all bots
    getBots: async () => {
        const response = await api.get('/bots');
        return response.data;
    },

    // บอทช่วยสอน (ไม่โชว์ในหน้ารายการ — ใช้กับ 3 ปุ่มบน homepage)
    getHelpConfig: async () => {
        const response = await api.get('/bots/help-config');
        return response.data;
    },

};

export default api;