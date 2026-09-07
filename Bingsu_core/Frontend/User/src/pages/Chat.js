import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import AnnouncementBanner from '../components/AnnouncementBanner';
import { 
  HiArrowLeft, 
  HiX,
  HiChevronDown,
} from 'react-icons/hi';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import { showToast } from '../components/ToastNotification';
import { chatMessageAPI, chatAPI, botAPI, userAPI, privateContextAPI, knowledgeAPI, getErrorMessage } from '../services/api';
import {
  DEFAULT_USER_AVATAR,
  formatToken,
  ENABLE_MODE_SELECTOR,
  ENABLE_SOURCE_REFERENCES,
  buildReferencesFromGroundingChunks,
  parseStoredJsonArray,
  isConversationNotFoundError,
  isAbortError,
  isGeneratedFollowUpPrompt,
  parsePrivateCommand,
  parseRememberedItems,
  mergePrivateOrderStarters,
  stripAiHelperSections,
  extractReferencePosition,
  PRIVATE_ORDER_STARTERS,
} from './chat/chatHelpers';
import ChatMessageList from './chat/ChatMessageList';
import ChatComposer from './chat/ChatComposer';
import CitationModal from './chat/CitationModal';

function Chat() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [userAvatarUrl, setUserAvatarUrl] = useState(DEFAULT_USER_AVATAR);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingStage, setTypingStage] = useState(0);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [chatName, setChatName] = useState('');
  // อัปเดตชื่อบนแท็บเบราว์เซอร์ให้ตรงกับหัวข้อแชทที่เปิดอยู่ (เหมือนที่เห็นในแอปอื่นๆ)
  useEffect(() => {
    const base = 'AI Chatbot Sale';
    document.title = (chatName && chatName !== 'New Chat') ? `${chatName} - ${base}` : base;
    return () => { document.title = base; };
  }, [chatName]);

  // โหลด/ซิงก์รูปโปรไฟล์จาก API + event จาก AccountModal
  useEffect(() => {
    let cancelled = false;
    const loadAvatar = async () => {
      try {
        const user = await userAPI.getCurrentUser();
        if (!cancelled) {
          setUserAvatarUrl(user?.avatarUrl || DEFAULT_USER_AVATAR);
        }
      } catch {
        if (!cancelled) setUserAvatarUrl(DEFAULT_USER_AVATAR);
      }
    };
    loadAvatar();
    const onProfileUpdated = (event) => {
      const next = event?.detail?.avatarUrl;
      if (next) setUserAvatarUrl(next);
      else loadAvatar();
    };
    window.addEventListener('user-profile-updated', onProfileUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('user-profile-updated', onProfileUpdated);
    };
  }, []);
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
  const [privateMode, setPrivateMode] = useState(() => Boolean(location.state?.privateMode));
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
  const [, setPrivateHasData] = useState(false);
  const [hasPrivateInstructions, setHasPrivateInstructions] = useState(false);
  const [composerPrivateCommand, setComposerPrivateCommand] = useState(null); // 'remember' | 'instruction' | null
  const [privateCmdMenuOpen, setPrivateCmdMenuOpen] = useState(false);
  const privateModeRef = useRef(false);
  const [feedbackByMessageId, setFeedbackByMessageId] = useState({});
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [sourceModalData, setSourceModalData] = useState(null);
  const [originalPreviewPopup, setOriginalPreviewPopup] = useState(null); // { name, url, loading }
  // คำถามต่อเนื่องจาก AI — รอให้โหลดเสร็จก่อนโชว์ (กันชิปกระพริบสลับคำ)
  const [aiFollowUps, setAiFollowUps] = useState([]);
  const [followUpsLoading, setFollowUpsLoading] = useState(false);
  const [followUpsReady, setFollowUpsReady] = useState(false);
  const followUpRequestIdRef = useRef(0);
  const restoredFollowUpsForRef = useRef(null);

  useEffect(() => {
    setAiFollowUps([]);
    setFollowUpsLoading(false);
    setFollowUpsReady(false);
    followUpRequestIdRef.current += 1;
    restoredFollowUpsForRef.current = null;
  }, [chatId]);
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
  const [switchingBot, setSwitchingBot] = useState(false);
  const botsDropdownRef = useRef(null);
  const [selectedBot, setSelectedBot] = useState(null);
  const selectableBots = useMemo(
    () => (Array.isArray(bots) ? bots.filter((b) => b && b.enabled !== false) : []),
    [bots],
  );
  const canSwitchBot = selectableBots.length > 1;
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
      const hasInstructions = String(data?.instructions || '').trim().length > 0;
      const hasRemembered = parseRememberedItems(String(data?.content || '')).length > 0;
      setPrivateHasData(Boolean(hasInstructions || hasRemembered));
      setHasPrivateInstructions(hasInstructions);
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

  const handleSelectBot = useCallback(async (bot) => {
    if (!bot?.id || switchingBot) return;
    if (selectedBot?.id && String(selectedBot.id) === String(bot.id)) {
      setIsBotsDropdownOpen(false);
      return;
    }
    if (bot.enabled === false) {
      showToast('บอทนี้ถูกปิดใช้งานแล้ว', 'warning');
      return;
    }
    setSwitchingBot(true);
    try {
      const documentId = bot.documentIds?.[0]
        || bot.documents?.[0]?.id
        || null;
      await chatAPI.setChatBot(chatId, bot.id, documentId);
      setSelectedBot(bot);
      setChatBotId(bot.id);
      setIsBotsDropdownOpen(false);
      showToast(`เปลี่ยนเป็น ${bot.name} แล้ว`, 'success');
    } catch (error) {
      showToast(getErrorMessage(error) || 'เปลี่ยนบอทไม่สำเร็จ', 'error');
    } finally {
      setSwitchingBot(false);
    }
  }, [chatId, selectedBot, switchingBot]);

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
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
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
    setMessagesError('');
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
    setMessagesLoading(true);
    setMessagesError('');
    try {
      const id = chatId != null ? String(chatId).trim() : '';
      if (!id || id === 'undefined' || id === 'null') {
        console.error('Invalid chat ID');
        setHasInitialized(true);
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
        const storedSuggestions = parseStoredJsonArray(msg.suggestions);
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
          ...(isBot && storedSuggestions.length ? { suggestions: storedSuggestions } : {}),
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
      setMessagesError(
        'โหลดข้อความในแชทนี้ไม่สำเร็จ ข้อความยังอยู่ในระบบ แต่ตอนนี้ดึงมาแสดงไม่ได้',
      );
      setHasInitialized(true);
    } finally {
      isLoadingMessagesRef.current = false;
      setMessagesLoading(false);
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

        // ข้อความแรกที่เป็น /จำ หรือ /สั่ง ต้องบันทึกเข้าคลังข้อมูลทันที (ไม่ส่งไปถามบอท)
        const firstPrivateCmd = parsePrivateCommand(firstMessage);
        if (firstPrivateCmd && privateModeRef.current) {
          if (!firstPrivateCmd.payload) {
            setMessages(prev => [
              ...prev,
              { id: `temp-user-${Date.now()}`, text: firstMessage, sender: 'user', timestamp: new Date() },
              {
                id: `temp-bot-cmd-empty-${Date.now()}`,
                text: firstPrivateCmd.kind === 'remember'
                  ? 'รูปแบบที่ถูกต้อง: /จำ <ข้อมูลที่ต้องการให้ AI จำ>'
                  : 'รูปแบบที่ถูกต้อง: /สั่ง <คำสั่งการตอบของ AI>',
                sender: 'bot',
                timestamp: new Date(),
              },
            ]);
            return;
          }
          setMessages(prev => [
            ...prev,
            { id: `temp-user-${Date.now()}`, text: firstMessage, sender: 'user', timestamp: new Date() },
            {
              id: `temp-bot-cmd-${Date.now()}`,
              text: firstPrivateCmd.kind === 'remember'
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
            const nextContent = firstPrivateCmd.kind === 'remember'
              ? [firstPrivateCmd.payload, String(current?.content || '').trim()].filter(Boolean).join('\n')
              : String(current?.content || '');
            // /สั่ง: เก็บเฉพาะคำสั่งล่าสุดเท่านั้น (แทนที่ของเดิม)
            const nextInstructions = firstPrivateCmd.kind === 'instruction'
              ? firstPrivateCmd.payload
              : String(current?.instructions || '');
            await privateContextAPI.save({
              content: nextContent.slice(0, maxChars),
              instructions: nextInstructions.slice(0, maxInstructionsChars),
              enabled: true,
            });
            await refreshPrivateMemory();
            setSuccessMessage(firstPrivateCmd.kind === 'remember' ? 'จำข้อมูลให้แล้ว' : 'อัปเดตคำสั่งล่าสุดแล้ว (แทนของเดิม)');
            setTimeout(() => setSuccessMessage(null), 2200);
          } catch (err) {
            setErrorMessage(getErrorMessage(err) || 'บันทึกคำสั่งส่วนตัวไม่สำเร็จ');
            const t = setTimeout(() => setErrorMessage(null), 4000);
            timeoutRefs.current.privateCmdFirstMessage = t;
          }
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
              loadMessages().then(() => {
                window.dispatchEvent(new CustomEvent('chatsUpdated'));
                fetchFollowUpSuggestions(
                  firstMessage,
                  (data?.reply ?? streamTextRef.current ?? '').trim(),
                  data?.messageId || null,
                );
              });
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
            window.dispatchEvent(new CustomEvent('chatsUpdated'));
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

  const handleSendMessage = async (e, overrideMessage = null, options = {}) => {
    e.preventDefault();
    const shouldClearComposer = overrideMessage == null;
    const replaceFromMessageId = options?.replaceFromMessageId || null;
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
    // ล้างคำถามต่อเนื่องชุดเดิม + ยกเลิกผลของคำขอที่ยังค้างอยู่
    setAiFollowUps([]);
    setFollowUpsLoading(false);
    setFollowUpsReady(false);
    restoredFollowUpsForRef.current = null;
    followUpRequestIdRef.current += 1;
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
            ? 'บันทึกในโหมดส่วนตัวแล้ว — ใช้เฉพาะโหมดส่วนตัวของคุณ (ไม่กระทบคำตอบโหมดปกติจากเอกสารระบบ) ถามต่อได้เลย'
            : 'บันทึกคำสั่ง AI แล้ว ระบบจะใช้รูปแบบนี้ในการตอบถัดไป (เฉพาะโหมดส่วนตัว)',
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
        // /สั่ง: เก็บเฉพาะคำสั่งล่าสุดเท่านั้น (แทนที่ของเดิม)
        const nextInstructions = privateCmd.kind === 'instruction'
          ? privateCmd.payload
          : String(current?.instructions || '');
        await privateContextAPI.save({
          content: nextContent.slice(0, maxChars),
          instructions: nextInstructions.slice(0, maxInstructionsChars),
          enabled: true,
        });
        await refreshPrivateMemory();
        setSuccessMessage(privateCmd.kind === 'remember' ? 'จำข้อมูลให้แล้ว' : 'อัปเดตคำสั่งล่าสุดแล้ว (แทนของเดิม)');
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
    setMessages(prev => {
      const base = replaceFromMessageId
        ? (() => {
            const idx = prev.findIndex((m) => m.id === replaceFromMessageId);
            return idx >= 0 ? prev.slice(0, idx) : prev;
          })()
        : prev;
      return [...base, userMsg, botMsgPlaceholder];
    });
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
          loadMessages().then(() => {
            // ให้ sidebar อัปเดตชื่อ/ลำดับแชท (ชื่อถูกตั้งจากข้อความแรกฝั่ง backend)
            window.dispatchEvent(new CustomEvent('chatsUpdated'));
            fetchFollowUpSuggestions(
              outboundText,
              (data?.reply ?? streamTextRef.current ?? '').trim(),
              data?.messageId || null,
            );
          });
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
        window.dispatchEvent(new CustomEvent('chatsUpdated'));
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
  // บันทึกการแก้ → แทนข้อความเก่า (ตัดคำตอบและข้อความถัดไป) แล้วส่งใหม่เหมือน Gemini
  const handleResendEditedUserMessage = async () => {
    const text = (editingUserText || '').trim();
    const editId = editingUserMsgId;
    if (!text || !editId || isTyping) return;

    // ตัดใน DB ก่อน เพื่อไม่ให้ history ของโมเดลเห็น branch เก่า
    if (chatId && !String(editId).startsWith('temp-')) {
      try {
        await chatMessageAPI.truncateFromMessage(chatId, editId);
      } catch (err) {
        setErrorMessage(getErrorMessage(err) || 'ไม่สามารถแทนข้อความเก่าได้');
        const t = setTimeout(() => setErrorMessage(null), 4000);
        timeoutRefs.current.truncateEdit = t;
        return;
      }
    }

    setEditingUserMsgId(null);
    setEditingUserText('');
    handleSendMessage({ preventDefault: () => {} }, text, { replaceFromMessageId: editId });
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

  // ทำซ้ำ: หาคำถามผู้ใช้ก่อนหน้าคำตอบบอทนี้ แล้วส่งซ้ำเพื่อให้ได้คำตอบใหม่
  const handleRegenerate = (botMessage) => {
    if (isTyping) return;
    const idx = messages.findIndex((m) => m.id === botMessage.id);
    const question = idx >= 0 ? getPreviousUserQuestion(idx) : '';
    if (!question) {
      setErrorMessage('ไม่พบคำถามก่อนหน้าสำหรับทำซ้ำ');
      const t = setTimeout(() => setErrorMessage(null), 2500);
      timeoutRefs.current.regenerate = t;
      return;
    }
    handleSendMessage({ preventDefault: () => {} }, question);
  };

  const openSourceReference = async (message, ref) => {
    if (!ENABLE_SOURCE_REFERENCES) return;
    if (!message || !ref?.docId) return;
    if (String(ref.docId) === '__private__') {
      setSourceModalData({
        docId: '__private__',
        displayName: ref.displayName || 'เนื้อหาส่วนตัวของคุณ',
        positions: [],
        chunks: [],
        isPrivate: true,
        privateLoading: true,
        privateItems: [],
        privateInstructions: '',
      });
      setIsSourceModalOpen(true);
      try {
        const data = await privateContextAPI.get();
        const items = parseRememberedItems(String(data?.content || ''));
        const instructions = String(data?.instructions || '').trim();
        setSourceModalData((prev) => (
          prev && prev.docId === '__private__'
            ? {
                ...prev,
                privateLoading: false,
                privateItems: items,
                privateInstructions: instructions,
              }
            : prev
        ));
      } catch (_) {
        setSourceModalData((prev) => (
          prev && prev.docId === '__private__'
            ? { ...prev, privateLoading: false, privateLoadError: true }
            : prev
        ));
      }
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
      originals: [],
      originalsLoading: true,
    });
    setIsSourceModalOpen(true);

    try {
      const doc = await knowledgeAPI.get(ref.docId);
      let rawSourceFiles = doc?.sourceFiles;
      if (typeof rawSourceFiles === 'string') {
        try { rawSourceFiles = JSON.parse(rawSourceFiles); } catch { rawSourceFiles = []; }
      }
      const files = Array.isArray(rawSourceFiles) ? rawSourceFiles : [];
      const chunkFileNames = new Set(
        parseStoredJsonArray(message.groundingChunks)
          .map((chunk) => String(chunk?.retrievedContext?.title || chunk?.payload?.fileName || '').trim())
          .filter(Boolean)
      );
      const originals = files
        .map((f, index) => ({
          index,
          name: f.originalName || f.name || f.fileName || `ไฟล์ ${index + 1}`,
          type: f.originalType || f.type || '',
          hasOriginal: Boolean(f.storage || f.hasOriginal),
        }))
        .filter((f) => f.hasOriginal)
        .sort((a, b) => {
          const aHit = chunkFileNames.has(a.name) ? 0 : 1;
          const bHit = chunkFileNames.has(b.name) ? 0 : 1;
          return aHit - bHit;
        });

      // การ์ดที่ไม่มีช่วงข้อความ (เช่น คำถาม "มีเอกสารอะไรบ้าง") = ตั้งใจดูรายชื่อไฟล์ จึงโชว์ครบ
      // ส่วนคำตอบปกติโชว์แค่ไฟล์ที่เกี่ยวข้องต้นๆ กันรายการยาวบังช่วงข้อความที่ใช้ตอบ
      const isDocumentOverview =
        relatedChunks.length === 0 && !(Array.isArray(ref.positions) && ref.positions.length > 0);
      // รายการอย่างเดียว — ไม่โหลดพรีวิวจนผู้ใช้กด Preview
      const listed = originals.slice(0, isDocumentOverview ? 50 : 3).map((item) => ({
        ...item,
        isPdf: /\.pdf$/i.test(item.name) || /pdf/i.test(item.type),
      }));

      setSourceModalData((prev) => (
        prev && String(prev.docId) === String(ref.docId)
          ? { ...prev, originals: listed, originalsLoading: false }
          : prev
      ));
    } catch (_) {
      setSourceModalData((prev) => (
        prev && String(prev.docId) === String(ref.docId)
          ? { ...prev, originals: [], originalsLoading: false }
          : prev
      ));
    }
  };

  const DOCUMENT_SCOPE_FOLLOWUPS = [
    'มีเอกสารอะไรบ้าง',
    'สรุปภาพรวมเอกสารที่เลือก',
    'ถามเรื่องราคา ส่วนลด หรืออำนาจอนุมัติได้ไหม',
  ];

  const isOutOfDocumentScopeReply = (text) =>
    /นอกขอบเขต|ยังไม่พบข้อมูลที่ตรงจากเอกสาร|ไม่สามารถยืนยันคำตอบได้|ตอบได้เฉพาะ.*(เอกสาร|ชุดความรู้)/.test(
      String(text || ''),
    );

  /** ขอคำถามต่อเนื่องจาก AI หลังบอทตอบเสร็จ — ถ้าคำขอเก่ากว่าล่าสุดจะทิ้งผลไป (กัน race) */
  const fetchFollowUpSuggestions = async (question, answer, messageId = null) => {
    const replyText = String(answer || '').trim();
    const questionText = String(question || '').trim();
    if (!replyText || questionText.startsWith('/')) {
      setFollowUpsLoading(false);
      setFollowUpsReady(true);
      return;
    }
    const requestId = ++followUpRequestIdRef.current;
    setFollowUpsLoading(true);
    setFollowUpsReady(false);
    const finish = (items, botMessageId) => {
      if (followUpRequestIdRef.current !== requestId) return;
      const list = mergePrivateOrderStarters(items || [], {
        privateMode: privateModeRef.current,
        hasInstructions: hasPrivateInstructions,
      });
      setAiFollowUps(list);
      if (botMessageId && list.length > 0) {
        setMessages((prev) => prev.map((m) => (
          m.id === botMessageId ? { ...m, suggestions: list } : m
        )));
      }
      setFollowUpsLoading(false);
      setFollowUpsReady(true);
    };
    // นอกขอบเขต: ไม่ต่อยอดจากคำถามนอกกรอบ — เสนอให้ถามในเอกสารแทน
    if (isOutOfDocumentScopeReply(replyText)) {
      try {
        const saved = await chatMessageAPI.getFollowUpSuggestions(
          chatId,
          questionText,
          replyText,
          messageId,
        );
        finish(
          Array.isArray(saved) && saved.length > 0 ? saved : DOCUMENT_SCOPE_FOLLOWUPS,
          messageId,
        );
      } catch {
        finish(DOCUMENT_SCOPE_FOLLOWUPS, messageId);
      }
      return;
    }
    try {
      const items = await chatMessageAPI.getFollowUpSuggestions(
        chatId,
        questionText,
        replyText,
        messageId,
      );
      if (Array.isArray(items) && items.length > 0) {
        finish(items, messageId);
      } else if (privateModeRef.current && !hasPrivateInstructions) {
        finish(PRIVATE_ORDER_STARTERS.slice(0, 2), messageId);
      } else {
        finish([], messageId);
      }
    } catch {
      finish([], messageId);
    }
  };

  // เปิดแชทเก่า: ใช้ชิปที่บันทึกไว้ — ถ้ายังไม่มีให้สร้างใหม่แล้วบันทึก
  useEffect(() => {
    if (!hasInitialized || isTyping || !chatId) return;
    let lastBotIdx = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.sender === 'bot') {
        lastBotIdx = i;
        break;
      }
    }
    if (lastBotIdx < 0) return;
    const lastBot = messages[lastBotIdx];
    if (!lastBot?.id || String(lastBot.id).startsWith('temp-')) return;
    if (restoredFollowUpsForRef.current === lastBot.id) return;
    restoredFollowUpsForRef.current = lastBot.id;

    const stored = Array.isArray(lastBot.suggestions)
      ? lastBot.suggestions.map((s) => String(s || '').trim()).filter(Boolean)
      : [];
    if (stored.length > 0) {
      setAiFollowUps(stored);
      setFollowUpsLoading(false);
      setFollowUpsReady(true);
      return;
    }

    let prevUserText = '';
    for (let i = lastBotIdx - 1; i >= 0; i -= 1) {
      if (messages[i]?.sender === 'user') {
        prevUserText = String(messages[i].text || '').trim();
        break;
      }
    }
    fetchFollowUpSuggestions(prevUserText, lastBot.text, lastBot.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- เรียกครั้งเดียวต่อข้อความบอทล่าสุด
  }, [hasInitialized, chatId, messages, isTyping]);

  const handleEditFollowUp = (question) => {
    setChatInput(String(question || ''));
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
      adjustTextareaHeight();
    });
  };

  const getSuggestedFollowUps = (botText, userQuestion = '') => {
    const text = String(botText || '').trim();
    const question = String(userQuestion || '').trim();
    if (!text) return ['อธิบายเพิ่มเติม', 'ขออ้างอิงที่มา'];

    if (/^ผู้อนุมัติ\s*:/i.test(text) || /ผู้อนุมัติ|อำนาจอนุมัติ|ใครอนุมัติ/.test(question)) {
      return ['ดูรายละเอียดเพิ่มเติม', 'ขออ้างอิงข้อที่เกี่ยวข้อง'];
    }
    if (isOutOfDocumentScopeReply(text) || /นอกขอบเขต/.test(text)) {
      return DOCUMENT_SCOPE_FOLLOWUPS;
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
      <Sidebar
        onCollapseChange={setIsSidebarCollapsed}
        privateWorkspace={privateMode}
        showMemoryControl={privateMode}
      />

      {/* Main Content */}
      {/* จอเล็ก sidebar ที่หุบเป็น overlay (w-0) จึงต้องเว้นที่ให้ปุ่มขยายลอย ส่วนจอ md ขึ้นไป rail กินพื้นที่จริงอยู่แล้ว */}
      <main className={`flex-1 min-w-0 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-16 md:pl-0' : ''}`}>
        <AnnouncementBanner />
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
            canSwitchBot ? (
              <div className='relative min-w-0' ref={botsDropdownRef}>
                <button
                  type='button'
                  onClick={() => !switchingBot && setIsBotsDropdownOpen((open) => !open)}
                  disabled={switchingBot || isTyping}
                  className='flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 min-w-0 max-w-[min(100vw-12rem,22rem)] disabled:opacity-60'
                  title='เลือกบอท'
                >
                  <span
                    className='font-medium truncate'
                    title={typeof selectedBot === 'object' ? selectedBot.name : String(selectedBot)}
                  >
                    {typeof selectedBot === 'object' ? selectedBot.name : String(selectedBot)}
                  </span>
                  <HiChevronDown
                    className={`text-base text-gray-500 shrink-0 transition-transform ${
                      isBotsDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isBotsDropdownOpen && (
                  <div className='absolute right-0 mt-1 w-72 max-w-[min(100vw-2rem,22rem)] rounded-lg border border-gray-200 bg-white shadow-lg z-40 py-1 max-h-64 overflow-y-auto'>
                    {selectableBots.map((bot) => {
                      const active = selectedBot?.id && String(selectedBot.id) === String(bot.id);
                      return (
                        <button
                          key={bot.id}
                          type='button'
                          onClick={() => handleSelectBot(bot)}
                          className={`w-full text-left px-3 py-2.5 text-sm hover:bg-yellow-50 ${
                            active ? 'bg-yellow-50 text-gray-900 font-semibold' : 'text-gray-700'
                          }`}
                        >
                          <div className='truncate'>{bot.name}</div>
                          {bot.isOwned ? (
                            <div className='text-[11px] text-gray-500 mt-0.5'>บอทของฉัน</div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className='flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-700 min-w-0'>
                <span
                  className='font-medium whitespace-nowrap'
                  title={typeof selectedBot === 'object' ? selectedBot.name : String(selectedBot)}
                >
                  {typeof selectedBot === 'object' ? selectedBot.name : String(selectedBot)}
                </span>
              </div>
            )
          ) : null}
          </div>
        </div>

        <ChatMessageList
          messagesContainerRef={messagesContainerRef}
          messagesEndRef={messagesEndRef}
          messages={messages}
          selectedBot={selectedBot}
          messagesLoading={messagesLoading || !hasInitialized}
          messagesError={messagesError}
          onRetryLoadMessages={loadMessages}
          isTyping={isTyping}
          typingStage={typingStage}
          streamTextRef={streamTextRef}
          streamBotIdRef={streamBotIdRef}
          userAvatarUrl={userAvatarUrl}
          isSelectingText={isSelectingText}
          setIsSelectingText={setIsSelectingText}
          hoveredMessageId={hoveredMessageId}
          setHoveredMessageId={setHoveredMessageId}
          tooltipPosition={tooltipPosition}
          setTooltipPosition={setTooltipPosition}
          editingUserMsgId={editingUserMsgId}
          editingUserText={editingUserText}
          setEditingUserText={setEditingUserText}
          handleResendEditedUserMessage={handleResendEditedUserMessage}
          handleCancelUserEdit={handleCancelUserEdit}
          handleStartEdit={handleStartEdit}
          handleFeedback={handleFeedback}
          handleRegenerate={handleRegenerate}
          handleStartUserEdit={handleStartUserEdit}
          handleCopyMessage={handleCopyMessage}
          feedbackByMessageId={feedbackByMessageId}
          copiedMessageId={copiedMessageId}
          isHelpChat={isHelpChat}
          getPreviousUserQuestion={getPreviousUserQuestion}
          getSuggestedFollowUps={getSuggestedFollowUps}
          aiFollowUps={aiFollowUps}
          followUpsLoading={followUpsLoading}
          followUpsReady={followUpsReady}
          privateMode={privateMode}
          hasPrivateInstructions={hasPrivateInstructions}
          handleSendMessage={handleSendMessage}
          handleSuggestedFollowUpClick={handleSuggestedFollowUpClick}
          handleEditFollowUp={handleEditFollowUp}
          openSourceReference={openSourceReference}
        />

        <ChatComposer
          showScrollDown={showScrollDown}
          scrollToBottom={scrollToBottom}
          setShowScrollDown={setShowScrollDown}
          selectedBot={selectedBot}
          isHelpChat={isHelpChat}
          privateMode={privateMode}
          usePrivateContent={usePrivateContent}
          setUsePrivateContent={setUsePrivateContent}
          navigate={navigate}
          handleSendMessage={handleSendMessage}
          privateCmdMenuOpen={privateCmdMenuOpen}
          setPrivateCmdMenuOpen={setPrivateCmdMenuOpen}
          composerPrivateCommand={composerPrivateCommand}
          setComposerPrivateCommand={setComposerPrivateCommand}
          textareaRef={textareaRef}
          chatInput={chatInput}
          setChatInput={setChatInput}
          adjustTextareaHeight={adjustTextareaHeight}
          answerMode={answerMode}
          modeMenuOpen={modeMenuOpen}
          setModeMenuOpen={setModeMenuOpen}
          selectAnswerMode={selectAnswerMode}
          isTyping={isTyping}
          handleStopStreaming={handleStopStreaming}
        />
      </main>

      <CitationModal
        isSourceModalOpen={isSourceModalOpen}
        sourceModalData={sourceModalData}
        originalPreviewPopup={originalPreviewPopup}
        setOriginalPreviewPopup={setOriginalPreviewPopup}
        setIsSourceModalOpen={setIsSourceModalOpen}
      />

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
