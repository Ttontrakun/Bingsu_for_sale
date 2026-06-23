import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HiOutlineArrowLeft, HiSearch, HiPencil } from 'react-icons/hi';
import { api } from '../services/api';

function formatFileSize(bytes) {
  if (bytes == null || typeof bytes !== 'number') return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function KnowledgeDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [document, setDocument] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [guideText, setGuideText] = useState('');
  const [guideSaving, setGuideSaving] = useState(false);
  const [guideError, setGuideError] = useState('');
  const [nameEditOpen, setNameEditOpen] = useState(false);
  const [nameEditValue, setNameEditValue] = useState('');
  const [nameEditSaving, setNameEditSaving] = useState(false);
  const [nameEditError, setNameEditError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.getAdminDocument(id)
      .then((doc) => setDocument(doc))
      .catch(() => setLoadError('โหลดข้อมูลไม่สำเร็จ'));
  }, [id]);

  const knowledgeName = document?.displayName || document?.name || `Knowledge ${id}`;
  const isGuide = knowledgeName === 'คู่มือการใช้งาน';

  useEffect(() => {
    if (!isGuide) return;
    api.getGuide()
      .then((data) => setGuideText(data?.text || ''))
      .catch((e) => setGuideError(e?.message || 'โหลดคู่มือไม่สำเร็จ'));
  }, [isGuide]);

  const files = useMemo(() => {
    const raw = document?.sourceFiles;
    if (!Array.isArray(raw)) return [];
    return raw.map((file, index) => {
      const name = file?.name ?? file?.fileName ?? `ไฟล์ ${index + 1}`;
      const size = file?.size ?? file?.sizeBytes;
      return { id: index + 1, name, size: formatFileSize(size) || '' };
    });
  }, [document?.sourceFiles]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const query = searchQuery.toLowerCase();
    return files.filter((file) => file.name.toLowerCase().includes(query));
  }, [files, searchQuery]);

  if (loadError) {
    return (
      <div className='max-w-5xl'>
        <button onClick={() => navigate('/knowledge')} className='flex items-center gap-2 text-sm text-gray-800 hover:text-gray-900 mb-6'>
          <HiOutlineArrowLeft className='text-lg' /> Back
        </button>
        <p className='text-red-600'>{loadError}</p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className='max-w-5xl'>
        <button onClick={() => navigate('/knowledge')} className='flex items-center gap-2 text-sm text-gray-800 hover:text-gray-900 mb-6'>
          <HiOutlineArrowLeft className='text-lg' /> Back
        </button>
        <p className='text-gray-500'>กำลังโหลด...</p>
      </div>
    );
  }

  const tags = Array.isArray(document?.tags) ? document.tags : [];

  return (
    <div className='max-w-5xl'>
      <button
        onClick={() => navigate('/knowledge')}
        className='flex items-center gap-2 text-sm text-gray-800 hover:text-gray-900 mb-6'
      >
        <HiOutlineArrowLeft className='text-lg' />
        Back
      </button>

      <div className='mb-6 min-w-0'>
        <div className='flex items-start justify-between gap-3'>
          <h1 className='text-3xl font-semibold text-gray-900 mb-1 break-words'>{knowledgeName}</h1>
          <button
            type='button'
            onClick={() => {
              setNameEditOpen(true);
              setNameEditValue(knowledgeName);
              setNameEditError('');
            }}
            className='inline-flex items-center gap-2 px-3 py-2 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 text-sm font-medium'
          >
            <HiPencil className='text-base' />
            แก้ชื่อ
          </button>
        </div>
        <p className='text-xs text-gray-500'>ชื่อนี้เป็นการกำหนดให้ AI และชื่อจึงข้อมูลจากเอกสารที่เก็บไว้เป็นไฟล์มาจากแหล่งอื่น</p>
      </div>

      <div className='mb-8'>
        <h2 className='text-xl font-semibold text-gray-900 mb-4'>ไฟล์ที่อัปโหลด</h2>

        <div className='relative max-w-md mb-5'>
          <HiSearch className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg' />
          <input
            type='text'
            placeholder='Search Data'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-sm'
          />
        </div>

        <div className='border border-gray-300 rounded-3xl p-4 min-h-[290px]'>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl'>
            {filteredFiles.length > 0 ? (
              filteredFiles.map((file) => (
                <div
                  key={file.id}
                  className='bg-gray-200 rounded-lg px-4 py-3 flex items-center justify-between text-sm text-gray-800'
                >
                  <span className='truncate pr-2'>{file.name}</span>
                  <span className='text-xs text-gray-700 whitespace-nowrap'>{file.size}</span>
                </div>
              ))
            ) : (
              <span className='text-gray-500 text-sm'>ยังไม่มีไฟล์ที่อัปโหลด</span>
            )}
          </div>
        </div>
      </div>

      {isGuide && (
        <div className='mb-10'>
          <h2 className='text-xl font-semibold text-gray-900 mb-2'>แก้ไขคู่มือการใช้งาน (.txt)</h2>
          <p className='text-xs text-gray-500 mb-4'>แก้ได้เฉพาะ Knowledge “คู่มือการใช้งาน” เท่านั้น</p>

          {guideError && (
            <div className='p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-4'>
              {guideError}
            </div>
          )}

          <textarea
            value={guideText}
            onChange={(e) => setGuideText(e.target.value.slice(0, 300000))}
            maxLength={300000}
            rows={10}
            className='w-full px-4 py-3 border border-gray-300 rounded-lg bg-white resize-y font-mono text-sm text-gray-800 break-words'
            placeholder='พิมพ์/วางเนื้อหาคู่มือการใช้งานที่นี่...'
          />
          <p className='text-xs text-gray-500 mt-1'>ไม่เกิน 300,000 ตัวอักษร</p>

          <div className='flex flex-wrap gap-3 items-center mt-4'>
            <button
              type='button'
              onClick={async () => {
                setGuideSaving(true);
                setGuideError('');
                try {
                  await api.updateGuide(guideText, 'replace');
                } catch (e) {
                  setGuideError(e?.message || 'บันทึกไม่สำเร็จ');
                } finally {
                  setGuideSaving(false);
                }
              }}
              disabled={guideSaving}
              className='px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 text-sm disabled:opacity-60'
            >
              {guideSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>

            <label className='px-4 py-2 rounded-lg font-semibold text-sm bg-white border border-gray-300 text-gray-700 cursor-pointer'>
              อัปโหลดไฟล์ .txt เพื่อแทนที่
              <input
                type='file'
                accept='.txt,text/plain'
                className='hidden'
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    setGuideText(text);
                  } catch {
                    setGuideError('อ่านไฟล์ไม่สำเร็จ');
                  } finally {
                    e.target.value = '';
                  }
                }}
              />
            </label>

            <label className='px-4 py-2 rounded-lg font-semibold text-sm bg-white border border-gray-300 text-gray-700 cursor-pointer'>
              อัปโหลดไฟล์ .txt เพื่อเพิ่มท้าย
              <input
                type='file'
                accept='.txt,text/plain'
                className='hidden'
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    setGuideSaving(true);
                    setGuideError('');
                    await api.updateGuide(text, 'append');
                    const latest = await api.getGuide();
                    setGuideText(latest?.text || '');
                  } catch (err) {
                    setGuideError(err?.message || 'เพิ่มข้อมูลไม่สำเร็จ');
                  } finally {
                    setGuideSaving(false);
                    e.target.value = '';
                  }
                }}
              />
            </label>
          </div>
        </div>
      )}

      <div className='min-w-0'>
        <h2 className='text-xl font-semibold text-gray-900 mb-4'>แท็ก / กลุ่ม</h2>
        <div className='flex flex-wrap gap-3'>
          {tags.length > 0 ? (
            tags.map((tag, index) => (
              <span key={index} title={tag} className='max-w-full px-8 py-2.5 bg-yellow-400 rounded-full text-sm font-medium text-gray-900 truncate inline-block'>
                {tag.length > 32 ? tag.slice(0, 29) + '...' : tag}
              </span>
            ))
          ) : (
            <span className='text-gray-500 text-sm'>ไม่มีข้อมูล</span>
          )}
        </div>
      </div>

      {nameEditOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
          <div className='w-full max-w-md rounded-xl bg-white p-6 shadow-lg'>
            <h3 className='text-lg font-semibold text-gray-800 mb-2'>แก้ชื่อ Knowledge</h3>
            <input
              type='text'
              value={nameEditValue}
              onChange={(e) => setNameEditValue(e.target.value)}
              className='w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400'
              maxLength={120}
              autoFocus
            />
            {nameEditError && <p className='mt-2 text-sm text-red-600'>{nameEditError}</p>}
            <div className='flex justify-end gap-2 mt-5'>
              <button
                type='button'
                onClick={() => {
                  setNameEditOpen(false);
                  setNameEditError('');
                }}
                className='px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50'
              >
                ยกเลิก
              </button>
              <button
                type='button'
                disabled={nameEditSaving}
                onClick={async () => {
                  const nextName = String(nameEditValue || '').trim();
                  if (!nextName) {
                    setNameEditError('กรุณากรอกชื่อ Knowledge');
                    return;
                  }
                  setNameEditSaving(true);
                  setNameEditError('');
                  try {
                    const updated = await api.updateDocument(id, { displayName: nextName });
                    setDocument((prev) => ({ ...(prev || {}), ...(updated || {}), displayName: nextName }));
                    setNameEditOpen(false);
                  } catch (e) {
                    setNameEditError(e?.message || 'แก้ชื่อไม่สำเร็จ');
                  } finally {
                    setNameEditSaving(false);
                  }
                }}
                className='px-4 py-2 rounded-lg bg-yellow-400 text-gray-800 hover:bg-yellow-500 disabled:opacity-60'
              >
                {nameEditSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default KnowledgeDetail;