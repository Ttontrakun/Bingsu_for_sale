import { useNavigate, useLocation } from 'react-router-dom';
import { HiArrowLeft, HiChevronDown, HiCheck, HiX } from 'react-icons/hi';
import Sidebar from '../components/Sidebar';
import { useState, useEffect, useRef } from 'react';
import { documentAPI, getErrorMessage } from '../services/api';
import { showToast } from '../components/ToastNotification';

function CreateKnowledge() {
  const navigate = useNavigate();
  const location = useLocation();
  const editingKnowledge = location.state?.knowledge;
  const isEditMode = !!editingKnowledge;
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({ knowledgeName: '' });
  const [knowledgeName, setKnowledgeName] = useState(editingKnowledge?.displayName || editingKnowledge?.name || '');
  const [tags, setTags] = useState(editingKnowledge?.tags?.join(', ') || '');
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState(editingKnowledge?.groups || []);
  const groupDropdownRef = useRef(null);
  const knowledgeNameRef = useRef(null);
  const [groupList] = useState([
    { id: 1, name: 'กลุ่มพัฒนา', description: 'Development Team' },
    { id: 2, name: 'กลุ่มการตลาด', description: 'Marketing Team' },
    { id: 3, name: 'กลุ่มฝ่ายขาย', description: 'Sales Team' },
    { id: 4, name: 'กลุ่มสนับสนุน', description: 'Support Team' },
  ]);

  const handleGroupToggle = (group) => {
    setSelectedGroups((prev) => {
      const exists = prev.find((g) => g.id === group.id);
      return exists ? prev.filter((g) => g.id !== group.id) : [...prev, group];
    });
  };

  const handleRemoveGroup = (groupId) => {
    setSelectedGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(event.target)) {
        setIsGroupDropdownOpen(false);
      }
    };

    if (isGroupDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isGroupDropdownOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({ knowledgeName: '' });

    // Validate required fields
    if (!knowledgeName.trim()) {
      const msg = 'กรุณากรอกชื่อฐานความรู้';
      setFieldErrors({ knowledgeName: msg });
      showToast(msg, 'warning');
      setTimeout(() => {
        if (knowledgeNameRef.current) {
          knowledgeNameRef.current.focus();
          knowledgeNameRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 0);
      setLoading(false);
      return;
    }

    try {
      // Parse tags from comma-separated string
      const tagsArray = tags
        ? tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
        : [];

      console.log('Creating/updating knowledge with data:', {
        displayName: knowledgeName.trim(),
        tags: tagsArray,
        isEditMode
      });

      if (isEditMode) {
        // Update existing document - only update displayName and tags, not sourceFiles
        // This preserves existing sourceFiles and avoids unnecessary re-indexing
        const updateData = {
          displayName: knowledgeName.trim(),
          tags: tagsArray
        };
        console.log('Updating document with data:', updateData);
        await documentAPI.updateDocument(editingKnowledge.id, updateData);
      } else {
        // Create new document without files - user will add files later
        const documentData = {
          displayName: knowledgeName.trim(),
          sourceFiles: [], // Empty array - user will add files via Add Data page
          tags: tagsArray,
          link: null
        };
        
        console.log('Sending document creation request:', documentData);
        await documentAPI.createDocument(documentData);
      }

      // Dispatch event to refresh knowledge list
      window.dispatchEvent(new CustomEvent('knowledgeUpdated'));
      
      // Navigate back to knowledge page
      navigate('/knowledge');
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      if (err?.response?.status === 409) {
        const msg = errorMsg || 'ชื่อ Knowledge นี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น';
        setFieldErrors({ knowledgeName: msg });
        showToast(msg, 'warning');
        setTimeout(() => {
          if (knowledgeNameRef.current) {
            knowledgeNameRef.current.focus();
            knowledgeNameRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 0);
      }
      setError(errorMsg);
      console.error('Error saving knowledge:', err);
      console.error('Error response:', err.response?.data);
      // Log full error details for debugging
      if (err.response?.data) {
        console.error('Full error details:', JSON.stringify(err.response.data, null, 2));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='flex h-screen bg-white relative'>
      {/* Sidebar Component */}
      <Sidebar onCollapseChange={setIsSidebarCollapsed} />

      {/* Main Content */}
      <main className={`flex-1 bg-white px-8 py-6 overflow-auto flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-16' : ''}`}>
        {/* Back Button */}
        <button
          onClick={() => navigate('/knowledge')}
          className='flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors mb-6 self-start'
        >
          <HiArrowLeft className='text-lg' />
          <span>Back</span>
        </button>

        <form noValidate onSubmit={handleSubmit} className='flex-1 max-w-4xl'>
          {/* Error Message */}
          {error && (
            <div className='mb-6 p-4 bg-red-50 border-2 border-red-300 rounded-lg shadow-sm'>
              <div className='flex items-start gap-2'>
                <span className='text-red-600 font-bold text-lg'>⚠️</span>
                <div className='flex-1'>
                  <p className='text-red-800 text-sm font-semibold mb-1'>เกิดข้อผิดพลาด:</p>
                  <p className='text-red-700 text-sm whitespace-pre-wrap break-words'>{error}</p>
                </div>
                <button
                  type='button'
                  onClick={() => setError(null)}
                  className='text-red-400 hover:text-red-600 transition-colors flex-shrink-0'
                  aria-label='Close error'
                >
                  <HiX className='text-lg' />
                </button>
              </div>
            </div>
          )}

          {/* Header */}
          <div className='mb-8'>
            <h1 className='text-3xl font-bold text-gray-800 mb-4'>{isEditMode ? 'Edit Knowledge' : 'Create Knowledge'}</h1>
          </div>

          {/* Knowledge Name Section */}
          <div className='mb-8'>
            <label htmlFor='knowledge-name' className='block text-sm font-medium text-gray-700 mb-3'>
              ชื่อฐานความรู้ (Knowledge Base Name)
            </label>
            <input
              ref={knowledgeNameRef}
              id='knowledge-name'
              type='text'
              value={knowledgeName}
              onChange={(e) => {
                setKnowledgeName(e.target.value.slice(0, 120));
                if (fieldErrors.knowledgeName) {
                  setFieldErrors({ knowledgeName: '' });
                }
              }}
              maxLength={120}
              placeholder='Enter knowledge base name'
              aria-invalid={Boolean(fieldErrors.knowledgeName)}
              className={`w-full px-4 py-3 border rounded-lg transition-all text-gray-700 placeholder-gray-400 break-words ${
                fieldErrors.knowledgeName
                  ? 'border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-transparent'
                  : 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent'
              }`}
            />
            {fieldErrors.knowledgeName && (
              <p className='text-xs text-red-600 mt-1'>{fieldErrors.knowledgeName}</p>
            )}
            <p className='text-xs text-gray-500 mt-0.5'>ไม่เกิน 120 ตัวอักษร</p>
          </div>

          {/* Tags Section */}
          <div className='mb-8'>
            <label htmlFor='knowledge-tags' className='block text-sm font-medium text-gray-700 mb-3'>
              Tags (คั่นด้วยเครื่องหมายจุลภาค)
            </label>
            <input
              id='knowledge-tags'
              type='text'
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder='เช่น: documentation, guide, tutorial'
              className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all text-gray-700 placeholder-gray-400'
            />
            <p className='text-xs text-gray-500 mt-2'>ใส่ tags คั่นด้วยเครื่องหมายจุลภาค (,) เพื่อช่วยในการค้นหา</p>
          </div>

          {/* Grouping Section */}
          <div className='mb-8'>
            <label className='block text-md font-medium text-gray-700 mb-3'>
              การจัดกลุ่ม
            </label>
            <p className='text-sm text-gray-600 mb-4'>
              หากต้องการเชื่อมต่อฐานความรู้กับกลุ่มผู้ใช้ ให้เพิ่มกลุ่มผู้ใช้ที่นี่
            </p>
            <div className='relative' ref={groupDropdownRef}>
              <button
                type='button'
                onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}
                className='w-full max-w-md px-4 py-3 bg-white border border-gray-300 rounded-lg text-left flex items-center justify-between hover:border-gray-400 transition-colors'
              >
                <span className={selectedGroups.length > 0 ? 'text-gray-800' : 'text-gray-400'}>
                  {selectedGroups.length > 0 ? `เลือกแล้ว ${selectedGroups.length} กลุ่ม` : 'เลือกกลุ่ม'}
                </span>
                <HiChevronDown className={`text-gray-500 transition-transform ${isGroupDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isGroupDropdownOpen && (
                <div className='absolute z-50 w-full max-w-md mt-2 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto'>
                  {groupList.map((group) => (
                    <button
                      key={group.id}
                      type='button'
                      onClick={() => handleGroupToggle(group)}
                      className={`w-full text-left px-4 py-3 transition-colors border-b border-gray-200 last:border-b-0 flex items-start justify-between gap-3 ${
                        selectedGroups.find((g) => g.id === group.id) ? 'bg-yellow-50 hover:bg-yellow-100' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div>
                        <p className='font-medium text-gray-800'>{group.name}</p>
                        <p className='text-sm text-gray-600'>{group.description}</p>
                      </div>
                      {selectedGroups.find((g) => g.id === group.id) && (
                        <HiCheck className='text-yellow-500 text-lg flex-shrink-0 mt-1' />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedGroups.length > 0 && (
              <div className='mt-4 space-y-2'>
                <p className='text-sm font-medium text-gray-700'>กลุ่มที่เลือก:</p>
                <div className='flex flex-wrap gap-2'>
                  {selectedGroups.map((group) => (
                    <div
                      key={group.id}
                      className='flex items-center gap-2 px-3 py-2 bg-yellow-100 border border-yellow-300 rounded-lg'
                    >
                      <span className='text-sm font-medium text-gray-800'>{group.name}</span>
                      <button
                        type='button'
                        onClick={() => handleRemoveGroup(group.id)}
                        className='flex items-center justify-center text-gray-600 hover:text-red-600 transition-colors'
                        title='Remove group'
                      >
                        <HiX className='text-lg' />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Submit Buttons */}
          <div className='flex gap-4 pt-4 border-t border-gray-200'>
            <button
              type='button'
              onClick={() => navigate('/knowledge')}
              className='px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors'
            >
              Cancel
            </button>
            <button
              type='submit'
              disabled={loading}
              className='px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {loading ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default CreateKnowledge;
