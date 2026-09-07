import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  HiOutlinePaperAirplane,
  HiLockClosed,
  HiX,
  HiPlus,
  HiChevronDown,
} from 'react-icons/hi';
import Sidebar from '../components/Sidebar';
import AnnouncementBanner from '../components/AnnouncementBanner';
import { showToast } from '../components/ToastNotification';
import { chatAPI, botAPI, privateContextAPI } from '../services/api';
import { useSystemConfig } from '../context/SystemConfigContext';

const OFFICIAL_BOT_DESCRIPTION = 'ค้นหาข้อมูลจากเอกสารที่มีในระบบ และตอบคำถามตามเนื้อหาในเอกสารนั้น พร้อมระบุแหล่งอ้างอิงให้ตรวจสอบได้';
const LEGACY_BOT_DESCRIPTION = 'บอทผู้ช่วยประจำระบบ';
const LEGACY_OFFICIAL_BOT_DESCRIPTION = 'ระบบผู้ช่วยอัจฉริยะสำหรับตอบคำถามและวิเคราะห์ข้อมูลจากฐานความรู้อย่างเป็นระบบ โดยมุ่งเน้นความถูกต้อง รวดเร็ว และความน่าเชื่อถือของข้อมูล';
const isDefaultBotDescription = (value) => {
  const text = String(value || '').trim();
  return !text || text === LEGACY_BOT_DESCRIPTION || text === LEGACY_OFFICIAL_BOT_DESCRIPTION;
};
const isCorruptedText = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  const qCount = (text.match(/\?/g) || []).length;
  return qCount >= 3 && qCount / Math.max(1, text.length) > 0.25;
};

const parsePrivateCommand = (text) => {
  const raw = String(text || '').trim();
  const slash = raw.match(/^\/(จำ|สั่ง)\s*([\s\S]*)$/);
  if (slash) {
    return { kind: slash[1] === 'จำ' ? 'remember' : 'instruction', payload: String(slash[2] || '').trim() };
  }
  const soft = raw.match(/^(?:จำไว้ว่า|จำว่า|ขอให้จำ(?:ว่า)?|ให้จำว่า)\s+([\s\S]+)$/i);
  if (soft && String(soft[1] || '').trim().length >= 4) {
    return { kind: 'remember', payload: String(soft[1] || '').trim() };
  }
  return null;
};

// รูปแบบจัดเก็บ 1 บรรทัด = 1 ความจำ โดยหัวข้อ (ถ้ามี) คั่นด้วย [[...]] ที่ต้นบรรทัด
const MEMORY_TITLE_PATTERN = /^\[\[([^\]]*)\]\]\s*([\s\S]*)$/;

const parseRememberedItems = (content) =>
  String(content || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(MEMORY_TITLE_PATTERN);
      if (!m) return { title: '', body: line };
      return { title: m[1].trim(), body: String(m[2] || '').trim() };
    })
    .filter((item) => item.title || item.body);

const serializeRememberedItems = (items) =>
  items
    .map(({ title, body }) => {
      const cleanTitle = String(title || '').replace(/[[\]\n]/g, '').trim();
      const cleanBody = String(body || '').replace(/\n/g, ' ').trim();
      if (!cleanTitle) return cleanBody;
      return `[[${cleanTitle}]] ${cleanBody}`.trim();
    })
    .filter(Boolean)
    .join('\n');

function Homepage({ privateMode = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { getCopy, getTextStyle, logoSrc, appName, menuEnabled } = useSystemConfig();
  const homepageTitle = getCopy('user.homepage.title', `Welcome to ${appName}`);
  const homepageDescription = getCopy('user.homepage.description', OFFICIAL_BOT_DESCRIPTION);
  const homepagePlaceholder = getCopy(
    'user.homepage.placeholder',
    'ถามเกี่ยวกับเอกสารในระบบ เช่น "อัตราค่าบริการ NT Corporate Internet"',
  );
  const homepageTitleStyle = getTextStyle('user.homepage.title');
  const homepageDescriptionStyle = getTextStyle('user.homepage.description');
  const homepagePlaceholderStyle = getTextStyle('user.homepage.placeholder');
  const privateTitle = getCopy('user.private.title', 'Personal — ถามจากเนื้อหาของคุณเอง');
  const privateBannerTitle = getCopy('user.private.bannerTitle', 'Personal');
  const privateBannerBody = getCopy(
    'user.private.bannerBody',
    'ใช้ข้อมูลของท่านเองได้ โดยไม่กระทบเอกสารระบบหรือผู้ใช้อื่น',
  );
  const privatePlaceholder = getCopy(
    'user.private.placeholder',
    'พิมพ์ข้อความ... หรือใช้ /จำ ข้อมูล และ /สั่ง คำสั่ง AI',
  );
  const privateTitleStyle = getTextStyle('user.private.title');
  const privateBannerTitleStyle = getTextStyle('user.private.bannerTitle');
  const privateBannerBodyStyle = getTextStyle('user.private.bannerBody');
  const privatePlaceholderStyle = getTextStyle('user.private.placeholder');

  useEffect(() => {
    if (privateMode && !menuEnabled('private')) {
      navigate('/homepage', { replace: true });
    }
  }, [privateMode, menuEnabled, navigate]);

  const [selectedBot, setSelectedBot] = useState(null); // This is the dropdown value (string)
  const [selectedBotObject, setSelectedBotObject] = useState(null); // This is the full bot object
  const [isBotsDropdownOpen, setIsBotsDropdownOpen] = useState(false);
  const botsDropdownRef = useRef(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [botOptions, setBotOptions] = useState([]);
  const [botsList, setBotsList] = useState([]); // Store full bots list
  const [botsLoading, setBotsLoading] = useState(true);
  const [botsLoadFailed, setBotsLoadFailed] = useState(false);
  const reloadBotsRef = useRef(null);
  // โหมดส่วนตัว: แสดงเพียงสถานะว่ามีข้อมูลตั้งไว้แล้วหรือยัง (จัดการผ่าน /จำ และ /สั่ง ในแชท)
  const [privateHasData, setPrivateHasData] = useState(false);
  const [privateInstructionsText, setPrivateInstructionsText] = useState('');
  const [privateRememberItems, setPrivateRememberItems] = useState([]);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [memoryConfirm, setMemoryConfirm] = useState(null);
  const [memorySearch, setMemorySearch] = useState('');
  const [memoryMaxChars, setMemoryMaxChars] = useState(12000);
  const [memoryMaxInstructionsChars, setMemoryMaxInstructionsChars] = useState(2000);
  const [editingInstruction, setEditingInstruction] = useState(false);
  const [instructionDraft, setInstructionDraft] = useState('');
  const [editingMemoryIndex, setEditingMemoryIndex] = useState(null);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryTitleDraft, setMemoryTitleDraft] = useState('');
  const [editingTitleIndex, setEditingTitleIndex] = useState(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [addingMemory, setAddingMemory] = useState(false);
  const [newMemoryDraft, setNewMemoryDraft] = useState('');
  const [newMemoryTitleDraft, setNewMemoryTitleDraft] = useState('');
  const [composerPrivateCommand, setComposerPrivateCommand] = useState(null); // 'remember' | 'instruction' | null
  const [privateCmdMenuOpen, setPrivateCmdMenuOpen] = useState(false);

  const refreshPrivateMemory = useCallback(async () => {
    const data = await privateContextAPI.get();
    const instructions = String(data?.instructions || '').trim();
    const remembered = parseRememberedItems(String(data?.content || ''));
    setMemoryMaxChars(Number.isFinite(data?.maxChars) ? Number(data.maxChars) : 12000);
    setMemoryMaxInstructionsChars(Number.isFinite(data?.maxInstructionsChars) ? Number(data.maxInstructionsChars) : 2000);
    setPrivateInstructionsText(instructions);
    setPrivateRememberItems(remembered);
    setPrivateHasData(Boolean(instructions || remembered.length));
  }, []);

  const openMemoryModal = useCallback(async () => {
    if (!privateMode) return;
    try {
      await refreshPrivateMemory();
    } catch (_) {
      // ignore and show last known state
    }
    setEditingInstruction(false);
    setEditingMemoryIndex(null);
    setEditingTitleIndex(null);
    setInstructionDraft('');
    setMemoryDraft('');
    setMemoryTitleDraft('');
    setTitleDraft('');
    setAddingMemory(false);
    setNewMemoryDraft('');
    setNewMemoryTitleDraft('');
    setMemorySearch('');
    setIsMemoryModalOpen(true);
  }, [privateMode, refreshPrivateMemory]);

  const handleStartInstructionEdit = () => {
    setEditingInstruction(true);
    setInstructionDraft(privateInstructionsText || '');
  };

  const handleSaveInstruction = async () => {
    try {
      await privateContextAPI.save({
        instructions: String(instructionDraft || '').trim().slice(0, memoryMaxInstructionsChars),
        enabled: true,
      });
      await refreshPrivateMemory();
      setEditingInstruction(false);
      showToast('บันทึกคำสั่งแล้ว', 'success');
    } catch (error) {
      showToast('บันทึกคำสั่งไม่สำเร็จ', 'error');
    }
  };

  const handleDeleteInstruction = async () => {
    try {
      await privateContextAPI.save({ instructions: '', enabled: true });
      await refreshPrivateMemory();
      setEditingInstruction(false);
      showToast('ลบคำสั่งแล้ว', 'success');
    } catch (error) {
      showToast('ลบคำสั่งไม่สำเร็จ', 'error');
    }
  };

  const saveRememberedItems = async (items) => {
    await privateContextAPI.save({
      content: serializeRememberedItems(items).slice(0, memoryMaxChars),
      enabled: true,
    });
    await refreshPrivateMemory();
  };

  const handleStartMemoryEdit = (index) => {
    setAddingMemory(false);
    setEditingTitleIndex(null);
    setEditingMemoryIndex(index);
    setMemoryDraft(privateRememberItems[index]?.body || '');
    setMemoryTitleDraft(privateRememberItems[index]?.title || '');
  };

  const handleAddMemoryItem = async () => {
    const body = String(newMemoryDraft || '').trim();
    if (!body) return;
    try {
      await saveRememberedItems([
        ...privateRememberItems,
        { title: String(newMemoryTitleDraft || '').trim(), body },
      ]);
      setAddingMemory(false);
      setNewMemoryDraft('');
      setNewMemoryTitleDraft('');
      showToast('เพิ่มความจำแล้ว', 'success');
    } catch (error) {
      showToast('เพิ่มความจำไม่สำเร็จ', 'error');
    }
  };

  const handleSaveMemoryItem = async (index) => {
    const nextItems = privateRememberItems.map((item, i) =>
      i === index
        ? { title: String(memoryTitleDraft || '').trim(), body: String(memoryDraft || '').trim() }
        : item,
    );
    try {
      await saveRememberedItems(nextItems);
      setEditingMemoryIndex(null);
      setMemoryDraft('');
      setMemoryTitleDraft('');
      showToast('บันทึกความจำแล้ว', 'success');
    } catch (error) {
      showToast('บันทึกความจำไม่สำเร็จ', 'error');
    }
  };

  const handleStartTitleEdit = (index) => {
    setEditingTitleIndex(index);
    setTitleDraft(privateRememberItems[index]?.title || '');
  };

  const handleSaveTitle = async (index) => {
    const nextTitle = String(titleDraft || '').trim();
    if (nextTitle === (privateRememberItems[index]?.title || '')) {
      setEditingTitleIndex(null);
      return;
    }
    const nextItems = privateRememberItems.map((item, i) => (i === index ? { ...item, title: nextTitle } : item));
    try {
      await saveRememberedItems(nextItems);
      setEditingTitleIndex(null);
      setTitleDraft('');
      showToast('เปลี่ยนชื่อหัวข้อแล้ว', 'success');
    } catch (error) {
      showToast('เปลี่ยนชื่อหัวข้อไม่สำเร็จ', 'error');
    }
  };

  const handleConfirmMemoryDelete = async () => {
    if (!memoryConfirm) return;
    const target = memoryConfirm;
    setMemoryConfirm(null);
    if (target.type === 'instruction') {
      await handleDeleteInstruction();
    } else {
      await handleDeleteMemoryItem(target.index);
    }
  };

  const handleDeleteMemoryItem = async (index) => {
    const nextItems = privateRememberItems.filter((_, i) => i !== index);
    try {
      await saveRememberedItems(nextItems);
      if (editingMemoryIndex === index) {
        setEditingMemoryIndex(null);
        setMemoryDraft('');
        setMemoryTitleDraft('');
      }
      if (editingTitleIndex === index) {
        setEditingTitleIndex(null);
        setTitleDraft('');
      }
      showToast('ลบความจำแล้ว', 'success');
    } catch (error) {
      showToast('ลบความจำไม่สำเร็จ', 'error');
    }
  };

  useEffect(() => {
    if (!privateMode) return;
    let cancelled = false;
    (async () => {
      try {
        await refreshPrivateMemory();
      } catch (_) {
        if (!cancelled) setPrivateHasData(false);
      }
    })();
    return () => { cancelled = true; };
  }, [privateMode, refreshPrivateMemory]);

  useEffect(() => {
    if (!privateMode) return;
    if (!location.state?.openMemory) return;
    openMemoryModal();
    navigate('/private', { replace: true, state: { privateMode: true } });
  }, [privateMode, location.state, openMemoryModal, navigate]);

  // ฟังก์ชันสำหรับสร้างแชทใหม่ (backend ใช้ conversations: ต้องมี documentId + botId)
  const createNewChat = async (firstMessage) => {
    if (!selectedBot || !selectedBotObject) {
      showToast('กรุณาเลือก Bot ก่อนเริ่มแชท', 'warning');
      return;
    }

    const documentId = selectedBotObject.documentIds?.[0]
      || selectedBotObject.documents?.[0]?.id
      || (Array.isArray(selectedBotObject.documents) && selectedBotObject.documents[0]?.id);
    if (!documentId) {
      showToast('บอทนี้ยังไม่มี Knowledge กรุณาเพิ่ม Knowledge ให้บอทก่อน', 'warning');
      return;
    }

    try {
      let chatName = null;
      if (firstMessage && typeof firstMessage === 'string' && firstMessage.trim()) {
        const sanitizedName = firstMessage
          .trim()
          .replace(/[<>]/g, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+=/gi, '')
          .substring(0, 50);
        if (sanitizedName) {
          chatName = sanitizedName;
          if (firstMessage.length > 50) chatName += '...';
        }
      }

      const newChat = await chatAPI.createChat(chatName, [], selectedBotObject.id, documentId, privateMode);

      window.dispatchEvent(new CustomEvent('chatsUpdated'));

      navigate(`/chat/${newChat.id}`, {
        state: {
          firstMessage: firstMessage?.trim(),
          selectedBot: selectedBotObject,
          privateMode,
        },
      });
    } catch (error) {
      console.error('Error creating chat:', error);
      const msg = error?.response?.data?.error || error?.message || 'ไม่สามารถสร้างแชทใหม่ได้ กรุณาลองอีกครั้ง';
      showToast(msg, 'error');
      throw error;
    }
  };

  // ฟังก์ชันสำหรับจัดการการส่งข้อความ
  const handleSendMessage = (e) => {
    e.preventDefault();
    const trimmedInput = chatInput.trim();
    if (trimmedInput) {
      // Sanitize และจำกัดความยาวข้อความ
      const prefix = composerPrivateCommand === 'remember' ? '/จำ' : composerPrivateCommand === 'instruction' ? '/สั่ง' : '';
      const composed = prefix ? `${prefix} ${trimmedInput}` : trimmedInput;
      const sanitizedMessage = composed.substring(0, 1000);
      setChatInput('');
      setComposerPrivateCommand(null);
      createNewChat(sanitizedMessage);
    }
  };

  // โหลด bots จาก API
  useEffect(() => {
    const loadBots = async () => {
      setBotsLoading(true);
      setBotsLoadFailed(false);
      try {
        const botsData = await botAPI.getBots();
        
        // Transform bots data to dropdown options format
        if (Array.isArray(botsData)) {
          // Extract documentIds from documents array if needed
          const processedBots = botsData
            .filter(bot => bot && bot.id && bot.name)
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
          
          // Store full bots list (all bots)
          setBotsList(processedBots);
          
          // Filter only enabled bots for dropdown options
          const enabledBots = processedBots.filter(bot => bot.enabled !== false);
          
          // Create dropdown options (only enabled bots)
          const options = enabledBots.map(bot => ({
            value: bot.id.toString(),
            label: bot.name
          }));
          setBotOptions(options);
        } else {
          setBotOptions([]);
          setBotsList([]);
        }
      } catch (error) {
        console.error('Error loading bots:', error);
        setBotOptions([]);
        setBotsList([]);
        setBotsLoadFailed(true);
      } finally {
        setBotsLoading(false);
      }
    };

    loadBots();
    reloadBotsRef.current = loadBots;
  }, []);

  // เลือกบอทอัตโนมัติเมื่อยังไม่ได้เลือก — ถ้ามีหลายตัว เลือกบอทระบบก่อน
  useEffect(() => {
    if (selectedBot || botOptions.length === 0) return;
    const defaultOpt =
      botOptions.find((o) => o.label === 'Enterprise AI Chatbot Assistant') || botOptions[0];
    setSelectedBot(String(defaultOpt.value));
  }, [botOptions, selectedBot]);

  // Update selectedBotObject when selectedBot (dropdown value) changes
  useEffect(() => {
    if (selectedBot && botsList.length > 0) {
      // Find bot and check if it's enabled
      const bot = botsList.find(b => b.id.toString() === selectedBot.toString());
      if (bot) {
        if (bot.enabled !== false) {
          setSelectedBotObject(bot);
        } else {
          // Bot is inactive, clear selection
          setSelectedBotObject(null);
          setSelectedBot(null);
          showToast('Bot นี้ถูก inactive แล้ว กรุณาเลือก Bot อื่น', 'warning');
        }
      } else {
        setSelectedBotObject(null);
      }
    } else {
      setSelectedBotObject(null);
    }
  }, [selectedBot, botsList]);

  useEffect(() => {
    if (!isBotsDropdownOpen) return undefined;
    const handleClickOutside = (event) => {
      if (botsDropdownRef.current && !botsDropdownRef.current.contains(event.target)) {
        setIsBotsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isBotsDropdownOpen]);

  const canSwitchBot = botOptions.length > 1;
  const typedPrivateCommand = composerPrivateCommand;

  return (
    <div className='flex h-screen bg-[#f7f7f8] relative'>
    {/* Sidebar Component */}
    <Sidebar
      onCollapseChange={setIsSidebarCollapsed}
      privateWorkspace={privateMode}
      showMemoryControl={privateMode}
      onMemoryClick={openMemoryModal}
    />

    {/* Main Content */}
    {/* จอเล็ก sidebar ที่หุบเป็น overlay (w-0) จึงต้องเว้นที่ให้ปุ่มขยายลอย ส่วนจอ md ขึ้นไป rail กินพื้นที่จริงอยู่แล้ว */}
    <main className={`flex-1 min-w-0 bg-[#f7f7f8] px-8 py-6 overflow-auto flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-16 md:pl-8' : ''}`}>
      <div className='-mx-4 -mt-3 mb-2'>
        <AnnouncementBanner />
      </div>
      {/* Top Bar */}
      <div className='flex justify-end items-center mb-8'>
        {selectedBotObject ? (
          canSwitchBot ? (
            <div className='relative' ref={botsDropdownRef}>
              <button
                type='button'
                onClick={() => setIsBotsDropdownOpen((open) => !open)}
                className='flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 min-w-0 max-w-[min(100vw-4rem,22rem)]'
                title='เลือกบอท'
              >
                <span className='font-medium truncate'>{selectedBotObject.name}</span>
                <HiChevronDown
                  className={`text-base text-gray-500 shrink-0 transition-transform ${
                    isBotsDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isBotsDropdownOpen && (
                <div className='absolute right-0 mt-1 w-72 max-w-[min(100vw-2rem,22rem)] rounded-lg border border-gray-200 bg-white shadow-lg z-40 py-1 max-h-64 overflow-y-auto'>
                  {botsList
                    .filter((b) => b.enabled !== false)
                    .map((bot) => {
                      const active = String(selectedBot) === String(bot.id);
                      return (
                        <button
                          key={bot.id}
                          type='button'
                          onClick={() => {
                            setSelectedBot(String(bot.id));
                            setIsBotsDropdownOpen(false);
                          }}
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
            <div className='flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-700 min-w-0 max-w-[min(100vw-4rem,22rem)]'>
              <span className='font-medium truncate' title={selectedBotObject.name}>
                {selectedBotObject.name}
              </span>
            </div>
          )
        ) : botsLoading ? (
          <div className='h-9 w-40 animate-pulse rounded-lg bg-gray-200' aria-label='กำลังโหลดบอท' />
        ) : botsLoadFailed ? (
          <div className='flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700'>
            <span>โหลดรายชื่อบอทไม่สำเร็จ</span>
            <button
              type='button'
              onClick={() => reloadBotsRef.current?.()}
              className='font-semibold underline underline-offset-2 hover:text-red-800'
            >
              ลองใหม่
            </button>
          </div>
        ) : (
          <div className='flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-600'>
            <span>ยังไม่มีบอทที่ใช้งานได้</span>
            <button
              type='button'
              onClick={() => navigate('/my-bots/create')}
              className='font-semibold text-gray-800 underline underline-offset-2 hover:text-gray-900'
            >
              สร้างบอท
            </button>
          </div>
        )}
      </div>

      {/* Welcome Section - Centered */}
      <div className='flex flex-col items-center justify-center flex-1'>
        {/* Mascot */}
        <div className='mb-6'>
          <img src={logoSrc} alt="mascot" className='w-32 h-32 object-cover' />
        </div>

        {/* Title — Welcome to + ชื่อบอทที่เลือก */}
        {privateMode && (
          <div className='mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-100 border border-yellow-300 text-gray-800 text-sm font-semibold'>
            <HiLockClosed className='text-base' />
            Personal
          </div>
        )}
        <h1
          className='text-2xl font-bold text-gray-800 mb-4'
          style={
            privateMode
              ? privateTitleStyle
              : !selectedBotObject?.name
                ? homepageTitleStyle
                : undefined
          }
        >
          {privateMode
            ? privateTitle
            : (selectedBotObject?.name
              ? `Welcome to ${selectedBotObject.name}`
              : homepageTitle)}
        </h1>

        {/* Description — ใช้คำอธิบายบอทที่ตั้งในฟอร์ม (สร้าง/แก้ไขบอท) หรือข้อความจาก Dev Studio */}
        <p
          className='text-gray-600 text-sm text-center max-w-2xl leading-relaxed mb-10'
          style={
            isDefaultBotDescription(selectedBotObject?.description) ||
            isCorruptedText(selectedBotObject?.description)
              ? homepageDescriptionStyle
              : undefined
          }
        >
          {!isDefaultBotDescription(selectedBotObject?.description) &&
           !isCorruptedText(selectedBotObject?.description)
            ? selectedBotObject.description.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < selectedBotObject.description.split('\n').length - 1 && <br />}
                </span>
              ))
            : (
              <span>{homepageDescription}</span>
            )}
        </p>

        {privateMode && (
          <div className='w-full max-w-4xl mb-4'>
            <div className='px-4 py-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white'>
              <p className='text-sm font-semibold text-gray-900' style={privateBannerTitleStyle}>
                {privateBannerTitle}
              </p>
              <p
                className='text-xs text-gray-600 mt-1 leading-relaxed whitespace-pre-line'
                style={privateBannerBodyStyle}
              >
                {privateBannerBody}
              </p>
              <div className='mt-2 space-y-1.5 text-xs text-gray-700'>
                <p className='flex items-center gap-2'>
                  <button
                    type='button'
                    onClick={() => setComposerPrivateCommand('remember')}
                    className='inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors'
                    title='ใช้คำสั่ง /จำ'
                  >
                    /จำ
                  </button>
                  <span>บอกข้อมูลที่ต้องการให้ระบบจำไว้ใช้ตอบ</span>
                </p>
                <p className='flex items-center gap-2'>
                  <button
                    type='button'
                    onClick={() => setComposerPrivateCommand('instruction')}
                    className='inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors'
                    title='ใช้คำสั่ง /สั่ง'
                  >
                    /สั่ง
                  </button>
                  <span>บอกว่าระบบควรตอบแบบไหน เช่น ตอบสั้น เป็นข้อๆ</span>
                </p>
              </div>
              <p className='text-[11px] text-amber-800/80 mt-2'>
                {privateHasData ? 'มีข้อมูลส่วนตัวบันทึกไว้แล้ว' : 'ยังไม่มีข้อมูลส่วนตัว — เริ่มด้วย /จำ หรือ /สั่ง'}
              </p>
            </div>
          </div>
        )}

        {/* แจ้งเตือนเมื่อบอทยังไม่มีเอกสารความรู้ในระบบ */}
        {selectedBotObject && !privateMode
          && Array.isArray(selectedBotObject.documentIds) && selectedBotObject.documentIds.length === 0 && (
          <div className='w-full max-w-4xl mb-4'>
            <div className='p-3 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-2'>
              <span className='text-amber-600 text-lg'>⚠️</span>
              <div>
                <p className='text-amber-900 text-sm font-bold mb-0.5'>ยังไม่มีเอกสารความรู้ในระบบ</p>
                <p className='text-amber-800 text-xs'>บอทนี้ยังไม่มี Knowledge ให้ใช้อ้างอิง คำตอบอาจไม่ครบถ้วนหรือไม่อ้างอิงจากเอกสาร — แนะนำให้เพิ่มเอกสารก่อนใช้งาน</p>
              </div>
            </div>
          </div>
        )}

        {/* Chat Input */}
        <div className='w-full max-w-4xl flex justify-center'>
          <div className='w-full'>
            <div className='flex items-center gap-2 border-4 border-yellow-400 rounded-3xl px-4 sm:px-6 py-4 bg-white shadow-lg w-full'>
            {privateMode && (
              <div className='relative flex-shrink-0'>
                <button
                  type='button'
                  onClick={() => setPrivateCmdMenuOpen((v) => !v)}
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors ${
                    privateCmdMenuOpen || typedPrivateCommand
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                  title='เลือกคำสั่ง /จำ หรือ /สั่ง'
                  aria-label='เลือกคำสั่งส่วนตัว'
                  aria-expanded={privateCmdMenuOpen}
                >
                  <HiPlus className={`text-lg transition-transform ${privateCmdMenuOpen ? 'rotate-45' : ''}`} />
                </button>
                {privateCmdMenuOpen && (
                  <>
                    <button
                      type='button'
                      className='fixed inset-0 z-40 cursor-default'
                      aria-label='ปิดเมนู'
                      onClick={() => setPrivateCmdMenuOpen(false)}
                    />
                    <div className='absolute left-0 bottom-full mb-2 z-50 w-56 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden'>
                      <button
                        type='button'
                        onClick={() => {
                          setComposerPrivateCommand('remember');
                          setPrivateCmdMenuOpen(false);
                        }}
                        className='w-full px-3 py-2.5 text-left hover:bg-blue-50 transition-colors'
                      >
                        <span className='inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700'>/จำ</span>
                        <span className='block text-[11px] text-gray-500 mt-1'>บอกข้อมูลให้ระบบจำไว้ใช้ตอบ</span>
                      </button>
                      <button
                        type='button'
                        onClick={() => {
                          setComposerPrivateCommand('instruction');
                          setPrivateCmdMenuOpen(false);
                        }}
                        className='w-full px-3 py-2.5 text-left border-t border-gray-100 hover:bg-blue-50 transition-colors'
                      >
                        <span className='inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700'>/สั่ง</span>
                        <span className='block text-[11px] text-gray-500 mt-1'>บอกว่าระบบควรตอบแบบไหน</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {privateMode && typedPrivateCommand && (
              <button
                type='button'
                onClick={() => setComposerPrivateCommand(null)}
                className='inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700'
                title='ปิดโหมดคำสั่ง'
              >
                <span className='font-semibold'>{typedPrivateCommand === 'remember' ? '/จำ' : '/สั่ง'}</span>
                <HiX className='text-xs' />
              </button>
            )}
            <textarea
              value={chatInput}
              onChange={(e) => {
                const next = e.target.value;
                if (privateMode && !composerPrivateCommand) {
                  const cmd = parsePrivateCommand(next);
                  if (cmd) {
                    setComposerPrivateCommand(cmd.kind);
                    setChatInput(cmd.payload || '');
                    const textarea = e.target;
                    textarea.style.height = 'auto';
                    const maxHeight = 128;
                    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
                    return;
                  }
                }
                setChatInput(next);
                // Auto resize textarea with max height limit
                const textarea = e.target;
                textarea.style.height = 'auto';
                const maxHeight = 128; // 8rem = 128px
                textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
              }}
              onKeyDown={(e) => {
                if (privateMode && composerPrivateCommand && e.key === 'Backspace' && !chatInput) {
                  setComposerPrivateCommand(null);
                  return;
                }
                // Auto resize on key down with max height limit
                const textarea = e.target;
                textarea.style.height = 'auto';
                const maxHeight = 128; // 8rem = 128px
                textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
                
                // ส่งข้อความเมื่อกด Enter (ไม่ใช่ Shift+Enter)
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder={
                privateMode
                  ? (composerPrivateCommand
                    ? (composerPrivateCommand === 'remember' ? 'พิมพ์ข้อมูลที่ต้องการให้ระบบจำ...' : 'พิมพ์คำสั่งการตอบของ AI...')
                    : privatePlaceholder)
                  : homepagePlaceholder
              }
              rows={1}
              style={privateMode ? privatePlaceholderStyle : homepagePlaceholderStyle}
              className='flex-1 outline-none text-gray-700 text-base placeholder-gray-400 bg-transparent resize-none overflow-y-auto min-h-[1.5rem] max-h-32'
            />
            <button
              type='button'
              onClick={handleSendMessage}
              className={`text-xl cursor-pointer transition ${chatInput.trim() ? 'text-gray-600 hover:scale-110 hover:text-gray-800' : 'text-gray-300 cursor-not-allowed'}`}
              disabled={!chatInput.trim()}
            >
              <HiOutlinePaperAirplane className='transform rotate-90' />
            </button>
            </div>
            <p className='text-xs text-gray-500 text-center mt-2'>
              Enterprise AI Chatbot อาจทำผิดพลาดได้ กรุณาตรวจสอบข้อมูลสำคัญ
            </p>
          </div>
        </div>

      </div>
    </main>

    {privateMode && isMemoryModalOpen && (
      <div
        className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4'
        onClick={() => setIsMemoryModalOpen(false)}
      >
        <div
          className='bg-[#faf9f5] rounded-2xl shadow-2xl border border-gray-200 w-[min(94vw,1000px)] h-[min(88vh,760px)] flex flex-col overflow-hidden'
          onClick={(e) => e.stopPropagation()}
          role='dialog'
          aria-modal='true'
          aria-label='คลังข้อมูลส่วนตัว'
        >
          {/* Header — สไตล์หน้า Projects ของ Claude */}
          <div className='px-8 pt-6 pb-4 flex items-start justify-between gap-4 flex-shrink-0'>
            <h2 className='text-xl font-bold text-gray-900'>คลังข้อมูลส่วนตัว</h2>
            <div className='flex items-center gap-2'>
              <input
                type='text'
                value={memorySearch}
                onChange={(e) => setMemorySearch(e.target.value)}
                placeholder='ค้นหาชื่อหัวข้อ / เนื้อหา...'
                className='hidden sm:block w-52 px-3 py-1.5 text-sm rounded-full border border-gray-300 bg-white outline-none focus:border-gray-400'
              />
              <button
                type='button'
                onClick={() => {
                  setEditingMemoryIndex(null);
                  setEditingTitleIndex(null);
                  setMemoryDraft('');
                  setMemoryTitleDraft('');
                  setAddingMemory(true);
                  setNewMemoryDraft('');
                  setNewMemoryTitleDraft('');
                }}
                className='px-3.5 py-1.5 text-sm font-medium rounded-full bg-gray-900 text-white hover:bg-gray-700 whitespace-nowrap'
              >
                + เพิ่มความจำ
              </button>
              <button
                type='button'
                onClick={() => setIsMemoryModalOpen(false)}
                className='p-1.5 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                aria-label='ปิดหน้าต่างคลังข้อมูล'
              >
                <HiX className='text-lg' />
              </button>
            </div>
          </div>

          <div className='flex-1 min-h-0 overflow-y-auto px-8 pb-8'>
            {/* ฟอร์มเพิ่มความจำใหม่ */}
            {addingMemory && (
              <div className='mb-4 rounded-xl border-l-4 border border-amber-200 border-l-amber-400 bg-amber-50/60 p-4 shadow-sm'>
                <p className='text-sm font-semibold text-amber-900 mb-2'>เพิ่มความจำใหม่</p>
                <input
                  type='text'
                  value={newMemoryTitleDraft}
                  onChange={(e) => setNewMemoryTitleDraft(e.target.value)}
                  placeholder='ชื่อหัวข้อ (ไม่ใส่ก็ได้)'
                  autoFocus
                  className='w-full mb-2 px-2.5 py-2 text-sm font-medium rounded-lg border border-amber-200 bg-white outline-none focus:border-amber-400'
                />
                <textarea
                  value={newMemoryDraft}
                  onChange={(e) => setNewMemoryDraft(e.target.value)}
                  placeholder='พิมพ์ข้อมูลที่อยากให้ AI จำ...'
                  className='w-full min-h-[100px] p-2.5 text-sm rounded-lg border border-amber-200 bg-white outline-none focus:border-amber-400'
                />
                <div className='flex justify-end gap-2 mt-2'>
                  <button
                    type='button'
                    onClick={() => { setAddingMemory(false); setNewMemoryDraft(''); setNewMemoryTitleDraft(''); }}
                    className='px-3 py-1.5 text-sm rounded-full border border-gray-300 text-gray-600 hover:bg-white'
                  >
                    ยกเลิก
                  </button>
                  <button
                    type='button'
                    onClick={handleAddMemoryItem}
                    disabled={!newMemoryDraft.trim()}
                    className={`px-3.5 py-1.5 text-sm font-medium rounded-full ${newMemoryDraft.trim() ? 'bg-amber-500 text-gray-900 hover:bg-amber-400' : 'bg-gray-300 text-white cursor-not-allowed'}`}
                  >
                    บันทึก
                  </button>
                </div>
              </div>
            )}

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              {/* การ์ดคำสั่งการตอบ */}
              <div className={`group rounded-xl border-l-4 border border-blue-200 border-l-blue-400 bg-blue-50/60 p-4 hover:shadow-md transition-shadow ${editingInstruction ? 'sm:col-span-2' : ''}`}>
                <div className='flex items-start justify-between gap-2 mb-2'>
                  <div className='flex items-center gap-2 min-w-0'>
                    <p className='text-sm font-semibold text-blue-900 truncate'>คำสั่งการตอบ</p>
                    <span className='px-2 py-0.5 text-[11px] rounded-md border border-blue-300 bg-blue-100 text-blue-700 flex-shrink-0'>คำสั่ง</span>
                  </div>
                  <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0'>
                    <button
                      type='button'
                      onClick={handleStartInstructionEdit}
                      className='px-2 py-1 text-xs rounded-md text-blue-700 hover:bg-blue-100'
                    >
                      แก้ไข
                    </button>
                    {privateInstructionsText && (
                      <button
                        type='button'
                        onClick={() => setMemoryConfirm({ type: 'instruction' })}
                        className='px-2 py-1 text-xs rounded-md text-red-600 hover:bg-red-50'
                      >
                        ลบ
                      </button>
                    )}
                  </div>
                </div>
                {editingInstruction ? (
                  <div className='space-y-2'>
                    <textarea
                      value={instructionDraft}
                      onChange={(e) => setInstructionDraft(e.target.value)}
                      placeholder='กำหนดวิธีตอบของ AI เช่น ตอบสั้น กระชับ เป็นภาษาไทย...'
                      autoFocus
                      className='w-full min-h-[120px] p-2.5 text-sm rounded-lg border border-blue-200 bg-white outline-none focus:border-blue-400'
                    />
                    <div className='flex justify-end gap-2'>
                      <button
                        type='button'
                        onClick={() => { setEditingInstruction(false); setInstructionDraft(''); }}
                        className='px-3 py-1.5 text-sm rounded-full border border-gray-300 text-gray-600 hover:bg-white'
                      >
                        ยกเลิก
                      </button>
                      <button
                        type='button'
                        onClick={handleSaveInstruction}
                        className='px-3.5 py-1.5 text-sm font-medium rounded-full bg-blue-600 text-white hover:bg-blue-700'
                      >
                        บันทึก
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className={`text-sm break-words line-clamp-4 whitespace-pre-wrap ${privateInstructionsText ? 'text-blue-900/70' : 'text-blue-400'}`}>
                    {privateInstructionsText || 'ยังไม่มีคำสั่งการตอบ — กด "แก้ไข" เพื่อกำหนดวิธีตอบของ AI'}
                  </p>
                )}
              </div>

              {/* การ์ดความจำแต่ละรายการ */}
              {privateRememberItems
                .map((item, idx) => ({ item, idx }))
                .filter(({ item }) => {
                  const q = memorySearch.trim().toLowerCase();
                  if (!q) return true;
                  return `${item.title} ${item.body}`.toLowerCase().includes(q);
                })
                .map(({ item, idx }) => (
                  <div
                    key={`mem-card-${idx}`}
                    className={`group rounded-xl border-l-4 border border-amber-200 border-l-amber-400 bg-amber-50/60 p-4 hover:shadow-md transition-shadow ${editingMemoryIndex === idx ? 'sm:col-span-2' : ''}`}
                  >
                    <div className='flex items-start justify-between gap-2 mb-2'>
                      <div className='flex items-center gap-2 min-w-0'>
                        {editingTitleIndex === idx ? (
                          <input
                            type='text'
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onBlur={() => handleSaveTitle(idx)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveTitle(idx);
                              }
                              if (e.key === 'Escape') {
                                setEditingTitleIndex(null);
                                setTitleDraft('');
                              }
                            }}
                            placeholder={`ความจำ #${idx + 1}`}
                            autoFocus
                            className='min-w-0 flex-1 px-2 py-0.5 text-sm font-semibold text-amber-900 rounded-md border border-amber-300 bg-white outline-none focus:border-amber-500'
                          />
                        ) : (
                          <button
                            type='button'
                            onClick={() => handleStartTitleEdit(idx)}
                            title='คลิกเพื่อแก้ชื่อหัวข้อ'
                            className='text-sm font-semibold text-amber-900 truncate px-1 -mx-1 rounded hover:bg-amber-100'
                          >
                            {item.title || `ความจำ #${idx + 1}`}
                          </button>
                        )}
                        <span className='px-2 py-0.5 text-[11px] rounded-md border border-amber-300 bg-amber-100 text-amber-700 flex-shrink-0'>ความจำ</span>
                      </div>
                      <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0'>
                        <button
                          type='button'
                          onClick={() => handleStartMemoryEdit(idx)}
                          className='px-2 py-1 text-xs rounded-md text-amber-800 hover:bg-amber-100'
                        >
                          แก้ไข
                        </button>
                        <button
                          type='button'
                          onClick={() =>
                            setMemoryConfirm({ type: 'item', index: idx, title: item.title })
                          }
                          className='px-2 py-1 text-xs rounded-md text-red-600 hover:bg-red-50'
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                    {editingMemoryIndex === idx ? (
                      <div className='space-y-2'>
                        <input
                          type='text'
                          value={memoryTitleDraft}
                          onChange={(e) => setMemoryTitleDraft(e.target.value)}
                          placeholder='ชื่อหัวข้อ (ไม่ใส่ก็ได้)'
                          className='w-full px-2.5 py-2 text-sm font-medium rounded-lg border border-amber-200 bg-white outline-none focus:border-amber-400'
                        />
                        <textarea
                          value={memoryDraft}
                          onChange={(e) => setMemoryDraft(e.target.value)}
                          autoFocus
                          className='w-full min-h-[100px] p-2.5 text-sm rounded-lg border border-amber-200 bg-white outline-none focus:border-amber-400'
                        />
                        <div className='flex justify-end gap-2'>
                          <button
                            type='button'
                            onClick={() => { setEditingMemoryIndex(null); setMemoryDraft(''); setMemoryTitleDraft(''); }}
                            className='px-3 py-1.5 text-sm rounded-full border border-gray-300 text-gray-600 hover:bg-white'
                          >
                            ยกเลิก
                          </button>
                          <button
                            type='button'
                            onClick={() => handleSaveMemoryItem(idx)}
                            className='px-3.5 py-1.5 text-sm font-medium rounded-full bg-amber-500 text-gray-900 hover:bg-amber-400'
                          >
                            บันทึก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className='text-sm text-amber-900/70 break-words line-clamp-4 whitespace-pre-wrap'>{item.body}</p>
                    )}
                  </div>
                ))}
            </div>

            {privateRememberItems.length === 0 && !addingMemory && (
              <div className='mt-4 rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400'>
                ยังไม่มีความจำที่บันทึกไว้ — กด "+ เพิ่มความจำ" หรือพิมพ์ /จำ ในแชท
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {memoryConfirm && (
      <div
        className='fixed inset-0 z-[60] flex items-center justify-center p-4'
        role='dialog'
        aria-modal='true'
      >
        <div
          className='absolute inset-0 bg-black/50'
          onClick={() => setMemoryConfirm(null)}
        />
        <div className='relative w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl'>
          <h3 className='mb-2 text-lg font-semibold text-gray-800'>
            {memoryConfirm.type === 'instruction' ? 'ลบคำสั่งนี้หรือไม่?' : 'ลบความจำนี้หรือไม่?'}
          </h3>
          <p className='mb-6 text-sm text-gray-600 break-words'>
            {memoryConfirm.type === 'instruction'
              ? 'บอทจะเลิกทำตามคำสั่งนี้ทันที และกู้คืนข้อความเดิมไม่ได้'
              : `“${memoryConfirm.title || 'ความจำนี้'}” จะถูกลบออกจากความจำส่วนตัว และกู้คืนไม่ได้`}
          </p>
          <div className='flex justify-end gap-3'>
            <button
              type='button'
              onClick={() => setMemoryConfirm(null)}
              className='rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50'
            >
              ยกเลิก
            </button>
            <button
              type='button'
              onClick={handleConfirmMemoryDelete}
              className='rounded-lg bg-red-600 px-4 py-2 font-semibold text-white shadow-md transition-colors hover:bg-red-700'
            >
              ลบ
            </button>
          </div>
        </div>
      </div>
    )}

    </div>
  );
}

export default Homepage;
