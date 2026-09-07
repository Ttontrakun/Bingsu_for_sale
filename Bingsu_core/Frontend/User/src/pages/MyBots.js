import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiDesktopComputer, HiPlus, HiSearch, HiTrash } from 'react-icons/hi';
import Sidebar from '../components/Sidebar';
import { showToast } from '../components/ToastNotification';
import { botAPI, getErrorMessage } from '../services/api';
import { useSystemConfig } from '../context/SystemConfigContext';

const AVATAR_COLORS = [
  'bg-blue-400', 'bg-purple-400', 'bg-pink-400', 'bg-indigo-400',
  'bg-green-400', 'bg-yellow-400', 'bg-red-400', 'bg-teal-400',
  'bg-orange-400', 'bg-cyan-400', 'bg-lime-400', 'bg-rose-400',
];

function MyBots() {
  const navigate = useNavigate();
  const { menuEnabled, getCopy, getTextStyle } = useSystemConfig();
  const botsTitle = getCopy('user.bots.title', 'Bots');
  const botsSubtitle = getCopy('user.bots.subtitle', 'จัดการบอทและการตั้งค่าของคุณ');
  const [bots, setBots] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [togglingIds, setTogglingIds] = useState([]);
  const itemsPerPage = 12;

  useEffect(() => {
    if (!menuEnabled('createBot')) navigate('/homepage', { replace: true });
  }, [menuEnabled, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await botAPI.getBots();
      const systemNames = new Set(['Enterprise AI Chatbot Assistant', 'บอทช่วยสอน']);
      const owned = (Array.isArray(list) ? list : [])
        .filter((b) => {
          if (b?.isOwned === true) return true;
          if (b?.isOwned === false) return false;
          return !systemNames.has(String(b?.name || ''));
        })
        .map((b, i) => ({
          ...b,
          color: AVATAR_COLORS[i % AVATAR_COLORS.length],
          enabled: b.enabled !== false,
        }));
      setBots(owned);
    } catch (err) {
      setBots([]);
      setLoadError(getErrorMessage(err) || 'โหลดบอทไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return bots;
    return bots.filter(
      (b) =>
        String(b.name || '').toLowerCase().includes(q) ||
        String(b.description || '').toLowerCase().includes(q),
    );
  }, [bots, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const canCreate = bots.length === 0;

  const handleStatusToggle = async (e, botId) => {
    e.stopPropagation();
    const current = bots.find((b) => b.id === botId);
    if (!current) return;
    const nextEnabled = !current.enabled;
    setTogglingIds((prev) => [...prev, botId]);
    setBots((prev) => prev.map((b) => (b.id === botId ? { ...b, enabled: nextEnabled } : b)));
    try {
      const updated = await botAPI.updateBot(botId, { enabled: nextEnabled });
      setBots((prev) =>
        prev.map((b) =>
          b.id === botId ? { ...b, enabled: updated?.enabled ?? nextEnabled } : b,
        ),
      );
    } catch (err) {
      setBots((prev) => prev.map((b) => (b.id === botId ? { ...b, enabled: current.enabled } : b)));
      showToast(getErrorMessage(err) || 'สลับสถานะไม่สำเร็จ', 'error');
    } finally {
      setTogglingIds((prev) => prev.filter((id) => id !== botId));
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await botAPI.deleteBot(confirmDeleteId);
      setBots((prev) => prev.filter((b) => b.id !== confirmDeleteId));
      showToast('ลบบอทแล้ว', 'success');
    } catch (err) {
      showToast(getErrorMessage(err) || 'ลบไม่สำเร็จ', 'error');
    }
    setConfirmDeleteId(null);
  };

  return (
    <div className="flex h-screen bg-[#f7f7f8]">
      <Sidebar />
      <main className="flex-1 overflow-auto px-6 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
              <HiDesktopComputer className="text-white text-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800" style={getTextStyle('user.bots.title')}>
                {botsTitle}{' '}
                <span className="text-gray-600 font-normal">{filtered.length}</span>
              </h1>
              <p className="text-sm text-gray-600" style={getTextStyle('user.bots.subtitle')}>
                {botsSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => navigate('/my-bots/create')}
            title={canCreate ? 'สร้างบอท' : 'บัญชีผู้ใช้มีได้ 1 บอท'}
            className={`inline-flex items-center gap-2 px-4 py-2 font-semibold rounded-lg shadow-sm text-sm self-start ${
              canCreate
                ? 'bg-yellow-400 hover:bg-yellow-500 text-gray-800'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <HiPlus className="text-lg" />
            สร้างบอท
          </button>
        </div>

        <div className="relative max-w-md mb-6">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl" />
          <input
            type="text"
            placeholder="Search Bots"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400"
          />
        </div>

        {loadError && (
          <div className="mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50 flex justify-between gap-3">
            <p className="text-sm text-amber-800">{loadError}</p>
            <button type="button" onClick={load} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm">
              โหลดใหม่
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">กำลังโหลด...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            {searchQuery.trim() ? (
              <>
                <p className="text-gray-500 text-lg mb-2">
                  ไม่พบบอทที่ตรงกับ “{searchQuery.trim()}”
                </p>
                <p className="text-gray-500 text-sm mb-4">ลองใช้คำค้นหาสั้นลง หรือล้างคำค้นหา</p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  ล้างคำค้นหา
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-500 text-lg mb-2">ยังไม่มีบอท</p>
                <p className="text-gray-500 text-sm">กด “สร้างบอท” เพื่อเริ่มต้น</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-3">
              {paginated.map((bot) => (
                <div
                  key={bot.id}
                  className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-yellow-300 transition-all flex flex-col min-w-0 overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div
                        className={`w-12 h-12 rounded-full ${bot.color} flex-shrink-0 ${
                          !bot.enabled ? 'grayscale opacity-50' : ''
                        }`}
                      />
                      <div className={`flex-1 min-w-0 ${!bot.enabled ? 'opacity-50' : ''}`}>
                        <h3
                          title={bot.name}
                          className={`text-base font-semibold mb-1 truncate ${
                            bot.enabled ? 'text-gray-800' : 'text-gray-400'
                          }`}
                        >
                          {bot.name}
                        </h3>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleStatusToggle(e, bot.id)}
                      disabled={togglingIds.includes(bot.id)}
                      className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors flex-shrink-0 ${
                        bot.enabled ? 'bg-green-500' : 'bg-gray-300'
                      } ${togglingIds.includes(bot.id) ? 'opacity-60 cursor-not-allowed' : ''}`}
                      title={bot.enabled ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    >
                      <span
                        className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                          bot.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="mb-3 min-h-[2.5rem]">
                    <p className="text-sm text-gray-600 line-clamp-2 break-words">
                      {bot.description || 'No description'}
                    </p>
                  </div>

                  <div className="flex justify-between items-center mt-auto gap-2 min-w-0">
                    <p className={`text-xs truncate ${bot.enabled ? 'text-gray-500' : 'text-gray-400'}`}>
                      ของฉัน
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => navigate(`/my-bots/${bot.id}`, { state: { bot } })}
                        className="px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all text-sm"
                      >
                        รายละเอียด
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(bot.id)}
                        className="inline-flex items-center gap-2 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium"
                      >
                        <HiTrash className="text-lg" />
                        ลบ
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-4 pt-3">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className={`px-3 py-2 rounded-lg font-medium ${
                    currentPage === 1
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  ←
                </button>
                {[...Array(totalPages)].map((_, index) => {
                  const pageNum = index + 1;
                  if (
                    pageNum === 1 ||
                    pageNum === totalPages ||
                    (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                  ) {
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-4 py-2 rounded-lg font-medium ${
                          currentPage === pageNum
                            ? 'bg-yellow-400 text-gray-800'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                  if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                    return (
                      <span key={pageNum} className="px-2 text-gray-400">
                        ...
                      </span>
                    );
                  }
                  return null;
                })}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-2 rounded-lg font-medium ${
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
        )}

        {confirmDeleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">ยืนยันการลบ</h3>
              <p className="text-sm text-gray-600 mb-5">ต้องการลบบอทนี้ใช่ไหม?</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-4 py-2 rounded-lg bg-red-500 text-white"
                >
                  ลบ
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default MyBots;
