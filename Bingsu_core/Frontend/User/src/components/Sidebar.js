import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  HiChevronLeft,
  HiChevronRight,
  HiChat,
  HiDatabase,
  HiCheck,
  HiX,
  HiDotsVertical,
  HiLockClosed,
  HiPlus,
  HiSearch,
  HiAdjustments,
  HiDesktopComputer,
  HiBookOpen
} from 'react-icons/hi';
import { HiOutlineUser } from 'react-icons/hi2';
import { BsPinAngleFill } from 'react-icons/bs';
import ProfileModal from './ProfileModal';
import AccountModal from './AccountModal';
import ChatMenuModal from './ChatMenuModal';
import ChatSearchModal from './ChatSearchModal';
import ConfirmModal from './ConfirmModal';
import { showToast } from './ToastNotification';
import { authAPI, chatAPI, userAPI } from '../services/api';
import { useSystemConfig } from '../context/SystemConfigContext';
import avatarMale from '../assets/avatars/user_male.png';
import avatarFemale from '../assets/avatars/user_female.png';

const AVATAR_SRC_BY_KEY = {
  'preset:user_male': avatarMale,
  'preset:user_female': avatarFemale,
};
const getPresetAvatarSrc = (v) => AVATAR_SRC_BY_KEY[String(v || '')] || null;
const THAI_CHAR_RE = /[\u0E00-\u0E7F]/;
const THAI_NAME_PREFIXES = [
  // civil/common
  'เด็กหญิง', 'เด็กชาย', 'นางสาว', 'นาย', 'นาง', 'น.ส.', 'น.ส', 'นส.', 'ด.ช.', 'ด.ช', 'ดช.', 'ด.ญ.', 'ด.ญ', 'ดญ.',
  // academic/professional
  'ศาสตราจารย์', 'รองศาสตราจารย์', 'ผู้ช่วยศาสตราจารย์', 'ศ.', 'รศ.', 'ผศ.', 'ดร.',
  'นายแพทย์', 'แพทย์หญิง', 'นพ.', 'พญ.',
  // military
  'พลเอก', 'พลโท', 'พลตรี', 'พล.อ.', 'พล.ท.', 'พล.ต.',
  'พันเอก', 'พันโท', 'พันตรี', 'พ.อ.', 'พ.ท.', 'พ.ต.',
  'ร้อยเอก', 'ร้อยโท', 'ร้อยตรี', 'ร.อ.', 'ร.ท.', 'ร.ต.',
  'สิบเอก', 'สิบโท', 'สิบตรี', 'ส.อ.', 'ส.ท.', 'ส.ต.',
  // police
  'พลตำรวจเอก', 'พลตำรวจโท', 'พลตำรวจตรี', 'พล.ต.อ.', 'พล.ต.ท.', 'พล.ต.ต.',
  'พันตำรวจเอก', 'พันตำรวจโท', 'พันตำรวจตรี', 'พ.ต.อ.', 'พ.ต.ท.', 'พ.ต.ต.',
  'ร้อยตำรวจเอก', 'ร้อยตำรวจโท', 'ร้อยตำรวจตรี', 'ร.ต.อ.', 'ร.ต.ท.', 'ร.ต.ต.',
  'สิบตำรวจเอก', 'สิบตำรวจโท', 'สิบตำรวจตรี', 'ส.ต.อ.', 'ส.ต.ท.', 'ส.ต.ต.',
];
const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const buildThaiPrefixRegex = () => {
  const sorted = [...THAI_NAME_PREFIXES].sort((a, b) => b.length - a.length);
  return new RegExp(`^(?:${sorted.map((v) => escapeRegExp(v)).join('|')})\\s*`, 'i');
};
const THAI_PREFIX_RE = buildThaiPrefixRegex();
const stripThaiNamePrefix = (name) => {
  let text = String(name || '').trim();
  if (!text) return text;
  let previous = '';
  while (text && text !== previous) {
    previous = text;
    text = text.replace(THAI_PREFIX_RE, '').trim();
  }
  return text;
};
const getSidebarFirstName = (fullName) => {
  const raw = String(fullName || '').trim();
  if (!raw) return 'โปรไฟล์';
  // ชื่อภาษาอังกฤษหรือภาษาอื่น: แสดงเต็ม แล้วให้ UI truncate กันล้นเมนู
  if (!THAI_CHAR_RE.test(raw)) return raw;
  // ตัดคำนำหน้าที่ใช้บ่อยในข้อมูลบุคลากรไทย
  const withoutTitle = stripThaiNamePrefix(raw);
  const firstToken = withoutTitle.split(/\s+/).filter(Boolean)[0];
  return firstToken || withoutTitle || raw;
};

function Sidebar({
  onCollapseChange,
  privateWorkspace = false,
  showMemoryControl,
  onMemoryClick = null,
}) {
  // บนมือถือ: เริ่มต้นด้วยการหุบ sidebar (เปิดเป็น overlay เมื่อกด)
  const [isCollapsed, setIsCollapsed] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  );
  const { logoSrc, appName, menuEnabled } = useSystemConfig();
  const appNameLines = String(appName || 'Enterprise AI Chatbot').trim().split(/\s+/);
  const appNameLine1 = appNameLines.slice(0, Math.ceil(appNameLines.length / 2)).join(' ') || 'Enterprise AI';
  const appNameLine2 = appNameLines.slice(Math.ceil(appNameLines.length / 2)).join(' ');
  // ปลายทาง "หน้าหลัก/New Chat" ขึ้นกับว่าอยู่ในโหมดส่วนตัวหรือไม่
  const homePath = privateWorkspace && menuEnabled('private') ? '/private' : '/homepage';
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState(() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Array สำหรับเก็บรายการ chats - ดึงจาก API
  const [chats, setChats] = useState([]);

  // State สำหรับแก้ไขชื่อ chat
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);
  // จำสถานะเปิด/ปิดประวัติแชทข้ามการรีเฟรช (ค่าเริ่มต้น = เปิด)
  const [isHistoryOpen, setIsHistoryOpen] = useState(() => {
    try { return localStorage.getItem('historyOpen') !== '0'; } catch { return true; }
  });
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
  const [isGroupMenuOpen, setIsGroupMenuOpen] = useState(false);
  const [historyGroupBy, setHistoryGroupBy] = useState(() => {
    try { return localStorage.getItem('historyGroupBy') || 'latest'; } catch { return 'latest'; }
  });
  const shouldShowMemoryControl = typeof showMemoryControl === 'boolean'
    ? showMemoryControl
    : privateWorkspace;
  // ปักหมุดแชท (เก็บที่เซิร์ฟเวอร์) — pinned = อยู่บนสุด + ลบไม่ได้ และรอดจากการล้างแชทตามอายุ
  const isPinned = (id) => chats.some((chat) => String(chat.id) === String(id) && chat.pinned === true);
  const togglePin = async (chatId, e) => {
    if (e) e.stopPropagation();
    setOpenMenuId(null);
    const next = !isPinned(chatId);
    try {
      await chatAPI.setChatPinned(chatId, next);
      await loadChats();
      window.dispatchEvent(new Event('chatUpdated'));
    } catch (error) {
      console.error('Error updating pin state:', error);
      showToast('ไม่สามารถเปลี่ยนสถานะปักหมุดได้', 'error');
    }
  };


  // ฟังก์ชันสำหรับเริ่มแก้ไขชื่อ chat
  const startEditingChat = (chatId, currentName, e) => {
    if (e) e.stopPropagation();
    setEditingChatId(chatId);
    setEditingName(currentName);
    setOpenMenuId(null);
  };

  // ฟังก์ชันสำหรับบันทึกชื่อ chat ที่แก้ไข
  const saveChatName = async (chatId, e) => {
    e.stopPropagation();
    if (editingName.trim()) {
      try {
        // Update chat name via API
        await chatAPI.updateChat(chatId, editingName.trim());
        // Refresh chats from API
        await loadChats();
        // Trigger custom event เพื่ออัพเดท Chat page
        window.dispatchEvent(new Event('chatUpdated'));
      } catch (error) {
        console.error('Error updating chat name:', error);
        showToast('ไม่สามารถอัพเดทชื่อแชทได้', 'error');
      }
    }
    setEditingChatId(null);
    setEditingName('');
  };

  // ฟังก์ชันสำหรับยกเลิกการแก้ไข
  const cancelEditing = (e) => {
    e.stopPropagation();
    setEditingChatId(null);
    setEditingName('');
  };

  // ฟังก์ชันสำหรับลบ chat
  const deleteChat = (chatId, e) => {
    e.stopPropagation();
    if (isPinned(chatId)) {
      showToast('แชทนี้ปักหมุดอยู่ — เลิกปักหมุดก่อนจึงจะลบได้', 'info');
      setOpenMenuId(null);
      return;
    }
    setChatToDelete(chatId);
    setShowDeleteConfirm(true);
    setOpenMenuId(null);
  };

  const handleConfirmDelete = async () => {
    if (chatToDelete) {
      try {
        // Delete chat via API
        await chatAPI.deleteChat(chatToDelete);
        // Refresh chats from API
        await loadChats();
        window.dispatchEvent(new Event('chatUpdated'));
        
        // ถ้า chat ที่ลบเป็น chat ที่กำลังเปิดอยู่ ให้ navigate ไปที่ homepage
        if (location.pathname === `/chat/${chatToDelete}`) {
          navigate(homePath);
        }
      } catch (error) {
        console.error('Error deleting chat:', error);
        const message = error?.response?.status === 409
          ? (error.response.data?.error || 'แชทนี้ปักหมุดอยู่ — เลิกปักหมุดก่อนจึงจะลบได้')
          : 'ไม่สามารถลบแชทได้';
        showToast(message, error?.response?.status === 409 ? 'info' : 'error');
      }
      setChatToDelete(null);
    }
  };

  // ฟังก์ชันสำหรับโหลด chats จาก API
  const loadChats = async () => {
    try {
      const chatsData = await chatAPI.getChats();
      // แปลง id จาก number เป็น string เพื่อให้เข้ากับ routing
      const formattedChats = chatsData.map(chat => ({
        ...chat,
        id: String(chat.id)
      }));
      setChats(formattedChats);
    } catch (error) {
      // Handle 401 - token หมดอายุหรือไม่ถูกต้อง
      if (error.response?.status === 401) {
        setChats([]);
      } else {
        console.error('Error loading chats:', error);
        setChats([]);
      }
    }
  };

  // โหลด chats เมื่อ component mount
  useEffect(() => {
    loadChats();
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const user = await userAPI.getCurrentUser();
      setMe(user || null);
      if (user && typeof user === 'object' && user.id) {
        // เก็บเฉพาะ id — ไม่เก็บอีเมล/โปรไฟล์เต็มใน localStorage
        localStorage.setItem('user', JSON.stringify({ id: user.id }));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  // ซิงก์ avatar/ชื่อทันทีเมื่อบันทึกใน AccountModal
  useEffect(() => {
    const onProfileUpdated = (event) => {
      const next = event?.detail;
      if (!next || typeof next !== 'object') {
        refreshMe();
        return;
      }
      setMe((prev) => ({
        ...(prev || {}),
        name: next.name ?? prev?.name,
        email: next.email ?? prev?.email,
        avatarUrl: next.avatarUrl ?? prev?.avatarUrl,
      }));
    };
    window.addEventListener('user-profile-updated', onProfileUpdated);
    return () => window.removeEventListener('user-profile-updated', onProfileUpdated);
  }, [refreshMe]);

  // ฟัง event เมื่อมีการสร้างแชทใหม่จากหน้า homepage
  useEffect(() => {
    const handleChatsUpdated = () => {
      loadChats();
    };

    window.addEventListener('chatsUpdated', handleChatsUpdated);
    
    return () => {
      window.removeEventListener('chatsUpdated', handleChatsUpdated);
    };
  }, []);

  // ปรับการหุบ/ขยายอัตโนมัติตามขนาดหน้าจอ (มือถือ = หุบ, จอใหญ่ = ขยาย)
  useEffect(() => {
    let lastIsMobile = window.innerWidth < 768;
    const handleResize = () => {
      const nowMobile = window.innerWidth < 768;
      if (nowMobile === lastIsMobile) return;
      lastIsMobile = nowMobile;
      setIsCollapsed(nowMobile);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // เมื่อเปิดโหมด Private ให้แสดง sidebar ทันที เพื่อเห็น Memory โดยไม่ต้องกดปุ่มอื่น
  useEffect(() => {
    if (!privateWorkspace) return;
    setIsCollapsed(false);
    if (onCollapseChange) onCollapseChange(false);
  }, [privateWorkspace, onCollapseChange]);

  // ปิดเมนู overlay เมื่อเปลี่ยนหน้า (มือถือ)
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsCollapsed(true);
    }
  }, [location.pathname]);

  // ฟังก์ชันสำหรับเปิด/ปิดเมนู
  const toggleMenu = (chatId, e) => {
    e.stopPropagation();
    if (openMenuId === chatId) {
      setOpenMenuId(null);
    } else {
      // คำนวณตำแหน่งของเมนู
      const buttonRect = e.currentTarget.getBoundingClientRect();
      setMenuPosition({
        top: buttonRect.bottom + 4,
        right: window.innerWidth - buttonRect.right
      });
      setOpenMenuId(chatId);
    }
  };

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    if (onCollapseChange) {
      onCollapseChange(newState);
    }
  };

  // แยกประวัติ: โหมดส่วนตัวเห็นเฉพาะห้องส่วนตัว, โหมดปกติเห็นเฉพาะห้องปกติ
  const visibleChats = chats
    .filter((chat) => (privateWorkspace ? chat.private === true : chat.private !== true))
    .slice()
    .sort((a, b) => (isPinned(b.id) ? 1 : 0) - (isPinned(a.id) ? 1 : 0));

  const updateHistoryOpen = (nextOpen) => {
    setIsHistoryOpen(nextOpen);
    try { localStorage.setItem('historyOpen', nextOpen ? '1' : '0'); } catch {}
  };

  const changeGroupBy = (value) => {
    setHistoryGroupBy(value);
    setIsGroupMenuOpen(false);
    updateHistoryOpen(true);
    try { localStorage.setItem('historyGroupBy', value); } catch {}
  };

  // จัดกลุ่มประวัติสนทนาตามตัวเลือกที่เลือก (ปักหมุด / วันที่ / ล่าสุด)
  const buildChatGroups = () => {
    if (historyGroupBy === 'latest') return [{ key: 'all', label: '', items: visibleChats }];

    const groups = new Map();
    const pushTo = (label, chat) => {
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(chat);
    };

    if (historyGroupBy === 'pinned') {
      ['Pinned', 'Others'].forEach((label) => groups.set(label, []));
      visibleChats.forEach((chat) => pushTo(isPinned(chat.id) ? 'Pinned' : 'Others', chat));
    } else {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const dayMs = 86400000;
      // เรียงลำดับหมวดล่วงหน้าเพื่อให้กลุ่มเรียงจากใหม่ไปเก่าเสมอ
      ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'].forEach((label) => groups.set(label, []));
      visibleChats.forEach((chat) => {
        const time = new Date(chat.updatedAt || chat.createdAt || 0).getTime();
        if (!time) return pushTo('Older', chat);
        if (time >= startOfToday.getTime()) return pushTo('Today', chat);
        if (time >= startOfToday.getTime() - dayMs) return pushTo('Yesterday', chat);
        if (time >= startOfToday.getTime() - 7 * dayMs) return pushTo('Previous 7 days', chat);
        if (time >= startOfToday.getTime() - 30 * dayMs) return pushTo('Previous 30 days', chat);
        return pushTo('Older', chat);
      });
    }

    return Array.from(groups.entries())
      .filter(([, items]) => items.length > 0)
      .map(([label, items]) => ({ key: label, label, items }));
  };

  const chatGroups = buildChatGroups();

  return (
    <>
    {/* Backdrop สำหรับมือถือเมื่อเปิด sidebar เป็น overlay */}
    {!isCollapsed && (
      <div
        className='fixed inset-0 bg-black/40 z-30 md:hidden'
        onClick={toggleSidebar}
        aria-hidden='true'
      />
    )}
    <aside className={`bg-white border-r border-gray-200 flex flex-col py-6 transition-all duration-300 ease-in-out fixed inset-y-0 left-0 z-40 md:relative md:inset-auto md:z-auto ${
      isCollapsed ? 'w-0 md:w-16 px-0 md:px-2 overflow-hidden md:overflow-visible md:items-center' : 'w-60 px-6 overflow-visible'
    }`}>
      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        className={`absolute -right-3 top-8 bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-gray-400 rounded-full p-2 z-30 shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out flex items-center justify-center ${
          isCollapsed ? 'opacity-0 pointer-events-none scale-0' : 'opacity-100 scale-100'
        }`}
        title="หุบ sidebar"
      >
        <HiChevronLeft className='text-gray-700 text-base' />
      </button>
      
      {/* Expand Button — มือถือเท่านั้น (desktop ใช้ rail + ปุ่มในตัว) */}
      <button
        onClick={toggleSidebar}
        className={`fixed left-0 top-8 bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-gray-400 rounded-r-full p-2.5 z-30 shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out ml-0 flex items-center justify-center md:hidden ${
          isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 pointer-events-none scale-0'
        }`}
        title="ขยาย sidebar"
      >
        <HiChevronRight className='text-gray-700 text-base' />
      </button>

      {/* Expand Button (desktop) — อยู่บนสุดของ rail */}
      {isCollapsed && (
        <button
          onClick={toggleSidebar}
          className='hidden md:flex mb-4 w-10 h-10 items-center justify-center bg-white hover:bg-gray-50 border border-gray-300 rounded-full shadow transition-colors flex-shrink-0'
          title='ขยายเมนู'
        >
          <HiChevronRight className='text-gray-700 text-base' />
        </button>
      )}

      {/* Logo */}
      <div
        className={`flex items-center gap-2 mb-6 pb-6 border-b border-gray-200 cursor-pointer hover:opacity-80 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'justify-center' : ''
        }`}
        onClick={() => navigate(homePath)}
        title={appName}
      >
        <img src={logoSrc} alt="logo" className='w-10 h-10 rounded-full object-cover flex-shrink-0' />
        {!isCollapsed && (
          <span className='text-orange-500 font-bold text-lg leading-tight'>
            <span className='block'>{appNameLine1}</span>
            {appNameLine2 ? <span className='block'>{appNameLine2}</span> : null}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className='flex flex-col gap-4 flex-1 min-h-0 w-full transition-all duration-300 ease-in-out'>
        {/* Fixed Navigation Items */}
        <div className='flex flex-col gap-3 flex-shrink-0'>
        {/* แชทใหม่ */}
        {menuEnabled('home') && (
        <button
          type='button'
          onClick={() => navigate(homePath)}
          className={`w-full py-2 px-2.5 flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-2 rounded-lg transition-colors text-sm font-medium text-gray-700 hover:bg-gray-100`}
          title='สร้างแชทใหม่'
        >
          <HiPlus className='text-lg flex-shrink-0' />
          {!isCollapsed && <span className='whitespace-nowrap'>New Chat</span>}
        </button>
        )}

        {/* ค้นหาแชท */}
        {menuEnabled('history') && (
        <button
          type='button'
          onClick={() => setIsChatSearchOpen(true)}
          className={`w-full py-2 px-2.5 flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-2 rounded-lg transition-colors text-sm font-medium text-gray-700 hover:bg-gray-100`}
          title='ค้นหาแชท'
        >
          <HiSearch className='text-lg flex-shrink-0' />
          {!isCollapsed && <span className='whitespace-nowrap'>Chats</span>}
        </button>
        )}

        {/* สวิตช์เปิด/ปิดโหมดส่วนตัว — เปิด = เข้าโหมดส่วนตัว, ปิด = กลับโหมดปกติ */}
        {menuEnabled('private') && (
        <button
          type='button'
          role='switch'
          aria-checked={privateWorkspace}
          onClick={() => navigate(privateWorkspace ? '/homepage' : '/private')}
          className={`w-full py-2 px-2.5 flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-2 rounded-lg transition-colors text-sm font-medium text-gray-700 hover:bg-gray-100`}
          title={privateWorkspace ? 'ปิดเพื่อกลับโหมดปกติ' : 'เปิดเพื่อเข้าโหมดส่วนตัว'}
        >
          {isCollapsed ? (
            <HiLockClosed className={`text-lg flex-shrink-0 ${privateWorkspace ? 'text-green-600' : 'text-gray-500'}`} />
          ) : (
            <>
              <HiLockClosed className={`text-lg flex-shrink-0 ${privateWorkspace ? 'text-green-600' : 'text-gray-500'}`} />
              <span className='whitespace-nowrap text-gray-900'>Private</span>
              <span className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${privateWorkspace ? 'bg-green-500' : 'bg-gray-400'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${privateWorkspace ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </span>
            </>
          )}
        </button>
        )}

        {menuEnabled('createBot') && (
          <button
            type='button'
            onClick={() => navigate('/my-bots')}
            className={`w-full py-2 px-2.5 flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-2 rounded-lg transition-colors text-sm font-medium text-gray-700 hover:bg-gray-100 ${location.pathname.startsWith('/my-bots') ? 'bg-gray-100' : ''}`}
            title='Bots'
          >
            <HiDesktopComputer className='text-lg flex-shrink-0' />
            {!isCollapsed && <span className='whitespace-nowrap'>Bots</span>}
          </button>
        )}

        {menuEnabled('uploadDocs') && (
          <button
            type='button'
            onClick={() => navigate('/my-knowledge')}
            className={`w-full py-2 px-2.5 flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-2 rounded-lg transition-colors text-sm font-medium text-gray-700 hover:bg-gray-100 ${location.pathname.startsWith('/my-knowledge') ? 'bg-gray-100' : ''}`}
            title='Knowledge'
          >
            <HiBookOpen className='text-lg flex-shrink-0' />
            {!isCollapsed && <span className='whitespace-nowrap'>Knowledge</span>}
          </button>
        )}

        {/* Memory (แสดงเมื่ออยู่โหมด Private) */}
        {shouldShowMemoryControl && (
          <button
            type='button'
            onClick={() => {
              if (typeof onMemoryClick === 'function') {
                onMemoryClick();
              } else {
                navigate('/private', { state: { privateMode: true, openMemory: true } });
              }
            }}
            className={`w-full py-2 px-2.5 flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-2 rounded-lg transition-colors text-sm font-medium text-gray-700 hover:bg-gray-100`}
            title='Memory'
          >
            <HiDatabase className='text-lg flex-shrink-0' />
            {!isCollapsed && <span className='whitespace-nowrap'>Memory</span>}
          </button>
        )}

        </div>
        
        {/* Divider */}
        {!isCollapsed && menuEnabled('history') && <div className='border-t border-gray-100 mt-1 mb-1 flex-shrink-0'></div>}

        {/* Scrollable Chat Section */}
        {!isCollapsed && menuEnabled('history') && (
          <div className='flex flex-col gap-2 flex-1 min-h-0'>
            {/* หัวข้อ "ประวัติสนทนา" + เมนูจัดกลุ่ม */}
            {visibleChats.length > 0 && (
              <div className='relative flex items-center justify-between gap-1 pl-2 pr-0 mb-0.5 flex-shrink-0'>
                <button
                  type='button'
                  onClick={() => updateHistoryOpen(!isHistoryOpen)}
                  className='group min-w-0 text-xs font-medium text-gray-400 inline-flex items-center gap-1.5 text-left hover:text-gray-500'
                >
                  <HiChat className='text-sm flex-shrink-0' />
                  <span className='truncate'>Chat History</span>
                  <span className='text-sm leading-none opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'>
                    {isHistoryOpen ? '>' : '<'}
                  </span>
                </button>
                <button
                  type='button'
                  onClick={() => setIsGroupMenuOpen((v) => !v)}
                  className='p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0'
                  title='จัดกลุ่มประวัติสนทนา'
                  aria-label='จัดกลุ่มประวัติสนทนา'
                >
                  <HiAdjustments className='text-sm rotate-90' />
                </button>

                {isGroupMenuOpen && (
                  <>
                    <div className='fixed inset-0 z-40' onClick={() => setIsGroupMenuOpen(false)} aria-hidden='true' />
                    <div className='absolute right-0 top-6 z-50 w-40 rounded-xl border border-gray-200 bg-white shadow-lg py-1'>
                      <p className='px-3 py-1 text-[11px] text-gray-400'>Group by</p>
                      {[
                        { id: 'pinned', label: 'Pinned' },
                        { id: 'date', label: 'Date' },
                        { id: 'latest', label: 'Latest' },
                      ].map((option) => (
                        <button
                          key={option.id}
                          type='button'
                          onClick={() => changeGroupBy(option.id)}
                          className='w-full px-3 py-1.5 flex items-center justify-between gap-2 text-sm text-gray-700 hover:bg-gray-100'
                        >
                          <span>{option.label}</span>
                          {historyGroupBy === option.id && <HiCheck className='text-base text-blue-600' />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {/* Scrollable Chat List — scrollbar ชิดขอบขวาสุดของ sidebar (ยื่น -mr-6 ชนขอบ, pr-3 กันข้อความชน) */}
            <div className={`thin-scrollbar flex-1 overflow-y-auto overflow-x-hidden -mr-6 pr-3 ${isHistoryOpen ? '' : 'hidden'}`}>
              <div className='flex flex-col gap-2'>
                {chatGroups.map((group) => (
                  <div key={group.key} className='flex flex-col gap-2'>
                    {group.label && (
                      <p className='px-2 pt-1 text-[11px] font-medium text-gray-400 truncate'>{group.label}</p>
                    )}
                    {group.items.map((chat) => {
                  const isEditing = editingChatId === chat.id;
                  
                  return (
                    <div
                      key={chat.id}
                      className='relative group'
                    >
                      {isEditing ? (
                        // Edit Mode
                        <div className='rounded-lg w-full py-1.5 px-2 flex items-center gap-2 text-gray-700 bg-gray-50'>
                          <HiChat className='text-base flex-shrink-0' />
                          <input
                            type='text'
                            value={editingName}
                            onChange={(e) => {
                              e.stopPropagation();
                              setEditingName(e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                saveChatName(chat.id, e);
                              } else if (e.key === 'Escape') {
                                cancelEditing(e);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className='flex-1 bg-transparent border-none outline-none text-sm text-gray-700'
                            autoFocus
                          />
                          <div className='flex items-center gap-1'>
                            <button
                              onClick={(e) => saveChatName(chat.id, e)}
                              className='p-0.5 text-green-600 hover:text-green-700 transition-colors'
                              title='บันทึก'
                            >
                              <HiCheck className='text-base' />
                            </button>
                            <button
                              onClick={cancelEditing}
                              className='p-0.5 text-red-600 hover:text-red-700 transition-colors'
                              title='ยกเลิก'
                            >
                              <HiX className='text-base' />
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View Mode
                        <>
                          <div
                            onClick={() => {
                              navigate(`/chat/${chat.id}`);
                              setOpenMenuId(null);
                            }}
                            className='cursor-pointer rounded-lg transition-colors w-full py-1.5 pl-2 pr-8 flex items-center gap-2 text-gray-700 hover:bg-gray-100'
          >
                            {isPinned(chat.id) && <BsPinAngleFill className='text-[11px] text-yellow-500 flex-shrink-0' />}
                            <span className='flex-1 truncate text-[13px]'>{chat.name}</span>
                          </div>
                          {/* Three Dots Menu Button */}
                          <div className='absolute right-0 top-1/2 -translate-y-1/2 z-20'>
                            <button
                              onClick={(e) => toggleMenu(chat.id, e)}
                              className='p-1 text-gray-500 hover:text-gray-700 transition-colors relative z-20'
                              title='เมนู'
                            >
                              <HiDotsVertical className='text-base' />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Profile */}
      <div
        className={`flex items-center gap-3 pt-4 border-t border-gray-200 cursor-pointer hover:bg-gray-100 rounded-lg p-2 transition-colors ${
          isCollapsed ? 'justify-center' : ''
        }`}
        onClick={() => setIsProfileModalOpen(true)}
        title={getSidebarFirstName(me?.name)}
      >
        <div className='w-10 h-10 bg-white rounded-full flex items-center justify-center flex-shrink-0'>
          {getPresetAvatarSrc(me?.avatarUrl) ? (
            <img
              src={getPresetAvatarSrc(me?.avatarUrl)}
              alt="avatar"
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <HiOutlineUser className='text-gray-600 text-xl' />
          )}
        </div>
        {!isCollapsed && (
          <span className='text-gray-700 flex-1 min-w-0 truncate'>
            {getSidebarFirstName(me?.name)}
          </span>
        )}
      </div>

      {/* Profile Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onManageAccount={() => {
          setIsAccountModalOpen(true);
        }}
        onSignOut={async () => {
          try {
            await authAPI.logout();
          } catch (_) {
            /* ignore */
          }
          navigate('/auth');
        }}
      />

      {/* Account Modal */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => {
          setIsAccountModalOpen(false);
          setTimeout(() => refreshMe(), 0);
        }}
      />

      {/* Chat Menu Modal */}
      {chats.map((chat) => (
        <ChatMenuModal
          key={chat.id}
          isOpen={openMenuId === chat.id}
          onClose={() => setOpenMenuId(null)}
          onEdit={(e) => {
            startEditingChat(chat.id, chat.name, e);
            setOpenMenuId(null);
          }}
          onDelete={(e) => deleteChat(chat.id, e)}
          onPin={(e) => togglePin(chat.id, e)}
          isPinned={isPinned(chat.id)}
          position={menuPosition}
        />
      ))}

      {/* Chat Search Modal */}
      <ChatSearchModal
        isOpen={isChatSearchOpen}
        onClose={() => setIsChatSearchOpen(false)}
        chats={chats}
        onSelectChat={(chat) => navigate(`/chat/${chat.id}`)}
        onNewChat={() => navigate(homePath)}
      />

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setChatToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="ยืนยันการลบแชท"
        message="คุณต้องการลบแชทนี้หรือไม่? การดำเนินการนี้ไม่สามารถยกเลิกได้"
        confirmText="ลบ"
        cancelText="ยกเลิก"
        type="danger"
      />
    </aside>
    </>
  );
}

export default Sidebar;
