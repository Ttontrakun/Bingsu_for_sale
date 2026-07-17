import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import Sidebar from '../components/Sidebar';
import { 
  HiArrowLeft, 
  HiOutlinePaperAirplane, 
  HiOutlineUser,
  HiClipboardCopy,
  HiCheck,
  HiX,
  HiPencil,
  HiThumbUp,
  HiThumbDown,
  HiChevronDown,
} from 'react-icons/hi';
import { HiChatBubbleLeftRight } from 'react-icons/hi2';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import { showToast } from '../components/ToastNotification';
import { chatMessageAPI, chatAPI, botAPI, userAPI, privateContextAPI, getErrorMessage } from '../services/api';

// ตัวเรนเดอร์ Markdown ของบอท — แยกออกมาและหุ้ม memo เพื่อไม่ให้ re-render
// ตาม state อื่น ๆ ของหน้าแชท (โหลด quota ทุก 12 วิ, hover, scroll ฯลฯ)
// เพราะการ re-render ReactMarkdown ระหว่างลากเมาส์จะทำให้ selection หลุด
// ต้องกดค้างตลอด — memo ช่วยให้ DOM คงเดิม เลือก/คัดลอกได้เหมือนข้อความผู้ใช้
const BOT_MARKDOWN_COMPONENTS = {
  h1: ({ node, children, ...props }) => <h1 className='text-lg font-semibold mt-3 mb-2 text-gray-900' {...props}>{children}</h1>,
  h2: ({ node, children, ...props }) => <h2 className='text-base font-semibold mt-3 mb-2 text-gray-900' {...props}>{children}</h2>,
  h3: ({ node, children, ...props }) => <h3 className='text-[15px] font-semibold mt-2.5 mb-1.5 text-gray-900' {...props}>{children}</h3>,
  table: ({ node, ...props }) => (
    <table
      className='w-full max-w-full table-fixed border border-gray-200 rounded-lg overflow-hidden my-2 text-sm'
      style={{ tableLayout: 'fixed' }}
      {...props}
    />
  ),
  thead: ({ node, ...props }) => <thead className='bg-gray-100' {...props} />,
  th: ({ node, ...props }) => (
    <th
      className='border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700 align-top break-words whitespace-normal sm:whitespace-nowrap'
      style={{ overflowWrap: 'anywhere', wordBreak: 'normal' }}
      {...props}
    />
  ),
  td: ({ node, ...props }) => (
    <td
      className='border border-gray-200 px-3 py-2 text-gray-800 align-top break-words whitespace-pre-wrap'
      style={{ overflowWrap: 'anywhere', wordBreak: 'normal' }}
      {...props}
    />
  ),
  tr: ({ node, ...props }) => <tr className='border-b border-gray-200' {...props} />,
  p: ({ node, ...props }) => <p className='whitespace-pre-wrap my-2 text-[15px] leading-7' {...props} />,
  strong: ({ node, ...props }) => <strong className='font-semibold' {...props} />,
  ul: ({ node, ...props }) => <ul className='list-disc list-inside my-2 space-y-1' {...props} />,
  ol: ({ node, ...props }) => <ol className='list-decimal list-inside my-2 space-y-1 pl-4' {...props} />,
  li: ({ node, ...props }) => <li className='ml-1 pl-1 leading-7' {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote className='border-l-4 border-yellow-300 bg-yellow-50/60 rounded-r-md px-3 py-2 my-2 text-gray-700' {...props} />
  ),
  code: ({ inline, children, ...props }) =>
    inline ? (
      <code className='px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 text-[13px]' {...props}>
        {children}
      </code>
    ) : (
      <code className='block rounded-lg bg-gray-900 text-gray-100 p-3 text-[13px] leading-6 overflow-x-auto' {...props}>
        {children}
      </code>
    ),
};

const BotMarkdown = memo(function BotMarkdown({ text }) {
  return (
    <div className='gemini-markdown max-w-full min-w-0 overflow-x-auto select-text [&_*]:select-text [&_ol_li>p]:inline [&_ol_li>p]:my-0 [&_ul_li>p]:inline [&_ul_li>p]:my-0 [&_table]:max-w-full [&_th:first-child]:w-32 [&_td:first-child]:w-32'>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={BOT_MARKDOWN_COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

const formatToken = (n) => {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x.toLocaleString('th-TH') : '0';
};
const OFFICIAL_BOT_DESCRIPTION = 'ระบบผู้ช่วยอัจฉริยะสำหรับตอบคำถามและวิเคราะห์ข้อมูลจากฐานความรู้อย่างเป็นระบบ โดยมุ่งเน้นความถูกต้อง รวดเร็ว และความน่าเชื่อถือของข้อมูล';
const ENABLE_MESSAGE_EDIT_BUTTON = false;
// ซ่อนปุ่มเลือกโหมด (Flash/Detail) ไว้ก่อน — ใช้ Detail (120B บน H100) เป็นหลักเสมอ
const ENABLE_MODE_SELECTOR = false;
const ENABLE_SOURCE_REFERENCES = true;
const isCorruptedText = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  const qCount = (text.match(/\?/g) || []).length;
  return qCount >= 3 && qCount / Math.max(1, text.length) > 0.25;
};

const normalizeReferenceQuote = (input) => {
  const raw = String(input || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const stripped = raw
    .replace(/^(?:sheet|tab)\s*[^|]*\|\s*/i, '')
    .replace(/^(?:row|line|column)\s*[_\d\s-]*:?\s*/i, '');
  return (stripped || raw).slice(0, 220).trim();
};

// ส่วนในเอกสารที่เขียนไว้ "ให้ AI ค้นหาเจอง่าย" (machine-oriented) — ซ่อนตอนแสดงแหล่งที่มาให้ผู้ใช้
// (AI ยังใช้เนื้อหาเต็มในการค้น/ตอบ เพียงแต่ไม่แสดงส่วนนี้ในหน้าอ้างอิง)
const AI_HELPER_MARKER = /(ให้ระบบค้นเจอง่าย|ให้ค้นหาเจอง่าย|ให้ค้นเจอง่าย|ให้ระบบค้นหาเจอ|ให้ระบบค้นเจอ|ให้ระบบค้นหา|search[- ]?friendly|สรุปเป็นประโยค|แบบประโยค)/i;
// บรรทัด "ประโยคช่วยค้นหา" (machine sentence) ที่ถูกตัด chunk แยกจากหัวข้อ — ตัดทิ้งตอนแสดง
const AI_HELPER_LINE = /International\s+[\d,]+\s*\/\s*Local\s*Access\s+[\d,]+\s*Mbps\s*:\s*ราคาปกติรวม/i;

const stripAiHelperSections = (raw) => {
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

const extractReferencePosition = (chunk) => {
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

const buildReferencesFromGroundingChunks = (chunks = []) => {
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

/** ค่าจาก Prisma Json / ระหว่างเดินสาย — normalize เป็น array */
const parseStoredJsonArray = (raw) => {
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

const isConversationNotFoundError = (error) => {
  const status = Number(error?.response?.status);
  const backendMessage = String(error?.response?.data?.error || '').toLowerCase();
  const text = String(error?.message || '').toLowerCase();
  return (status === 404 && backendMessage.includes('conversation'))
    || text.includes('conversation not found');
};

const isAbortError = (error) => {
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();
  return name === 'AbortError' || message.includes('aborted') || message.includes('abort');
};

const getReferenceFileMeta = (displayName) => {
  const name = String(displayName || 'เอกสาร');
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return { icon: '📄', type: 'PDF', previewClass: 'from-rose-600 to-red-700' };
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv'))
    return { icon: '📊', type: 'EXCEL/CSV', previewClass: 'from-emerald-600 to-teal-700' };
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) return { icon: '📝', type: 'WORD', previewClass: 'from-blue-600 to-indigo-700' };
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp'))
    return { icon: '🖼️', type: 'IMAGE', previewClass: 'from-violet-500 to-purple-700' };
  return { icon: '📎', type: 'DOC', previewClass: 'from-slate-500 to-slate-700' };
};

const isGeneratedFollowUpPrompt = (text) => {
  const t = String(text || '').trim();
  if (!t) return false;
  return /^จากคำตอบก่อนหน้า\s*ช่วย/i.test(t);
};

const parsePrivateCommand = (text) => {
  const raw = String(text || '').trim();
  if (!raw.startsWith('/')) return null;
  const match = raw.match(/^\/(จำ|สั่ง)\s*([\s\S]*)$/);
  if (!match) return null;
  return {
    kind: match[1] === 'จำ' ? 'remember' : 'instruction',
    payload: String(match[2] || '').trim(),
  };
};

const parseRememberedItems = (content) =>
  String(content || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

// ตัวบ่งชี้ "กำลังพิมพ์" ของบอท — แสดงเฉพาะตอนรอคำตอบแต่ยังไม่มีบับเบิลบอท (ไม่ทับตอนสตรีม)
const TypingIndicator = ({ isTyping, messages, typingStage }) => {
  if (!isTyping) return null;
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.sender === 'bot') return null;
  return (
    <div className='flex gap-3 justify-start'>
      <div className='flex-shrink-0 w-8 h-8 mt-1'>
        <div className='w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center shadow-sm'>
          <HiChatBubbleLeftRight className='text-white text-sm' />
        </div>
      </div>
      <div className='flex-1'>
        <div className='inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white border border-gray-200 shadow-sm'>
          <div className='flex gap-1.5'>
            <div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '0ms' }}></div>
            <div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '150ms' }}></div>
            <div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '300ms' }}></div>
          </div>
          <span className='text-xs text-gray-500'>
            {typingStage === 0
              ? 'กำลังค้นหาข้อมูลที่เกี่ยวข้อง…'
              : typingStage === 1
                ? 'กำลังเรียบเรียงคำตอบ…'
                : 'ใกล้เสร็จแล้ว กำลังตรวจสอบความถูกต้อง…'}
          </span>
        </div>
      </div>
    </div>
  );
};

function Chat() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingStage, setTypingStage] = useState(0);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [chatName, setChatName] = useState('');
  // help bot: ใช้ซ่อนปุ่มคำสั่งลัดเฉพาะแชทบอทช่วยสอน
  const [helpBotId, setHelpBotId] = useState(null);
  const [chatBotId, setChatBotId] = useState(null);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({});
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [editingOriginalText, setEditingOriginalText] = useState('');
  // แก้ไขข้อความที่ผู้ใช้ส่งไปแล้ว แล้วส่งคำถามที่แก้ใหม่ (แบบ Gemini)
  const [editingUserMsgId, setEditingUserMsgId] = useState(null);
  const [editingUserText, setEditingUserText] = useState('');
  // โหมดส่วนตัว: จัดการเนื้อหา/คำสั่งที่หน้า /private — ในแชทเหลือสวิตช์เปิด/ปิด
  const [privateMode, setPrivateMode] = useState(false);
  // โหมดคำตอบ: 'fast' (Qwen เร็ว) หรือ 'detailed' (120B ละเอียด) — จำค่าไว้ข้ามการใช้งาน
  const [answerMode, setAnswerMode] = useState(() => {
    if (!ENABLE_MODE_SELECTOR) return 'detailed';
    try { return localStorage.getItem('answerMode') === 'fast' ? 'fast' : 'detailed'; } catch { return 'detailed'; }
  });
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const selectAnswerMode = (m) => {
    const next = m === 'fast' ? 'fast' : 'detailed';
    setAnswerMode(next);
    try { localStorage.setItem('answerMode', next); } catch {}
    setModeMenuOpen(false);
  };
  const [usePrivateContent, setUsePrivateContent] = useState(true);
  const [privateHasData, setPrivateHasData] = useState(false);
  const [privateInstructionsText, setPrivateInstructionsText] = useState('');
  const [privateRememberItems, setPrivateRememberItems] = useState([]);
  const [privateMemoryPanelOpen, setPrivateMemoryPanelOpen] = useState(false);
  const [composerPrivateCommand, setComposerPrivateCommand] = useState(null); // 'remember' | 'instruction' | null
  const privateModeRef = useRef(false);
  const [feedbackByMessageId, setFeedbackByMessageId] = useState({});
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [sourceModalData, setSourceModalData] = useState(null);
  const [isSelectingText, setIsSelectingText] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const timeoutRefs = useRef({});
  const streamTextRef = useRef('');
  const streamBotIdRef = useRef(null);
  const pendingStreamChunkRef = useRef('');
  const streamFlushTimerRef = useRef(null);
  const streamAbortControllerRef = useRef(null);
  const missingConversationHandledRef = useRef(false);

  // Token quota (today)
  const [tokenQuota, setTokenQuota] = useState(null);
  
  // Bot states
  const [bots, setBots] = useState([]);
  const [isBotsDropdownOpen, setIsBotsDropdownOpen] = useState(false);
  const botsDropdownRef = useRef(null);
  const [selectedBot, setSelectedBot] = useState(null);
  const isHelpChat =
    (helpBotId && chatBotId && String(helpBotId) === String(chatBotId)) ||
    (helpBotId && location.state?.selectedBot?.id && String(helpBotId) === String(location.state.selectedBot.id)) ||
    (location.state?.selectedBot?.name === 'บอทช่วยสอน');

  // ดึงชื่อ chat และ bot จาก API
  useEffect(() => {
    const loadChatName = async () => {
      try {
        const chat = await chatAPI.getChat(chatId);
        setChatBotId(chat?.botId ?? null);
        if (chat?.private === true) setPrivateMode(true);
        if (chat && chat.name) {
          setChatName(chat.name);
        } else {
          setChatName('New Chat');
        }
        
        // ถ้า chat มี botId ให้โหลด bot จาก botId (priority สูงกว่า location.state)
        if (chat && chat.botId && bots.length > 0) {
          const bot = bots.find(b => b.id === chat.botId);
          if (bot) {
            setSelectedBot(bot);
          } else {
            console.warn('Bot from chat.botId not found in bots list:', chat.botId);
          }
        }
      } catch (error) {
        if (isConversationNotFoundError(error) && !missingConversationHandledRef.current) {
          missingConversationHandledRef.current = true;
          setErrorMessage('ไม่พบแชทนี้แล้ว (อาจถูกลบหรือไม่มีสิทธิ์เข้าถึง) ระบบจะพากลับหน้าแรก');
          setTimeout(() => {
            navigate('/homepage');
          }, 1200);
          return;
        }
        console.error('Error loading chat name:', error);
        setChatName('New Chat');
      }
    };

    loadChatName();
    
    // Listen for custom event (when chat is updated in Sidebar)
    const handleChatUpdate = () => {
      loadChatName();
    };
    window.addEventListener('chatsUpdated', handleChatUpdate);

    return () => {
      window.removeEventListener('chatsUpdated', handleChatUpdate);
    };
  }, [chatId, bots, navigate]);

  // โหลด help-config เพื่อรู้ว่า botId ไหนคือ "บอทช่วยสอน"
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await botAPI.getHelpConfig();
        if (cancelled) return;
        setHelpBotId(data?.botId ?? null);
      } catch (_) {
        if (!cancelled) setHelpBotId(null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const refreshPrivateMemory = useCallback(async () => {
    try {
      const data = await privateContextAPI.get();
      const instructions = String(data?.instructions || '').trim();
      const content = String(data?.content || '');
      const remembered = parseRememberedItems(content);
      setPrivateInstructionsText(instructions);
      setPrivateRememberItems(remembered);
      setPrivateHasData(Boolean(instructions || remembered.length));
    } catch (_) {
      // ignore
    }
  }, []);

  // ตรวจว่าผู้ใช้มีเนื้อหา/คำสั่งส่วนตัวบันทึกไว้ไหม (ไว้แสดงป้ายและ list ในแชท)
  useEffect(() => {
    refreshPrivateMemory();
  }, [refreshPrivateMemory]);

  // ห้องนี้เป็นห้องส่วนตัวไหม: เปิดทันทีถ้ามาจากหน้าโหมดส่วนตัว (ยืนยันอีกครั้งจาก chat.private ตอนโหลด)
  useEffect(() => {
    if (location.state?.privateMode) {
      setPrivateMode(true);
    }
  }, [location.state]);

  // sync refs เพื่อให้ค่าใน callback/stream เป็นปัจจุบันเสมอ
  // ส่ง privateMode=true ก็ต่อเมื่ออยู่ในห้องส่วนตัว "และ" สวิตช์เปิดอยู่
  useEffect(() => { privateModeRef.current = privateMode && usePrivateContent; }, [privateMode, usePrivateContent]);

  // โหลด bots จาก API
  useEffect(() => {
    const loadBots = async () => {
      try {
        const botsData = await botAPI.getBots();
        
        // Ensure we have an array and filter out any invalid data
        if (Array.isArray(botsData)) {
          // Filter to only show valid bots with required fields
          // Also extract documentIds from documents array if needed
          const validBots = botsData
            .filter(bot => 
              bot && 
              bot.id && 
              bot.name && 
              typeof bot.name === 'string'
            )
            .map(bot => {
              // Extract documentIds from documents array if documentIds is not present
              let documentIds = bot.documentIds;
              if (!documentIds && bot.documents && Array.isArray(bot.documents)) {
                documentIds = bot.documents.map(doc => doc.id || doc);
              }
              return {
                ...bot,
                documentIds: documentIds || []
              };
            });
          // Store all bots (including inactive) for checking selectedBot status
          setBots(validBots);
        } else {
          console.warn('Bots data is not an array:', botsData);
          setBots([]);
        }
      } catch (error) {
        console.error('Error loading bots:', error);
        setBots([]);
      }
    };

    loadBots();
  }, []);

  // โหลด token quota และอัปเดตเป็นระยะ (หน้า Chat)
  useEffect(() => {
    let cancelled = false;
    const load = async (silent = false) => {
      try {
        const data = await userAPI.getTokenQuotaToday();
        if (cancelled) return;
        setTokenQuota(data || null);
      } catch (e) {
        if (cancelled) return;
        if (!silent) console.warn('Load token quota failed:', e?.message || e);
      }
    };
    load(false);
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, 12000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Close bots dropdown when clicking outside
  useEffect(() => {
    if (!isBotsDropdownOpen) return;

    const handleClickOutside = (event) => {
      if (botsDropdownRef.current && !botsDropdownRef.current.contains(event.target)) {
        setIsBotsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isBotsDropdownOpen]);
  
  const [messages, setMessages] = useState([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const getDraftKey = useCallback((id) => {
    const chatKey = id != null ? String(id).trim() : '';
    return chatKey ? `chat:draft:${chatKey}` : null;
  }, []);

  const flushStreamText = useCallback(() => {
    if (streamFlushTimerRef.current) {
      cancelAnimationFrame(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }
    const pending = pendingStreamChunkRef.current;
    if (!pending) return;
    pendingStreamChunkRef.current = '';
    streamTextRef.current = (streamTextRef.current || '') + pending;
    const id = streamBotIdRef.current;
    if (!id) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text: streamTextRef.current } : m)),
    );
  }, []);

  const appendStreamChunk = useCallback(
    (content) => {
      if (!content) return;
      pendingStreamChunkRef.current += content;
      if (streamFlushTimerRef.current) return;
      streamFlushTimerRef.current = requestAnimationFrame(() => {
        flushStreamText();
      });
    },
    [flushStreamText],
  );

  // เก็บ timeout reference เพื่อ cleanup เมื่อ component unmount
  const typingTimeoutRef = useRef(null);
  // เก็บ firstMessage ที่ถูกส่งไปแล้วเพื่อป้องกันการส่งซ้ำ
  const firstMessageSentRef = useRef(false);
  // เก็บ firstMessage ที่ถูกส่งไปแล้ว (เก็บข้อความจริงๆ เพื่อตรวจสอบ)
  const sentFirstMessageRef = useRef(null);
  // เก็บ flag เพื่อป้องกันการโหลด messages ซ้ำ
  const isLoadingMessagesRef = useRef(false);

  // Reset messages และ initialization เมื่อเปลี่ยน chatId
  useEffect(() => {
    // Clear any pending timeouts
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    setMessages([]);
    setHasInitialized(false);
    setIsTyping(false);
    setEditingMessageId(null);
    setEditingText('');
    setEditingOriginalText('');
    firstMessageSentRef.current = false; // Reset firstMessage flag
    sentFirstMessageRef.current = null; // Reset sent firstMessage
    isLoadingMessagesRef.current = false; // Reset loading flag
    missingConversationHandledRef.current = false;
    setHoveredMessageId(null); // Reset hovered message
    setTooltipPosition({}); // Reset tooltip positions
    setErrorMessage(null); // Reset error message
    setSuccessMessage(null);
    pendingStreamChunkRef.current = '';
    if (streamFlushTimerRef.current) {
      cancelAnimationFrame(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }
    
    // Cleanup all timeouts
    Object.values(timeoutRefs.current).forEach(timeout => {
      if (timeout) clearTimeout(timeout);
    });
    timeoutRefs.current = {};
  }, [chatId]);

  // โหลด draft ข้อความที่พิมพ์ค้างไว้ของแต่ละห้องแชท
  useEffect(() => {
    const key = getDraftKey(chatId);
    if (!key) return;
    try {
      const savedDraft = localStorage.getItem(key);
      setChatInput(savedDraft || '');
    } catch {
      setChatInput('');
    }
  }, [chatId, getDraftKey]);

  // บันทึก draft ระหว่างพิมพ์ เพื่อกันข้อความหายเมื่อเปลี่ยนห้อง/รีเฟรช
  useEffect(() => {
    const key = getDraftKey(chatId);
    if (!key) return;
    try {
      if (chatInput && chatInput.trim()) {
        localStorage.setItem(key, chatInput);
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore storage errors (private mode / quota)
    }
  }, [chatId, chatInput, getDraftKey]);

  // โหลด messages จาก API
  const loadMessages = useCallback(async () => {
    // ป้องกันการโหลดซ้ำ
    if (isLoadingMessagesRef.current) {
      return;
    }
    
    isLoadingMessagesRef.current = true;
    try {
      const id = chatId != null ? String(chatId).trim() : '';
      if (!id || id === 'undefined' || id === 'null') {
        console.error('Invalid chat ID');
        return;
      }
      const messagesData = await chatMessageAPI.getMessages(id);
      const list = Array.isArray(messagesData) ? messagesData : [];

      const userData = localStorage.getItem('user');
      let currentUserId = null;
      if (userData) {
        try {
          const user = JSON.parse(userData);
          currentUserId = user.id;
        } catch (e) {
          console.error('Error parsing user data:', e);
        }
      }

      const messageMap = new Map();

      list.forEach(msg => {
        // Backend (conversations) ใช้ content + role (user/model)
        const text = msg.content ?? msg.message ?? '';
        const isBot = msg.role === 'model' || msg.isAiGenerated === true;
        const timestamp = new Date(msg.createdAt || 0);
        const groundingNorm = parseStoredJsonArray(msg.groundingChunks);
        const storedRefs = parseStoredJsonArray(msg.references);
        const references = isBot
          ? storedRefs.length > 0
            ? storedRefs
            : buildReferencesFromGroundingChunks(groundingNorm)
          : undefined;
        messageMap.set(msg.id, {
          id: msg.id,
          text,
          sender: isBot ? 'bot' : (msg.userId === currentUserId ? 'user' : 'user'),
          timestamp,
          ...(references?.length ? { references } : {}),
          ...(groundingNorm.length ? { groundingChunks: groundingNorm } : {}),
          ...(msg.feedback ? { feedback: msg.feedback } : {}),
        });
      });
      
      // แปลง Map เป็น Array และเรียงลำดับตามเวลา (เก่าที่สุดก่อน) — ถ้าเวลาเท่ากัน user ก่อน bot
      const formattedMessages = Array.from(messageMap.values()).sort((a, b) => {
        const t = a.timestamp - b.timestamp;
        if (t !== 0) return t;
        return a.sender === 'user' && b.sender === 'bot' ? -1 : a.sender === 'bot' && b.sender === 'user' ? 1 : 0;
      });
      setMessages(formattedMessages);
      // โหลด/รีเฟรชแล้วให้เริ่มที่บรรทัดล่าสุดเสมอ
      setShowScrollDown(false);
      requestAnimationFrame(() => scrollToBottom('auto'));
      setHasInitialized(true);
    } catch (error) {
      if (isConversationNotFoundError(error) && !missingConversationHandledRef.current) {
        missingConversationHandledRef.current = true;
        setErrorMessage('ไม่พบแชทนี้แล้ว (อาจถูกลบหรือไม่มีสิทธิ์เข้าถึง) ระบบจะพากลับหน้าแรก');
        setTimeout(() => {
          navigate('/homepage');
        }, 1200);
        return;
      }
      console.error('Error loading messages:', error);
      setMessages([]);
      setHasInitialized(true);
    } finally {
      isLoadingMessagesRef.current = false;
    }
  }, [chatId, navigate]);

  // โหลด bot ที่เลือกจาก location.state (สำหรับแชทใหม่) หรือจาก chat.botId (สำหรับแชทเก่า)
  // Priority: chat.botId > location.state
  useEffect(() => {
    // ถ้ามี selectedBot แล้ว (จาก chat.botId) ไม่ต้องโหลดจาก location.state
    if (selectedBot) {
      return;
    }
    
    const botFromState = location.state?.selectedBot;
    if (botFromState && bots.length > 0) {
      // หา bot object จาก bots list โดยใช้ id
      const botId = typeof botFromState === 'object' ? botFromState.id : botFromState;
      const bot = bots.find(b => 
        b.id.toString() === botId.toString() || 
        b.id === botId ||
        (typeof botFromState === 'object' && b.id === botFromState.id)
      );
      
      if (bot) {
        // ตรวจสอบว่า bot ยัง active อยู่หรือไม่
        if (bot.enabled !== false) {
          setSelectedBot(bot);
        } else {
          console.warn('Bot from state is inactive:', bot.name);
          // Bot inactive - เก็บไว้เพื่อแสดงข้อความเตือน แต่ไม่ให้ส่งข้อความ
          setSelectedBot(bot);
        }
      } else {
        console.warn('Bot from state not found in bots list:', botId);
      }
    } else if (botFromState && bots.length === 0) {
      // ถ้ายังไม่มี bots list ให้เก็บไว้ชั่วคราว
      setSelectedBot(botFromState);
    }
  }, [location.state, bots, selectedBot]);

  // จัดการ firstMessage จาก homepage (state หรือ query string เมื่อเปิดจากปุ่มบอทช่วยสอน)
  useEffect(() => {
    // ป้องกันการทำงานซ้ำ (React StrictMode)
    if (hasInitialized || firstMessageSentRef.current) return;
    
    const fromQuery = new URLSearchParams(location.search).get('firstMessage');
    let fromQueryDecoded = null;
    if (fromQuery) {
      try {
        fromQueryDecoded = decodeURIComponent(fromQuery);
      } catch (_) {
        fromQueryDecoded = fromQuery;
      }
    }
    const firstMessage = location.state?.firstMessage ?? fromQueryDecoded;
    
    if (firstMessage) {
      // ตรวจสอบว่า firstMessage นี้ถูกส่งไปแล้วหรือยัง (ป้องกันการส่งซ้ำ)
      if (sentFirstMessageRef.current === firstMessage) {
        return; // ถ้าถูกส่งไปแล้ว ให้ข้าม
      }
      
      // Mark firstMessage as sent IMMEDIATELY (ก่อน async) เพื่อป้องกันการทำงานซ้ำ
      firstMessageSentRef.current = true;
      sentFirstMessageRef.current = firstMessage; // เก็บ firstMessage ที่ถูกส่งไปแล้ว
      
      // Clear state/query เพื่อป้องกันการส่งซ้ำ (รวมกรณีมาจาก ?firstMessage=...)
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      
      // ส่งข้อความแรกและ bot response (streaming + optimistic UI)
      const sendFirstMessage = async () => {
        const id = chatId != null ? String(chatId).trim() : '';
        if (!id || id === 'undefined' || id === 'null') {
          console.error('Invalid chat ID');
          return;
        }
        
        if (selectedBot && selectedBot.enabled === false) {
          showToast('Bot นี้ถูก inactive แล้ว กรุณาไปเปิด Bot เป็น active ในหน้า Bots ก่อนส่งข้อความ', 'warning');
          return;
        }
        
        const tempUserId = `temp-user-${Date.now()}`;
        const tempBotId = `temp-bot-${Date.now()}`;
        setMessages(prev => [...prev,
          { id: tempUserId, text: firstMessage, sender: 'user', timestamp: new Date() },
          { id: tempBotId, text: '', sender: 'bot', timestamp: new Date() },
        ]);
        setShowScrollDown(false);
        requestAnimationFrame(() => scrollToBottom('smooth'));
        setIsTyping(true);
        streamTextRef.current = '';
        streamBotIdRef.current = tempBotId;
        const controller = new AbortController();
        streamAbortControllerRef.current = controller;
        try {
          await chatMessageAPI.createBotResponseStream(chatId, firstMessage, {
            mode: answerMode,
            signal: controller.signal,
            privateMode: privateModeRef.current,
            onChunk: (content) => appendStreamChunk(content),
            onDone: (data) => {
              flushStreamText();
              const id = streamBotIdRef.current;
              if (id) {
                const finalText = (data?.reply ?? streamTextRef.current ?? '').trim() || streamTextRef.current || '';
                setMessages(prev => prev.map(m => {
                  if (m.id !== id) return m;
                  return {
                    ...m,
                    text: finalText || m.text,
                    references: data?.references ?? m.references,
                    groundingChunks: Array.isArray(data?.groundingChunks) ? data.groundingChunks : m.groundingChunks,
                  };
                }));
              }
              streamBotIdRef.current = null;
              streamAbortControllerRef.current = null;
              loadMessages();
            },
          });
        } catch (botError) {
          if (isAbortError(botError)) {
            streamAbortControllerRef.current = null;
            streamBotIdRef.current = null;
            return;
          }
          if (isConversationNotFoundError(botError) && !missingConversationHandledRef.current) {
            missingConversationHandledRef.current = true;
            setErrorMessage('แชทนี้ไม่พบในระบบแล้ว ระบบจะพากลับหน้าแรก');
            setTimeout(() => navigate('/homepage'), 1200);
            return;
          }
          setMessages(prev => prev.filter(m => m.id !== tempBotId));
          try {
            await chatMessageAPI.createBotResponse(chatId, firstMessage, null, {
              privateMode: privateModeRef.current,
            });
            await loadMessages();
          } catch (fallbackErr) {
            if (isConversationNotFoundError(fallbackErr) && !missingConversationHandledRef.current) {
              missingConversationHandledRef.current = true;
              setErrorMessage('แชทนี้ไม่พบในระบบแล้ว ระบบจะพากลับหน้าแรก');
              setTimeout(() => navigate('/homepage'), 1200);
              return;
            }
            const safeErr = getErrorMessage(fallbackErr);
            setErrorMessage(safeErr);
            setMessages(prev => [
              ...prev,
              {
                id: `temp-bot-error-${Date.now()}`,
                text: `ขออภัย ระบบประมวลผลไม่สำเร็จ (${safeErr})`,
                sender: 'bot',
                timestamp: new Date(),
              },
            ]);
            const timeoutId = setTimeout(() => setErrorMessage(null), 5000);
            timeoutRefs.current['botError'] = timeoutId;
          }
        } finally {
          streamAbortControllerRef.current = null;
          setIsTyping(false);
        }
      };
      
      sendFirstMessage();
    } else {
      // ถ้าไม่มี firstMessage ให้โหลด messages จาก API
      loadMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, hasInitialized]);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // ตรวจว่าผู้ใช้อยู่ใกล้ก้นแชทหรือไม่ เพื่อโชว์ปุ่ม "เลื่อนลงล่างสุด"
  const isNearBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return undefined;
    const onScroll = () => setShowScrollDown(!isNearBottom());
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [isNearBottom]);

  // Auto-scroll to bottom when messages change — เฉพาะตอนผู้ใช้อยู่ใกล้ก้นแชท
  useEffect(() => {
    if (isNearBottom()) {
      messagesEndRef.current?.scrollIntoView({ behavior: isTyping ? 'auto' : 'smooth' });
    } else {
      setShowScrollDown(true);
    }
  }, [messages, isTyping, isNearBottom]);

  // สถานะรอคำตอบแบบไล่ขั้น (ให้ผู้ใช้รู้ว่าระบบกำลังทำงาน ไม่ได้ค้าง)
  useEffect(() => {
    if (!isTyping) {
      setTypingStage(0);
      return undefined;
    }
    setTypingStage(0);
    const timers = [
      setTimeout(() => setTypingStage(1), 2500),
      setTimeout(() => setTypingStage(2), 7000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isTyping]);

  // Format timestamp (สำหรับแสดงใน timestamp badge)
  const formatTime = (date) => {
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

  // Format timestamp แบบละเอียด (สำหรับแสดงใน tooltip)
  const formatDetailedTime = (date) => {
    return date.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  /** ตรวจว่าเป็นคำสั่งแก้คำผิด: "X เปลี่ยนเป็น Y", "X เปลี่ยน Y", "ช่วยเปลี่ยน X เป็น Y" */
  const tryApplyReplaceCommand = (text) => {
    let from, to;
    const m1 = text.match(/^(.+?)\s*เปลี่ยน\s*เป็น\s*(.+)$/);
    if (m1) {
      from = m1[1].trim();
      to = m1[2].trim();
    } else {
      const m2 = text.match(/^(?:ช่วย)?\s*เปลี่ยน\s+(.+?)\s+เป็น\s+(.+)$/);
      if (m2) {
        from = m2[1].trim();
        to = m2[2].trim();
      } else {
        const m3 = text.match(/^(.+?)\s+เปลี่ยน\s+(?!เป็น)(.+)$/);
        if (!m3) return null;
        from = m3[1].trim();
        to = m3[2].trim();
      }
    }
    if (!from || !to) return null;
    return { from, to };
  };

  /** ตรวจจับคำสั่งรูปแบบคำตอบจากข้อความผู้ใช้ (สั้น/สรุป/ยาว/ปกติ) พร้อมคำพ้องความหมาย */
  const buildStyledPrompt = (rawText) => {
    const original = String(rawText || '').trim();
    if (!original) return { outboundText: original, style: null };

    const normalized = original.toLowerCase();
    const hasAny = (patterns) => patterns.some((re) => re.test(normalized));

    // จับสไตล์จากคำที่พิมพ์ โดยรองรับทั้งไทยและอังกฤษ
    let style = null;
    if (
      hasAny([
        /ตอบ\s*แบบ\s*ปกติ/,
        /แบบ\s*ปกติ/,
        /โหมด\s*ปกติ/,
        /normal/,
        /default/,
        /ธรรมดา/,
      ])
    ) {
      style = 'normal';
    } else if (
      hasAny([
        /ตอบ\s*แบบ\s*สรุป/,
        /แบบ\s*สรุป/,
        /สรุป\s*ให้/,
        /สรุป\s*ใจความ/,
        /summary/,
        /bullet/,
      ])
    ) {
      style = 'summary';
    } else if (
      hasAny([
        /ตอบ\s*แบบ\s*สั้น/,
        /แบบ\s*สั้น/,
        /สั้น\s*กระชับ/,
        /ตอบ\s*ย่อ/,
        /short/,
        /brief/,
        /concise/,
      ])
    ) {
      style = 'short';
    } else if (
      hasAny([
        /ตอบ\s*แบบ\s*ยาว/,
        /แบบ\s*ยาว/,
        /ตอบ\s*ละเอียด/,
        /อธิบาย\s*ละเอียด/,
        /long/,
        /detailed?/,
        /เชิงลึก/,
      ])
    ) {
      style = 'long';
    }

    if (!style || style === 'normal') {
      return { outboundText: original, style: style || null };
    }

    // ลบคำสั่งสไตล์ออกจากต้น/ท้ายข้อความ เพื่อให้คำถามสะอาดขึ้น
    const leadingDirective =
      /^\s*(?:ช่วย|ขอ)?\s*(?:ตอบ|สรุป|เขียน|อธิบาย)?\s*(?:ให้)?\s*(?:แบบ)?\s*(?:สั้น|สรุป|ยาว|ปกติ|normal|default|short|brief|summary|long|detailed?)\s*[:：-]?\s*/i;
    const trailingDirective =
      /\s*(?:ช่วย|ขอ)?\s*(?:ตอบ|สรุป|เขียน|อธิบาย)?\s*(?:ให้)?\s*(?:แบบ)?\s*(?:สั้น|สรุป|ยาว|ปกติ|normal|default|short|brief|summary|long|detailed?)\s*$/i;
    const cleaned = original.replace(leadingDirective, '').replace(trailingDirective, '').trim();
    const coreQuestion = cleaned || original;

    const styleInstructionMap = {
      short: 'ตอบให้สั้น กระชับ ชัดเจน ภายใน 1-3 ประโยค และเน้นเฉพาะประเด็นสำคัญ',
      summary: 'สรุปคำตอบเป็นหัวข้อสั้นๆ ที่อ่านง่าย 3-5 ข้อ โดยเน้นใจความหลัก',
      long: 'ตอบแบบละเอียดเป็นลำดับ มีบริบท เหตุผล และข้อควรระวังที่เกี่ยวข้อง',
    };

    const outboundText = `[กำหนดรูปแบบคำตอบ]\n${styleInstructionMap[style]}\n\n[คำถามผู้ใช้]\n${coreQuestion}`;
    return { outboundText, style };
  };

  const handleStopStreaming = () => {
    if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
      streamAbortControllerRef.current = null;
    }
    setIsTyping(false);
    setSuccessMessage('หยุดการตอบแล้ว');
    setTimeout(() => setSuccessMessage(null), 1800);
  };

  const handleDeletePrivateInstruction = async () => {
    try {
      await privateContextAPI.save({ instructions: '', enabled: true });
      await refreshPrivateMemory();
      setSuccessMessage('ลบคำสั่ง AI แล้ว');
      setTimeout(() => setSuccessMessage(null), 1800);
    } catch (err) {
      setErrorMessage(getErrorMessage(err) || 'ลบคำสั่ง AI ไม่สำเร็จ');
      setTimeout(() => setErrorMessage(null), 2500);
    }
  };

  const handleDeleteRememberItem = async (index) => {
    try {
      const nextItems = privateRememberItems.filter((_, i) => i !== index);
      await privateContextAPI.save({ content: nextItems.join('\n'), enabled: true });
      await refreshPrivateMemory();
      setSuccessMessage('ลบข้อมูลหน่วยความจำแล้ว');
      setTimeout(() => setSuccessMessage(null), 1800);
    } catch (err) {
      setErrorMessage(getErrorMessage(err) || 'ลบข้อมูลไม่สำเร็จ');
      setTimeout(() => setErrorMessage(null), 2500);
    }
  };

  const handleSendMessage = async (e, overrideMessage = null) => {
    e.preventDefault();
    const shouldClearComposer = overrideMessage == null;
    const messageText = (overrideMessage != null && String(overrideMessage).trim() !== '')
      ? String(overrideMessage).trim()
      : chatInput.trim();
    const commandPrefix = composerPrivateCommand === 'remember'
      ? '/จำ'
      : composerPrivateCommand === 'instruction'
        ? '/สั่ง'
        : '';
    const finalText = (commandPrefix ? `${commandPrefix} ${messageText}` : messageText);

    if (!finalText.trim()) return;
    if (isTyping) return;
    const { outboundText } = buildStyledPrompt(finalText);
    const shouldRestoreInputOnError = overrideMessage == null;
    const restoreInputOnError = () => {
      if (!shouldRestoreInputOnError) return;
      setChatInput(messageText);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    };
    
    // Clear previous timeout if exists
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    
    const id = chatId != null ? String(chatId).trim() : '';
    if (!id || id === 'undefined' || id === 'null') {
      setErrorMessage('ไม่พบห้องแชท — กรุณาเริ่มแชทใหม่จากหน้าแรก');
      return;
    }
    if (shouldClearComposer) {
      setChatInput('');
      setComposerPrivateCommand(null);

      // Reset textarea height after we've confirmed message can be sent
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
    const draftKey = getDraftKey(id);

    // คำสั่งลัดโหมดส่วนตัว: /จำ ... หรือ /สั่ง ...
    const privateCmd = parsePrivateCommand(finalText);
    if (privateCmd) {
      if (!privateMode) {
        setErrorMessage('คำสั่ง /จำ และ /สั่ง ใช้ได้เฉพาะในโหมดส่วนตัว');
        const t = setTimeout(() => setErrorMessage(null), 3500);
        timeoutRefs.current.privateCmdMode = t;
        restoreInputOnError();
        return;
      }
      if (!privateCmd.payload) {
        setErrorMessage(privateCmd.kind === 'remember'
          ? 'รูปแบบที่ถูกต้อง: /จำ <ข้อมูลที่ต้องการให้ AI จำ>'
          : 'รูปแบบที่ถูกต้อง: /สั่ง <คำสั่งการตอบของ AI>');
        const t = setTimeout(() => setErrorMessage(null), 3500);
        timeoutRefs.current.privateCmdEmpty = t;
        restoreInputOnError();
        return;
      }
      const userTempId = `temp-user-${Date.now()}`;
      const botTempId = `temp-bot-cmd-${Date.now()}`;
      setMessages(prev => [
        ...prev,
        { id: userTempId, text: finalText, sender: 'user', timestamp: new Date() },
        {
          id: botTempId,
          text: privateCmd.kind === 'remember'
            ? 'บันทึกข้อมูลส่วนตัวแล้ว ใช้ต่อในแชทใหม่ได้ทันที'
            : 'บันทึกคำสั่ง AI แล้ว ระบบจะใช้รูปแบบนี้ในการตอบถัดไป',
          sender: 'bot',
          timestamp: new Date(),
        },
      ]);
      try {
        const current = await privateContextAPI.get();
        const maxChars = Number.isFinite(current?.maxChars) ? Number(current.maxChars) : 12000;
        const maxInstructionsChars = Number.isFinite(current?.maxInstructionsChars) ? Number(current.maxInstructionsChars) : 2000;
        // ใส่ข้อมูลใหม่ไว้ก่อนข้อมูลเก่า เพื่อให้ข้อมูลล่าสุดมีน้ำหนักมากกว่า
        const nextContent = privateCmd.kind === 'remember'
          ? [privateCmd.payload, String(current?.content || '').trim()].filter(Boolean).join('\n')
          : String(current?.content || '');
        const nextInstructions = privateCmd.kind === 'instruction'
          ? privateCmd.payload
          : String(current?.instructions || '');
        await privateContextAPI.save({
          content: nextContent.slice(0, maxChars),
          instructions: nextInstructions.slice(0, maxInstructionsChars),
          enabled: true,
        });
        await refreshPrivateMemory();
        setSuccessMessage(privateCmd.kind === 'remember' ? 'จำข้อมูลให้แล้ว' : 'ตั้งค่าคำสั่ง AI แล้ว');
        setTimeout(() => setSuccessMessage(null), 2200);
      } catch (err) {
        setMessages(prev => prev.filter(m => m.id !== botTempId));
        setErrorMessage(getErrorMessage(err) || 'บันทึกคำสั่งส่วนตัวไม่สำเร็จ');
        const t = setTimeout(() => setErrorMessage(null), 4000);
        timeoutRefs.current.privateCmdSave = t;
        restoreInputOnError();
      }
      return;
    }

    // คำสั่ง "X เปลี่ยนเป็น Y" / "ช่วยเปลี่ยน X เป็น Y" — แก้ข้อความบอทล่าสุด
    const replaceCmd = tryApplyReplaceCommand(finalText);
    if (replaceCmd) {
      const botMessages = messages.filter((m) => m.sender === 'bot');
      const lastBot = botMessages[botMessages.length - 1];
      const userMsgForReplace = { id: `temp-user-${Date.now()}`, text: finalText, sender: 'user', timestamp: new Date() };

      if (lastBot && replaceCmd.from) {
        const newText = lastBot.text.split(replaceCmd.from).join(replaceCmd.to);
        const isTempBot = String(lastBot.id).startsWith('temp-');
        const userMsgForReplaceWithText = { ...userMsgForReplace, text: finalText };
        setMessages(prev => {
          const updated = prev.map(m => (m.id === lastBot.id ? { ...m, text: newText } : m));
          updated.push(userMsgForReplaceWithText);
          return updated;
        });
        if (editingMessageId === lastBot.id) setEditingMessageId(null);

        if (!isTempBot) {
          try {
            const res = await chatMessageAPI.updateMessage(chatId, lastBot.id, newText, { from: replaceCmd.from, to: replaceCmd.to });
            setErrorMessage(null);
            const applied = res?.appliedToKnowledge ?? 0;
            const botAck = applied > 0
              ? `รับทราบครับ เราได้ทำการอัปเดตในฐานข้อมูลให้แล้ว (อัปเดตฐานความรู้ ${applied} ชิ้น) ถ้าถามอีกรอบจะได้คำตอบที่แก้แล้ว`
              : `รับทราบครับ เราได้ทำการอัปเดตในฐานข้อมูลให้แล้ว (แก้ข้อความในแชทแล้ว)`;
            setMessages(prev => [...prev, { id: `temp-ack-${Date.now()}`, text: botAck, sender: 'bot', timestamp: new Date() }]);
            setSuccessMessage(applied > 0 ? 'แก้ไขและอัปเดตฐานความรู้แล้ว' : 'แก้ไขและอัปเดตแชทแล้ว');
            setTimeout(() => setSuccessMessage(null), 3000);
          } catch (err) {
            setErrorMessage(getErrorMessage(err));
          }
        } else {
          const botAck = 'รับทราบครับ เราได้แก้ข้อความแล้ว (จะบันทึกลงฐานข้อมูลเมื่อโหลดจากเซิร์ฟเวอร์)';
          setMessages(prev => [...prev, { id: `temp-ack-${Date.now()}`, text: botAck, sender: 'bot', timestamp: new Date() }]);
          setSuccessMessage('แก้ไขแล้ว (จะบันทึกเมื่อโหลดข้อความจากเซิร์ฟเวอร์)');
          setTimeout(() => setSuccessMessage(null), 3000);
        }
        return;
      }

      setMessages(prev => [...prev, { ...userMsgForReplace, text: finalText }]);
      setErrorMessage('ไม่พบข้อความบอทล่าสุดที่จะแก้ — ให้บอทตอบก่อน แล้วค่อยใช้คำสั่ง  X เปลี่ยนเป็น Y');
      restoreInputOnError();
      const t = setTimeout(() => setErrorMessage(null), 5000);
      timeoutRefs.current['replaceError'] = t;
      return;
    }

    // Optimistic UI: แสดงคำถามผู้ใช้ทันที (ก่อนรอคำตอบ)
    const tempUserId = `temp-user-${Date.now()}`;
    const tempBotId = `temp-bot-${Date.now()}`;
    const userMsg = {
      id: tempUserId,
      text: finalText,
      sender: 'user',
      timestamp: new Date(),
    };
    const botMsgPlaceholder = {
      id: tempBotId,
      text: '',
      sender: 'bot',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg, botMsgPlaceholder]);
    setShowScrollDown(false);
    requestAnimationFrame(() => scrollToBottom('smooth'));
    setIsTyping(true);
    streamTextRef.current = '';
    streamBotIdRef.current = tempBotId;
    const controller = new AbortController();
    streamAbortControllerRef.current = controller;

    try {
      await chatMessageAPI.createBotResponseStream(chatId, outboundText, {
        mode: answerMode,
        signal: controller.signal,
        privateMode: privateModeRef.current,
        onChunk: (content) => appendStreamChunk(content),
        onDone: (data) => {
          flushStreamText();
          const id = streamBotIdRef.current;
          if (id) {
            const finalText = (data?.reply ?? streamTextRef.current ?? '').trim() || streamTextRef.current || '';
            setMessages(prev => prev.map(m => {
              if (m.id !== id) return m;
              return {
                ...m,
                text: finalText || m.text,
                references: data?.references ?? m.references,
                groundingChunks: Array.isArray(data?.groundingChunks) ? data.groundingChunks : m.groundingChunks,
              };
            }));
          }
          streamBotIdRef.current = null;
          streamAbortControllerRef.current = null;
          if (draftKey && shouldClearComposer) {
            try {
              localStorage.removeItem(draftKey);
            } catch {
              // ignore storage errors
            }
          }
          loadMessages();
        },
      });
    } catch (botError) {
      if (isAbortError(botError)) {
        restoreInputOnError();
        streamAbortControllerRef.current = null;
        streamBotIdRef.current = null;
        return;
      }
      if (isConversationNotFoundError(botError) && !missingConversationHandledRef.current) {
        missingConversationHandledRef.current = true;
        setErrorMessage('แชทนี้ไม่พบในระบบแล้ว ระบบจะพากลับหน้าแรก');
        setTimeout(() => navigate('/homepage'), 1200);
        return;
      }
      // Fallback: ถ้า streaming ไม่รองรับ ให้ใช้แบบธรรมดา
      setMessages(prev => prev.filter(m => m.id !== tempBotId));
      try {
        await chatMessageAPI.createBotResponse(chatId, outboundText, null, {
          privateMode: privateModeRef.current,
        });
        if (draftKey && shouldClearComposer) {
          try {
            localStorage.removeItem(draftKey);
          } catch {
            // ignore storage errors
          }
        }
        await loadMessages();
      } catch (fallbackErr) {
        if (isConversationNotFoundError(fallbackErr) && !missingConversationHandledRef.current) {
          missingConversationHandledRef.current = true;
          setErrorMessage('แชทนี้ไม่พบในระบบแล้ว ระบบจะพากลับหน้าแรก');
          setTimeout(() => navigate('/homepage'), 1200);
          return;
        }
        const safeErr = getErrorMessage(fallbackErr);
        restoreInputOnError();
        setErrorMessage(safeErr);
        setMessages(prev => [
          ...prev,
          {
            id: `temp-bot-error-${Date.now()}`,
            text: `ขออภัย ระบบประมวลผลไม่สำเร็จ (${safeErr})`,
            sender: 'bot',
            timestamp: new Date(),
          },
        ]);
        const timeoutId = setTimeout(() => setErrorMessage(null), 5000);
        timeoutRefs.current['botError'] = timeoutId;
      }
    } finally {
      streamAbortControllerRef.current = null;
      setIsTyping(false);
    }
  };

  // Cleanup timeout เมื่อ component unmount หรือ chatId เปลี่ยน
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (streamFlushTimerRef.current) {
        cancelAnimationFrame(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
      }
      if (streamAbortControllerRef.current) {
        streamAbortControllerRef.current.abort();
        streamAbortControllerRef.current = null;
      }
      // Cleanup all timeouts
      Object.values(timeoutRefs.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
      timeoutRefs.current = {};
    };
  }, [chatId]);

  useEffect(() => {
    const syncSelectionState = () => {
      try {
        const selection = window.getSelection?.();
        const hasRange = Boolean(selection && !selection.isCollapsed && String(selection.toString() || '').trim().length > 0);
        setIsSelectingText(hasRange);
      } catch {
        setIsSelectingText(false);
      }
    };

    window.addEventListener('selectionchange', syncSelectionState);
    window.addEventListener('mouseup', syncSelectionState);
    window.addEventListener('keyup', syncSelectionState);
    return () => {
      window.removeEventListener('selectionchange', syncSelectionState);
      window.removeEventListener('mouseup', syncSelectionState);
      window.removeEventListener('keyup', syncSelectionState);
    };
  }, []);

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const nextHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = `${nextHeight}px`;
      // เมื่อเต็ม max-height ให้เลื่อนในช่องพิมพ์ได้ด้วยเมาส์/ทัชแพด
      textareaRef.current.style.overflowY = textareaRef.current.scrollHeight > 200 ? 'auto' : 'hidden';
    }
  };

  /** แก้ตาราง Markdown ที่มี | อยู่ในเนื้อหาเซลล์ (ทำให้คอลัมน์แตก) — รวมส่วนที่เกินกลับเป็นเซลล์กลาง คั่นด้วยขึ้นบรรทัดใหม่ */
  const normalizeMarkdownTable = (text) => {
    const lines = String(text).split(/\r?\n/);
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!/^\s*\|.+\|\s*$/.test(line)) {
        out.push(line);
        i++;
        continue;
      }
      const headerLine = line;
      const headerParts = headerLine.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
      const numCols = headerParts.length;
      if (numCols < 2) {
        out.push(line);
        i++;
        continue;
      }
      out.push(headerLine);
      i++;
      if (i < lines.length && /^\s*\|[\s\-:]+\|\s*$/.test(lines[i])) {
        out.push(lines[i]);
        i++;
      } else if (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        // มีแถวข้อมูลตามมาแต่ AI ลืมใส่บรรทัดคั่นหัวตาราง (|---|---|)
        // → เติมให้เอง เพื่อให้เรนเดอร์เป็นตารางจริง ไม่ใช่ markdown ดิบ
        out.push(`|${' --- |'.repeat(numCols)}`);
      }
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        const row = lines[i];
        const parts = row.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
        if (parts.length <= numCols) {
          out.push(row);
        } else {
          const first = parts[0] ?? '';
          const last = parts[parts.length - 1] ?? '';
          const middle = parts.slice(1, parts.length - 1).join('<br>');
          const fixedRow = `| ${first} | ${middle} | ${last} |`;
          out.push(fixedRow);
        }
        i++;
      }
    }
    return out.join('\n');
  };

  /** หาส่วนที่เปลี่ยนระหว่างข้อความเก่าและใหม่ (prefix/suffix ร่วม แล้วคืน from/to ของส่วนกลาง) */
  const getCorrectionFromDiff = (oldText, newText) => {
    if (!oldText || oldText === newText) return null;
    let i = 0;
    while (i < oldText.length && i < newText.length && oldText[i] === newText[i]) i++;
    let j = 0;
    while (j < oldText.length - i && j < newText.length - i && oldText[oldText.length - 1 - j] === newText[newText.length - 1 - j]) j++;
    const from = oldText.slice(i, oldText.length - j);
    const to = newText.slice(i, newText.length - j);
    if (!from.trim()) return null;
    return { from, to };
  };

  // แก้ไขข้อความบอท — บันทึกลง DB และส่ง correction ให้อัปเดตฐานความรู้
  const handleStartEdit = (message) => {
    setEditingMessageId(message.id);
    setEditingText(message.text || '');
    setEditingOriginalText(message.text || '');
  };
  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
    setEditingOriginalText('');
  };
  const handleSaveEdit = async () => {
    const id = chatId != null ? String(chatId).trim() : '';
    if (!id || !editingMessageId || editingText.trim() === '') return;
    const newContent = editingText.trim();
    const correction = getCorrectionFromDiff(editingOriginalText || '', newContent);
    try {
      const res = await chatMessageAPI.updateMessage(id, editingMessageId, newContent, correction || undefined);
      setMessages(prev => prev.map(m => (m.id === editingMessageId ? { ...m, text: newContent } : m)));
      const applied = res?.appliedToKnowledge ?? 0;
      if (applied > 0) {
        const botAck = `รับทราบครับ เราได้ทำการอัปเดตในฐานข้อมูลให้แล้ว (อัปเดตฐานความรู้ ${applied} ชิ้น)`;
        setMessages(prev => [...prev, { id: `temp-ack-${Date.now()}`, text: botAck, sender: 'bot', timestamp: new Date() }]);
      }
      setEditingMessageId(null);
      setEditingText('');
      setEditingOriginalText('');
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    }
  };

  // แก้ไขข้อความที่ผู้ใช้ส่งไปแล้ว → เข้าสู่โหมดแก้ (แสดงกล่องพิมพ์แทนฟองข้อความ)
  const handleStartUserEdit = (message) => {
    if (isTyping) return;
    setEditingUserMsgId(message.id);
    setEditingUserText(message.text || '');
  };
  const handleCancelUserEdit = () => {
    setEditingUserMsgId(null);
    setEditingUserText('');
  };
  // บันทึกการแก้ → ส่งคำถามที่แก้ไปใหม่ (เหมือนถามใหม่ด้วยข้อความที่แก้แล้ว)
  const handleResendEditedUserMessage = () => {
    const text = (editingUserText || '').trim();
    if (!text || isTyping) return;
    setEditingUserMsgId(null);
    setEditingUserText('');
    handleSendMessage({ preventDefault: () => {} }, text);
  };

  // กดโหวตคำตอบ 👍/👎 — กดซ้ำที่ปุ่มเดิม = ยกเลิก พร้อมแจ้งเตือนมุมบนขวา
  const handleFeedback = async (message, ratingWanted) => {
    const current = feedbackByMessageId[message.id] ?? message.feedback ?? null;
    const next = current === ratingWanted ? 'none' : ratingWanted;
    const prevValue = feedbackByMessageId[message.id];
    setFeedbackByMessageId(prev => ({ ...prev, [message.id]: next }));
    try {
      await chatMessageAPI.submitFeedback(message.id, next);
      if (next === 'up') {
        showToast('ขอบคุณสำหรับความคิดเห็นของคุณ', 'success');
      } else if (next === 'down') {
        showToast('ขอบคุณสำหรับความคิดเห็นของคุณ เราจะนำไปปรับปรุงให้ดีขึ้น', 'success');
      } else {
        showToast('ยกเลิกความคิดเห็นแล้ว', 'info');
      }
    } catch (err) {
      setFeedbackByMessageId(prev => ({ ...prev, [message.id]: prevValue }));
    }
  };

  // ฟังก์ชันสำหรับคัดลอกข้อความ
  const handleCopyMessage = async (messageText, messageId) => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopiedMessageId(messageId);
      // Reset copied state after 2 seconds
      const timeoutId = setTimeout(() => {
        setCopiedMessageId(null);
      }, 2000);
      timeoutRefs.current[`copy-${messageId}`] = timeoutId;
    } catch (error) {
      console.error('Failed to copy message:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = messageText;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopiedMessageId(messageId);
        const timeoutId = setTimeout(() => {
          setCopiedMessageId(null);
        }, 2000);
        timeoutRefs.current[`copy-fallback-${messageId}`] = timeoutId;
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textArea);
    }
  };

  const getPreviousUserQuestion = (botMessageIndex) => {
    let fallbackQuestion = '';
    for (let i = botMessageIndex - 1; i >= 0; i -= 1) {
      const candidate = messages[i];
      if (candidate?.sender === 'user' && String(candidate?.text || '').trim()) {
        const text = String(candidate.text).trim();
        if (!fallbackQuestion) fallbackQuestion = text;
        // ข้ามข้อความ template ที่ระบบสร้างจากปุ่ม follow-up
        // เพื่อให้ "คำถามเดิม" คือคำถามหลักจริงของผู้ใช้
        if (isGeneratedFollowUpPrompt(text)) continue;
        return text;
      }
    }
    return fallbackQuestion;
  };

  const openSourceReference = (message, ref) => {
    if (!ENABLE_SOURCE_REFERENCES) return;
    if (!message || !ref?.docId) return;
    if (String(ref.docId) === '__private__') {
      setSourceModalData({
        docId: '__private__',
        displayName: ref.displayName || 'เนื้อหาส่วนตัวของคุณ',
        positions: [],
        chunks: [],
        isPrivate: true,
      });
      setIsSourceModalOpen(true);
      return;
    }
    const relatedChunks = parseStoredJsonArray(message.groundingChunks)
      .filter((chunk) => {
        const docId = chunk?.retrievedContext?.docId ?? chunk?.payload?.docId;
        return String(docId) === String(ref.docId);
      })
      // เรียงตามความเกี่ยวข้อง (score) มาก→น้อย เพื่อโชว์เฉพาะช่วงที่ใช้ตอบจริง
      .sort((a, b) => (Number(b?.score) || 0) - (Number(a?.score) || 0))
      .map((chunk, index) => {
        const pos = extractReferencePosition(chunk);
        return {
          id: `${ref.docId}-${index}`,
          lineHint: pos.lineHint || (pos.chunkIndex !== null ? `ช่วงที่ ${pos.chunkIndex + 1}` : ''),
          label: pos.label || '-',
          page: pos.page ?? null,
          quote: pos.quote || '',
          text: String(chunk?.retrievedContext?.text ?? chunk?.payload?.text ?? '').trim(),
        };
      })
      // เก็บเฉพาะช่วงที่มีเนื้อหาจริง (ตัดช่วงที่เป็นข้อมูลช่วยค้นหาล้วน) — โชว์ครบเท่าที่ดึงมา ตัวกรอง helper คุมความรกแล้ว
      .filter((item) => item.text && stripAiHelperSections(item.text))
      .slice(0, 12);
    setSourceModalData({
      docId: ref.docId,
      displayName: ref.displayName || 'เอกสาร',
      positions: (Array.isArray(ref.positions) ? [...ref.positions] : [])
        .sort((a, b) => (Number(b?.score) || 0) - (Number(a?.score) || 0))
        .slice(0, 12),
      chunks: relatedChunks,
    });
    setIsSourceModalOpen(true);
  };

  const getSuggestedFollowUps = (botText, userQuestion = '') => {
    const text = String(botText || '').trim();
    const question = String(userQuestion || '').trim();
    if (!text) return ['อธิบายเพิ่มเติม', 'ขออ้างอิงที่มา'];

    if (/^ผู้อนุมัติ\s*:/i.test(text) || /ผู้อนุมัติ|อำนาจอนุมัติ|ใครอนุมัติ/.test(question)) {
      return ['ดูรายละเอียดเพิ่มเติม', 'ขออ้างอิงข้อที่เกี่ยวข้อง'];
    }
    if (/ยังไม่พบข้อมูลที่ตรง|ไม่พบข้อมูลที่ชัดเจน|ข้อมูลไม่เพียงพอ/.test(text)) {
      return ['มีเอกสารอะไรบ้าง', 'ลองระบุชื่อข้อ/หัวข้อที่ต้องการ'];
    }
    if ((text.match(/\n/g) || []).length >= 3 || /^(?:\s*[-*•]|\s*\d+[.)])/.test(text)) {
      return ['สรุปเฉพาะประเด็นสำคัญ', 'ยกตัวอย่างให้เข้าใจง่าย'];
    }
    return ['อธิบายเพิ่มเติม', 'ขออ้างอิงที่มา'];
  };

  const buildFollowUpPrompt = (label, botText, userQuestion = '') => {
    const q = String(userQuestion || '').trim();
    const forQ = q ? ` (คำถามเดิม: ${q})` : '';
    // ทุกคำสั่งขึ้นต้นด้วย "จากคำตอบก่อนหน้า" เพื่อให้ backend ตรวจเป็น follow-up แล้วดึงประวัติ
    // (รวมคำตอบบอทก่อนหน้า) มาให้ AI ยึด → คำตอบต่อเนื่องกับด้านบน ไม่หลุดประเด็น
    if (label === 'อธิบายเพิ่มเติม') {
      return `จากคำตอบก่อนหน้า ช่วยอธิบายเพิ่มเติมให้เข้าใจง่ายขึ้น โดยยึดเนื้อหาคำตอบเดิมเป็นหลัก ห้ามเปลี่ยนประเด็นหรือสลับไปเรื่องอื่น${forQ}`;
    }
    if (label === 'ดูรายละเอียดเพิ่มเติม') {
      return `จากคำตอบก่อนหน้า ช่วยลงรายละเอียดเพิ่มเติมแบบเป็นข้อ โดยยึดเนื้อหาคำตอบเดิมเป็นหลัก ห้ามเปลี่ยนประเด็น${forQ}`;
    }
    if (label === 'สรุปเฉพาะประเด็นสำคัญ') {
      return `จากคำตอบก่อนหน้า ช่วยสรุปเฉพาะประเด็นสำคัญให้สั้นกระชับ โดยสรุปจากเนื้อหาคำตอบเดิมเท่านั้น ห้ามเพิ่มข้อมูลใหม่${forQ}`;
    }
    if (label === 'ยกตัวอย่างให้เข้าใจง่าย') {
      return `จากคำตอบก่อนหน้า ช่วยยกตัวอย่างประกอบให้เข้าใจง่ายขึ้น โดยอิงเนื้อหาคำตอบเดิมเป็นหลัก ไม่ออกนอกประเด็น${forQ}`;
    }
    if (label === 'ขออ้างอิงที่มา') {
      return `จากคำตอบก่อนหน้า ช่วยระบุแหล่งที่มาจากเอกสารที่ใช้ตอบให้ชัดเจน${forQ}`;
    }
    if (label === 'ขออ้างอิงข้อที่เกี่ยวข้อง') {
      return `จากคำตอบก่อนหน้า ช่วยระบุข้ออ้างอิง/แหล่งข้อมูลที่เกี่ยวข้องให้ชัดเจน${forQ}`;
    }
    return label;
  };

  const handleSuggestedFollowUpClick = (label, message, messageIndex) => {
    if (!label || isTyping || (selectedBot && selectedBot.enabled === false)) return;
    if (label === 'ขออ้างอิงข้อที่เกี่ยวข้อง' || label === 'ขออ้างอิงที่มา') {
      if (Array.isArray(message?.references) && message.references.length > 0) {
        openSourceReference(message, message.references[0]);
        return;
      }
      // ถ้ายังไม่มี references ใน message นี้ ให้ fallback เป็นคำถาม follow-up เพื่อให้ backend ดึงแหล่งที่มาเพิ่ม
    }
    const previousQuestion = getPreviousUserQuestion(messageIndex);
    const prompt = buildFollowUpPrompt(label, message?.text || '', previousQuestion);
    handleSendMessage({ preventDefault: () => {} }, prompt);
  };

  const tokenUsageRatio =
    tokenQuota && !tokenQuota.unlimited
      ? Number(tokenQuota.usedTokens || 0) / Math.max(1, Number(tokenQuota.limitTokens || 0))
      : 0;
  const showTokenQuotaPill = Boolean(tokenQuota && !tokenQuota.unlimited && tokenUsageRatio >= 0.8);

  return (
    <div className='flex h-screen bg-[#f7f7f8] relative'>
      {/* Sidebar Component */}
      <Sidebar onCollapseChange={setIsSidebarCollapsed} privateWorkspace={privateMode} />

      {/* Main Content */}
      <main className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-16' : ''}`}>
        {/* Error Message Toast */}
        {errorMessage && (
          <div className='fixed top-4 right-4 z-50 animate-slide-in-right'>
            <div className='bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md'>
              <div className='flex-1'>
                <p className='text-sm font-medium'>{errorMessage}</p>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className='text-white hover:text-gray-200 transition-colors'
              >
                <HiX className='text-lg' />
              </button>
            </div>
          </div>
        )}
        {successMessage && (
          <div className='fixed top-4 right-4 z-50 animate-slide-in-right'>
            <div className='bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md'>
              <div className='flex-1'>
                <p className='text-sm font-medium'>{successMessage}</p>
              </div>
              <button
                onClick={() => setSuccessMessage(null)}
                className='text-white hover:text-gray-200 transition-colors'
              >
                <HiX className='text-lg' />
              </button>
            </div>
          </div>
        )}
        
        {/* Header - Minimalist like ChatGPT */}
        <div className='border-b border-gray-200 bg-white px-4 sm:px-6 py-3 flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <button
              onClick={() => navigate('/homepage')}
              className='text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg p-2 transition-all'
            >
              <HiArrowLeft className='text-xl' />
            </button>
            <div className='flex items-center gap-2'>
              <img src={bingsuLogo} alt="Enterprise AI Chatbot" className='w-7 h-7 rounded-full object-cover' />
              <h1 className='text-base font-medium text-gray-800'>{chatName}</h1>
            </div>
          </div>
          <div className='flex items-center gap-2'>
            {/* Token quota pill */}
            {showTokenQuotaPill ? (
              <div className="hidden sm:flex flex-col items-end mr-1">
                <div className="text-[11px] text-gray-500">
                  Token วันนี้
                </div>
                <div className="text-xs font-semibold text-gray-700">
                  {formatToken(tokenQuota.usedTokens)}
                  <span className="text-gray-500"> / {formatToken(tokenQuota.limitTokens)}</span>
                </div>
                <div className="w-40 h-1.5 bg-gray-200 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-yellow-400"
                    style={{
                      width: `${Math.min(100, Math.max(0, tokenUsageRatio * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

          {selectedBot ? (
            <div className='flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-700 min-w-0'>
              <span
                className='font-medium whitespace-nowrap'
                title={typeof selectedBot === 'object' ? selectedBot.name : String(selectedBot)}
              >
                {typeof selectedBot === 'object' ? selectedBot.name : String(selectedBot)}
              </span>
              <span className='text-xs text-gray-500 shrink-0'>(ไม่สามารถเปลี่ยนได้)</span>
            </div>
          ) : null}
          </div>
        </div>

        {/* Messages Area - Centered like ChatGPT/Gemini */}
        <div ref={messagesContainerRef} className='relative flex-1 overflow-y-auto bg-[#f7f7f8]'>
          <div className='max-w-3xl mx-auto px-4 sm:px-6 py-6'>
            {messages.length === 0 ? (
              // Empty state — ใช้ชื่อและคำอธิบายบอทที่ตั้งในฟอร์ม (สร้าง/แก้ไขบอท)
              <div className='flex flex-col items-center justify-center h-full min-h-[60vh]'>
                <div className='mb-6'>
                  <img src={bingsuLogo} alt="Enterprise AI Chatbot" className='w-20 h-20 rounded-full object-cover shadow-lg' />
                </div>
                <h2 className='text-2xl font-semibold text-gray-800 mb-2'>
                  Welcome to {selectedBot?.name || 'Enterprise AI Chatbot Chat'}
                </h2>
                <p className='text-gray-500 text-center mb-8 max-w-2xl'>
                  {selectedBot?.description && !isCorruptedText(selectedBot.description)
                    ? selectedBot.description
                    : OFFICIAL_BOT_DESCRIPTION}
                </p>
              </div>
            ) : (
              <div className='space-y-8'>
                {messages.map((message, index) => {
                  const showTimestamp = index === 0 || 
                    new Date(message.timestamp) - new Date(messages[index - 1].timestamp) > 300000;
                  
                  const isUser = message.sender === 'user';
                  
                  return (
                    <div key={message.id} className='group'>
                      {showTimestamp && (
                        <div className='flex justify-center my-4'>
                          <span className='text-xs text-gray-400 bg-white px-3 py-1.5 rounded-full shadow-sm'>
                            {formatTime(message.timestamp)}
                          </span>
                        </div>
                      )}
                      
                      <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                        {/* Avatar */}
                        <div className='flex-shrink-0 w-8 h-8 mt-1'>
                          {isUser ? (
                            <div className='w-8 h-8 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center shadow-sm'>
                              <HiOutlineUser className='text-white text-sm' />
                            </div>
                          ) : (
                            <div className='w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center shadow-sm'>
                              <HiChatBubbleLeftRight className='text-white text-sm' />
                            </div>
                          )}
                        </div>
                        
                        {/* Message Content — min-w-0 ให้ flex อนุญาตให้หดตาม max-w-[80%] ได้ */}
                        <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : 'flex justify-start'}`}>
                          <div className={`max-w-[80%] min-w-0 text-left relative group/message`}>
                            <div
                              className={`inline-block max-w-full px-4 py-2.5 rounded-2xl relative group/timestamp ${
                                isUser
                                  ? 'bg-gradient-to-r from-yellow-400 to-amber-400 text-gray-900 border border-amber-500/40 shadow-sm rounded-tr-md'
                                  : 'bg-white text-gray-900 border border-gray-200 shadow-sm rounded-tl-md'
                              } ${message.sender === 'bot' && isTyping && index === messages.length - 1 && !(streamTextRef.current || message.text) ? 'min-h-[52px] flex items-center' : ''}`}
                              style={{
                                maxWidth: '100%',
                                overflowWrap: 'anywhere',
                                wordBreak: 'normal',
                              }}
                              onMouseMove={(e) => {
                                // ปิด hover tracking สำหรับข้อความบอท เพื่อลด rerender ระหว่างลากเลือกข้อความ
                                if (message.sender === 'bot' || isSelectingText) return;
                                if (hoveredMessageId !== message.id) {
                                  setHoveredMessageId(message.id);
                                }
                                const rect = e.currentTarget.getBoundingClientRect();
                                const mouseY = e.clientY - rect.top;
                                setTooltipPosition(prev => ({
                                  ...prev,
                                  [message.id]: mouseY
                                }));
                              }}
                              onMouseLeave={() => {
                                if (message.sender === 'bot' || isSelectingText) return;
                                setHoveredMessageId(null);
                                setTooltipPosition(prev => {
                                  const newPos = { ...prev };
                                  delete newPos[message.id];
                                  return newPos;
                                });
                              }}
                              onMouseDown={(e) => {
                                if (e.button === 0 && isSelectingText) {
                                  // คลิกใหม่ขณะมี selection เดิม ให้ปลดโหมด selection ได้ทันที
                                  setIsSelectingText(false);
                                }
                              }}
                            >
                              {(
                                <>
                                  <div
                                    className='text-[15px] leading-relaxed break-words chat-message-content max-w-full min-w-0 select-text cursor-text'
                                    style={{
                                      // ใช้ anywhere เพื่อกันข้อความยาวมากล้นกรอบ แต่ไม่ "หั่นทุกตัวอักษร" แบบ break-all
                                      overflowWrap: 'anywhere',
                                      wordBreak: 'normal',
                                      maxWidth: '100%',
                                    }}
                                  >
                                    {(() => {
                                      if (isUser && editingUserMsgId === message.id) {
                                        return (
                                          <div className='min-w-[240px] sm:min-w-[320px]'>
                                            <textarea
                                              autoFocus
                                              value={editingUserText}
                                              onChange={(e) => setEditingUserText(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                  e.preventDefault();
                                                  handleResendEditedUserMessage();
                                                } else if (e.key === 'Escape') {
                                                  handleCancelUserEdit();
                                                }
                                              }}
                                              rows={2}
                                              className='w-full resize-none rounded-lg bg-white/85 text-gray-900 text-[15px] leading-relaxed px-3 py-2 outline-none border border-amber-500/50 focus:border-amber-600'
                                            />
                                            <div className='flex justify-end gap-2 mt-2'>
                                              <button type='button' onClick={handleCancelUserEdit} className='px-3 py-1 text-sm rounded-full bg-white/70 text-gray-800 hover:bg-white transition-colors'>ยกเลิก</button>
                                              <button type='button' onClick={handleResendEditedUserMessage} disabled={!editingUserText.trim()} className='px-3 py-1 text-sm rounded-full bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors'>ส่ง</button>
                                            </div>
                                          </div>
                                        );
                                      }
                                      const isStreamingThis = message.sender === 'bot' && message.id === streamBotIdRef.current;
                                      const displayText = isStreamingThis ? (streamTextRef.current || message.text) : message.text;
                                      const showDots = message.sender === 'bot' && !displayText && isTyping && index === messages.length - 1;
                                      if (showDots) {
                                        return (
                                          <span className='inline-flex items-center gap-1.5 text-gray-500' aria-label='กำลังคิด'>
                                            <span className='w-3 h-3 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '0ms' }} />
                                            <span className='w-3 h-3 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '150ms' }} />
                                            <span className='w-3 h-3 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '300ms' }} />
                                          </span>
                                        );
                                      }
                                      if (message.sender === 'bot' && displayText) {
                                        const textWithNewlines = String(displayText).replace(/<br\s*\/?>/gi, '\n');
                                        const textNormalized = normalizeMarkdownTable(textWithNewlines);
                                        return <BotMarkdown text={textNormalized} />;
                                      }
                                      return (
                                        <span
                                          className='whitespace-pre-wrap break-words'
                                          style={{ overflowWrap: 'anywhere', wordBreak: 'normal' }}
                                        >
                                          {displayText || ''}
                                        </span>
                                      );
                                    })()}
                                  </div>
                              {/* Timestamp Tooltip - แสดงเมื่อ hover ติดตาม cursor */}
                              {!isSelectingText && message.sender !== 'bot' && hoveredMessageId === message.id && tooltipPosition[message.id] !== undefined && (
                                <div className={`absolute ${
                                  isUser ? 'right-full mr-2' : 'left-full ml-2'
                                } opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap`}
                                style={{ 
                                  top: `${tooltipPosition[message.id]}px`, 
                                  transform: 'translateY(-50%)' 
                                }}
                                >
                                  <div className="bg-gray-900 text-white text-xs rounded-lg px-2 py-1.5 shadow-lg relative">
                                    {formatDetailedTime(message.timestamp)}
                                    <div className={`absolute ${
                                      isUser ? 'right-0' : 'left-0'
                                    } top-1/2 -translate-y-1/2 ${
                                      isUser ? '-mr-1' : '-ml-1'
                                    } w-0 h-0 border-t-4 border-b-4 ${
                                      isUser ? 'border-r-4 border-r-gray-900 border-l-0' : 'border-l-4 border-l-gray-900 border-r-0'
                                    } border-transparent`}></div>
                                  </div>
                                </div>
                              )}
                                </>
                              )}
                            </div>

                            {/* แหล่งที่มาจากเอกสาร — แยกจากฟองข้อความ เหมือนไฟล์แนบ / ภาพย่อ */}
                            {ENABLE_SOURCE_REFERENCES && !isUser && message.sender === 'bot' && message.references?.length > 0 && (
                              <div className='mt-1.5 space-y-1.5 w-full max-w-xs'>
                                {message.references.map((ref, i) => {
                                  const meta = getReferenceFileMeta(ref.displayName);
                                  const isPrivateRef = String(ref.docId) === '__private__';
                                  const pageLabel = isPrivateRef
                                    ? 'เนื้อหาส่วนตัว'
                                    : Array.isArray(ref.positions) && Number.isFinite(ref.positions[0]?.page)
                                      ? `หน้า ${ref.positions[0].page}`
                                      : Array.isArray(ref.positions) && ref.positions[0]?.lineHint
                                        ? ref.positions[0].lineHint
                                        : 'ไม่ระบุหน้า';
                                  return (
                                    <button
                                      key={ref.docId || i}
                                      type='button'
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openSourceReference(message, ref);
                                      }}
                                      className='flex w-full max-w-xs min-w-0 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden text-left hover:border-gray-300 hover:bg-gray-50/80 transition-colors'
                                      title={`เปิดแหล่งที่มา: ${ref.displayName}`}
                                    >
                                      <div
                                        className={`flex-shrink-0 w-11 sm:w-12 bg-gradient-to-br ${meta.previewClass} flex flex-col items-center justify-center text-white px-1.5 py-1.5 border-r border-black/10`}
                                        aria-hidden
                                      >
                                        <span className='text-[9px] font-bold tracking-wide opacity-95'>{meta.type}</span>
                                        <span className='text-base leading-none mt-0.5 drop-shadow-sm'>{meta.icon}</span>
                                      </div>
                                      <div className='min-w-0 flex-1 px-2.5 py-1.5'>
                                        <p className='text-[10px] text-gray-500 uppercase tracking-wide'>แหล่งที่มา</p>
                                        <p className='text-xs font-medium text-gray-900 truncate mt-0.5'>{ref.displayName}</p>
                                        <p className='text-[11px] text-gray-600 mt-0.5 truncate'>ตำแหน่ง: {pageLabel}</p>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            
                            {/* Copy, แก้ไข, โหวต (บอท) + แนะนำคำถามถัดไป */}
                            <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} items-center gap-1 mt-1 flex-wrap`}>
                              {message.sender === 'bot' && !String(message.id).startsWith('temp-') && (
                                <>
                                  {ENABLE_MESSAGE_EDIT_BUTTON && (
                                    <button
                                      type='button'
                                      onClick={(e) => { e.stopPropagation(); handleStartEdit(message); }}
                                      className='opacity-70 hover:opacity-100 text-gray-600 hover:text-gray-900 rounded p-1.5 hover:bg-gray-100'
                                      title='แก้ไขข้อความ'
                                    >
                                      <HiPencil className='text-base' />
                                    </button>
                                  )}
                                  <button
                                    type='button'
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await handleFeedback(message, 'up');
                                    }}
                                    className={`rounded p-1.5 hover:bg-gray-100 ${(feedbackByMessageId[message.id] || message.feedback) === 'up' ? 'text-green-600' : 'opacity-70 hover:opacity-100 text-gray-500 hover:text-gray-700'}`}
                                    title='มีประโยชน์'
                                  >
                                    <HiThumbUp className='text-base' />
                                  </button>
                                  <button
                                    type='button'
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await handleFeedback(message, 'down');
                                    }}
                                    className={`rounded p-1.5 hover:bg-gray-100 ${(feedbackByMessageId[message.id] || message.feedback) === 'down' ? 'text-red-600' : 'opacity-70 hover:opacity-100 text-gray-500 hover:text-gray-700'}`}
                                    title='ไม่มีประโยชน์'
                                  >
                                    <HiThumbDown className='text-base' />
                                  </button>
                                </>
                              )}
                              {isUser && !String(message.id).startsWith('temp-') && editingUserMsgId !== message.id && (
                                <button
                                  type='button'
                                  onClick={(e) => { e.stopPropagation(); handleStartUserEdit(message); }}
                                  disabled={isTyping}
                                  className='opacity-70 hover:opacity-100 transition-all duration-150 text-yellow-800 hover:text-yellow-900 rounded p-1.5 hover:bg-gray-100 disabled:opacity-40'
                                  title='แก้ไขและส่งใหม่'
                                >
                                  <HiPencil className='text-base' />
                                </button>
                              )}
                              <div className="relative group/copy inline-block">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyMessage(message.text, message.id);
                                  }}
                                  className={`opacity-70 hover:opacity-100 transition-all duration-150 border border-transparent ${
                                    isUser
                                      ? 'text-yellow-800 hover:text-yellow-900'
                                      : 'text-gray-700 hover:text-gray-900'
                                  } rounded p-1.5 hover:bg-gray-100 hover:border-gray-300 flex items-center gap-1`}
                                >
                                  {copiedMessageId === message.id ? (
                                    <HiCheck className='text-base' />
                                  ) : (
                                    <HiClipboardCopy className='text-base' />
                                  )}
                                </button>
                                
                                {/* Tooltip - ใช้ absolute positioning และ pointer-events-none เพื่อไม่กระทบ layout */}
                                <div className={`absolute ${
                                  isUser ? 'right-0' : 'left-0'
                                } top-full mt-2 opacity-0 group-hover/copy:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap`}>
                                  <div className="bg-gray-900 text-white text-xs rounded-lg px-2 py-1.5 shadow-lg relative">
                                    {copiedMessageId === message.id ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}
                                    <div className={`absolute ${
                                      isUser ? 'right-2' : 'left-2'
                                    } bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900`}></div>
                                  </div>
                                </div>
                              </div>
                              {/* แนะนำคำถามถัดไป — แสดงใต้ข้อความบอทล่าสุดเท่านั้น */}
                              {!isHelpChat && message.sender === 'bot' && (() => {
                                let lastBotIdx = -1;
                                for (let i = messages.length - 1; i >= 0; i--) if (messages[i].sender === 'bot') { lastBotIdx = i; break; }
                                const isLastBot = index === lastBotIdx && !(isTyping && index === messages.length - 1);
                                if (!isLastBot) return null;
                                const previousQuestion = getPreviousUserQuestion(index);
                                const suggestions = getSuggestedFollowUps(message.text, previousQuestion);
                                return (
                                  <div className='flex flex-wrap gap-2 mt-2'>
                                    {suggestions.map((q) => (
                                      <button
                                        key={q}
                                        type='button'
                                        onClick={() => handleSuggestedFollowUpClick(q, message, index)}
                                        disabled={isTyping || (selectedBot && selectedBot.enabled === false)}
                                        className='px-3 py-1.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 disabled:opacity-50'
                                      >
                                        {q}
                                      </button>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Typing Indicator — แยกเป็น component TypingIndicator */}
                <TypingIndicator isTyping={isTyping} messages={messages} typingStage={typingStage} />
                
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Chat Input - ChatGPT/Gemini style */}
        <div className='relative border-t border-gray-200 bg-white'>
          {showScrollDown && (
            <button
              type='button'
              onClick={() => { scrollToBottom('smooth'); setShowScrollDown(false); }}
              aria-label='เลื่อนลงล่างสุด'
              title='เลื่อนลงล่างสุด'
              className='absolute -top-12 left-1/2 -translate-x-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white border border-gray-300 shadow-md text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-all'
            >
              <HiArrowLeft className='text-lg -rotate-90' />
            </button>
          )}
          <div className='max-w-3xl mx-auto px-4 sm:px-6 py-4'>
            {/* Warning message if bot is inactive */}
            {selectedBot && selectedBot.enabled === false && (
              <div className='mb-4 p-3 bg-red-50 border-2 border-red-200 rounded-lg'>
                <div className='flex items-start gap-2'>
                  <span className='text-red-600 font-bold text-lg'>⚠️</span>
                  <div className='flex-1'>
                    <p className='text-red-800 text-sm font-semibold mb-1'>Bot นี้ถูก inactive แล้ว</p>
                    <p className='text-red-700 text-xs mb-2'>คุณไม่สามารถส่งข้อความได้จนกว่าจะไปเปิด Bot เป็น active ในหน้า Bots</p>
                    <button
                      onClick={() => navigate('/homepage')}
                      className='px-3 py-1.5 text-xs bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-sm hover:shadow-md transition-all'
                    >
                      ไปเปิด Bot เป็น Active
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* แจ้งเตือนเมื่อบอทยังไม่มีเอกสารความรู้ในระบบ */}
            {selectedBot && selectedBot.enabled !== false && !isHelpChat && !privateMode
              && Array.isArray(selectedBot.documentIds) && selectedBot.documentIds.length === 0 && (
              <div className='mb-4 p-3 bg-amber-50 border-2 border-amber-300 rounded-lg'>
                <div className='flex items-start gap-2'>
                  <span className='text-amber-600 text-lg'>⚠️</span>
                  <div className='flex-1'>
                    <p className='text-amber-900 text-sm font-bold mb-0.5'>ยังไม่มีเอกสารความรู้ในระบบ</p>
                    <p className='text-amber-800 text-xs'>
                      บอทนี้ยังไม่มี Knowledge ให้ใช้อ้างอิง คำตอบอาจไม่ครบถ้วนหรือไม่อ้างอิงจากเอกสาร — แนะนำให้เพิ่มเอกสารก่อนใช้งาน
                    </p>
                  </div>
                </div>
              </div>
            )}
            {privateMode && (
            <div className='mb-2'>
              <div className='flex items-center gap-2 flex-wrap'>
                <button
                  type='button'
                  role='switch'
                  aria-checked={usePrivateContent}
                  onClick={() => setUsePrivateContent((v) => !v)}
                  className='flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-gray-300 bg-white hover:border-yellow-400 transition-colors'
                  title='เปิด = ใช้หน่วยความจำส่วนตัวร่วมกับเอกสารระบบ, ปิด = ปิดเฉพาะส่วนตัว (ยังใช้เอกสารระบบ)'
                >
                  <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${usePrivateContent ? 'bg-yellow-400' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${usePrivateContent ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </span>
                  <span className='text-xs font-semibold text-gray-800'>ใช้หน่วยความจำส่วนตัว {usePrivateContent ? '(เปิด)' : '(ปิด)'}</span>
                </button>
                <button
                  type='button'
                  onClick={() => setPrivateMemoryPanelOpen((v) => !v)}
                  className='px-2.5 py-1.5 text-xs font-medium rounded-full border border-gray-300 bg-white text-gray-700 hover:border-yellow-400 transition-colors'
                >
                  หน่วยความจำ
                </button>
                <span className='text-xs text-gray-500'>
                  {privateHasData
                    ? 'ใช้ /จำ เพื่อเพิ่มข้อมูล, ใช้ /สั่ง เพื่อตั้งรูปแบบคำตอบ'
                    : 'ยังไม่มีข้อมูลส่วนตัว — ลองพิมพ์ /จำ <ข้อมูล> หรือ /สั่ง <คำสั่ง>'}
                </span>
                <span className='text-xs text-gray-500'>
                  เปิด = ส่วนตัว + เอกสารระบบ, ปิด = ปิดเฉพาะส่วนตัว
                </span>
              </div>
              {privateMemoryPanelOpen && (
                <div className='mt-2 rounded-xl border border-gray-200 bg-white p-3 space-y-2'>
                  <p className='text-xs font-semibold text-gray-700'>หน่วยความจำที่บันทึกไว้ (ระดับผู้ใช้)</p>
                  <div className='space-y-2 max-h-56 overflow-y-auto overflow-x-hidden pr-1'>
                    {privateInstructionsText ? (
                      <div className='rounded-lg border border-blue-200 bg-blue-50 p-2'>
                        <div className='flex items-start justify-between gap-2'>
                          <div>
                            <p className='text-[11px] font-semibold text-blue-700'>คำสั่ง AI (/สั่ง)</p>
                            <p className='text-xs text-gray-700 whitespace-pre-wrap break-words'>{privateInstructionsText}</p>
                          </div>
                          <button
                            type='button'
                            onClick={handleDeletePrivateInstruction}
                            className='text-xs text-red-600 hover:text-red-700'
                          >
                            ลบ
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {privateRememberItems.map((item, idx) => (
                      <div key={`mem-${idx}`} className='rounded-lg border border-yellow-200 bg-yellow-50 p-2'>
                        <div className='flex items-start justify-between gap-2'>
                          <div>
                            <p className='text-[11px] font-semibold text-yellow-700'>ข้อมูลที่จำไว้ #{idx + 1}</p>
                            <p className='text-xs text-gray-700 whitespace-pre-wrap break-words'>{item}</p>
                          </div>
                          <button
                            type='button'
                            onClick={() => handleDeleteRememberItem(idx)}
                            className='text-xs text-red-600 hover:text-red-700'
                          >
                            ลบ
                          </button>
                        </div>
                      </div>
                    ))}
                    {!privateInstructionsText && privateRememberItems.length === 0 && (
                      <p className='text-xs text-gray-500'>ยังไม่มีข้อมูลที่จำไว้</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            )}
            <form onSubmit={handleSendMessage} className='relative'>
              <div className={`flex items-end gap-2 bg-white border-2 rounded-2xl shadow-sm transition-colors ${
                selectedBot && selectedBot.enabled === false
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300 hover:border-yellow-400 focus-within:border-yellow-400'
              }`}>
                {privateMode && composerPrivateCommand && (
                  <button
                    type='button'
                    onClick={() => setComposerPrivateCommand(null)}
                    className='self-center mb-1 ml-1 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700'
                    title='ปิดโหมดคำสั่ง'
                  >
                    <span className='font-semibold'>{composerPrivateCommand === 'remember' ? '/จำ' : '/สั่ง'}</span>
                    <HiX className='text-xs' />
                  </button>
                )}
                <textarea
                  ref={textareaRef}
                  value={chatInput}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (privateMode && !composerPrivateCommand) {
                      const cmd = parsePrivateCommand(next);
                      if (cmd) {
                        setComposerPrivateCommand(cmd.kind);
                        setChatInput(cmd.payload || '');
                        adjustTextareaHeight();
                        return;
                      }
                    }
                    setChatInput(next);
                    adjustTextareaHeight();
                  }}
                  onKeyDown={(e) => {
                    if (privateMode && composerPrivateCommand && e.key === 'Backspace' && !chatInput) {
                      setComposerPrivateCommand(null);
                      return;
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      const hasMultipleLines = String(chatInput || '').includes('\n');
                      const explicitSend = e.ctrlKey || e.metaKey;
                      // Safety for long multi-line test text:
                      // - Enter keeps editing
                      // - Ctrl/Cmd+Enter sends
                      if (hasMultipleLines && !explicitSend) {
                        return;
                      }
                      e.preventDefault();
                      handleSendMessage(e);
                    } else {
                      adjustTextareaHeight();
                    }
                  }}
                  placeholder={
                    selectedBot && selectedBot.enabled === false
                      ? 'Bot นี้ถูก inactive แล้ว...'
                      : privateMode
                        ? (composerPrivateCommand
                          ? (composerPrivateCommand === 'remember' ? 'พิมพ์ข้อมูลที่ต้องการให้ระบบจำ...' : 'พิมพ์คำสั่งการตอบของ AI...')
                          : 'พิมพ์ข้อความ... หรือใช้ /จำ ข้อมูล และ /สั่ง คำสั่ง AI')
                        : 'พิมพ์ข้อความ...'
                  }
                  rows={1}
                  disabled={selectedBot && selectedBot.enabled === false}
                  className={`flex-1 outline-none text-[15px] placeholder-gray-400 bg-transparent resize-none overflow-x-hidden overflow-y-auto min-h-[52px] max-h-[200px] px-4 py-3.5 ${
                    selectedBot && selectedBot.enabled === false
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700'
                  }`}
                />
                
                {/* โหมดคำตอบ (Flash/Detail) — ซ่อนไว้ก่อน ใช้ Detail เป็นหลัก (เปิดคืนได้ที่ ENABLE_MODE_SELECTOR) */}
                {ENABLE_MODE_SELECTOR && (
                <div className='relative self-end mb-2 flex-shrink-0'>
                  <button
                    type='button'
                    onClick={() => setModeMenuOpen((o) => !o)}
                    className='flex items-center gap-1 px-2 py-1.5 rounded-full text-xs text-gray-600 hover:bg-gray-100 transition-colors'
                    title='เลือกโหมดคำตอบ'
                  >
                    <span>{answerMode === 'fast' ? '⚡' : '🎯'}</span>
                    <span className='font-medium'>{answerMode === 'fast' ? 'Flash' : 'Detail'}</span>
                    <HiChevronDown className={`text-sm text-gray-400 transition-transform ${modeMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {modeMenuOpen && (
                    <>
                      <div className='fixed inset-0 z-10' onClick={() => setModeMenuOpen(false)} aria-hidden='true' />
                      <div className='absolute bottom-full right-0 mb-2 w-80 max-w-[85vw] bg-white rounded-xl shadow-xl border border-gray-200 z-20 py-1'>
                        <button
                          type='button'
                          onClick={() => selectAnswerMode('fast')}
                          className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-start gap-2.5 ${answerMode === 'fast' ? 'bg-yellow-50' : ''}`}
                        >
                          <span className='text-lg leading-none mt-0.5'>⚡</span>
                          <span className='flex-1 min-w-0'>
                            <span className='block text-sm font-medium text-gray-800'>Flash · เร็ว</span>
                            <span className='block text-xs text-gray-500'>ตอบไวขึ้น เหมาะกับถาม-ตอบทั่วไป หาข้อมูลตรงๆ</span>
                          </span>
                          {answerMode === 'fast' && <HiCheck className='text-yellow-500 text-base mt-0.5 flex-shrink-0' />}
                        </button>
                        <button
                          type='button'
                          onClick={() => selectAnswerMode('detailed')}
                          className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-start gap-2.5 ${answerMode === 'detailed' ? 'bg-yellow-50' : ''}`}
                        >
                          <span className='text-lg leading-none mt-0.5'>🎯</span>
                          <span className='flex-1 min-w-0'>
                            <span className='block text-sm font-medium text-gray-800'>Detail · ละเอียด</span>
                            <span className='block text-xs text-gray-500'>วิเคราะห์ลึก เปรียบเทียบ สรุปหลายเงื่อนไข/หลายเอกสาร</span>
                          </span>
                          {answerMode === 'detailed' && <HiCheck className='text-yellow-500 text-base mt-0.5 flex-shrink-0' />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
                )}
                <div className='pr-2 pb-2 flex items-center justify-center'>
                  {isTyping ? (
                    <button
                      type='button'
                      onClick={handleStopStreaming}
                      className='rounded-lg p-2.5 transition-all flex items-center justify-center bg-red-500 text-white hover:bg-red-600 shadow-sm hover:shadow-md'
                      title='หยุดการตอบ'
                    >
                      <HiX className='text-lg' />
                    </button>
                  ) : (
                    <button
                      type='submit'
                      disabled={!chatInput.trim() || (selectedBot && selectedBot.enabled === false)}
                      className={`rounded-lg p-2.5 transition-all flex items-center justify-center ${
                        chatInput.trim() && (!selectedBot || selectedBot.enabled !== false)
                          ? 'bg-gradient-to-br from-yellow-400 to-yellow-500 text-gray-900 hover:from-yellow-500 hover:to-yellow-600 shadow-sm hover:shadow-md'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <HiOutlinePaperAirplane className='text-lg transform rotate-90' />
                    </button>
                  )}
                </div>
              </div>
            </form>
            <p className='text-xs text-gray-400 text-center mt-2'>
              Enterprise AI Chatbot อาจทำผิดพลาดได้ กรุณาตรวจสอบข้อมูลสำคัญ
            </p>
          </div>
        </div>
      </main>

      {ENABLE_SOURCE_REFERENCES && isSourceModalOpen && sourceModalData && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50'
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsSourceModalOpen(false);
          }}
          role='dialog'
          aria-modal='true'
        >
          <div className='bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col'>
            <div className='px-6 py-4 border-b border-gray-200 flex items-center justify-between'>
              <div>
                <h2 className='text-lg font-semibold text-gray-900'>แหล่งอ้างอิงคำตอบ</h2>
                <p className='text-sm text-gray-600'>{sourceModalData.displayName}</p>
              </div>
              <button
                type='button'
                onClick={() => setIsSourceModalOpen(false)}
                className='text-gray-500 hover:text-gray-700'
                aria-label='ปิด'
              >
                <HiX className='text-lg' />
              </button>
            </div>
            <div className='p-6 overflow-auto space-y-4 text-sm'>
              {Array.isArray(sourceModalData.positions) && sourceModalData.positions.length > 0 && (
                <div className='rounded-lg border border-amber-200 bg-amber-50 px-3 py-2'>
                  <p className='text-xs font-semibold text-amber-800 mb-1'>ตำแหน่งที่ใช้ตอบ</p>
                  <div className='flex flex-wrap gap-2'>
                    {sourceModalData.positions.map((pos, idx) => (
                      <span key={`${pos.chunkIndex ?? 'n'}-${idx}`} className='inline-flex items-center rounded-md bg-white border border-amber-200 px-2 py-0.5 text-xs text-amber-800'>
                        {pos.lineHint || pos.label || `ช่วงที่ ${(pos.chunkIndex ?? idx) + 1}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {sourceModalData.isPrivate ? (
                <div className='rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-gray-700 space-y-1'>
                  <p className='text-sm font-medium text-gray-800'>อ้างอิงจากเนื้อหาส่วนตัวของคุณ</p>
                  <p className='text-xs text-gray-600 leading-relaxed'>
                    คำตอบส่วนนี้อ้างอิงจากเนื้อหาที่คุณตั้งไว้ในโหมดส่วนตัว (ไม่ได้มาจากเอกสารในระบบ) — แก้ไขได้โดยพิมพ์ /จำ หรือ /สั่ง ในแชท หรือที่หน้าโหมดส่วนตัว
                  </p>
                </div>
              ) : Array.isArray(sourceModalData.chunks) && sourceModalData.chunks.length > 0 ? (
                sourceModalData.chunks.map((chunk, idx) => {
                  const displayText = stripAiHelperSections(String(chunk.text || '').replace(/<br\s*\/?>/gi, '\n'));
                  const helperOnly = !displayText;
                  return (
                  <div key={chunk.id || idx} className='rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5'>
                    <p className='text-xs font-semibold text-gray-700 mb-1'>
                      {chunk.lineHint || (Number.isFinite(chunk.page) ? `หน้า ${chunk.page}` : `ช่วงที่ ${idx + 1}`)}
                    </p>
                    {chunk.quote && !helperOnly ? (
                      <p className='text-xs text-gray-600 italic mb-1'>อ้างอิง: "{chunk.quote}"</p>
                    ) : null}
                    <div className='text-sm text-gray-800 leading-relaxed'>
                      {displayText ? (
                        <BotMarkdown text={normalizeMarkdownTable(displayText)} />
                      ) : (
                        <p className='text-xs text-gray-500 italic'>อ้างอิงจากเอกสารนี้ — ดูเอกสารฉบับเต็มสำหรับรายละเอียด</p>
                      )}
                    </div>
                  </div>
                  );
                })
              ) : (
                <div className='rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-gray-700 space-y-2'>
                  <p className='text-sm font-medium text-gray-800'>ไม่มีข้อความย่อยแสดงในหน้าต่างนี้</p>
                  <p className='text-xs text-gray-600 leading-relaxed'>
                    ถ้าการ์ดนี้มาจากเอกสารหลักของแชทแต่ระบบยังไม่ดึง chunk ที่เกี่ยวข้องมาเก็บ คุณจะเห็นแค่ชื่อไฟล์ด้านบนได้
                    คุณสามารถถามต่อแบบเจาะจงเพื่อให้ระบบดึงบริบทที่เกี่ยวข้องเพิ่มเติมได้
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Popup แก้ไขข้อความบอท — ใหญ่ อ่าน/แก้สะดวก */}
      {editingMessageId && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50'
          onClick={(e) => { if (e.target === e.currentTarget) handleCancelEdit(); }}
          role='dialog'
          aria-modal='true'
          aria-labelledby='edit-message-title'
        >
          <div
            className='bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='px-6 pt-5 pb-2 border-b border-gray-200'>
              <h2 id='edit-message-title' className='text-lg font-semibold text-gray-900'>
                แก้ไขข้อความ
              </h2>
              <p className='text-sm text-gray-500 mt-0.5'>แก้แล้วกดบันทึก ระบบจะอัปเดตทั้งแชทและฐานความรู้</p>
            </div>
            <div className='flex-1 overflow-hidden p-6'>
              <textarea
                ref={textareaRef}
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                className='w-full min-h-[280px] p-4 text-[15px] rounded-xl border border-gray-300 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 outline-none resize-y'
                placeholder='แก้ไขข้อความ...'
                autoFocus
              />
            </div>
            <div className='px-6 py-4 border-t border-gray-200 flex justify-end gap-3'>
              <button
                type='button'
                onClick={handleCancelEdit}
                className='px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-200 text-gray-700 hover:bg-gray-300'
              >
                ยกเลิก
              </button>
              <button
                type='button'
                onClick={handleSaveEdit}
                className='px-4 py-2.5 text-sm font-medium rounded-xl bg-yellow-500 text-gray-900 hover:bg-yellow-600'
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Chat;
