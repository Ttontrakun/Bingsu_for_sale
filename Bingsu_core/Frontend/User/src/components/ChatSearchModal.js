import { useEffect, useMemo, useRef, useState } from 'react';
import { HiSearch, HiX, HiChat, HiLockClosed, HiChevronDown } from 'react-icons/hi';

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const formatChatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'เมื่อสักครู่';
  if (diffMinutes < 60) return `${diffMinutes} นาทีที่แล้ว`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]}`;
};

const FILTERS = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'normal', label: 'ปกติ' },
  { id: 'private', label: 'ส่วนตัว' },
];

function ChatSearchModal({ isOpen, onClose, chats = [], onSelectChat, onNewChat }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setFilter('all');
    setIsFilterOpen(false);
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const visibleChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats
      .filter((chat) => {
        if (filter === 'private') return chat.private === true;
        if (filter === 'normal') return chat.private !== true;
        return true;
      })
      .filter((chat) => {
        if (!q) return true;
        return `${chat.name || ''} ${chat.lastMessage || ''}`.toLowerCase().includes(q);
      });
  }, [chats, filter, query]);

  if (!isOpen) return null;

  const activeFilterLabel = FILTERS.find((f) => f.id === filter)?.label || 'ทั้งหมด';

  return (
    <div
      className='fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4'
      onClick={onClose}
    >
      <div
        className='bg-[#faf9f5] rounded-2xl shadow-2xl border border-gray-200 w-[min(94vw,860px)] h-[min(88vh,720px)] flex flex-col overflow-hidden'
        onClick={(e) => e.stopPropagation()}
        role='dialog'
        aria-modal='true'
        aria-label='ค้นหาแชท'
      >
        <div className='px-8 pt-6 pb-3 flex items-start justify-between gap-4 flex-shrink-0'>
          <h2 className='text-2xl font-semibold text-gray-900'>แชททั้งหมด</h2>
          <div className='flex items-center gap-2'>
            <div className='relative'>
              <button
                type='button'
                onClick={() => setIsFilterOpen((v) => !v)}
                className='px-3 py-1.5 text-sm rounded-full border border-gray-300 bg-white text-gray-700 hover:border-gray-400 inline-flex items-center gap-1'
              >
                <span>กรอง: {activeFilterLabel}</span>
                <HiChevronDown className='text-base' />
              </button>
              {isFilterOpen && (
                <div className='absolute right-0 mt-1 w-36 rounded-xl border border-gray-200 bg-white shadow-lg py-1 z-10'>
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type='button'
                      onClick={() => {
                        setFilter(f.id);
                        setIsFilterOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 ${filter === f.id ? 'text-gray-900 font-medium' : 'text-gray-600'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type='button'
              onClick={() => {
                onClose();
                if (typeof onNewChat === 'function') onNewChat();
              }}
              className='px-3.5 py-1.5 text-sm font-medium rounded-full bg-gray-900 text-white hover:bg-gray-700 whitespace-nowrap'
            >
              แชทใหม่
            </button>
            <button
              type='button'
              onClick={onClose}
              className='p-1.5 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              aria-label='ปิดหน้าต่างค้นหาแชท'
            >
              <HiX className='text-lg' />
            </button>
          </div>
        </div>

        <div className='px-8 pb-3 flex-shrink-0'>
          <div className='relative'>
            <HiSearch className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg' />
            <input
              ref={inputRef}
              type='text'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='ค้นหาแชท...'
              className='w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-gray-300 bg-white outline-none focus:border-gray-500'
            />
          </div>
        </div>

        <div className='flex-1 min-h-0 overflow-y-auto px-4 pb-6'>
          {visibleChats.length === 0 ? (
            <div className='mx-4 mt-4 rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400'>
              {query.trim() ? 'ไม่พบแชทที่ตรงกับคำค้นหา' : 'ยังไม่มีแชท'}
            </div>
          ) : (
            visibleChats.map((chat) => (
              <button
                key={chat.id}
                type='button'
                onClick={() => {
                  onClose();
                  if (typeof onSelectChat === 'function') onSelectChat(chat);
                }}
                className='w-full px-4 py-3 flex items-center gap-3 rounded-xl text-left hover:bg-white border-b border-gray-200/70 last:border-b-0'
              >
                {chat.private ? (
                  <HiLockClosed className='text-base text-green-600 flex-shrink-0' />
                ) : (
                  <HiChat className='text-base text-gray-400 flex-shrink-0' />
                )}
                <span className='flex-1 min-w-0 truncate text-sm text-gray-800'>{chat.name}</span>
                <span className='text-xs text-gray-400 flex-shrink-0'>{formatChatTime(chat.updatedAt)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatSearchModal;
