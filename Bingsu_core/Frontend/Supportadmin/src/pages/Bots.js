import { HiSearch, HiTrash } from 'react-icons/hi';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, mapBotToDisplay } from '../services/api';

function Bots({ userRole = 'support' }) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const itemsPerPage = 12;
  const canToggleBot = userRole === 'admin';
  const canDeleteBot = userRole === 'admin';
  const HELP_BOT_NAME = 'บอทช่วยสอน';
  const pinHelpBotFirst = useCallback((list) => {
    const arr = Array.isArray(list) ? list : [];
    const help = arr.filter((b) => b?.name === HELP_BOT_NAME);
    const rest = arr.filter((b) => b?.name !== HELP_BOT_NAME);
    return [...help, ...rest];
  }, []);
  
  // Avatar color variants
  const avatarColors = [
    'bg-blue-400', 'bg-purple-400', 'bg-pink-400', 'bg-indigo-400',
    'bg-green-400', 'bg-yellow-400', 'bg-red-400', 'bg-teal-400',
    'bg-orange-400', 'bg-cyan-400', 'bg-lime-400', 'bg-rose-400',
    'bg-violet-400', 'bg-fuchsia-400', 'bg-emerald-400', 'bg-amber-400',
    'bg-sky-400', 'bg-slate-400', 'bg-blue-500', 'bg-purple-500',
    'bg-pink-500', 'bg-green-500', 'bg-yellow-500', 'bg-red-500',
    'bg-indigo-500', 'bg-teal-500', 'bg-cyan-500', 'bg-rose-500',
    'bg-violet-500', 'bg-orange-500'
  ];
  
  const [botList, setBotList] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [togglingBotIds, setTogglingBotIds] = useState([]);

  const loadBots = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await api.getAdminBots();
      const mapped = (list || []).map((b, i) => mapBotToDisplay(b, i, avatarColors));
      setBotList(pinHelpBotFirst(mapped));
    } catch (err) {
      setBotList([]);
      const msg = err?.message || '';
      setLoadError(msg === 'SESSION_EXPIRED' ? 'SESSION_EXPIRED' : (msg || 'โหลดรายการบอทไม่สำเร็จ — ตรวจสอบว่า backend รันอยู่'));
    }
  // avatarColors is static, omit to avoid unnecessary refetch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinHelpBotFirst]);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  // Filter bots with useMemo for performance
  const filteredBots = useMemo(() => {
    const filtered = botList.filter(bot => 
      bot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (bot.description && bot.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (bot.username && bot.username.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    return pinHelpBotFirst(filtered);
  }, [botList, pinHelpBotFirst, searchQuery]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredBots.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBots = filteredBots.slice(startIndex, endIndex);

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleStatusToggle = async (e, botId) => {
    e.stopPropagation();
    if (!canToggleBot) return;
    const current = botList.find((b) => b.id === botId);
    if (!current) return;
    const nextEnabled = !current.enabled;
    setTogglingBotIds((prev) => [...prev, botId]);
    setLoadError(null);

    setBotList((prev) => prev.map((b) => (b.id === botId ? { ...b, enabled: nextEnabled } : b)));
    try {
      const updated = await api.updateAdminBot(botId, { enabled: nextEnabled });
      const resolvedEnabled = updated?.enabled ?? nextEnabled;
      setBotList((prev) => prev.map((b) => (b.id === botId ? { ...b, enabled: resolvedEnabled } : b)));
    } catch (err) {
      // Roll back local UI when backend update fails.
      setBotList((prev) => prev.map((b) => (b.id === botId ? { ...b, enabled: current.enabled } : b)));
      const msg = err?.message || 'สลับสถานะบอทไม่สำเร็จ';
      setLoadError(msg === 'SESSION_EXPIRED' ? 'SESSION_EXPIRED' : msg);
    } finally {
      setTogglingBotIds((prev) => prev.filter((id) => id !== botId));
    }
  };

  const handleBotClick = (bot) => {
    navigate(`/bots/${bot.id}`, { state: { bot } });
  };

  const handleConfirmDelete = async () => {
    if (confirmDeleteId === null) return;
    if (canDeleteBot) {
      try {
        await api.deleteBot(confirmDeleteId);
        setBotList(botList.filter((bot) => bot.id !== confirmDeleteId));
      } catch {
        setBotList(botList.filter((bot) => bot.id !== confirmDeleteId));
      }
    } else {
      setBotList(botList.filter((bot) => bot.id !== confirmDeleteId));
    }
    setConfirmDeleteId(null);
  };

  return (
    <>
      {/* Header */}
      <div className='mb-6'>
        <div className='flex items-center justify-between gap-3 mb-4'>
          <h1 className='text-2xl font-semibold text-gray-800'>
            Bots <span className='text-gray-600 font-normal'>{filteredBots.length}</span>
          </h1>
          {userRole === 'admin' && (
            <button
              type='button'
              onClick={() => navigate('/bots/create')}
              className='px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-sm transition-all text-sm'
            >
              สร้างบอท
            </button>
          )}
        </div>
        
        {/* Search Input */}
        <div className='relative max-w-md'>
          <HiSearch className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl' />
          <input
            type='text'
            placeholder='Search Bots / Username'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
            aria-label='Search bots'
          />
        </div>
      </div>

      {loadError && (
        <div className='mb-4 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 border border-amber-200 bg-amber-50'>
          <p className='text-sm text-amber-800'>
            {loadError === 'SESSION_EXPIRED' ? 'Session หมดอายุหรือไม่ถูกต้อง — กรุณาล็อกอินใหม่' : loadError}
          </p>
          {loadError === 'SESSION_EXPIRED' ? (
            <button
              type='button'
              onClick={() => navigate('/login')}
              className='px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium'
            >
              ไปหน้า Login
            </button>
          ) : (
            <button
              type='button'
              onClick={() => loadBots()}
              className='px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium'
            >
              โหลดใหม่
            </button>
          )}
        </div>
      )}

      {/* Content - Bot List */}
      <div className='flex-1 flex flex-col'>
        {filteredBots.length > 0 ? (
          <>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-3'>
              {paginatedBots.map(bot => {
              return (
                <div 
                  key={bot.id} 
                  className='bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col min-w-0 overflow-hidden'
                >
                  {/* Top row: Avatar/Name + Status Switch */}
                  <div className='flex items-start justify-between gap-4 mb-4'>
                    <div className='flex items-start gap-4 flex-1 min-w-0'>
                      {/* Avatar */}
                      <div className={`w-12 h-12 rounded-full ${bot.color} flex-shrink-0 transition-all ${
                        !bot.enabled ? 'grayscale opacity-50' : ''
                      }`}></div>
                      
                      {/* Content */}
                      <div className={`flex-1 min-w-0 transition-all ${
                        !bot.enabled ? 'opacity-50' : ''
                      }`}>
                        <h3 title={bot.name} className={`text-base font-semibold mb-1 truncate ${
                          bot.enabled ? 'text-gray-800' : 'text-gray-400'
                        }`}>{bot.name}</h3>
                      </div>
                    </div>

                    {/* Status Toggle */}
                    <button
                      type='button'
                      onClick={(e) => handleStatusToggle(e, bot.id)}
                      disabled={!canToggleBot || togglingBotIds.includes(bot.id)}
                      className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none flex-shrink-0 ${
                          bot.enabled ? 'bg-green-500' : 'bg-gray-300'
                      } ${(!canToggleBot || togglingBotIds.includes(bot.id)) ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                        bot.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  {/* Description */}
                  <div className='mb-3 min-h-[2.5rem]'>
                    <p title={bot.description || ''} className='text-sm text-gray-600 line-clamp-2 break-words'>{bot.description || 'No description'}</p>
                  </div>
                  
                  {/* Bottom row: Username and Detail Button */}
                  <div className='flex justify-between items-center mt-auto gap-2 min-w-0'>
                    <p title={bot.username} className={`text-xs truncate flex-shrink min-w-0 ${
                      bot.enabled ? 'text-gray-500' : 'text-gray-400'
                    }`}>By {bot.username}</p>
                    <div className='flex items-center gap-2 flex-shrink-0'>
                      <button
                        onClick={() => handleBotClick(bot)}
                        className='px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 text-sm'
                      >
                        รายละเอียด
                      </button>
                      {canDeleteBot && (
                      <button
                        type='button'
                        onClick={() => setConfirmDeleteId(bot.id)}
                        className='inline-flex items-center gap-2 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium'
                      >
                        <HiTrash className='text-lg' />
                        ลบ
                      </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className='flex justify-center items-center gap-2 mt-auto pt-3'>
              {/* Previous Button */}
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                ←
              </button>

              {/* Page Numbers */}
              {[...Array(totalPages)].map((_, index) => {
                const pageNum = index + 1;
                // Show first page, last page, current page, and pages around current
                if (
                  pageNum === 1 ||
                  pageNum === totalPages ||
                  (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        currentPage === pageNum
                          ? 'bg-yellow-400 text-gray-800'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                } else if (
                  pageNum === currentPage - 2 ||
                  pageNum === currentPage + 2
                ) {
                  return <span key={pageNum} className='px-2 text-gray-400'>...</span>;
                }
                return null;
              })}

              {/* Next Button */}
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                →
              </button>
            </div>
          )}
          </>
        ) : (
          <div className='text-center py-16'>
            <p className='text-gray-500 text-lg mb-4'>No bots found</p>
            <p className='text-gray-400 text-sm'>Try adjusting your search query</p>
          </div>
        )}
      </div>

      {confirmDeleteId !== null && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
          <div className='w-full max-w-sm rounded-xl bg-white p-6 shadow-lg'>
            <h3 className='text-lg font-semibold text-gray-800 mb-2'>ยืนยันการลบ</h3>
            <p className='text-sm text-gray-600 mb-5'>ต้องการลบบอทนี้ใช่ไหม?</p>
            <div className='flex justify-end gap-2'>
              <button
                type='button'
                onClick={() => setConfirmDeleteId(null)}
                className='px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50'
              >
                ยกเลิก
              </button>
              <button
                type='button'
                onClick={handleConfirmDelete}
                className='px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600'
              >
                ลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Bots;
