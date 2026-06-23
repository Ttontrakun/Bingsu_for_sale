import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  HiOutlinePaperAirplane,
} from 'react-icons/hi';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import Sidebar from '../components/Sidebar';
import { chatAPI, botAPI } from '../services/api';

const OFFICIAL_BOT_DESCRIPTION = 'ระบบผู้ช่วยอัจฉริยะสำหรับตอบคำถามและวิเคราะห์ข้อมูลจากฐานความรู้อย่างเป็นระบบ โดยมุ่งเน้นความถูกต้อง รวดเร็ว และความน่าเชื่อถือของข้อมูล';
const LEGACY_BOT_DESCRIPTION = 'บอทผู้ช่วยประจำระบบ';
const isCorruptedText = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  const qCount = (text.match(/\?/g) || []).length;
  return qCount >= 3 && qCount / Math.max(1, text.length) > 0.25;
};

function Homepage() {
  const navigate = useNavigate();
  const [selectedBot, setSelectedBot] = useState(null); // This is the dropdown value (string)
  const [selectedBotObject, setSelectedBotObject] = useState(null); // This is the full bot object
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [botOptions, setBotOptions] = useState([]);
  const [botsList, setBotsList] = useState([]); // Store full bots list

  // ฟังก์ชันสำหรับสร้างแชทใหม่ (backend ใช้ conversations: ต้องมี documentId + botId)
  const createNewChat = async (firstMessage) => {
    if (!selectedBot || !selectedBotObject) {
      alert('กรุณาเลือก Bot ก่อนเริ่มแชท');
      return;
    }

    const documentId = selectedBotObject.documentIds?.[0]
      || selectedBotObject.documents?.[0]?.id
      || (Array.isArray(selectedBotObject.documents) && selectedBotObject.documents[0]?.id);
    if (!documentId) {
      alert('บอทนี้ยังไม่มี Knowledge กรุณาเพิ่ม Knowledge ให้บอทก่อน');
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

      const newChat = await chatAPI.createChat(chatName, [], selectedBotObject.id, documentId);

      window.dispatchEvent(new CustomEvent('chatsUpdated'));

      navigate(`/chat/${newChat.id}`, {
        state: {
          firstMessage: firstMessage?.trim(),
          selectedBot: selectedBotObject,
        },
      });
    } catch (error) {
      console.error('Error creating chat:', error);
      const msg = error?.response?.data?.error || error?.message || 'ไม่สามารถสร้างแชทใหม่ได้ กรุณาลองอีกครั้ง';
      alert(msg);
      throw error;
    }
  };

  // ฟังก์ชันสำหรับจัดการการส่งข้อความ
  const handleSendMessage = (e) => {
    e.preventDefault();
    const trimmedInput = chatInput.trim();
    if (trimmedInput) {
      // Sanitize และจำกัดความยาวข้อความ
      const sanitizedMessage = trimmedInput.substring(0, 1000);
      setChatInput('');
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
          alert('Bot นี้ถูก inactive แล้ว กรุณาเลือก Bot อื่น');
        }
      } else {
        setSelectedBotObject(null);
      }
    } else {
      setSelectedBotObject(null);
    }
  }, [selectedBot, botsList]);

  return (
    <div className='flex h-screen bg-white relative'>
    {/* Sidebar Component */}
    <Sidebar onCollapseChange={setIsSidebarCollapsed} />

    {/* Main Content */}
    <main className={`flex-1 bg-white px-8 py-6 overflow-auto flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-16' : ''}`}>
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
        <h1 className='text-2xl font-semibold text-gray-800 mb-4'>
          Welcome to {selectedBotObject?.name || 'Enterprise AI Chatbot LLM'}
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

        {/* Chat Input */}
        <div className='w-full max-w-4xl flex justify-center'>
          <div className='flex items-center gap-2 border-4 border-yellow-400 rounded-3xl px-6 py-4 bg-white shadow-lg w-full'>
            <textarea
              value={chatInput}
              onChange={(e) => {
                setChatInput(e.target.value);
                // Auto resize textarea with max height limit
                const textarea = e.target;
                textarea.style.height = 'auto';
                const maxHeight = 128; // 8rem = 128px
                textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
              }}
              onKeyDown={(e) => {
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
              placeholder='How can I help today?...'
              rows={1}
              className='flex-1 outline-none text-gray-700 text-base placeholder-gray-400 bg-transparent resize-none overflow-hidden min-h-[1.5rem] max-h-32'
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
    </main>
    </div>
  );
}

export default Homepage;
