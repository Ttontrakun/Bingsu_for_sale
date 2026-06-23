import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { HiArrowLeft } from 'react-icons/hi';
import { api } from '../services/api';
import { getStoredUser, normalizeDashboardRole } from '../services/api';

function BotDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeBotId } = useParams();
  const initialBot = location.state?.bot;
  const [bot, setBot] = useState(initialBot || null);
  const storedUser = useMemo(() => getStoredUser(), []);
  const normalizedRole = normalizeDashboardRole(storedUser?.role);
  const isAdmin = normalizedRole === 'admin';
  const isCreateMode = !routeBotId;
  // Support ดูบอทได้ แต่แก้ไขได้เฉพาะ admin
  const canEdit = isAdmin;

  const [isEditing, setIsEditing] = useState(isCreateMode);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showUnsavedPopup, setShowUnsavedPopup] = useState(false);
  const [showSavedPopup, setShowSavedPopup] = useState(false);
  const [saveAreaHighlight, setSaveAreaHighlight] = useState(false);
  const [loadingBot, setLoadingBot] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const saveActionRef = useRef(null);
  const navigateTimeoutRef = useRef(null);
  const [form, setForm] = useState({
    name: bot?.name || '',
    description: bot?.description || '',
    prompt: bot?.prompt ?? '',
    documentIds: Array.isArray(bot?.documents) ? bot.documents.map((d) => d?.id).filter(Boolean) : [],
  });
  const [initialForm, setInitialForm] = useState({
    name: bot?.name || '',
    description: bot?.description || '',
    prompt: bot?.prompt ?? '',
    documentIds: Array.isArray(bot?.documents) ? bot.documents.map((d) => d?.id).filter(Boolean) : [],
  });

  const normalizeFormValue = (value) => ({
    name: String(value?.name || '').trim(),
    description: String(value?.description || '').trim(),
    prompt: String(value?.prompt || '').trim(),
    documentIds: Array.isArray(value?.documentIds)
      ? [...new Set(value.documentIds.map((id) => String(id)).filter(Boolean))].sort()
      : [],
  });

  useEffect(() => {
    const next = {
      name: bot?.name || '',
      description: bot?.description || '',
      prompt: bot?.prompt ?? '',
      documentIds: Array.isArray(bot?.documents) ? bot.documents.map((d) => d?.id).filter(Boolean) : [],
    };
    setForm(next);
    setInitialForm(next);
  }, [bot?.name, bot?.description, bot?.prompt, bot?.documents]);

  const hasUnsavedChanges = useMemo(() => {
    const current = normalizeFormValue(form);
    const initial = normalizeFormValue(initialForm);
    return JSON.stringify(current) !== JSON.stringify(initial);
  }, [form, initialForm]);

  const focusSaveActions = () => {
    if (saveActionRef.current) {
      saveActionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setSaveAreaHighlight(true);
      setTimeout(() => setSaveAreaHighlight(false), 1500);
    }
  };

  const warnUnsavedChanges = () => {
    setSaveError('มีการแก้ไขที่ยังไม่บันทึก กรุณากด "บันทึก" ก่อนออกจากหน้านี้');
    setShowUnsavedPopup(true);
    focusSaveActions();
  };

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!(isEditing || isCreateMode) || !hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, isCreateMode, isEditing]);

  useEffect(() => () => {
    if (navigateTimeoutRef.current) clearTimeout(navigateTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    const loadDocuments = async () => {
      setLoadingDocuments(true);
      try {
        const list = await api.getAdminDocuments();
        if (!cancelled) setDocuments(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setDocuments([]);
      } finally {
        if (!cancelled) setLoadingDocuments(false);
      }
    };
    loadDocuments();
    return () => { cancelled = true; };
  }, [canEdit]);

  useEffect(() => {
    if (isCreateMode || !routeBotId) return;
    let cancelled = false;
    const loadBot = async () => {
      setLoadingBot(true);
      try {
        const list = await api.getAdminBots();
        const found = Array.isArray(list)
          ? list.find((item) => String(item?.id) === String(routeBotId))
          : null;
        if (!cancelled) {
          setBot(found || null);
          if (!found) setSaveError('ไม่พบบอทที่ต้องการ');
        }
      } catch (e) {
        if (!cancelled) setSaveError(e?.message || 'โหลดข้อมูลบอทไม่สำเร็จ');
      } finally {
        if (!cancelled) setLoadingBot(false);
      }
    };
    loadBot();
    return () => { cancelled = true; };
  }, [isCreateMode, routeBotId]);

  // ใช้ข้อมูลจากบอทที่ผู้ใช้สร้าง (prompt จริงจาก backend)
  const botData = {
    name: bot?.name || form.name || 'Bot Name',
    supportId: bot?.id ? `Support${bot.id.toString().padStart(3, '0')}` : 'Support001',
    avatar: bot?.color || 'bg-gray-300',
    basicInfo: bot?.name || form.name || '',
    description: bot?.description || form.description || '',
    systemPrompt: bot?.prompt ?? form.prompt ?? '',
    knowledge: Array.isArray(bot?.documents) ? bot.documents : [],
  };

  const handleBack = () => {
    if ((isEditing || isCreateMode) && hasUnsavedChanges) {
      warnUnsavedChanges();
      return;
    }
    navigate('/bots');
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        name: form.name,
        description: form.description,
        prompt: form.prompt,
        documentIds: form.documentIds,
      };
      if (isCreateMode && isAdmin) await api.createAdminBot(payload);
      else await api.updateAdminBot(bot?.id || routeBotId, payload);
      setInitialForm(payload);
      setBot((prev) => ({
        ...(prev || {}),
        ...payload,
        documents: documents.filter((doc) => payload.documentIds.includes(doc.id)),
      }));
      setIsEditing(false);
      setShowSavedPopup(true);
      navigateTimeoutRef.current = setTimeout(() => {
        setShowSavedPopup(false);
        navigate('/bots');
      }, 900);
    } catch (e) {
      setSaveError(e?.message || (isCreateMode ? 'สร้างบอทไม่สำเร็จ' : 'บันทึกไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDocument = (docId, checked) => {
    if (!docId) return;
    if (checked) {
      const ok = window.confirm('ยืนยันลบการเชื่อมเอกสารนี้ออกจากบอท?');
      if (!ok) return;
    }
    setForm((s) => ({
      ...s,
      documentIds: checked
        ? s.documentIds.filter((id) => id !== docId)
        : [...s.documentIds, docId],
    }));
  };

  const handleClearAllDocuments = () => {
    if (form.documentIds.length === 0) return;
    const ok = window.confirm('ยืนยันลบการเชื่อมเอกสารทั้งหมดออกจากบอท?');
    if (!ok) return;
    setForm((s) => ({ ...s, documentIds: [] }));
  };

  return (
    <div className='pb-10'>
      {/* Back Button */}
      <button
        onClick={handleBack}
        className='flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6 transition-colors'
      >
        <HiArrowLeft className='text-2xl' />
      </button>

      {/* Bot Header */}
      <div className='flex items-center gap-4 mb-8'>
        <div className={`w-20 h-20 rounded-full ${botData.avatar} flex-shrink-0`}></div>
        <div>
          <h1 className='text-2xl font-semibold text-gray-800'>{isCreateMode ? 'สร้างบอทใหม่' : botData.name}</h1>
          <p className='text-gray-500'>{botData.supportId}</p>
        </div>
      </div>

      {/* Form */}
      <div className='space-y-6 max-w-3xl'>
        {canEdit && (
          <div className='flex items-center justify-between'>
            <div className='text-sm text-gray-600'>
              {isCreateMode ? 'โหมดสร้างบอท (Admin)' : 'โหมดแก้ไข (Support/Admin)'}
            </div>
            <div
              ref={saveActionRef}
              className={`flex gap-2 rounded-lg px-1 py-1 transition-all ${saveAreaHighlight ? 'ring-2 ring-red-300 bg-red-50/60' : ''}`}
            >
              {!isEditing && !isCreateMode ? (
                <button
                  type='button'
                  onClick={() => setIsEditing(true)}
                  className='px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 text-sm'
                >
                  แก้ไข
                </button>
              ) : (
                <>
                  <button
                    type='button'
                    onClick={() => {
                      if (hasUnsavedChanges) {
                        warnUnsavedChanges();
                        return;
                      }
                      setIsEditing(false);
                      setSaveError('');
                      setForm({
                        name: bot?.name || '',
                        description: bot?.description || '',
                        prompt: bot?.prompt ?? '',
                        documentIds: Array.isArray(bot?.documents) ? bot.documents.map((d) => d?.id).filter(Boolean) : [],
                      });
                    }}
                    className='px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 bg-white border border-gray-300 text-gray-700'
                    disabled={saving}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type='button'
                    onClick={handleSave}
                    className='px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 text-sm disabled:opacity-60'
                    disabled={saving}
                  >
                    {saving ? (isCreateMode ? 'กำลังสร้าง...' : 'กำลังบันทึก...') : (isCreateMode ? 'สร้างบอท' : 'บันทึก')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {saveError && (
          <div className='p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700'>
            {saveError}
          </div>
        )}
        {(isEditing || isCreateMode) && hasUnsavedChanges && (
          <div className='p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800'>
            ยังมีการแก้ไขที่ยังไม่บันทึก กรุณากด "บันทึก" ก่อนออกจากหน้านี้
          </div>
        )}

        {/* Bot Name */}
        <div>
          <label className='block text-sm font-medium text-gray-700 mb-2'>
            ชื่อบอท
          </label>
          <input
            type='text'
            value={isEditing || isCreateMode ? form.name : botData.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value.slice(0, 120) }))}
            readOnly={!isEditing && !isCreateMode}
            maxLength={120}
            className={`w-full px-4 py-2.5 border border-gray-300 rounded-lg ${isEditing || isCreateMode ? 'bg-white' : 'bg-gray-50 cursor-default'} text-gray-700`}
          />
          {(isEditing || isCreateMode) && <p className='text-xs text-gray-500 mt-1'>ไม่เกิน 120 ตัวอักษร</p>}
        </div>

        {/* Basic Info */}
        <div>
          <label className='block text-sm font-medium text-gray-700 mb-2'>
            โมเดลพื้นฐาน (จาก)
          </label>
          <input
            type='text'
            value={botData.basicInfo}
            readOnly
            className='w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 cursor-default text-gray-700'
            placeholder='Enterprise AI Chatbot & Timsum'
          />
        </div>

        {/* Description */}
        <div>
          <label className='block text-sm font-medium text-gray-700 mb-2'>
            คำอธิบาย
          </label>
          <textarea
            value={isEditing || isCreateMode ? form.description : botData.description}
            onChange={(e) => setForm((s) => ({ ...s, description: e.target.value.slice(0, 2000) }))}
            readOnly={!isEditing && !isCreateMode}
            maxLength={2000}
            rows={8}
            className={`w-full px-4 py-3 border border-gray-300 rounded-lg ${isEditing || isCreateMode ? 'bg-white' : 'bg-gray-50 cursor-default'} resize-none text-gray-700 break-words`}
            placeholder='อธิบายฟังก์ชันหรือวัตถุประสงค์ของบอท...'
          />
          {(isEditing || isCreateMode) && <p className='text-xs text-gray-500 mt-1'>ไม่เกิน 2,000 ตัวอักษร</p>}
        </div>

        {/* System Prompt */}
        <div>
          <label className='block text-sm font-medium text-gray-700 mb-2'>
            พรอมต์ระบบของบอท
          </label>
          <textarea
            value={isEditing || isCreateMode ? form.prompt : botData.systemPrompt}
            onChange={(e) => setForm((s) => ({ ...s, prompt: e.target.value.slice(0, 10000) }))}
            readOnly={!isEditing && !isCreateMode}
            maxLength={10000}
            rows={6}
            className={`w-full px-4 py-3 border border-gray-300 rounded-lg ${isEditing || isCreateMode ? 'bg-white' : 'bg-gray-50 cursor-default'} resize-none font-mono text-sm text-gray-700 break-words`}
            placeholder='System prompt...'
          />
          {(isEditing || isCreateMode) && <p className='text-xs text-gray-500 mt-1'>ไม่เกิน 10,000 ตัวอักษร</p>}
        </div>

        {/* Knowledge */}
        <div>
          <div className='flex items-center justify-between mb-2'>
            <label className='block text-sm font-medium text-gray-700'>
              ความรู้
            </label>
            {canEdit && !isEditing && !isCreateMode && (
              <button
                type='button'
                onClick={() => setIsEditing(true)}
                className='px-3 py-1.5 rounded-md border border-yellow-300 text-xs font-medium text-yellow-700 hover:bg-yellow-50'
              >
                จัดการ Knowledge
              </button>
            )}
          </div>
          {(isEditing || isCreateMode) ? (
            <div className='border border-gray-200 rounded-lg p-3 max-h-72 overflow-y-auto space-y-2 bg-white'>
              <div className='flex items-center justify-between pb-2 border-b border-gray-100'>
                <p className='text-xs text-gray-500'>เลือกเอกสารเพื่อเพิ่ม/ลบการเชื่อมกับบอทนี้</p>
                <div className='flex items-center gap-2'>
                  <button
                    type='button'
                    onClick={() => setForm((s) => ({ ...s, documentIds: documents.map((d) => d.id) }))}
                    className='px-2 py-1 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50'
                    disabled={loadingDocuments || loadingBot || documents.length === 0}
                  >
                    เพิ่มทั้งหมด
                  </button>
                  <button
                    type='button'
                    onClick={handleClearAllDocuments}
                    className='px-2 py-1 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50'
                    disabled={loadingDocuments || loadingBot || form.documentIds.length === 0}
                  >
                    ลบทั้งหมด
                  </button>
                </div>
              </div>
              {loadingDocuments || loadingBot ? (
                <p className='text-sm text-gray-500'>กำลังโหลดรายการเอกสาร...</p>
              ) : documents.length > 0 ? (
                documents.map((doc) => {
                  const checked = form.documentIds.includes(doc.id);
                  return (
                    <div key={doc.id} className='flex items-center justify-between gap-3 py-1'>
                      <label className='flex items-center gap-3 text-sm text-gray-700 cursor-pointer min-w-0'>
                        <input
                          type='checkbox'
                          checked={checked}
                          onChange={() => handleToggleDocument(doc.id, checked)}
                          className='h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400'
                        />
                        <span className='truncate'>{doc.displayName || doc.name || doc.id}</span>
                      </label>
                      <button
                        type='button'
                        onClick={() => handleToggleDocument(doc.id, checked)}
                        className={`px-2 py-1 rounded-md text-xs border ${
                          checked
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-green-200 text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {checked ? 'ลบ' : 'เพิ่ม'}
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className='text-sm text-gray-500'>ยังไม่มีเอกสารในระบบ</p>
              )}
            </div>
          ) : (
            <>
              <div className='flex flex-wrap gap-2'>
                {loadingBot ? (
                  <span className='text-gray-500 text-sm'>กำลังโหลดข้อมูล...</span>
                ) : Array.isArray(botData.knowledge) && botData.knowledge.length > 0 ? (
                  botData.knowledge.map((item) => (
                    <button
                      type='button'
                      key={item.id}
                      className='inline-flex items-center max-w-full px-4 py-2 bg-yellow-400 text-gray-800 rounded-full text-sm font-medium'
                      title={item.displayName || item.id}
                      onClick={() =>
                        navigate(`/knowledge/${item.id}/add-data`, {
                          state: { knowledgeName: item.displayName || item.id },
                        })
                      }
                    >
                      <span className='truncate'>{item.displayName || item.id}</span>
                    </button>
                  ))
                ) : (
                  <span className='text-gray-500 text-sm'>ไม่มีข้อมูล</span>
                )}
              </div>
              {canEdit && !isCreateMode && (
                <p className='text-xs text-gray-500 mt-2'>ต้องการแก้ไขการเชื่อมเอกสาร: กด "จัดการ Knowledge" แล้วบันทึก</p>
              )}
            </>
          )}
        </div>
      </div>

      {showUnsavedPopup && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45'>
          <div className='w-full max-w-md rounded-xl bg-white border border-red-200 shadow-xl p-5'>
            <h3 className='text-base font-semibold text-red-700 mb-2'>ยังไม่ได้บันทึกข้อมูล</h3>
            <p className='text-sm text-gray-700 mb-4'>
              ตรวจพบการแก้ไขที่ยังไม่บันทึก ระบบพามาที่ปุ่มบันทึกแล้ว กรุณากดบันทึกก่อนออกจากหน้านี้
            </p>
            <div className='flex justify-end'>
              <button
                type='button'
                onClick={() => setShowUnsavedPopup(false)}
                className='px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-medium text-sm'
              >
                รับทราบ
              </button>
            </div>
          </div>
        </div>
      )}

      {showSavedPopup && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35'>
          <div className='w-full max-w-sm rounded-xl bg-white border border-emerald-200 shadow-xl p-5'>
            <h3 className='text-base font-semibold text-emerald-700 mb-2'>บันทึกสำเร็จ</h3>
            <p className='text-sm text-gray-700'>ระบบบันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default BotDetail;
