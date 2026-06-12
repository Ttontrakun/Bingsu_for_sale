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
        const data = error.response?.data;
        if (data?.error && typeof data.error === 'string') {
            const msg = data.error.toLowerCase();
            if (msg.includes('chat quota') || msg.includes('daily chat')) return 'โควต้าแชทรายวันหมดแล้ว — ลองใหม่พรุ่งนี้';
            if (msg.includes('token quota') || msg.includes('daily token')) return 'โควต้าโทเค็นรายวันหมดแล้ว — ลองใหม่พรุ่งนี้';
            if (msg.includes('rate limit')) return 'ส่งข้อความบ่อยเกินไป — กรุณารอสักครู่แล้วลองอีกครั้ง';
        }
        const retryAfter = error.response.headers['retry-after'];
        if (retryAfter) {
            const seconds = parseInt(retryAfter, 10);
            const minutes = Math.ceil(seconds / 60);
            return `คุณพยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ ${minutes} นาที แล้วลองอีกครั้ง`;
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
        if (response.data.user) {
            localStorage.setItem('user', JSON.stringify(response.data.user));
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

    // Logout
    logout: () => {
        localStorage.removeItem('user');
    },
};

// Credential API functions
export const credentialAPI = {
    // Change password
    changePassword: async (oldPassword, newPassword) => {
        const response = await api.post('/credentials/change-password', {
            old_password: oldPassword,
            new_password: newPassword,
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

    // Update user profile by ID (admin only)
    updateProfileById: async (userId, profileData) => {
        // Ensure userId is an integer
        const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
        if (isNaN(userIdInt)) {
            throw new Error('Invalid user ID');
        }
        const response = await api.put(`/users/${userIdInt}`, {
            firstName: profileData.firstName,
            lastName: profileData.lastName,
            email: profileData.email,
        });
        return response.data;
    },

    // Get user by ID
    getUserById: async (userId) => {
        // Ensure userId is an integer
        const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
        if (isNaN(userIdInt)) {
            throw new Error('Invalid user ID');
        }
        const response = await api.get(`/users/${userIdInt}`);
        return response.data;
    },

    // Admin functions for approval
    // Get pending approval users (admin only)
    getPendingUsers: async () => {
        const response = await api.get('/users/pending');
        return response.data;
    },

    // Approve a user (admin only)
    approveUser: async (userId) => {
        const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
        if (isNaN(userIdInt)) {
            throw new Error('Invalid user ID');
        }
        const response = await api.put(`/users/${userIdInt}/approve`);
        return response.data;
    },

    // Reject/unapprove a user (admin only)
    rejectUser: async (userId) => {
        const userIdInt = typeof userId === 'string' ? parseInt(userId, 10) : userId;
        if (isNaN(userIdInt)) {
            throw new Error('Invalid user ID');
        }
        const response = await api.put(`/users/${userIdInt}/reject`);
        return response.data;
    },
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
    create: async (documentId, botId = null) => {
        const payload = { documentId };
        if (botId) payload.botId = botId;
        const response = await api.post('/conversations', payload);
        return response.data;
    },
    updateTitle: async (id, title) => {
        const sid = id != null ? String(id).trim() : '';
        if (!sid || sid === 'undefined' || sid === 'null') throw new Error('Invalid conversation ID');
        const response = await api.patch(`/conversations/${encodeURIComponent(sid)}`, { title });
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
    createChat: async (_name, _userIds, botId, documentId) => {
        if (!documentId) throw new Error('documentId is required to create conversation');
        return conversationsAPI.create(documentId, botId || null);
    },
    updateChat: async (chatId, name) => {
        return conversationsAPI.updateTitle(chatId, name);
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

    /** โหวตคำตอบบอท (up/down) — backend: POST /api/messages/:id/feedback */
    submitFeedback: async (messageId, rating, comment = null) => {
        const mid = messageId != null ? String(messageId).trim() : '';
        if (!mid) throw new Error('Invalid message ID');
        const body = { rating: rating === 'up' || rating === 'down' ? rating : 'up' };
        if (comment != null && String(comment).trim()) body.comment = String(comment).trim().slice(0, 500);
        const response = await api.post(`/messages/${encodeURIComponent(mid)}/feedback`, body);
        return response.data;
    },

    // ส่งข้อความผู้ใช้ + ได้คำตอบจากบอท (backend: POST /api/chat)
    createBotResponse: async (chatId, message, _documentIds = null) => {
        const sid = chatId != null ? String(chatId).trim() : '';
        if (!sid || sid === 'undefined' || sid === 'null') throw new Error('Invalid chat ID');
        const response = await api.post('/chat', {
            conversationId: sid,
            message: typeof message === 'string' ? message : (message?.content ?? message ?? ''),
        });
        return response.data;
    },

    // Streaming: ส่งข้อความ + ได้คำตอบทีละส่วน (onChunk ถูกเรียกทุกครั้งที่มี chunk ใหม่)
    createBotResponseStream: async (chatId, message, { onChunk, onDone, signal } = {}) => {
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
            }),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || res.statusText || 'Stream failed');
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

// Bot API functions
export const botAPI = {
    // Get all bots
    getBots: async () => {
        const response = await api.get('/bots');
        return response.data;
    },

    // Get bot by ID (backend ใช้ id แบบ string/cuid)
    getBot: async (botId) => {
        const id = botId != null ? String(botId).trim() : '';
        if (!id || id === 'undefined' || id === 'null') throw new Error('Invalid bot ID');
        const response = await api.get(`/bots/${encodeURIComponent(id)}`);
        return response.data;
    },

    // บอทช่วยสอน (ไม่โชว์ในหน้ารายการ — ใช้กับ 3 ปุ่มบน homepage)
    getHelpConfig: async () => {
        const response = await api.get('/bots/help-config');
        return response.data;
    },

    // Create a new bot
    createBot: async (botData) => {
        const payload = {
            name: botData.name,
            prompt: botData.prompt || botData.systemPrompt || '',
            description: botData.description || null,
            model: botData.model || botData.modelId || null,
            avatarUrl: botData.avatarUrl || null,
            avatarBase64: botData.avatarBase64 || undefined,
            enabled: botData.enabled !== undefined ? botData.enabled : true,
            documentIds: botData.documentIds || []
        };
        
        console.log('Sending bot creation request:', payload);
        const response = await api.post('/bots', payload);
        return response.data;
    },

    // Update a bot (id เป็น string/cuid)
    updateBot: async (botId, botData) => {
        const id = botId != null ? String(botId).trim() : '';
        if (!id || id === 'undefined' || id === 'null') throw new Error('Invalid bot ID');
        const response = await api.patch(`/bots/${encodeURIComponent(id)}`, {
            name: botData.name,
            prompt: botData.prompt || botData.systemPrompt,
            description: botData.description,
            model: botData.model || botData.modelId,
            avatarUrl: botData.avatarUrl,
            avatarBase64: botData.avatarBase64,
            enabled: botData.enabled,
            documentIds: botData.documentIds
        });
        return response.data;
    },

    // Delete a bot (id เป็น string/cuid)
    deleteBot: async (botId) => {
        const id = botId != null ? String(botId).trim() : '';
        if (!id || id === 'undefined' || id === 'null') throw new Error('Invalid bot ID');
        const response = await api.delete(`/bots/${encodeURIComponent(id)}`);
        return response.data;
    },
};

// Integrations API (LINE, etc.)
export const integrationsAPI = {
    list: async () => {
        const response = await api.get('/integrations');
        return response.data;
    },
    update: async (provider, payload) => {
        const p = provider != null ? String(provider).trim() : '';
        if (!p) throw new Error('Invalid provider');
        const response = await api.patch(`/integrations/${encodeURIComponent(p)}`, payload);
        return response.data;
    },
};

// Document/Knowledge API functions
export const documentAPI = {
    // Get all documents
    getDocuments: async () => {
        const response = await api.get('/documents');
        return response.data;
    },

    // Get document by ID (backend ใช้ id แบบ string/cuid)
    getDocument: async (documentId) => {
        const id = documentId != null ? String(documentId).trim() : '';
        if (!id || id === 'undefined' || id === 'null') throw new Error('Invalid document ID');
        const response = await api.get(`/documents/${encodeURIComponent(id)}`);
        return response.data;
    },

    // Create a new document
    createDocument: async (documentData) => {
        const response = await api.post('/documents', documentData);
        return response.data;
    },

    // Update a document (id เป็น string/cuid) — บันทึก + แปลงเป็น vector ใช้เวลานาน
    updateDocument: async (documentId, documentData) => {
        const id = documentId != null ? String(documentId).trim() : '';
        if (!id || id === 'undefined' || id === 'null') throw new Error('Invalid document ID');
        const VECTOR_TIMEOUT = 1200000; // 20 นาที (บันทึก+embed+Qdrant อาจช้า)
        const response = await api.patch(`/documents/${encodeURIComponent(id)}`, documentData, {
            timeout: VECTOR_TIMEOUT,
        });
        return response.data;
    },

    // Delete a document (id เป็น string/cuid)
    deleteDocument: async (documentId) => {
        const id = documentId != null ? String(documentId).trim() : '';
        if (!id || id === 'undefined' || id === 'null') throw new Error('Invalid document ID');
        const response = await api.delete(`/documents/${encodeURIComponent(id)}`);
        return response.data;
    },
    // Get Qdrant status
    getQdrantStatus: async () => {
        const response = await api.get('/documents/qdrant/status');
        return response.data;
    },
    // Process file with OCR (documentId เป็น string/cuid จาก backend)
    // options: { provider: 'typhoon' } = ใช้ Typhoon OCR โดยตรง (แนะนำสำหรับ PDF สแกน)
    processFileWithOCR: async (documentId, file, options = {}) => {
        const id = documentId != null ? String(documentId).trim() : '';
        if (!id || id === 'undefined' || id === 'null') throw new Error('Invalid document ID');
        const formData = new FormData();
        formData.append('file', file);
        if (options.provider === 'typhoon') {
            formData.append('provider', 'typhoon');
        }
        // OCR processing can take a long time, especially for large files or first-time model loading
        // OCR อาจใช้เวลานาน (PDF หลายหน้า / Typhoon) — 10 นาที ให้สอดคล้องกับ nginx
        const OCR_TIMEOUT = 600000; // 10 minutes
        const response = await api.post(`/documents/${encodeURIComponent(id)}/files/ocr`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            timeout: OCR_TIMEOUT,
        });
        return response.data;
    },
    /** จัดเรียงข้อความ OCR ด้วย AI (หัวข้อ/ย่อหน้า) — ต้องมี OPENAI_API_KEY หรือ OCR_LLM_* ใน backend */
    structureOcrWithAi: async (documentId, text) => {
        const id = documentId != null ? String(documentId).trim() : '';
        if (!id || id === 'undefined' || id === 'null') throw new Error('Invalid document ID');
        const STRUCTURE_TIMEOUT = Number(process.env.REACT_APP_OCR_STRUCTURE_TIMEOUT_MS || 120000);
        const response = await api.post(
            `/documents/${encodeURIComponent(id)}/files/ocr/structure-text`,
            { text },
            { timeout: STRUCTURE_TIMEOUT },
        );
        return response.data;
    },
};

// Database API functions
export const databaseAPI = {
    // Get all schemas
    getAllSchemas: async () => {
        const response = await api.get('/database/schemas');
        return response.data;
    },

    // Get schema details by name
    getSchemaDetails: async (schemaName) => {
        const response = await api.get(`/database/schemas/${schemaName}`);
        return response.data;
    },

    // Get Qdrant status
    getQdrantStatus: async () => {
        const response = await api.get('/documents/qdrant/status');
        return response.data;
    },

    // Get table data
    getTableData: async (schemaName, tableName, limit = 100, offset = 0) => {
        const response = await api.get(`/database/schemas/${schemaName}/tables/${tableName}/data`, {
            params: { limit, offset }
        });
        return response.data;
    },
};

export default api;