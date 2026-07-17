import { useNavigate, useLocation } from 'react-router-dom';
import { HiArrowLeft, HiChatAlt2, HiX, HiSearch, HiCheck, HiChevronDown } from 'react-icons/hi';
import Sidebar from '../components/Sidebar';
import Dropdown from '../components/Dropdown';
import { useState, useEffect, useRef } from 'react';
import { botAPI, documentAPI, getErrorMessage } from '../services/api';
import { showToast } from '../components/ToastNotification';

const BOT_ICON_CHOICES = [
  { key: 'emoji:🤖', label: '🤖' },
  { key: 'emoji:🧠', label: '🧠' },
  { key: 'emoji:🦊', label: '🦊' },
  { key: 'emoji:🐼', label: '🐼' },
  { key: 'emoji:🐯', label: '🐯' },
  { key: 'emoji:🐸', label: '🐸' },
  { key: 'emoji:🦁', label: '🦁' },
  { key: 'emoji:🐶', label: '🐶' },
  { key: 'emoji:🐱', label: '🐱' },
  { key: 'emoji:🐵', label: '🐵' },
  { key: 'emoji:🐧', label: '🐧' },
  { key: 'emoji:🦄', label: '🦄' },
];

const isEmojiAvatar = (v) => typeof v === 'string' && v.startsWith('emoji:') && v.length > 'emoji:'.length;
const getEmoji = (v) => (isEmojiAvatar(v) ? String(v).slice('emoji:'.length) : '');

function CreateBot({ singleUserFlow = false, forcedBotForEdit = null } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const backTarget = singleUserFlow ? '/homepage' : '/bots';
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({
    botName: '',
    systemPrompt: '',
    knowledge: '',
  });
  const botNameInputRef = useRef(null);
  const systemPromptRef = useRef(null);
  const knowledgeButtonRef = useRef(null);
  
  // รับ bot จาก state (เมื่อแก้ไข) หรือจากหน้า My bot (บอทเดียวต่อ user)
  const botFromState = location.state?.bot || forcedBotForEdit || null;
  const [botToEdit, setBotToEdit] = useState(botFromState);
  const isEditMode = !!botFromState;
  
  const [botName, setBotName] = useState(botFromState?.name || '');
  const [description, setDescription] = useState(botFromState?.description || '');
  const [systemPrompt, setSystemPrompt] = useState(botFromState?.prompt || botFromState?.systemPrompt || '');
  const [avatarUrl, setAvatarUrl] = useState(botFromState?.avatarUrl || 'emoji:🤖');
  // enabled state is not used in UI but kept for future use
  const [enabled] = useState(botFromState?.enabled !== undefined ? botFromState.enabled : true);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const avatarPickerRef = useRef(null);

  useEffect(() => {
    if (!isAvatarPickerOpen) return;
    const onDown = (event) => {
      if (avatarPickerRef.current && !avatarPickerRef.current.contains(event.target)) {
        setIsAvatarPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isAvatarPickerOpen]);

  // Load full bot details when editing (to get documentIds)
  useEffect(() => {
    if (isEditMode && botFromState?.id) {
      const loadBotDetails = async () => {
        try {
          const fullBot = await botAPI.getBot(botFromState.id);
          setBotToEdit(fullBot);
          // Update form fields with full bot data
          setBotName(fullBot.name || '');
          // All bots use MATCHA AI
          setSelectedBaseModel('MATCHA AI');
          setDescription(fullBot.description || '');
          setSystemPrompt(fullBot.prompt || fullBot.systemPrompt || '');
          setAvatarUrl(fullBot.avatarUrl || 'emoji:🤖');
        } catch (err) {
          console.error('Error loading bot details:', err);
          // Continue with state bot if API fails
        }
      };
      loadBotDetails();
    } else if (!isEditMode) {
      // For new bots, set default to MATCHA AI
      setSelectedBaseModel('MATCHA AI');
    }
  }, [isEditMode, botFromState?.id]);

  const baseModelOptions = [
    { value: 'MATCHA AI', label: 'MATCHA AI' },
  ];

  // Set default value to MATCHA AI
  const [selectedBaseModel, setSelectedBaseModel] = useState('MATCHA AI');

  // Knowledge states
  const [selectedKnowledge, setSelectedKnowledge] = useState([]);
  const [tempSelectedKnowledge, setTempSelectedKnowledge] = useState([]);
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [isConfirmCloseModalOpen, setIsConfirmCloseModalOpen] = useState(false);
  const [knowledgeSearchQuery, setKnowledgeSearchQuery] = useState('');
  const knowledgeModalRef = useRef(null);

  // Group states
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const groupDropdownRef = useRef(null);

  // Knowledge/Documents list
  const [knowledgeList, setKnowledgeList] = useState([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState(null);

  // Load knowledge/documents from API
  useEffect(() => {
    loadKnowledge();
  }, []);

  // Track if we've initialized selected knowledge to avoid overwriting user changes
  const hasInitializedKnowledge = useRef(false);

  // Load selected knowledge when editing a bot (after knowledge list is loaded)
  useEffect(() => {
    if (isEditMode && botToEdit && knowledgeList.length > 0 && !hasInitializedKnowledge.current) {
      // Check if bot has documentIds or documents array
      const documentIds = botToEdit.documentIds || (botToEdit.documents ? botToEdit.documents.map(d => d.id || d) : []);
      
      if (documentIds && documentIds.length > 0) {
        // Map documentIds to knowledge objects from the loaded knowledge list
        const selected = documentIds
          .map(docId => {
            // Handle both number and string IDs
            const id = typeof docId === 'object' ? docId.id : docId;
            return knowledgeList.find(k => k.id === id || k.id === parseInt(id));
          })
          .filter(k => k !== undefined); // Filter out any undefined (in case document was deleted)
        
        if (selected.length > 0) {
          setSelectedKnowledge(selected);
          hasInitializedKnowledge.current = true;
        }
      } else {
        // Bot has no documentIds, ensure selectedKnowledge is empty
        setSelectedKnowledge([]);
        hasInitializedKnowledge.current = true;
      }
    }
  }, [isEditMode, botToEdit, knowledgeList]);

  const loadKnowledge = async () => {
    setLoadingKnowledge(true);
    setKnowledgeError(null);
    try {
      const documents = await documentAPI.getDocuments();
      // Transform documents to knowledge format
      const knowledge = documents.map(doc => ({
        id: doc.id,
        name: doc.displayName,
        description: doc.tags?.join(', ') || 'No tags'
      }));
      setKnowledgeList(knowledge);
    } catch (err) {
      setKnowledgeError(getErrorMessage(err));
      console.error('Error loading knowledge:', err);
      // Continue with empty list if API fails
      setKnowledgeList([]);
    } finally {
      setLoadingKnowledge(false);
    }
  };

  const groupList = [
    { id: 1, name: 'Group 1', description: 'Group description 1' },
    { id: 2, name: 'Group 2', description: 'Group description 2' },
    { id: 3, name: 'Group 3', description: 'Group description 3' },
  ];

  const handleAddKnowledge = (knowledge) => {
    // Toggle selection - if already selected, remove it; if not, add it
    const isAlreadySelected = tempSelectedKnowledge.find(k => k.id === knowledge.id);
    if (isAlreadySelected) {
      setTempSelectedKnowledge(tempSelectedKnowledge.filter(k => k.id !== knowledge.id));
    } else {
      setTempSelectedKnowledge([...tempSelectedKnowledge, knowledge]);
    }
  };

  const handleRemoveSelectedKnowledge = (knowledgeId) => {
    setSelectedKnowledge(selectedKnowledge.filter(k => k.id !== knowledgeId));
  };

  const handleSaveKnowledge = () => {
    setSelectedKnowledge(tempSelectedKnowledge);
    if (tempSelectedKnowledge.length > 0 && fieldErrors.knowledge) {
      setFieldErrors((prev) => ({ ...prev, knowledge: '' }));
    }
    setIsKnowledgeModalOpen(false);
  };

  const handleCloseKnowledgeModal = () => {
    if (tempSelectedKnowledge.length > 0 && JSON.stringify(tempSelectedKnowledge) !== JSON.stringify(selectedKnowledge)) {
      setIsKnowledgeModalOpen(false);
      setIsConfirmCloseModalOpen(true);
    } else {
      setIsKnowledgeModalOpen(false);
      setTempSelectedKnowledge(selectedKnowledge);
    }
  };

  const handleConfirmClose = (save) => {
    if (save) {
      setSelectedKnowledge(tempSelectedKnowledge);
    } else {
      setTempSelectedKnowledge(selectedKnowledge);
    }
    setIsConfirmCloseModalOpen(false);
  };

  const handleGroupToggle = (group) => {
    setSelectedGroups((prev) => {
      const exists = prev.find((g) => g.id === group.id);
      return exists ? prev.filter((g) => g.id !== group.id) : [...prev, group];
    });
  };

  const handleRemoveGroup = (groupId) => {
    setSelectedGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  // Open modal and initialize temp selection
  const openKnowledgeModal = () => {
    setTempSelectedKnowledge(selectedKnowledge);
    setIsKnowledgeModalOpen(true);
  };

  // Close modal when clicking outside
  useEffect(() => {
    if (!isKnowledgeModalOpen) return;

    const handleClickOutside = (event) => {
      if (knowledgeModalRef.current && !knowledgeModalRef.current.contains(event.target)) {
        setIsKnowledgeModalOpen(false);
      }
    };

      document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isKnowledgeModalOpen]);

  // Close group dropdown when clicking outside
  useEffect(() => {
    if (!isGroupDropdownOpen) return;

    const handleClickOutside = (event) => {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(event.target)) {
        setIsGroupDropdownOpen(false);
      }
    };

      document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isGroupDropdownOpen]);

  const filteredKnowledgeList = knowledgeList.filter((knowledge) =>
    knowledge.name.toLowerCase().includes(knowledgeSearchQuery.toLowerCase()) ||
    knowledge.description.toLowerCase().includes(knowledgeSearchQuery.toLowerCase())
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({ botName: '', systemPrompt: '', knowledge: '' });

    const nextFieldErrors = {
      botName: !botName.trim() ? 'กรุณากรอกชื่อบอต' : '',
      systemPrompt: !systemPrompt.trim() ? 'กรุณากรอกระบบพรอมต์' : '',
      knowledge: selectedKnowledge.length === 0 ? 'กรุณาเลือก Knowledge อย่างน้อย 1 รายการ' : '',
    };
    const hasFieldError = Object.values(nextFieldErrors).some(Boolean);
    if (hasFieldError) {
      setFieldErrors(nextFieldErrors);
      const toastMessages = [];
      if (nextFieldErrors.botName) toastMessages.push(nextFieldErrors.botName);
      if (nextFieldErrors.systemPrompt) toastMessages.push(nextFieldErrors.systemPrompt);
      if (nextFieldErrors.knowledge) toastMessages.push(nextFieldErrors.knowledge);
      toastMessages.forEach((msg, idx) => {
        setTimeout(() => showToast(msg, 'warning'), idx * 120);
      });

      const focusFirstInvalidField = () => {
        if (nextFieldErrors.botName && botNameInputRef.current) {
          botNameInputRef.current.focus();
          botNameInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (nextFieldErrors.systemPrompt && systemPromptRef.current) {
          systemPromptRef.current.focus();
          systemPromptRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (nextFieldErrors.knowledge && knowledgeButtonRef.current) {
          knowledgeButtonRef.current.focus();
          knowledgeButtonRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };
      setTimeout(focusFirstInvalidField, 0);
      setLoading(false);
      return;
    }

    try {
      // Prepare document IDs - filter out any invalid values
      const documentIds = selectedKnowledge
        .filter(k => k && k.id)
        .map(k => k.id)
        .filter(id => id != null && id !== undefined);

      // Always use MATCHA AI as the model
      const botData = {
        name: botName.trim(),
        prompt: systemPrompt.trim(),
        description: description.trim() || null,
        model: 'MATCHA AI', // All bots use MATCHA AI
        avatarUrl: String(avatarUrl || '').trim() || null,
        enabled: enabled,
        documentIds: documentIds.length > 0 ? documentIds : []
      };

      if (isEditMode) {
        await botAPI.updateBot(botToEdit.id, botData);
      } else {
        if (singleUserFlow) {
          const existing = await botAPI.getBots();
          if (Array.isArray(existing) && existing.length > 0) {
            setError('คุณมีบอทแล้ว 1 ตัว — แก้ไขจากเมนู "บอทของฉัน"');
            setLoading(false);
            return;
          }
        }
        await botAPI.createBot(botData);
      }

      navigate(backTarget);
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      if (err?.response?.status === 409) {
        setFieldErrors((prev) => ({ ...prev, botName: errorMsg || 'ชื่อบอทนี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น' }));
        showToast(errorMsg || 'ชื่อบอทนี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น', 'warning');
        setTimeout(() => {
          if (botNameInputRef.current) {
            botNameInputRef.current.focus();
            botNameInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 0);
      }
      setError(errorMsg);
      console.error('Error saving bot:', err);
      console.error('Error response:', err.response?.data);
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
          type="button"
          onClick={() => navigate(backTarget)}
          className='flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors mb-6 self-start'
        >
          <HiArrowLeft className='text-lg' />
          <span>{singleUserFlow ? 'กลับหน้าแรก' : 'Back'}</span>
        </button>
        {singleUserFlow && (
          <p className="text-sm text-gray-600 mb-4 -mt-2">
            สร้างได้ 1 บอทต่อบัญชี — Knowledge ที่บอทใช้จะถูกเพิ่มโดย Admin / Support
          </p>
        )}

        <form noValidate onSubmit={handleSubmit} className='flex-1 max-w-4xl'>
          {/* Error Message */}
          {error && (
            <div className='mb-6 p-4 bg-red-50 border-2 border-red-300 rounded-lg shadow-sm'>
              <div className='flex items-start gap-2'>
                <span className='text-red-600 font-bold text-lg'>⚠️</span>
                <div className='flex-1'>
                  <p className='text-red-800 text-sm font-semibold mb-1'>เกิดข้อผิดพลาด:</p>
                  <p className='text-red-700 text-sm'>{error}</p>
                </div>
                <button
                  type='button'
                  onClick={() => setError(null)}
                  className='text-red-400 hover:text-red-600 transition-colors'
                >
                  <HiX className='text-lg' />
                </button>
              </div>
            </div>
          )}

          {/* Bot Profile Section */}
          <div className='mb-8'>
            <div className='flex items-start gap-4 mb-4'>
              <div className='flex flex-col items-center gap-2 flex-shrink-0'>
                <div className='w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden shadow-sm border border-gray-200'>
                  {isEmojiAvatar(avatarUrl) ? (
                    <span className="text-5xl">{getEmoji(avatarUrl) || '🤖'}</span>
                  ) : avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={botName || 'Bot avatar'}
                      className='w-full h-full object-cover'
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <HiChatAlt2 className='text-gray-700 text-4xl' />
                  )}
                </div>
                <div className="relative" ref={avatarPickerRef}>
                  <button
                    type="button"
                    onClick={() => setIsAvatarPickerOpen((v) => !v)}
                    className="px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-sm font-semibold shadow-sm transition-colors"
                    title="อัปโหลดรูป (เลือกไอคอน)"
                  >
                    อัปโหลดรูป
                  </button>
                  {isAvatarPickerOpen && (
                    <div className="absolute z-50 mt-2 w-[260px] rounded-xl border border-gray-200 bg-white shadow-lg p-3">
                      <div className="text-xs text-gray-600 mb-2">เลือกไอคอน</div>
                      <div className="flex flex-wrap gap-2">
                        {BOT_ICON_CHOICES.map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => {
                              setAvatarUrl(c.key);
                              setIsAvatarPickerOpen(false);
                            }}
                            className={`w-9 h-9 rounded-lg border flex items-center justify-center text-xl transition-all ${
                              avatarUrl === c.key ? 'border-yellow-400 ring-2 ring-yellow-200 bg-white' : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                            title="เลือกไอคอน"
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className='flex-1 min-w-0'>
                <div className='mb-2'>
                  <input
                    ref={botNameInputRef}
                    type='text'
                    value={botName}
                    onChange={(e) => {
                      setBotName(e.target.value.slice(0, 120));
                      if (fieldErrors.botName) {
                        setFieldErrors((prev) => ({ ...prev, botName: '' }));
                      }
                    }}
                    maxLength={120}
                    placeholder='ชื่อบอต *'
                    aria-invalid={Boolean(fieldErrors.botName)}
                    className={`text-2xl font-bold text-gray-800 bg-transparent w-full placeholder-gray-400 break-words rounded-md ${
                      fieldErrors.botName
                        ? 'border border-red-300 px-2 py-1 outline-none focus:ring-2 focus:ring-red-200'
                        : 'border-none outline-none'
                    }`}
                  />
                  {fieldErrors.botName && (
                    <p className='text-xs text-red-600 mt-1'>{fieldErrors.botName}</p>
                  )}
                  <p className='text-xs text-gray-500 mt-0.5'>ไม่เกิน 120 ตัวอักษร</p>
                </div>
                <div className='mb-4'>
                  <span className='text-sm text-gray-600'>MATCHA AI</span>
                </div>
              </div>
            </div>
          </div>

          {/* Base Model Section */}
          <div className='mb-8'>
            <label className='block text-sm font-medium text-gray-700 mb-3'>
              AI Model
            </label>
            <Dropdown
              options={baseModelOptions}
              selectedValue={selectedBaseModel}
              onSelect={setSelectedBaseModel}
              placeholder="Select AI Model"
            />
          </div>

          {/* Description Section */}
          <div className='mb-8'>
            <label htmlFor='description' className='block text-sm font-medium text-gray-700 mb-3'>
              คำอธิบาย
            </label>
            <textarea
              id='description'
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
              maxLength={2000}
              placeholder='เพิ่มคำอธิบายสั้น ๆ สำหรับโมเดลที่ทำ'
              rows={4}
              className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all resize-none text-gray-700 placeholder-gray-400 break-words'
            />
            <p className='text-xs text-gray-500 mt-0.5'>ไม่เกิน 2,000 ตัวอักษร</p>
          </div>

          {/* Model Parameters Section */}
          <div className='mb-8'>
            <label className='block text-sm font-medium text-gray-700 mb-3'>
              พารามิเตอร์ของบอท
            </label>
            <div className='mb-3'>
              <label className='block text-sm text-gray-600 mb-2'>
                ระบบพรอมต์
              </label>
              <textarea
                ref={systemPromptRef}
                value={systemPrompt}
                onChange={(e) => {
                  setSystemPrompt(e.target.value.slice(0, 10000));
                  if (fieldErrors.systemPrompt) {
                    setFieldErrors((prev) => ({ ...prev, systemPrompt: '' }));
                  }
                }}
                maxLength={10000}
                placeholder='เพิ่มคำอธิบายสั้น ๆ สำหรับโมเดลที่ทำ'
                rows={6}
                aria-invalid={Boolean(fieldErrors.systemPrompt)}
                className={`w-full px-4 py-3 border rounded-lg transition-all resize-none text-gray-700 placeholder-gray-400 break-words ${
                  fieldErrors.systemPrompt
                    ? 'border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-transparent'
                    : 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent'
                }`}
              />
              {fieldErrors.systemPrompt && (
                <p className='text-xs text-red-600 mt-1'>{fieldErrors.systemPrompt}</p>
              )}
              <p className='text-xs text-gray-500 mt-0.5'>ไม่เกิน 10,000 ตัวอักษร</p>
            </div>
          </div>

          {/* Knowledge Section */}
          <div className='mb-8'>
            <label className='block text-sm font-medium text-gray-700 mb-3'>
              Knowledge
            </label>
            <p className='text-sm text-gray-600 mb-4'>
              หากต้องการเชื่อมต่อฐานความรู้ที่นี่ ให้เพิ่มข้อมูลลงในพื้นที่ทำงาน "Knowledge" ก่อน
            </p>
            <button
              ref={knowledgeButtonRef}
              type='button'
              onClick={openKnowledgeModal}
              className='px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95'
            >
              เลือก Knowledge
            </button>
            {fieldErrors.knowledge && (
              <p className='text-xs text-red-600 mt-2'>{fieldErrors.knowledge}</p>
            )}

            {selectedKnowledge.length > 0 && (
              <div className='mt-4 space-y-2'>
                <p className='text-sm font-medium text-gray-700'>Knowledge ที่เลือก:</p>
                <div className='flex flex-wrap gap-2'>
                  {selectedKnowledge.map((knowledge) => (
                    <div
                      key={knowledge.id}
                      className='flex items-center gap-2 px-3 py-2 bg-yellow-100 border border-yellow-300 rounded-lg max-w-full min-w-0'
                    >
                      <span title={knowledge.name} className='text-sm font-medium text-gray-800 truncate'>{typeof knowledge.name === 'string' && knowledge.name.length > 40 ? knowledge.name.slice(0, 37) + '...' : knowledge.name}</span>
                      <button
                        type='button'
                        onClick={() => handleRemoveSelectedKnowledge(knowledge.id)}
                        className='flex items-center justify-center text-gray-600 hover:text-red-600 transition-colors'
                        title='Remove knowledge'
                      >
                        <HiX className='text-lg' />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Grouping Section */}
          <div className='mb-8'>
            <label className='block text-md font-medium text-gray-700 mb-3'>
              การจัดกลุ่ม
            </label>
            <p className='text-sm text-gray-600 mb-4'>
              หากต้องการเชื่อมต่อบอตกับกลุ่มผู้ใช้ ให้เพิ่มกลุ่มผู้ใช้ที่นี่
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
              onClick={() => navigate(backTarget)}
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

      {/* Knowledge Modal */}
      {isKnowledgeModalOpen && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
          <div ref={knowledgeModalRef} className='bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col'>
            <div className='px-6 py-4 border-b border-gray-200 flex items-center justify-between'>
              <h2 className='text-xl font-semibold text-gray-800'>เลือก Knowledge</h2>
              <button
                onClick={handleCloseKnowledgeModal}
                className='text-gray-400 hover:text-gray-600 transition-colors'
              >
                <HiX className='text-2xl' />
              </button>
            </div>
            <div className='px-6 py-4 border-b border-gray-200'>
              <div className='relative'>
                <HiSearch className='absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400' />
                <input
                  type='text'
                  value={knowledgeSearchQuery}
                  onChange={(e) => setKnowledgeSearchQuery(e.target.value)}
                  placeholder='Search knowledge...'
                  className='w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent'
                />
              </div>
            </div>
            <div className='flex-1 overflow-y-auto px-6 py-4'>
              {loadingKnowledge ? (
                <div className='text-center py-8'>
                  <p className='text-gray-500'>Loading knowledge...</p>
                </div>
              ) : knowledgeError ? (
                <div className='text-center py-8'>
                  <p className='text-red-600 text-sm mb-2'>Error loading knowledge</p>
                  <p className='text-gray-500 text-xs'>{knowledgeError}</p>
                  <button
                    type='button'
                    onClick={loadKnowledge}
                    className='mt-4 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg text-sm'
                  >
                    Retry
                  </button>
                </div>
              ) : filteredKnowledgeList.length > 0 ? (
                <div className='space-y-2'>
                  {filteredKnowledgeList.map((knowledge) => {
                    const isSelected = tempSelectedKnowledge.find(k => k.id === knowledge.id);
                    return (
                      <button
                        key={knowledge.id}
                        type='button'
                        onClick={() => handleAddKnowledge(knowledge)}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                          isSelected
                            ? 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100'
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className='flex items-start justify-between min-w-0'>
                          <div className='min-w-0 flex-1'>
                            <p title={knowledge.name} className='font-medium text-gray-800 truncate'>{knowledge.name}</p>
                            <p title={knowledge.description || ''} className='text-sm text-gray-600 mt-1 line-clamp-2 break-words'>{knowledge.description || ''}</p>
                          </div>
                          {isSelected && (
                            <HiCheck className='text-yellow-500 text-lg flex-shrink-0 mt-1' />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className='text-center py-8'>
                  <p className='text-gray-500 mb-2'>No knowledge found</p>
                  <p className='text-gray-400 text-xs mb-4'>
                    {knowledgeSearchQuery
                      ? 'Try adjusting your search'
                      : singleUserFlow
                        ? 'ยังไม่มี Knowledge ในระบบ — ทีม Admin / Support จะเพิ่มให้ จากนั้นกลับมาเลือกผูกกับบอทได้'
                        : 'Create knowledge in the Knowledge page first'}
                  </p>
                  {!knowledgeSearchQuery && !singleUserFlow && (
                    <button
                      type='button'
                      onClick={() => {
                        setIsKnowledgeModalOpen(false);
                        window.location.href = '/knowledge';
                      }}
                      className='px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg text-sm'
                    >
                      Go to Knowledge Page
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className='px-6 py-4 border-t border-gray-200 flex justify-end gap-3'>
              <button
                type='button'
                onClick={handleCloseKnowledgeModal}
                className='px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={handleSaveKnowledge}
                className='px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200'
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Close Modal */}
      {isConfirmCloseModalOpen && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
          <div className='bg-white rounded-lg shadow-xl w-full max-w-md p-6'>
            <h2 className='text-xl font-semibold text-gray-800 mb-4'>Unsaved Changes</h2>
            <p className='text-gray-600 mb-6'>
              You have unsaved changes. Do you want to save them before closing?
            </p>
            <div className='flex justify-end gap-3'>
              <button
                type='button'
                onClick={() => handleConfirmClose(false)}
                className='px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors'
              >
                Discard
              </button>
              <button
                type='button'
                onClick={() => handleConfirmClose(true)}
                className='px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200'
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default CreateBot;
