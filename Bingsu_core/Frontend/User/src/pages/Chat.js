import { useState, useEffect, useRef, useCallback } from 'react';
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
  HiPaperClip
} from 'react-icons/hi';
import { HiChatBubbleLeftRight } from 'react-icons/hi2';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import { chatMessageAPI, chatAPI, botAPI, userAPI, getErrorMessage } from '../services/api';

const formatToken = (n) => {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x.toLocaleString('th-TH') : '0';
};
const OFFICIAL_BOT_DESCRIPTION = 'ระบบผู้ช่วยอัจฉริยะสำหรับตอบคำถามและวิเคราะห์ข้อมูลจากฐานความรู้อย่างเป็นระบบ โดยมุ่งเน้นความถูกต้อง รวดเร็ว และความน่าเชื่อถือของข้อมูล';
const ENABLE_MESSAGE_EDIT_BUTTON = false;
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

function Chat() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
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
  const [attachedFile, setAttachedFile] = useState(null);
  const fileInputRef = useRef(null);
  const [feedbackByMessageId, setFeedbackByMessageId] = useState({});
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [sourceModalData, setSourceModalData] = useState(null);
  const [isSelectingText, setIsSelectingText] = useState(false);
  const messagesEndRef = useRef(null);
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
        if (chat && chat.name) {
          setChatName(chat.name);
        } else {
          setChatName('New Chat');
        }
        
        // ถ้า chat มี botId ให้โหลด bot จาก botId (priority สูงกว่า location.state)
        if (chat && chat.botId && bots.length > 0) {
          const bot = bots.find(b => b.id === chat.botId);
          if (bot) {
            console.log('Found bot from chat.botId:', bot.name, 'with documentIds:', bot.documentIds);
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

  // โหลด bots จาก API
  useEffect(() => {
    const loadBots = async () => {
      try {
        const botsData = await botAPI.getBots();
        console.log('Bots data from API:', botsData);
        
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
          console.log('Loaded bots:', validBots.length, 'bots (enabled:', validBots.filter(b => b.enabled !== false).length, ')');
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
          console.log('Found bot from location.state:', bot.name, 'with documentIds:', bot.documentIds, '(enabled)');
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
      console.log('Bots list not loaded yet, storing bot from state temporarily');
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
          alert('Bot นี้ถูก inactive แล้ว กรุณาไปเปิด Bot เป็น active ในหน้า Bots ก่อนส่งข้อความ');
          return;
        }
        
        const tempUserId = `temp-user-${Date.now()}`;
        const tempBotId = `temp-bot-${Date.now()}`;
        setMessages(prev => [...prev,
          { id: tempUserId, text: firstMessage, sender: 'user', timestamp: new Date() },
          { id: tempBotId, text: '', sender: 'bot', timestamp: new Date() },
        ]);
        setIsTyping(true);
        streamTextRef.current = '';
        streamBotIdRef.current = tempBotId;
        const controller = new AbortController();
        streamAbortControllerRef.current = controller;
        try {
          await chatMessageAPI.createBotResponseStream(chatId, firstMessage, {
            signal: controller.signal,
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
            await chatMessageAPI.createBotResponse(chatId, firstMessage);
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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: isTyping ? 'auto' : 'smooth' });
  }, [messages, isTyping]);

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

  const handleSendMessage = async (e, overrideMessage = null) => {
    e.preventDefault();
    const shouldClearComposer = overrideMessage == null;
    const messageText = (overrideMessage != null && String(overrideMessage).trim() !== '')
      ? String(overrideMessage).trim()
      : chatInput.trim();
    const withAttachment = attachedFile ? ` (แนบไฟล์: ${attachedFile.name})` : '';
    const finalText = messageText + withAttachment;

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
      setAttachedFile(null);

      // Reset textarea height after we've confirmed message can be sent
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
    const draftKey = getDraftKey(id);

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
    setIsTyping(true);
    streamTextRef.current = '';
    streamBotIdRef.current = tempBotId;
    const controller = new AbortController();
    streamAbortControllerRef.current = controller;

    try {
      await chatMessageAPI.createBotResponseStream(chatId, outboundText, {
        signal: controller.signal,
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
        await chatMessageAPI.createBotResponse(chatId, outboundText);
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
    for (let i = botMessageIndex - 1; i >= 0; i -= 1) {
      const candidate = messages[i];
      if (candidate?.sender === 'user' && String(candidate?.text || '').trim()) {
        return String(candidate.text).trim();
      }
    }
    return '';
  };

  const openSourceReference = (message, ref) => {
    if (!ENABLE_SOURCE_REFERENCES) return;
    if (!message || !ref?.docId) return;
    const relatedChunks = parseStoredJsonArray(message.groundingChunks)
      .filter((chunk) => {
        const docId = chunk?.retrievedContext?.docId ?? chunk?.payload?.docId;
        return String(docId) === String(ref.docId);
      })
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
      .filter((item) => item.text)
      .slice(0, 8);
    setSourceModalData({
      docId: ref.docId,
      displayName: ref.displayName || 'เอกสาร',
      positions: Array.isArray(ref.positions) ? ref.positions : [],
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
    if (label === 'อธิบายเพิ่มเติม') {
      return `จากคำตอบก่อนหน้า ช่วยอธิบายเพิ่มเติมให้เข้าใจง่ายขึ้น${q ? ` โดยยึดคำถามเดิม: ${q}` : ''}`;
    }
    if (label === 'ดูรายละเอียดเพิ่มเติม') {
      return `จากคำตอบก่อนหน้า ช่วยอธิบายรายละเอียดเพิ่มเติมแบบเป็นข้อ พร้อมยกตัวอย่างที่เข้าใจง่าย${q ? ` โดยอ้างอิงจากคำถามเดิม: ${q}` : ''}`;
    }
    if (label === 'ขออ้างอิงที่มา') {
      return `จากคำตอบก่อนหน้า ช่วยระบุแหล่งที่มาจากเอกสารที่ใช้ตอบให้ชัดเจน${q ? ` สำหรับคำถาม: ${q}` : ''}`;
    }
    if (label === 'ขออ้างอิงข้อที่เกี่ยวข้อง') {
      return `จากคำตอบก่อนหน้า ช่วยระบุข้ออ้างอิง/แหล่งข้อมูลที่เกี่ยวข้องให้ชัดเจน${q ? ` สำหรับคำถาม: ${q}` : ''}`;
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
      <Sidebar onCollapseChange={setIsSidebarCollapsed} />

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
            <div className='flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-700 max-w-[320px] min-w-0'>
              <span
                className='font-medium truncate min-w-0'
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
        <div className='flex-1 overflow-y-auto bg-[#f7f7f8]'>
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
                                        return (
                                          <div className='gemini-markdown max-w-full min-w-0 overflow-x-auto select-text [&_*]:select-text [&_ol_li>p]:inline [&_ol_li>p]:my-0 [&_ul_li>p]:inline [&_ul_li>p]:my-0 [&_table]:max-w-full [&_th:first-child]:w-32 [&_td:first-child]:w-32'>
                                            <ReactMarkdown
                                              remarkPlugins={[remarkGfm]}
                                              rehypePlugins={[rehypeRaw]}
                                              components={{
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
                                              }}
                                            >
                                              {textNormalized}
                                            </ReactMarkdown>
                                          </div>
                                        );
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
                                  const pageLabel =
                                    Array.isArray(ref.positions) && Number.isFinite(ref.positions[0]?.page)
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
                                      const rating = 'up';
                                      setFeedbackByMessageId(prev => ({ ...prev, [message.id]: rating }));
                                      try { await chatMessageAPI.submitFeedback(message.id, rating); } catch (err) { setFeedbackByMessageId(prev => ({ ...prev, [message.id]: undefined })); }
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
                                      const rating = 'down';
                                      setFeedbackByMessageId(prev => ({ ...prev, [message.id]: rating }));
                                      try { await chatMessageAPI.submitFeedback(message.id, rating); } catch (err) { setFeedbackByMessageId(prev => ({ ...prev, [message.id]: undefined })); }
                                    }}
                                    className={`rounded p-1.5 hover:bg-gray-100 ${(feedbackByMessageId[message.id] || message.feedback) === 'down' ? 'text-red-600' : 'opacity-70 hover:opacity-100 text-gray-500 hover:text-gray-700'}`}
                                    title='ไม่มีประโยชน์'
                                  >
                                    <HiThumbDown className='text-base' />
                                  </button>
                                </>
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
                
                {/* Typing Indicator — แสดงเฉพาะเมื่อกำลังรอแต่ยังไม่มีบับเบิลบอท (ไม่แสดงเมื่อกำลังสตรีมเข้า placeholder เดียวกัน) */}
                {isTyping && (() => {
                  const lastMsg = messages[messages.length - 1];
                  const isStreamingIntoBot = lastMsg?.sender === 'bot';
                  if (isStreamingIntoBot) return null;
                  return (
                    <div className='flex gap-3 justify-start'>
                      <div className='flex-shrink-0 w-8 h-8 mt-1'>
                        <div className='w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center shadow-sm'>
                          <HiChatBubbleLeftRight className='text-white text-sm' />
                        </div>
                      </div>
                      <div className='flex-1'>
                        <div className='inline-block px-4 py-2.5 rounded-2xl bg-white border border-gray-200 shadow-sm'>
                          <div className='flex gap-1.5'>
                            <div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '0ms' }}></div>
                            <div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '150ms' }}></div>
                            <div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '300ms' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Chat Input - ChatGPT/Gemini style */}
        <div className='border-t border-gray-200 bg-white'>
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
            <form onSubmit={handleSendMessage} className='relative'>
              <input
                ref={fileInputRef}
                type='file'
                accept='.pdf,.png,.jpg,.jpeg,.doc,.docx,image/*'
                className='hidden'
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setAttachedFile({ name: f.name, file: f });
                  e.target.value = '';
                }}
              />
              {attachedFile && (
                <div className='flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-yellow-50 border border-yellow-200'>
                  <HiPaperClip className='text-yellow-600 flex-shrink-0' />
                  <span className='text-sm text-gray-700 truncate flex-1'>{attachedFile.name}</span>
                  <button type='button' onClick={() => setAttachedFile(null)} className='text-gray-500 hover:text-red-600 p-0.5'>
                    <HiX className='text-base' />
                  </button>
                </div>
              )}
              <div className={`flex items-end gap-2 bg-white border-2 rounded-2xl shadow-sm transition-colors ${
                selectedBot && selectedBot.enabled === false
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300 hover:border-yellow-400 focus-within:border-yellow-400'
              }`}>
                <button
                  type='button'
                  onClick={() => fileInputRef.current?.click()}
                  disabled={selectedBot && selectedBot.enabled === false}
                  className='p-2.5 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg self-end mb-1 ml-1 disabled:opacity-50'
                  title='แนบไฟล์'
                >
                  <HiPaperClip className='text-lg' />
                </button>
                <textarea
                  ref={textareaRef}
                  value={chatInput}
                  onChange={(e) => {
                    setChatInput(e.target.value);
                    adjustTextareaHeight();
                  }}
                  onKeyDown={(e) => {
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
                  placeholder={selectedBot && selectedBot.enabled === false ? 'Bot นี้ถูก inactive แล้ว...' : 'พิมพ์ข้อความ...'}
                  rows={1}
                  disabled={selectedBot && selectedBot.enabled === false}
                  className={`flex-1 outline-none text-[15px] placeholder-gray-400 bg-transparent resize-none overflow-x-hidden overflow-y-auto min-h-[52px] max-h-[200px] px-4 py-3.5 ${
                    selectedBot && selectedBot.enabled === false
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700'
                  }`}
                />
                
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
              {Array.isArray(sourceModalData.chunks) && sourceModalData.chunks.length > 0 ? (
                sourceModalData.chunks.map((chunk, idx) => (
                  <div key={chunk.id || idx} className='rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5'>
                    <p className='text-xs font-semibold text-gray-700 mb-1'>
                      {chunk.lineHint || (Number.isFinite(chunk.page) ? `หน้า ${chunk.page}` : `ช่วงที่ ${idx + 1}`)}
                    </p>
                    {chunk.quote ? (
                      <p className='text-xs text-gray-600 italic mb-1'>อ้างอิง: "{chunk.quote}"</p>
                    ) : null}
                    <p className='whitespace-pre-wrap text-sm text-gray-800 leading-relaxed'>
                      {chunk.text}
                    </p>
                  </div>
                ))
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
