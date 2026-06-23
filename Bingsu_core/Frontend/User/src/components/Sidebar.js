import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  HiHome,
  HiChevronLeft,
  HiChevronRight,
  HiChat,
  HiCheck,
  HiX,
  HiDotsVertical
} from 'react-icons/hi';
import { HiOutlineUser } from 'react-icons/hi2';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import ProfileModal from './ProfileModal';
import AccountModal from './AccountModal';
import ChatMenuModal from './ChatMenuModal';
import ConfirmModal from './ConfirmModal';
import { authAPI, chatAPI, userAPI } from '../services/api';
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

function Sidebar({ onCollapseChange }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
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
        alert('ไม่สามารถอัพเดทชื่อแชทได้');
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
          navigate('/homepage');
        }
      } catch (error) {
        console.error('Error deleting chat:', error);
        alert('ไม่สามารถลบแชทได้');
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
      if (user && typeof user === 'object') {
        // keep latest avatarUrl/name for sidebar display
        localStorage.setItem('user', JSON.stringify(user));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshMe();
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

  const isActive = (path) => {
    if (path === '/chat') {
      return location.pathname.startsWith('/chat');
    }
    return location.pathname === path;
  };

  return (
    <aside className={`bg-gray-200 flex flex-col py-6 transition-all duration-500 ease-in-out relative ${
      isCollapsed ? 'w-0 px-0 overflow-hidden' : 'w-52 px-6 overflow-visible'
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
      
      {/* Expand Button (shown when collapsed) */}
      <button
        onClick={toggleSidebar}
        className={`fixed left-0 top-8 bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-gray-400 rounded-r-full p-2.5 z-30 shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out ml-0 flex items-center justify-center ${
          isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 pointer-events-none scale-0'
        }`}
        title="ขยาย sidebar"
      >
        <HiChevronRight className='text-gray-700 text-base' />
      </button>

      {/* Logo */}
      <div 
        className={`flex items-center gap-2 mb-6 pb-6 border-b border-gray-300 cursor-pointer hover:opacity-80 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'opacity-0 overflow-hidden' : 'opacity-100'
        }`}
        onClick={() => navigate('/homepage')}
      >
        <img src={bingsuLogo} alt="logo" className='w-10 h-10 rounded-full object-cover flex-shrink-0' />
        <span className='text-orange-500 font-bold text-base leading-tight'>
          <span className='block'>Enterprise AI</span>
          <span className='block'>Chatbot</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className={`flex flex-col gap-6 flex-1 min-h-0 transition-all duration-300 ease-in-out ${
        isCollapsed ? 'opacity-0 overflow-hidden' : 'opacity-100'
      }`}>
        {/* Fixed Navigation Items */}
        <div className='flex flex-col gap-6 flex-shrink-0'>
        <div 
          onClick={() => navigate('/homepage')}
          className={`w-full py-2 px-3 flex items-center justify-center gap-2 text-center rounded-lg transition-colors bg-gray-300 hover:bg-gray-400 active:bg-gray-500 ${
            isActive('/homepage') ? 'text-gray-900 font-semibold' : 'text-gray-700'
          }`}
        >
          <HiHome className='text-xl flex-shrink-0' />
          {!isCollapsed && <span>Home</span>}
        </div>
        </div>
        
        {/* Divider */}
        {!isCollapsed && (
          <div className='border-t border-gray-300 mt-2 mb-2 flex-shrink-0'></div>
        )}

        {/* Scrollable Chat Section */}
        {!isCollapsed && (
          <div className='flex flex-col gap-2 flex-1 min-h-0 overflow-hidden'>
            {/* New Chat Button */}
            <button
              onClick={() => navigate('/homepage')}
              className='w-full py-2 px-3 mb-2 bg-gray-300 hover:bg-gray-400 active:bg-gray-500 text-gray-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 flex-shrink-0'
            >
              <HiChat className='text-lg' />
              <span>New Chat</span>
            </button>
            {/* Scrollable Chat List */}
            <div className='flex-1 overflow-y-auto overflow-x-hidden pr-1'>
              <div className='flex flex-col gap-2'>
                {chats.map((chat) => {
                  const isChatActive = location.pathname === `/chat/${chat.id}`;
                  const isEditing = editingChatId === chat.id;
                  
                  return (
                    <div
                      key={chat.id}
                      className='relative group'
                    >
                      {isEditing ? (
                        // Edit Mode
                        <div className='nav-item nav-item-inactive rounded-lg w-full py-1 px-2 flex items-center gap-2'>
                          <HiChat className='text-xl flex-shrink-0' />
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
                            className={`nav-item ${isChatActive ? 'nav-item-active' : 'nav-item-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2`}
          >
            <HiChat className='text-xl flex-shrink-0' />
                            <span className='flex-1 truncate'>{chat.name}</span>
                          </div>
                          {/* Three Dots Menu Button */}
                          <div className='absolute right-2 top-1/2 -translate-y-1/2 z-20'>
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
            </div>
          </div>
        )}
      </nav>

      {/* Profile */}
      <div 
        className={`flex items-center gap-3 pt-4 border-t border-gray-300 cursor-pointer hover:bg-gray-100 rounded-lg p-2 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'opacity-0 overflow-hidden' : 'opacity-100'
        }`}
        onClick={() => setIsProfileModalOpen(true)}
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
        onSignOut={() => {
          authAPI.logout();
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
          position={menuPosition}
        />
      ))}

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
  );
}

export default Sidebar;
