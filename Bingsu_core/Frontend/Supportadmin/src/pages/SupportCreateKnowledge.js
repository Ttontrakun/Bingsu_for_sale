import { useNavigate, useLocation } from 'react-router-dom';
import { HiArrowLeft } from 'react-icons/hi';
import { useState, useRef } from 'react';
import { supportDocuments, getErrorMessage } from '../services/api';
import { useToast } from '../components/Toast';

function SupportCreateKnowledge() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const editingKnowledge = location.state?.knowledge || null;
  const isEditMode = !!editingKnowledge;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({ knowledgeName: '' });
  const [knowledgeName, setKnowledgeName] = useState(
    editingKnowledge?.displayName || editingKnowledge?.name || ''
  );
  const [tags, setTags] = useState(
    Array.isArray(editingKnowledge?.tags)
      ? editingKnowledge.tags.join(', ')
      : ''
  );
  const knowledgeNameRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({ knowledgeName: '' });

    if (!knowledgeName.trim()) {
      const msg = 'กรุณากรอกชื่อ Knowledge';
      setFieldErrors({ knowledgeName: msg });
      toast(msg, 'warning');
      setTimeout(() => knowledgeNameRef.current?.focus(), 0);
      setLoading(false);
      return;
    }

    try {
      const tagsArray = tags
        ? tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];

      if (isEditMode) {
        await supportDocuments.updateDocument(editingKnowledge.id, {
          displayName: knowledgeName.trim(),
          tags: tagsArray,
        });
      } else {
        const created = await supportDocuments.createDocument({
          displayName: knowledgeName.trim(),
          sourceFiles: [],
          tags: tagsArray,
          link: null,
        });
        // ไปหน้าอัปโหลดเอกสารทันที
        navigate(`/knowledge/${created.id}/add-data`, {
          state: { knowledgeName: created.displayName },
        });
        return;
      }
      navigate('/knowledge');
    } catch (err) {
      const msg = getErrorMessage(err);
      if (err?.message?.includes('409') || msg.includes('มีอยู่แล้ว')) {
        const dupMsg = 'ชื่อนี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น';
        setFieldErrors({ knowledgeName: dupMsg });
        toast(dupMsg, 'error');
      } else {
        const errMsg = msg || 'บันทึกไม่สำเร็จ';
        setError(errMsg);
        toast(errMsg, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='max-w-2xl'>
      <button
        type='button'
        onClick={() => navigate('/knowledge')}
        className='flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors mb-6'
      >
        <HiArrowLeft className='text-lg' />
        <span>Back</span>
      </button>

      <h1 className='text-2xl font-semibold text-gray-800 mb-6'>
        {isEditMode ? 'แก้ไข Knowledge' : 'สร้าง Knowledge ใหม่'}
      </h1>

      <form noValidate onSubmit={handleSubmit} className='flex flex-col gap-6'>
        {error && (
          <div className='p-4 bg-red-50 border border-red-300 rounded-lg text-sm text-red-700'>
            {error}
          </div>
        )}

        {/* ชื่อ Knowledge */}
        <div>
          <label className='block text-sm font-medium text-gray-700 mb-1'>
            ชื่อ Knowledge <span className='text-red-500'>*</span>
          </label>
          <input
            ref={knowledgeNameRef}
            type='text'
            value={knowledgeName}
            onChange={(e) => {
              setKnowledgeName(e.target.value);
              if (fieldErrors.knowledgeName) setFieldErrors({ knowledgeName: '' });
            }}
            maxLength={120}
            placeholder='ชื่อฐานความรู้'
            className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 text-gray-800 ${
              fieldErrors.knowledgeName ? 'border-red-400' : 'border-gray-300'
            }`}
          />
          {fieldErrors.knowledgeName && (
            <p className='text-xs text-red-600 mt-1'>{fieldErrors.knowledgeName}</p>
          )}
          <p className='text-xs text-gray-400 mt-1'>ไม่เกิน 120 ตัวอักษร</p>
        </div>

        {/* Tags */}
        <div>
          <label className='block text-sm font-medium text-gray-700 mb-1'>
            Tags <span className='text-gray-400 font-normal'>(คั่นด้วยจุลภาค)</span>
          </label>
          <input
            type='text'
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder='เช่น HR, นโยบาย, คู่มือ'
            className='w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 text-gray-800'
          />
        </div>

        {/* Buttons */}
        <div className='flex gap-3 pt-2'>
          <button
            type='button'
            onClick={() => navigate('/knowledge')}
            className='px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors'
          >
            ยกเลิก
          </button>
          <button
            type='submit'
            disabled={loading}
            className='px-6 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed'
          >
            {loading
              ? 'กำลังบันทึก...'
              : isEditMode
              ? 'บันทึก'
              : 'สร้างและเพิ่มเอกสาร →'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default SupportCreateKnowledge;
