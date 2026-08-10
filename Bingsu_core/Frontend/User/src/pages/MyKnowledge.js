import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiBookOpen, HiPlus, HiSearch, HiTrash, HiPencil } from 'react-icons/hi';
import Sidebar from '../components/Sidebar';
import { showToast } from '../components/ToastNotification';
import { knowledgeAPI, getErrorMessage } from '../services/api';
import { useSystemConfig } from '../context/SystemConfigContext';

function MyKnowledge() {
  const navigate = useNavigate();
  const { menuEnabled, getCopy, getTextStyle } = useSystemConfig();
  const knowledgeTitle = getCopy('user.knowledge.title', 'Knowledge');
  const knowledgeSubtitle = getCopy('user.knowledge.subtitle', 'จัดการฐานความรู้และเอกสารของคุณ');
  const [list, setList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const itemsPerPage = 12;

  useEffect(() => {
    if (!menuEnabled('uploadDocs')) navigate('/homepage', { replace: true });
  }, [menuEnabled, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const rows = await knowledgeAPI.list();
      setList(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setList([]);
      setLoadError(getErrorMessage(err) || 'โหลด Knowledge ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((k) => {
      const name = String(k.displayName || k.name || '').toLowerCase();
      const tags = Array.isArray(k.tags) ? k.tags.join(' ').toLowerCase() : '';
      return name.includes(q) || tags.includes(q);
    });
  }, [list, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginated = filtered.slice(startIndex, startIndex + itemsPerPage);

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await knowledgeAPI.delete(confirmDeleteId);
      setList((prev) => prev.filter((k) => k.id !== confirmDeleteId));
      showToast('ลบแล้ว', 'success');
    } catch (err) {
      showToast(getErrorMessage(err) || 'ลบไม่สำเร็จ', 'error');
    }
    setConfirmDeleteId(null);
  };

  const handleRename = async () => {
    if (!editTarget?.id) return;
    const next = editName.trim();
    if (!next) {
      showToast('กรุณากรอกชื่อ', 'warning');
      return;
    }
    setEditSaving(true);
    try {
      await knowledgeAPI.update(editTarget.id, { displayName: next });
      setList((prev) =>
        prev.map((k) => (k.id === editTarget.id ? { ...k, displayName: next, name: next } : k)),
      );
      setEditTarget(null);
      showToast('แก้ชื่อแล้ว', 'success');
    } catch (err) {
      showToast(getErrorMessage(err) || 'แก้ชื่อไม่สำเร็จ', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <main className="flex-1 overflow-auto thin-scrollbar px-6 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
              <HiBookOpen className="text-white text-2xl" />
            </div>
            <div>
              <h1
                className="text-2xl font-bold text-gray-800"
                style={getTextStyle('user.knowledge.title')}
              >
                {knowledgeTitle}{' '}
                <span className="text-gray-600 font-normal">{filtered.length}</span>
              </h1>
              <p className="text-sm text-gray-600" style={getTextStyle('user.knowledge.subtitle')}>
                {knowledgeSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/my-knowledge/create')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-sm transition-all text-sm self-start"
          >
            <HiPlus className="text-lg" />
            สร้าง Knowledge
          </button>
        </div>

        <div className="relative max-w-md mb-6">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl" />
          <input
            type="text"
            placeholder="Search Knowledge"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400"
          />
        </div>

        {loadError && (
          <div className="mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50 flex justify-between gap-3">
            <p className="text-sm text-amber-800">{loadError}</p>
            <button
              type="button"
              onClick={load}
              className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm"
            >
              โหลดใหม่
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">กำลังโหลด...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg mb-2">ยังไม่มี Knowledge</p>
            <p className="text-gray-400 text-sm">กด “สร้าง Knowledge” เพื่อเริ่มต้น</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginated.map((knowledge) => {
                const name = knowledge.displayName || knowledge.name || '-';
                const fileCount = Array.isArray(knowledge.sourceFiles)
                  ? knowledge.sourceFiles.length
                  : 0;
                return (
                  <div
                    key={knowledge.id}
                    className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col min-w-0 overflow-hidden"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 title={name} className="text-base font-semibold text-gray-800 mb-1 truncate">
                        {name}
                      </h3>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {fileCount > 0 ? `${fileCount} ไฟล์ในฐานความรู้` : 'ยังไม่มีไฟล์ — กดอัปโหลดเอกสาร'}
                      </p>
                    </div>
                    <div className="flex justify-between items-center mt-4 gap-2 min-w-0">
                      <p className="text-xs text-gray-500 truncate">ของฉัน</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditTarget(knowledge);
                            setEditName(name);
                          }}
                          className="inline-flex items-center gap-2 px-3 py-2 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors text-sm font-medium"
                        >
                          <HiPencil className="text-lg" />
                          แก้ชื่อ
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/my-knowledge/${knowledge.id}/add-data`, {
                              state: { knowledgeName: name },
                            })
                          }
                          className="px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 text-sm"
                        >
                          อัปโหลดเอกสาร
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(knowledge.id)}
                          className="inline-flex items-center gap-2 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
                        >
                          <HiTrash className="text-lg" />
                          ลบ
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ก่อนหน้า
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium ${
                      currentPage === page
                        ? 'bg-yellow-400 text-gray-900'
                        : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ถัดไป
                </button>
              </div>
            )}
          </>
        )}

        {confirmDeleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">ยืนยันการลบ</h3>
              <p className="text-sm text-gray-600 mb-5">ต้องการลบรายการนี้ใช่ไหม?</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300"
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

        {editTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">แก้ชื่อ Knowledge</h3>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400"
                maxLength={120}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={handleRename}
                  className="px-4 py-2 rounded-lg bg-yellow-400 text-gray-800 disabled:opacity-50"
                >
                  {editSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default MyKnowledge;
