import { HiSearch, HiDesktopComputer, HiUser, HiArrowLeft, HiBookOpen } from 'react-icons/hi';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { api, mapBotToDisplay } from '../services/api';
import { useAdminSystemConfig } from '../context/AdminSystemConfigContext';

const AVATAR_COLORS = [
  'bg-blue-400', 'bg-purple-400', 'bg-pink-400', 'bg-indigo-400',
  'bg-green-400', 'bg-yellow-400', 'bg-red-400', 'bg-teal-400',
  'bg-orange-400', 'bg-cyan-400', 'bg-lime-400', 'bg-rose-400',
];

function UserBots() {
  const { getCopy, getTextStyle } = useAdminSystemConfig();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [botList, setBotList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null);
  const itemsPerPage = 12;

  const loadBots = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const list = await api.getAdminBots({ ownerRole: 'user' });
      setBotList((list || []).map((b, i) => mapBotToDisplay(b, i, AVATAR_COLORS)));
    } catch (err) {
      setBotList([]);
      const msg = err?.message || '';
      setLoadError(
        msg === 'SESSION_EXPIRED'
          ? 'SESSION_EXPIRED'
          : msg || 'โหลดบอทของผู้ใช้ไม่สำเร็จ',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  const filteredBots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return botList;
    return botList.filter((bot) => {
      const docNames = (bot.documents || [])
        .map((d) => String(d.displayName || d.name || '').toLowerCase())
        .join(' ');
      return (
        bot.name.toLowerCase().includes(q) ||
        (bot.description && bot.description.toLowerCase().includes(q)) ||
        (bot.username && bot.username.toLowerCase().includes(q)) ||
        (bot.ownerEmail && bot.ownerEmail.toLowerCase().includes(q)) ||
        docNames.includes(q)
      );
    });
  }, [botList, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredBots.length / itemsPerPage));
  const paginatedBots = filteredBots.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const attachedDocs = useMemo(() => {
    if (!selected) return [];
    return (selected.documents || []).map((doc) => ({
      id: doc.id,
      name: doc.displayName || doc.name || doc.id || 'ไม่มีชื่อ',
    }));
  }, [selected]);

  if (selected) {
    return (
      <div className="w-full pb-10">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6 transition-colors"
        >
          <HiArrowLeft className="text-2xl" />
          <span className="text-sm">กลับรายการบอท</span>
        </button>

        <div className="flex items-center gap-4 mb-8">
          <div className={`w-20 h-20 rounded-full ${selected.color || 'bg-gray-300'} flex-shrink-0`} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-800 truncate">{selected.name}</h1>
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1 min-w-0">
              <HiUser className="shrink-0" />
              <span className="truncate">
                {selected.username}
                {selected.ownerEmail && selected.ownerEmail !== selected.username
                  ? ` · ${selected.ownerEmail}`
                  : ''}
              </span>
            </div>
            <span
              className={`inline-flex mt-2 text-[11px] px-2 py-0.5 rounded-full ${
                selected.enabled
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {selected.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
            </span>
          </div>
        </div>

        <div className="space-y-6 max-w-3xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">คำอธิบาย</label>
            <div className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 whitespace-pre-wrap break-words min-h-[6rem]">
              {selected.description || 'ไม่มีคำอธิบาย'}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                ความรู้ที่แนบ ({attachedDocs.length})
              </label>
            </div>
            <div className="border border-gray-200 rounded-lg p-4 bg-white">
              {attachedDocs.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {attachedDocs.map((doc) => (
                    <span
                      key={doc.id || doc.name}
                      className="inline-flex items-center gap-1.5 max-w-full px-3 py-2 bg-yellow-100 text-gray-800 rounded-full text-sm"
                      title={doc.name}
                    >
                      <HiBookOpen className="shrink-0 text-yellow-700" />
                      <span className="truncate">{doc.name}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">บอทนี้ยังไม่มีเอกสารแนบ</p>
              )}
              <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                แสดงเฉพาะชื่อเอกสาร — ไม่สามารถเปิดดูเนื้อหาภายในได้
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
            <HiDesktopComputer className="text-white text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800" style={getTextStyle('admin.userBots.title')}>
              {getCopy('admin.userBots.title', 'User Bots')}{' '}
              <span className="text-gray-600 font-normal">{filteredBots.length}</span>
            </h1>
            <p className="text-sm text-gray-600" style={getTextStyle('admin.userBots.subtitle')}>
              {getCopy(
                'admin.userBots.subtitle',
                'บอทของผู้ใช้ — กดดูรายละเอียดเพื่อเห็นชื่อเอกสารที่แนบ',
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="relative max-w-md mb-6">
        <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl" />
        <input
          type="text"
          placeholder="ค้นหาบอท / เจ้าของ / ชื่อเอกสาร"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700"
        />
      </div>

      {loadError && (
        <div className="mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50 flex justify-between gap-3">
          <p className="text-sm text-amber-800">
            {loadError === 'SESSION_EXPIRED' ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' : loadError}
          </p>
          <button
            type="button"
            onClick={loadBots}
            className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm"
          >
            โหลดใหม่
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-gray-200" />
                <div className="flex-1">
                  <div className="h-4 w-2/3 rounded bg-gray-200" />
                  <div className="mt-2 h-3 w-1/3 rounded bg-gray-100" />
                </div>
              </div>
              <div className="mt-4 h-3 w-full rounded bg-gray-100" />
              <div className="mt-2 h-3 w-4/5 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : filteredBots.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-700 text-lg mb-1">
            {searchQuery.trim() ? 'ไม่พบบอทที่ค้นหา' : 'ยังไม่มีบอทของผู้ใช้'}
          </p>
          <p className="text-gray-500 text-sm">
            {searchQuery.trim() ? 'ลองเปลี่ยนคำค้นหา' : 'เมื่อผู้ใช้สร้างบอท จะแสดงที่นี่'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-3">
            {paginatedBots.map((bot) => {
              const docCount = Array.isArray(bot.documents) ? bot.documents.length : 0;
              return (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() => setSelected(bot)}
                  className="text-left bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-yellow-300 transition-all flex flex-col min-w-0"
                >
                  <div className="flex items-start gap-4 mb-3">
                    <div
                      className={`w-12 h-12 rounded-full ${bot.color} flex-shrink-0 ${
                        !bot.enabled ? 'grayscale opacity-50' : ''
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <h3
                        title={bot.name}
                        className={`text-base font-semibold mb-1 truncate ${
                          bot.enabled ? 'text-gray-800' : 'text-gray-400'
                        }`}
                      >
                        {bot.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
                        <HiUser className="shrink-0" />
                        <span className="truncate" title={bot.ownerEmail || bot.username}>
                          {bot.username}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${
                        bot.enabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {bot.enabled ? 'เปิด' : 'ปิด'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3 min-h-[2.5rem]">
                    {bot.description || 'ไม่มีคำอธิบาย'}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500 truncate inline-flex items-center gap-1">
                      <HiBookOpen className="text-yellow-600" />
                      เอกสารแนบ {docCount} รายการ
                    </p>
                    <span className="text-xs font-medium text-yellow-700">รายละเอียด →</span>
                  </div>
                </button>
              );
            })}
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
              <span className="text-sm text-gray-600">
                {currentPage} / {totalPages}
              </span>
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
    </div>
  );
}

export default UserBots;
