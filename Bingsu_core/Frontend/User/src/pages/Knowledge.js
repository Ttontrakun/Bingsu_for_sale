import { useNavigate } from 'react-router-dom';
import { HiPlus, HiSearch, HiDotsHorizontal } from 'react-icons/hi';
import Sidebar from '../components/Sidebar';
import { showToast } from '../components/ToastNotification';
import { useState, useRef, useEffect, useMemo } from 'react';
import { documentAPI, getErrorMessage } from '../services/api';

const HELP_KNOWLEDGE_NAME = 'คู่มือการใช้งาน';

function Knowledge() {
  const navigate = useNavigate();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [knowledgeList, setKnowledgeList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [openGroupDropdownId, setOpenGroupDropdownId] = useState(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [knowledgeToDelete, setKnowledgeToDelete] = useState(null);
  const [isGroupConfirmOpen, setIsGroupConfirmOpen] = useState(false);
  const [groupConfirmAction, setGroupConfirmAction] = useState(null);
  const [pendingGroup, setPendingGroup] = useState(null);
  const [pendingKnowledgeId, setPendingKnowledgeId] = useState(null);
  const menuRefs = useRef({});
  const dropdownRefs = useRef({});

  // Load knowledge/documents from API
  useEffect(() => {
    loadKnowledge();
    
    // Listen for knowledge update events
    const handleKnowledgeUpdate = () => {
      loadKnowledge();
    };
    window.addEventListener('knowledgeUpdated', handleKnowledgeUpdate);
    
    return () => {
      window.removeEventListener('knowledgeUpdated', handleKnowledgeUpdate);
    };
  }, []);

  const loadKnowledge = async () => {
    setLoading(true);
    setError(null);
    try {
      const documents = await documentAPI.getDocuments();
      // Transform documents to knowledge format
      const knowledge = documents.map(doc => ({
        id: doc.id,
        name: doc.displayName || 'Unnamed Knowledge',
        description: doc.tags && doc.tags.length > 0
          ? doc.tags.join(', ')
          : (doc.displayName === HELP_KNOWLEDGE_NAME ? 'คู่มือ' : 'No tags'),
        groups: [] // Groups feature not implemented yet
      }));
      setKnowledgeList(knowledge);
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      setError(errorMsg);
      console.error('Error loading knowledge:', err);
      // Show toast notification for better UX
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Filter knowledge based on search query
  const filteredKnowledgeList = useMemo(() => {
    if (!searchQuery.trim()) {
      return knowledgeList;
    }
    const query = searchQuery.toLowerCase();
    return knowledgeList.filter(k => 
      k.name.toLowerCase().includes(query) ||
      k.description.toLowerCase().includes(query)
    );
  }, [knowledgeList, searchQuery]);

  const handleMenuToggle = (e, knowledgeId) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === knowledgeId ? null : knowledgeId);
    setOpenGroupDropdownId(null);
  };

  const handleConfirmGroupChange = () => {
    if (!pendingGroup || !pendingKnowledgeId || !groupConfirmAction) {
      setIsGroupConfirmOpen(false);
      return;
    }

    const updatedList = knowledgeList.map((k) => {
      if (k.id !== pendingKnowledgeId) return k;
      const exists = k.groups.find((g) => g.id === pendingGroup.id);

      if (groupConfirmAction === 'remove' && exists) {
        return { ...k, groups: k.groups.filter((g) => g.id !== pendingGroup.id) };
      }

      if (groupConfirmAction === 'add' && !exists) {
        return { ...k, groups: [...k.groups, pendingGroup] };
      }

      return k;
    });

    setKnowledgeList(updatedList);
    setIsGroupConfirmOpen(false);
    setPendingGroup(null);
    setPendingKnowledgeId(null);
    setGroupConfirmAction(null);
  };

  const handleCancelGroupChange = () => {
    setIsGroupConfirmOpen(false);
    setPendingGroup(null);
    setPendingKnowledgeId(null);
    setGroupConfirmAction(null);
  };

  const handleDeleteClick = (e, knowledgeId) => {
    e.stopPropagation();
    setKnowledgeToDelete(knowledgeId);
    setIsDeleteConfirmOpen(true);
    setOpenMenuId(null);
  };

  const handleConfirmDelete = async () => {
    if (knowledgeToDelete) {
      try {
        await documentAPI.deleteDocument(knowledgeToDelete);
        setKnowledgeList(knowledgeList.filter(k => k.id !== knowledgeToDelete));
        // Dispatch event to refresh if needed
        window.dispatchEvent(new CustomEvent('knowledgeUpdated'));
      } catch (err) {
        console.error('Error deleting knowledge:', err);
        showToast(getErrorMessage(err), 'error');
      }
    }
    setIsDeleteConfirmOpen(false);
    setKnowledgeToDelete(null);
  };

  const handleCancelDelete = () => {
    setIsDeleteConfirmOpen(false);
    setKnowledgeToDelete(null);
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

      Object.values(dropdownRefs.current).forEach(ref => {
        if (ref && ref.contains(event.target)) {
          isClickedInside = true;
        }
      });

      if (!isClickedInside) {
        setOpenMenuId(null);
        setOpenGroupDropdownId(null);
      }
    };

    if (openMenuId || openGroupDropdownId) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuId, openGroupDropdownId]);

  return (
    <div className='flex h-screen bg-white relative'>
      {/* Sidebar Component */}
      <Sidebar onCollapseChange={setIsSidebarCollapsed} />

      {/* Main Content */}
      <main className={`flex-1 bg-white px-8 py-6 overflow-auto flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-16' : ''}`}>
        {/* Create Button - Top Right */}
        <button
          onClick={() => navigate('/create-knowledge')}
          className='absolute top-6 right-6 flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 z-10'
        >
          <span>Create Knowledge</span>
          <HiPlus className='text-lg' />
        </button>

        {/* Header */}
        <div className='mb-6'>
          <h1 className='text-3xl font-bold text-gray-800 mb-4'>Knowledge</h1>
          
          {/* Search Input */}
          <div className='relative max-w-md'>
            <HiSearch className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg' />
            <input
              type='text'
              placeholder='Search Knowledge'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className='w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400'
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
              <p className='text-gray-600'>Loading knowledge...</p>
            </div>
          </div>
        )}

        {/* Knowledge List */}
        {!loading && (
          <div className='flex-1'>
            {filteredKnowledgeList.length > 0 ? (
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                {filteredKnowledgeList.map((knowledge) => {
                  const isHelpDoc = knowledge.name === HELP_KNOWLEDGE_NAME;
                  return (
                <div
                  key={knowledge.id}
                  onClick={!isHelpDoc ? () => navigate(`/knowledge/${knowledge.id}/add-data`) : undefined}
                  className={`bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow hover:border-yellow-400 relative min-w-0 overflow-hidden ${!isHelpDoc ? 'cursor-pointer' : ''}`}
                >
                  {!isHelpDoc && (
                  <div 
                    className='absolute top-4 right-4'
                    ref={(el) => menuRefs.current[knowledge.id] = el}
                  >
                    <button
                      type='button'
                      onClick={(e) => handleMenuToggle(e, knowledge.id)}
                      className='p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors'
                    >
                      <HiDotsHorizontal className='text-xl' />
                    </button>
                    {openMenuId === knowledge.id && (
                      <div className='absolute right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-48'>
                        <button
                          type='button'
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(null);
                            navigate('/create-knowledge', { state: { knowledge } });
                          }}
                          className='w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-200 first:rounded-t-lg text-gray-700'
                        >
                          แก้ไข
                        </button>
                        <button
                          type='button'
                          onClick={(e) => handleDeleteClick(e, knowledge.id)}
                          className='w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 transition-colors last:rounded-b-lg'
                        >
                          ลบ Knowledge
                        </button>
                      </div>
                    )}
                  </div>
                  )}

                  <h3 title={knowledge.name} className='text-lg font-semibold text-gray-800 mb-2 pr-8 truncate'>{knowledge.name}</h3>
                  <p title={knowledge.description || ''} className='text-sm text-gray-600 mb-4 line-clamp-2 break-words'>{knowledge.description || ''}</p>
                  {!isHelpDoc && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/knowledge/${knowledge.id}/add-data`);
                    }}
                    className='inline-flex items-center gap-2 px-2 py-1 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-medium rounded-md shadow hover:shadow-md transition-all duration-200 hover:scale-105 active:scale-95 text-sm'
                  >
                    <span>Add Data</span>
                    <span>→</span>
                  </button>
                  )}

                  {knowledge.groups.length > 0 && (
                    <div className='mt-4 pt-4 border-t border-gray-200 min-w-0'>
                      <p className='text-xs font-medium text-gray-700 mb-2'>กลุ่มที่เป็นสมาชิก:</p>
                      <div className='flex flex-wrap gap-2'>
                        {knowledge.groups.map((group) => (
                          <span key={group.id} title={group.name} className='inline-flex items-center max-w-full px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 truncate'>
                            {typeof group.name === 'string' && group.name.length > 30 ? group.name.slice(0, 27) + '...' : group.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                );
                })}
              </div>
            ) : knowledgeList.length === 0 ? (
              <div className='text-center py-16'>
                <p className='text-gray-500 text-lg mb-4'>No knowledge bases created yet</p>
                <p className='text-gray-400 text-sm mb-8'>Click "Create Knowledge" to get started</p>
                <button
                  onClick={() => navigate('/create-knowledge')}
                  className='px-6 py-3 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95'
                >
                  Create Your First Knowledge Base
                </button>
              </div>
            ) : (
              <div className='text-center py-16'>
                <p className='text-gray-500 text-lg mb-4'>No knowledge found</p>
                <p className='text-gray-400 text-sm'>Try adjusting your search query</p>
              </div>
            )}
          </div>
        )}

        {/* Group Confirm Modal */}
        {isGroupConfirmOpen && (
          <>
            <div className='fixed inset-0 bg-black bg-opacity-50 z-40' onClick={handleCancelGroupChange} />
            <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
              <div className='bg-white rounded-lg shadow-2xl w-full max-w-sm p-6'>
                <h3 className='text-lg font-semibold text-gray-800 mb-4'>
                  {groupConfirmAction === 'remove' ? 'ต้องการนำกลุ่มนี้ออกจาก Knowledge นี้หรือไม่?' : 'ต้องการเพิ่ม Knowledge นี้ลงกลุ่มความรู้นี้หรือไม่?'}
                </h3>
                <p className='text-sm text-gray-600 mb-6'>
                  {pendingGroup ? `กลุ่ม: ${pendingGroup.name}` : ''}
                </p>
                <div className='flex gap-3 justify-end'>
                  <button
                    type='button'
                    onClick={handleCancelGroupChange}
                    className='px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors'
                  >
                    Cancel
                  </button>
                  <button
                    type='button'
                    onClick={handleConfirmGroupChange}
                    className={`px-4 py-2 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 ${groupConfirmAction === 'remove' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-yellow-400 hover:bg-yellow-500 text-gray-800'}`}
                  >
                    {groupConfirmAction === 'remove' ? 'Remove' : 'Add'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Delete Confirmation Modal */}
        {isDeleteConfirmOpen && (
          <>
            {/* Backdrop */}
            <div className='fixed inset-0 bg-black bg-opacity-50 z-40' onClick={handleCancelDelete} />
            
            {/* Confirmation Dialog */}
            <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
              <div className='bg-white rounded-lg shadow-2xl w-full max-w-sm p-6'>
                <h3 className='text-lg font-semibold text-gray-800 mb-4'>
                  ลบ Knowledge นี้หรือไม่?
                </h3>
                <p className='text-sm text-gray-600 mb-6'>
                  คุณแน่ใจหรือไม่ว่าต้องการลบ Knowledge นี้ การดำเนินการนี้ไม่สามารถเรียกคืนได้
                </p>
                <div className='flex gap-3 justify-end'>
                  <button
                    type='button'
                    onClick={handleCancelDelete}
                    className='px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors'
                  >
                    Cancel
                  </button>
                  <button
                    type='button'
                    onClick={handleConfirmDelete}
                    className='px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200'
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default Knowledge;
