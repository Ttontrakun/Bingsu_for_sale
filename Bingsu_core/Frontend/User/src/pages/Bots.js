import { useNavigate } from 'react-router-dom';
import { HiPlus, HiSearch, HiDotsHorizontal } from 'react-icons/hi';
import Sidebar from '../components/Sidebar';
import { useState, useMemo, useRef, useEffect } from 'react';
import { botAPI, getErrorMessage } from '../services/api';

const HELP_BOT_NAME = 'บอทช่วยสอน';
const isEmojiAvatar = (v) => typeof v === 'string' && v.startsWith('emoji:') && v.length > 'emoji:'.length;
const getEmoji = (v) => (isEmojiAvatar(v) ? String(v).slice('emoji:'.length) : '');

function Bots() {
  const navigate = useNavigate();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRefs = useRef({});

  // Profile color variants that match the website theme
  const profileColorVariants = [
    'from-yellow-400 to-orange-400',    // Original yellow-orange
    'from-amber-400 to-yellow-500',     // Warm amber
    'from-orange-400 to-red-400',       // Orange-red
    'from-yellow-300 to-amber-400',     // Light yellow
    'from-rose-400 to-orange-400',      // Rose-orange
    'from-amber-500 to-orange-500',     // Deep amber
  ];

  // Function to get consistent color for each bot based on ID
  const getBotProfileColor = (botId) => {
    return profileColorVariants[botId % profileColorVariants.length];
  };
  
  const [botList, setBotList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load bots from API
  useEffect(() => {
    loadBots();
  }, []);

  const loadBots = async () => {
    setLoading(true);
    setError(null);
    try {
      const bots = await botAPI.getBots();
      setBotList(bots || []);
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error loading bots:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter bots with useMemo for performance
  const filteredBots = useMemo(() => {
    const query = String(searchQuery || '').toLowerCase().trim();
    if (!query) return botList;
    return botList.filter((bot) => {
      const name = String(bot?.name || '').toLowerCase();
      const description = String(bot?.description || '').toLowerCase();
      return name.includes(query) || description.includes(query);
    });
  }, [botList, searchQuery]);

  const handleMenuToggle = (e, botId) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === botId ? null : botId);
  };

  const handleStatusToggle = async (e, botId) => {
    e.stopPropagation();
    const bot = botList.find(b => b.id === botId);
    if (!bot) return;

    try {
      const updatedBot = await botAPI.updateBot(botId, {
        ...bot,
        enabled: !bot.enabled
      });
      setBotList(botList.map(b => b.id === botId ? updatedBot : b));
    } catch (err) {
      console.error('Error updating bot status:', err);
      alert(getErrorMessage(err));
    }
  };

  const handleDelete = async (botId) => {
    try {
      await botAPI.deleteBot(botId);
    setBotList(botList.filter(b => b.id !== botId));
    setDeleteConfirmId(null);
    setOpenMenuId(null);
    } catch (err) {
      console.error('Error deleting bot:', err);
      alert(getErrorMessage(err));
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      let isClickedInside = false;
      
      Object.values(menuRefs.current).forEach(ref => {
        if (ref && ref.contains(event.target)) {
          isClickedInside = true;
        }
      });

      if (!isClickedInside) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuId]);

  return (
    <div className='flex h-screen bg-white relative'>
      {/* Sidebar Component */}
      <Sidebar onCollapseChange={setIsSidebarCollapsed} />

      {/* Main Content */}
      <main className={`flex-1 bg-white px-8 py-6 overflow-auto flex flex-col transition-all duration-300 relative ${isSidebarCollapsed ? 'pl-16' : ''}`}>
        {/* Create Button - Top Right */}
        <button
          onClick={() => navigate('/create-bot')}
          className='absolute top-6 right-6 flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 z-10'
          aria-label='Create new bot'
        >
          <span>Create bot</span>
          <HiPlus className='text-lg' />
        </button>

        {/* Header */}
        <div className='mb-6'>
          <h1 className='text-3xl font-bold text-gray-800 mb-4'>Bots</h1>
          
          {/* Search Input */}
          <div className='relative max-w-md'>
            <HiSearch className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg' />
            <input
              type='text'
              placeholder='Search Bots'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className='w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
              aria-label='Search bots'
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className='mb-4 p-4 bg-red-50 border border-red-200 rounded-lg'>
            <p className='text-red-800 text-sm'>{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className='flex-1 flex items-center justify-center'>
            <div className='text-center'>
              <p className='text-gray-600'>Loading bots...</p>
            </div>
          </div>
        )}

        {/* Content - Bot List */}
        {!loading && (
        <div className='flex-1'>
          {filteredBots.length > 0 ? (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                {filteredBots.map(bot => {
                  const botStatus = bot.enabled ? 'Active' : 'Inactive';
                  const isHelpBot = bot.name === HELP_BOT_NAME;
                  return (
                  <div key={bot.id} className='bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow hover:border-yellow-400 flex flex-col justify-between relative min-w-0 overflow-hidden'>
                    {!isHelpBot && (
                    <div 
                      className='absolute top-4 right-4'
                      ref={(el) => menuRefs.current[bot.id] = el}
                    >
                      <button
                        type='button'
                        onClick={(e) => handleMenuToggle(e, bot.id)}
                        className='p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors'
                      >
                        <HiDotsHorizontal className='text-xl' />
                      </button>
                      {openMenuId === bot.id && (
                        <div className='absolute right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-48'>
                          <button
                            type='button'
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); navigate('/create-bot', { state: { bot } }); }}
                            className='w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-200 first:rounded-t-lg text-gray-700'
                          >
                            แก้ไข
                          </button>
                          <button
                            type='button'
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(bot.id); setOpenMenuId(null); }}
                            className='w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 transition-colors last:rounded-b-lg'
                          >
                            ลบ Bot
                          </button>
                        </div>
                      )}
                    </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className='flex items-center gap-3 mb-3 min-w-0'>
                        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getBotProfileColor(bot.id)} flex items-center justify-center text-white font-bold text-lg flex-shrink-0 transition-all ${
                            !bot.enabled ? 'grayscale opacity-50' : ''
                        }`}>
                          {isEmojiAvatar(bot.avatarUrl) ? (
                            <span className="text-2xl">{getEmoji(bot.avatarUrl)}</span>
                          ) : (
                            bot.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <h3 title={bot.name} className='text-lg font-semibold text-gray-800 truncate'>{bot.name}</h3>
                      </div>
                        <p title={bot.description || ''} className='text-sm text-gray-600 mb-2 line-clamp-2 break-words'>{bot.description || 'No description'}</p>
                        <div title={bot.documents?.length ? bot.documents.map((d) => d.displayName || d.name || d.id).join(', ') : ''} className="text-xs text-gray-500 mb-3 truncate">
                          <span className="font-medium text-gray-600">Knowledge: </span>
                          {bot.documents && bot.documents.length > 0
                            ? bot.documents.map((d) => d.displayName || d.name || d.id).join(', ')
                            : (bot.documentIds && bot.documentIds.length > 0 ? `${bot.documentIds.length} ชุด` : 'ยังไม่ได้ผูก')}
                        </div>
                      <div className='flex items-center justify-between'>
                          <span className={`inline-block px-3 py-1 text-xs rounded-full font-semibold ${bot.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{botStatus}</span>
                        {!isHelpBot && (
                      <button
                          type='button'
                          onClick={(e) => handleStatusToggle(e, bot.id)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 ${
                              bot.enabled ? 'bg-yellow-400' : 'bg-gray-300'
                          }`}
                          aria-label='Toggle bot status'
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                bot.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                      </button>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
            </div>
          ) : botList.length === 0 ? (
            <div className='text-center py-16'>
              <p className='text-gray-500 text-lg mb-4'>No bots created yet</p>
              <p className='text-gray-400 text-sm mb-8'>Click "Create Bot" to get started</p>
              <button
                onClick={() => navigate('/create-bot')}
                className='px-6 py-3 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95'
                aria-label='Create your first bot'
              >
                Create Your First Bot
              </button>
            </div>
          ) : (
            <div className='text-center py-16'>
              <p className='text-gray-500 text-lg mb-4'>No bots found</p>
              <p className='text-gray-400 text-sm'>Try adjusting your search query</p>
            </div>
          )}
        </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirmId && (
          <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50' onClick={() => setDeleteConfirmId(null)}>
            <div className='bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4' onClick={(e) => e.stopPropagation()}>
              <h2 className='text-xl font-semibold text-gray-800 mb-4'>Confirm Delete</h2>
              <p className='text-gray-600 mb-6'>
                Are you sure you want to delete this bot? This action cannot be undone.
              </p>
              <div className='flex justify-end gap-3'>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className='px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors'
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  className='px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg shadow-sm transition-all duration-200 hover:scale-105 active:scale-95'
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Bots;
