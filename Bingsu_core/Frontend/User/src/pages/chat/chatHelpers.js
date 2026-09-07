import avatarMale from '../../assets/avatars/user_male.png';
import avatarFemale from '../../assets/avatars/user_female.png';

export const AVATAR_SRC_BY_KEY = {
  'preset:user_male': avatarMale,
  'preset:user_female': avatarFemale,
};
export const getUserAvatarSrc = (avatarUrl) => AVATAR_SRC_BY_KEY[String(avatarUrl || '')] || avatarMale;
export const DEFAULT_USER_AVATAR = 'preset:user_male';

export const formatToken = (n) => {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x.toLocaleString('th-TH') : '0';
};
export const OFFICIAL_BOT_DESCRIPTION = 'ค้นหาข้อมูลจากเอกสารที่มีในระบบ และตอบคำถามตามเนื้อหาในเอกสารนั้น พร้อมระบุแหล่งอ้างอิงให้ตรวจสอบได้';
export const LEGACY_OFFICIAL_BOT_DESCRIPTION = 'ระบบผู้ช่วยอัจฉริยะสำหรับตอบคำถามและวิเคราะห์ข้อมูลจากฐานความรู้อย่างเป็นระบบ โดยมุ่งเน้นความถูกต้อง รวดเร็ว และความน่าเชื่อถือของข้อมูล';
export const ENABLE_MESSAGE_EDIT_BUTTON = false;
export const ENABLE_MODE_SELECTOR = false;
export const ENABLE_SOURCE_REFERENCES = true;

export const isCorruptedText = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  const qCount = (text.match(/\?/g) || []).length;
  return qCount >= 3 && qCount / Math.max(1, text.length) > 0.25;
};

export const resolveBotDescription = (description) => {
  const text = String(description || '').trim();
  if (!text || text === LEGACY_OFFICIAL_BOT_DESCRIPTION || isCorruptedText(text)) {
    return OFFICIAL_BOT_DESCRIPTION;
  }
  return text;
};

export const normalizeReferenceQuote = (input) => {
  const raw = String(input || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const stripped = raw
    .replace(/^(?:sheet|tab)\s*[^|]*\|\s*/i, '')
    .replace(/^(?:row|line|column)\s*[_\d\s-]*:?\s*/i, '');
  return (stripped || raw).slice(0, 220).trim();
};

const AI_HELPER_MARKER = /(ให้ระบบค้นเจอง่าย|ให้ค้นหาเจอง่าย|ให้ค้นเจอง่าย|ให้ระบบค้นหาเจอ|ให้ระบบค้นเจอ|ให้ระบบค้นหา|search[- ]?friendly|สรุปเป็นประโยค|แบบประโยค)/i;
const AI_HELPER_LINE = /International\s+[\d,]+\s*\/\s*Local\s*Access\s+[\d,]+\s*Mbps\s*:\s*ราคาปกติรวม/i;

export const stripAiHelperSections = (raw) => {
  const lines = String(raw || '').split('\n');
  const out = [];
  let skipping = false;
  for (const line of lines) {
    const isHeader = /^\s{0,3}#{1,6}\s/.test(line);
    if (isHeader) {
      skipping = AI_HELPER_MARKER.test(line);
      if (!skipping) out.push(line);
      continue;
    }
    if (!skipping && AI_HELPER_MARKER.test(line)) {
      skipping = true;
      continue;
    }
    if (AI_HELPER_LINE.test(line)) continue;
    if (!skipping) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

export const extractReferencePosition = (chunk) => {
  const label = String(chunk?.payload?.label || '').trim();
  const rawChunkIndex = chunk?.payload?.chunkIndex;
  const chunkIndex = Number.isFinite(Number(rawChunkIndex)) ? Number(rawChunkIndex) : null;
  const textRaw = String(chunk?.retrievedContext?.text ?? chunk?.payload?.text ?? '').trim();
  const quote = normalizeReferenceQuote(textRaw);
  const pageMatch = label.match(/page\s+(\d+)/i) || textRaw.match(/\bpage\s+(\d+)\b/i);
  const page = pageMatch ? Number(pageMatch[1]) : null;
  let lineHint = '';
  const rowMatch = label.match(/row\s+(\d+)/i) || textRaw.match(/\brow\s+(\d+)\b/i);
  const lineMatch = label.match(/line\s+(\d+)(?:\s*[-–]\s*(\d+))?/i) || textRaw.match(/\bline\s+(\d+)(?:\s*[-–]\s*(\d+))?\b/i);
  if (rowMatch) lineHint = `แถว ${rowMatch[1]}`;
  else if (lineMatch) lineHint = lineMatch[2] ? `บรรทัด ${lineMatch[1]}-${lineMatch[2]}` : `บรรทัด ${lineMatch[1]}`;
  else if (pageMatch) lineHint = `หน้า ${pageMatch[1]}`;
  else if (chunkIndex !== null) lineHint = `ช่วงที่ ${chunkIndex + 1}`;
  const score = Number.isFinite(Number(chunk?.score)) ? Number(chunk.score) : 0;
  return { chunkIndex, label, lineHint, page, quote, score };
};

export const buildReferencesFromGroundingChunks = (chunks = []) => {
  const docMap = new Map();
  (Array.isArray(chunks) ? chunks : []).forEach((chunk) => {
    const docId = chunk?.retrievedContext?.docId ?? chunk?.payload?.docId;
    if (!docId) return;
    const title = chunk?.retrievedContext?.title ?? chunk?.payload?.fileName ?? 'เอกสาร';
    if (!docMap.has(docId)) {
      docMap.set(docId, { docId, displayName: title, positions: [], bestScore: Number.NEGATIVE_INFINITY });
    }
    const ref = docMap.get(docId);
    const pos = extractReferencePosition(chunk);
    ref.bestScore = Math.max(ref.bestScore, pos.score || 0);
    const key = `${pos.chunkIndex ?? 'n'}::${pos.label || ''}::${pos.lineHint || ''}`;
    if (!ref.positions.some((item) => `${item.chunkIndex ?? 'n'}::${item.label || ''}::${item.lineHint || ''}` === key)) {
      ref.positions.push(pos);
    }
    ref.positions.sort((a, b) => (b.score || 0) - (a.score || 0));
  });
  return Array.from(docMap.values())
    .sort((a, b) => (b.bestScore || Number.NEGATIVE_INFINITY) - (a.bestScore || Number.NEGATIVE_INFINITY))
    .map((ref) => ({ docId: ref.docId, displayName: ref.displayName, positions: ref.positions.slice(0, 3) }));
};

export const parseStoredJsonArray = (raw) => {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const isConversationNotFoundError = (error) => {
  const status = Number(error?.response?.status);
  const backendMessage = String(error?.response?.data?.error || '').toLowerCase();
  const text = String(error?.message || '').toLowerCase();
  return (status === 404 && backendMessage.includes('conversation'))
    || text.includes('conversation not found');
};

export const isAbortError = (error) => {
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();
  return name === 'AbortError' || message.includes('aborted') || message.includes('abort');
};

export const isGeneratedFollowUpPrompt = (text) => {
  const t = String(text || '').trim();
  if (!t) return false;
  return /^จากคำตอบก่อนหน้า\s*ช่วย/i.test(t);
};

export const parsePrivateCommand = (text) => {
  const raw = String(text || '').trim();
  const slash = raw.match(/^\/(จำ|สั่ง)\s*([\s\S]*)$/);
  if (slash) {
    return {
      kind: slash[1] === 'จำ' ? 'remember' : 'instruction',
      payload: String(slash[2] || '').trim(),
    };
  }
  const soft = raw.match(/^(?:จำไว้ว่า|จำว่า|ขอให้จำ(?:ว่า)?|ให้จำว่า)\s+([\s\S]+)$/i);
  if (soft && String(soft[1] || '').trim().length >= 4) {
    return { kind: 'remember', payload: String(soft[1] || '').trim() };
  }
  return null;
};

export const parseRememberedItems = (content) =>
  String(content || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

export const PRIVATE_ORDER_STARTERS = [
  '/สั่ง ตอบสั้น ตรงประเด็น เป็นข้อๆ',
  '/สั่ง ตอบละเอียด อธิบายเงื่อนไขให้ครบ',
  '/สั่ง ใช้ภาษาทางการ สุภาพ',
];

export const isPrivateCommandSuggestion = (text) => /^\/(จำ|สั่ง)\b/.test(String(text || '').trim());

export const mergePrivateOrderStarters = (suggestions, { privateMode, hasInstructions }) => {
  const base = Array.isArray(suggestions) ? suggestions.filter(Boolean) : [];
  if (!privateMode || hasInstructions) return base.slice(0, 5);
  const starters = PRIVATE_ORDER_STARTERS.filter((s) => !base.includes(s));
  return [...starters.slice(0, 2), ...base].slice(0, 5);
};

export const BOT_FULL_WIDTH = true;
export const SHORT_BOT_BUBBLE_CHAR_LIMIT = 120;

export const formatTime = (date) => {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;

  return date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatDetailedTime = (date) => {
  return date.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};
