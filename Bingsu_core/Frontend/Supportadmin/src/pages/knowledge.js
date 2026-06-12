import { useNavigate } from 'react-router-dom';
import { HiSearch, HiTrash, HiPlus } from 'react-icons/hi';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { api, mapDocumentToDisplay } from '../services/api';

function Knowledge({ userRole = 'support' }) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const itemsPerPage = 12;
  const canDeleteKnowledge = userRole === 'support' || userRole === 'admin';
  const [knowledgeList, setKnowledgeList] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const GUIDE_NAME = 'คู่มือการใช้งาน';

  const pinGuideFirst = useCallback((list) => {
    const arr = Array.isArray(list) ? list : [];
    const guide = arr.filter((k) => k?.name === GUIDE_NAME);
    const rest = arr.filter((k) => k?.name !== GUIDE_NAME);
    return [...guide, ...rest];
  }, []);

  const loadKnowledge = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await api.getAdminDocuments();
      const mapped = (list || []).map(mapDocumentToDisplay);
      setKnowledgeList(pinGuideFirst(mapped));
    } catch (err) {
      setKnowledgeList([]);
      const msg = err?.message || '';
      setLoadError(msg === 'SESSION_EXPIRED' ? 'SESSION_EXPIRED' : (msg || 'โหลดรายการ Knowledge ไม่สำเร็จ — ตรวจสอบว่า backend รันอยู่'));
    }
  }, [pinGuideFirst]);

  useEffect(() => {
    loadKnowledge();
  }, [loadKnowledge]);

  // Filter knowledge based on search query
  const filteredKnowledgeList = useMemo(() => {
    if (!searchQuery.trim()) {
      return pinGuideFirst(knowledgeList);
    }
    const query = searchQuery.toLowerCase();
    const filtered = knowledgeList.filter(k => 
      k.name.toLowerCase().includes(query) ||
      (k.description && k.description.toLowerCase().includes(query)) ||
      (k.username && k.username.toLowerCase().includes(query))
    );
    return pinGuideFirst(filtered);
  }, [knowledgeList, pinGuideFirst, searchQuery]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredKnowledgeList.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedKnowledgeList = filteredKnowledgeList.slice(startIndex, endIndex);

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleConfirmDelete = async () => {
    if (confirmDeleteId === null) return;
    if (!canDeleteKnowledge) {
      setConfirmDeleteId(null);
      return;
    }
    try {
      await api.deleteDocument(confirmDeleteId);
      setKnowledgeList((prev) => prev.filter((knowledge) => knowledge.id !== confirmDeleteId));
    } catch (err) {
      setLoadError(err?.message || 'ลบ Knowledge ไม่สำเร็จ');
    }
    setConfirmDeleteId(null);
  };

  return (
    <>
      {/* Header */}
      <div className='mb-6'>
        <div className='flex items-center justify-between mb-4 pr-16'>
          <h1 className='text-2xl font-semibold text-gray-800'>
            Knowledge <span className='text-gray-600 font-normal'>{filteredKnowledgeList.length}</span>
          </h1>
          <button
            type='button'
            onClick={() => navigate('/knowledge/create')}
            className='flex items-center gap-2 px-4 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-sm transition-all text-sm'
          >
            <HiPlus className='text-lg' />
            สร้าง Knowledge
          </button>
        </div>

        {/* Search Input */}
        <div className='relative max-w-md'>
          <HiSearch className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl' />
          <input
            type='text'
            placeholder='Search Knowledge'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
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
              onClick={() => loadKnowledge()}
              className='px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium'
            >
              โหลดใหม่
            </button>
          )}
        </div>
      )}

      {/* Knowledge List */}
      <div className='flex-1 flex flex-col'>
        {filteredKnowledgeList.length > 0 ? (
          <>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-3'>
              {paginatedKnowledgeList.map((knowledge) => (
              <div
                key={knowledge.id}
                className='bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col min-w-0 overflow-hidden'
              >
                <div className='flex-1 min-w-0'>
                  <h3 title={knowledge.name} className='text-base font-semibold text-gray-800 mb-1 truncate'>{knowledge.name}</h3>
                  <p title={knowledge.description || ''} className='text-sm text-gray-600 line-clamp-2 break-words'>{knowledge.description || 'No description'}</p>
                </div>
                <div className='flex justify-between items-center mt-4 gap-2 min-w-0'>
                  <p title={knowledge.username} className='text-xs text-gray-500 truncate flex-shrink min-w-0'>By {knowledge.username}</p>
                  <div className='flex items-center gap-2 flex-shrink-0'>
                    <button
                      onClick={() =>
                        navigate(`/knowledge/${knowledge.id}/add-data`, {
                          state: { knowledgeName: knowledge.name },
                        })
                      }
                      className='px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 text-sm'
                    >
                      อัปโหลดเอกสาร
                    </button>
                    {canDeleteKnowledge && (
                    <button
                      type='button'
                      onClick={() => setConfirmDeleteId(knowledge.id)}
                      className='inline-flex items-center gap-2 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium'
                    >
                      <HiTrash className='text-lg' />
                      ลบ
                    </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
            <p className='text-gray-500 text-lg mb-4'>No knowledge found</p>
            <p className='text-gray-400 text-sm'>Try adjusting your search query</p>
          </div>
        )}
      </div>

      {confirmDeleteId !== null && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
          <div className='w-full max-w-sm rounded-xl bg-white p-6 shadow-lg'>
            <h3 className='text-lg font-semibold text-gray-800 mb-2'>ยืนยันการลบ</h3>
            <p className='text-sm text-gray-600 mb-5'>ต้องการลบรายการนี้ใช่ไหม?</p>
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

export default Knowledge;
