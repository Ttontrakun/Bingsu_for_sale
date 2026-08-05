import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  HiOutlinePaperAirplane,
  HiLockClosed,
  HiX,
} from 'react-icons/hi';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import Sidebar from '../components/Sidebar';
import AnnouncementBanner from '../components/AnnouncementBanner';
import { showToast } from '../components/ToastNotification';
import { chatAPI, botAPI, privateContextAPI } from '../services/api';

const OFFICIAL_BOT_DESCRIPTION = 'ระบบผู้ช่วยอัจฉริยะสำหรับตอบคำถามและวิเคราะห์ข้อมูลจากฐานความรู้อย่างเป็นระบบ โดยมุ่งเน้นความถูกต้อง รวดเร็ว และความน่าเชื่อถือของข้อมูล';
const LEGACY_BOT_DESCRIPTION = 'บอทผู้ช่วยประจำระบบ';
const isCorruptedText = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  const qCount = (text.match(/\?/g) || []).length;
  return qCount >= 3 && qCount / Math.max(1, text.length) > 0.25;
};

const parsePrivateCommand = (text) => {
  const raw = String(text || '').trim();
  if (!raw.startsWith('/')) return null;
  const m = raw.match(/^\/(จำ|สั่ง)\s*([\s\S]*)$/);
  if (!m) return null;
  return { kind: m[1] === 'จำ' ? 'remember' : 'instruction', payload: String(m[2] || '').trim() };
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
  const [selectedBot, setSelectedBot] = useState(null); // This is the dropdown value (string)
  const [selectedBotObject, setSelectedBotObject] = useState(null); // This is the full bot object
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [botOptions, setBotOptions] = useState([]);
  const [botsList, setBotsList] = useState([]); // Store full bots list
  // โหมดส่วนตัว: แสดงเพียงสถานะว่ามีข้อมูลตั้งไว้แล้วหรือยัง (จัดการผ่าน /จำ และ /สั่ง ในแชท)
  const [privateHasData, setPrivateHasData] = useState(false);
  const [privateInstructionsText, setPrivateInstructionsText] = useState('');
  const [privateRememberItems, setPrivateRememberItems] = useState([]);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
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
      }
    };

    loadBots();
  }, []);

  // user มีบอทเดียว: เลือกให้โดยอัตโนมัติ
  useEffect(() => {
    if (!selectedBot && botOptions.length > 0) {
      setSelectedBot(String(botOptions[0].value));
    }
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

  const typedPrivateCommand = composerPrivateCommand;

  return (
    <div className='flex h-screen bg-white relative'>
    {/* Sidebar Component */}
    <Sidebar
      onCollapseChange={setIsSidebarCollapsed}
      privateWorkspace={privateMode}
      showMemoryControl={privateMode}
      onMemoryClick={openMemoryModal}
    />

    {/* Main Content */}
    <main className={`flex-1 bg-white px-8 py-6 overflow-auto flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-16' : ''}`}>
      <div className='-mx-4 -mt-3 mb-2'>
        <AnnouncementBanner />
      </div>
      {/* Top Bar */}
      <div className='flex justify-between items-center mb-8'>
        <span className='text-sm text-gray-500'>
          {selectedBotObject ? (
            <span className='font-medium text-gray-700'>{selectedBotObject.name}</span>
          ) : (
            <span className='italic text-gray-400'>กำลังโหลดบอท...</span>
          )}
        </span>
      </div>

      {/* Welcome Section - Centered */}
      <div className='flex flex-col items-center justify-center flex-1'>
        {/* Mascot */}
        <div className='mb-6'>
          <img src={bingsuLogo} alt="mascot" className='w-32 h-32 object-cover' />
        </div>

        {/* Title — Welcome to + ชื่อบอทที่เลือก */}
        {privateMode && (
          <div className='mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-100 border border-yellow-300 text-gray-800 text-sm font-semibold'>
            <HiLockClosed className='text-base' />
            โหมดส่วนตัว
          </div>
        )}
        <h1 className='text-2xl font-semibold text-gray-800 mb-4'>
          {privateMode
            ? 'โหมดส่วนตัว — ถามจากเนื้อหาของคุณเอง'
            : `Welcome to ${selectedBotObject?.name || 'Enterprise AI Chatbot LLM'}`}
        </h1>

        {/* Description — ใช้คำอธิบายบอทที่ตั้งในฟอร์ม (สร้าง/แก้ไขบอท) หรือข้อความเริ่มต้น */}
        <p className='text-gray-600 text-center max-w-2xl leading-relaxed mb-10'>
          {selectedBotObject?.description &&
           selectedBotObject.description.trim() !== LEGACY_BOT_DESCRIPTION &&
           !isCorruptedText(selectedBotObject.description)
            ? selectedBotObject.description.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < selectedBotObject.description.split('\n').length - 1 && <br />}
                </span>
              ))
            : (
              <>
                {OFFICIAL_BOT_DESCRIPTION}
              </>
            )}
        </p>

        {privateMode && (
          <div className='w-full max-w-4xl mb-4'>
            <div className='p-4 rounded-2xl border border-yellow-300 bg-yellow-50'>
              <p className='text-sm font-semibold text-gray-800 mb-1'>โหมดส่วนตัว (ใช้ง่ายขึ้น)</p>
              <p className='text-xs text-gray-600 mb-1'>พิมพ์ในแชทได้เลย:</p>
              <p className='text-xs text-gray-700'><code>/จำ ข้อมูลที่ต้องการให้ AI จำ</code></p>
              <p className='text-xs text-gray-700'><code>/สั่ง รูปแบบการตอบที่ต้องการ</code></p>
              <p className='text-xs text-gray-500 mt-2'>
                {privateHasData
                  ? 'มีข้อมูลส่วนตัวบันทึกไว้แล้ว และระบบจะจำข้ามแชทให้อัตโนมัติ'
                  : 'ยังไม่มีข้อมูลส่วนตัว — ลองพิมพ์ /จำ หรือ /สั่ง ในแชทด้านล่าง'}
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
            <div className='flex items-center gap-2 border-4 border-yellow-400 rounded-3xl px-6 py-4 bg-white shadow-lg w-full'>
            {privateMode && typedPrivateCommand && (
              <button
                type='button'
                onClick={() => setComposerPrivateCommand(null)}
                className='inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700'
                title='ปิดโหมดคำสั่ง'
              >
                <span className='font-semibold'>{typedPrivateCommand === 'remember' ? '/จำ' : '/สั่ง'}</span>
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
                    : 'พิมพ์ข้อความ... หรือใช้ /จำ ข้อมูล และ /สั่ง คำสั่ง AI')
                  : 'How can I help today?...'
              }
              rows={1}
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
            <h2 className='text-2xl font-semibold text-gray-900'>คลังข้อมูลส่วนตัว</h2>
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
                        onClick={handleDeleteInstruction}
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
                          onClick={() => handleDeleteMemoryItem(idx)}
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

    </div>
  );
}

export default Homepage;
