import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HiLightBulb,
  HiChevronDown,
  HiChevronRight,
  HiBookOpen,
  HiCurrencyDollar,
  HiPresentationChartBar,
  HiPencil,
  HiSave,
  HiX,
  HiPlus,
  HiTrash,
  HiDownload,
  HiHome,
  HiRefresh,
} from 'react-icons/hi';
import { Document, Page, pdfjs } from 'react-pdf';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import { useAdminSystemConfig } from '../context/AdminSystemConfigContext';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const ICON_MAP = {
  form: HiLightBulb,
  manual: HiBookOpen,
  pricing: HiCurrencyDollar,
  presentation: HiPresentationChartBar,
};

const FALLBACK_DOCUMENTS = [
  {
    id: 'form',
    type: 'content',
    title: 'แบบฟอร์มบันทึก',
    description: 'รวมแบบฟอร์มการใช้งานที่เกี่ยวข้องกับระบบ Enterprise AI Chatbot',
    iconKey: 'form',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-500',
    subcategories: [],
  },
];

const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const needsAuthPdfFetch = (filePath) => {
  const raw = String(filePath || '');
  return raw.startsWith('/uploads/manual/') || raw.includes('/api/admin/manual/file/');
};

/** PDF viewer ที่ดึงไฟล์ Manual แบบมี auth (ไม่เปิด URL สาธารณะ) */
function AuthPdfDocument({ filePath, pageWidth }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setError('');
    setSrc('');
    setNumPages(0);
    (async () => {
      if (!filePath) return;
      try {
        if (needsAuthPdfFetch(filePath)) {
          const blob = await api.fetchManualPdfBlob(filePath);
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setSrc(objectUrl);
        } else if (!cancelled) {
          setSrc(api.resolveUploadUrl(filePath));
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'โหลด PDF ไม่สำเร็จ');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filePath]);

  if (error) {
    return <p className='text-sm text-red-500 text-center py-6'>{error}</p>;
  }
  if (!src) {
    return <p className='text-sm text-gray-500 text-center py-6'>กำลังโหลดเอกสาร...</p>;
  }
  return (
    <Document
      file={src}
      onLoadSuccess={({ numPages: total }) => setNumPages(total)}
      loading={<p className='text-sm text-gray-500 text-center py-6'>กำลังโหลดเอกสาร...</p>}
      error={<p className='text-sm text-red-500 text-center py-6'>ไม่สามารถโหลดไฟล์ PDF ได้</p>}
    >
      <div className='flex flex-col items-center gap-4'>
        {Array.from(new Array(numPages), (_, index) => (
          <Page
            key={`auth-pdf-page-${index + 1}`}
            pageNumber={index + 1}
            width={pageWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        ))}
      </div>
    </Document>
  );
}

const toPersistable = (docs) =>
  (docs || []).map((doc) => {
    const base = {
      id: doc.id,
      type: doc.type === 'pdf' ? 'pdf' : 'content',
      title: doc.title || '',
      description: doc.description || '',
      iconKey: doc.iconKey || 'form',
      iconBg: doc.iconBg || 'bg-yellow-100',
      iconColor: doc.iconColor || 'text-yellow-500',
    };
    if (base.type === 'pdf') {
      return { ...base, file: doc.file || '' };
    }
    return {
      ...base,
      subcategories: (doc.subcategories || []).map((sub) => ({
        id: sub.id,
        title: sub.title || '',
        content: (sub.content || []).map((item) => {
          if (item.type === 'list') return { type: 'list', items: [...(item.items || [])] };
          if (item.type === 'pdf') return { type: 'pdf', file: item.file || '' };
          return { type: item.type || 'text', value: item.value || '' };
        }),
      })),
    };
  });

function Home({ userRole }) {
  const { getCopy, getTextStyle } = useAdminSystemConfig();
  const toast = useToast();
  const viewerRef = useRef(null);
  const [pageWidth, setPageWidth] = useState(900);
  const [openDocument, setOpenDocument] = useState(null);
  const [openSubcategory, setOpenSubcategory] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [documents, setDocuments] = useState(FALLBACK_DOCUMENTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [editingCategory, setEditingCategory] = useState(null);
  const [editCategoryData, setEditCategoryData] = useState({});
  const [editingSubcategory, setEditingSubcategory] = useState(null);
  const [editSubcategoryData, setEditSubcategoryData] = useState({});
  const [editingContent, setEditingContent] = useState(null);
  const [editContentData, setEditContentData] = useState({});

  const isAdmin = userRole === 'admin' || (typeof window !== 'undefined' && window.userRole === 'admin');

  const resolveFile = useCallback((filePath) => api.resolveUploadUrl(filePath), []);

  const persistDocuments = useCallback(
    async (nextDocs, successMsg = 'บันทึก Manual แล้ว') => {
      setSaving(true);
      try {
        const payload = toPersistable(nextDocs);
        const res = await api.updateManual(payload);
        const saved = Array.isArray(res?.documents) ? res.documents : payload;
        setDocuments(saved);
        if (successMsg) toast(successMsg, 'success');
        return saved;
      } catch (err) {
        toast(err?.message || 'บันทึก Manual ไม่สำเร็จ', 'error');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [toast],
  );

  const loadManual = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getManual();
      const docs = Array.isArray(data?.documents) && data.documents.length ? data.documents : FALLBACK_DOCUMENTS;
      setDocuments(docs);
    } catch (err) {
      toast(err?.message || 'โหลด Manual ไม่สำเร็จ', 'error');
      setDocuments(FALLBACK_DOCUMENTS);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadManual();
  }, [loadManual]);

  useEffect(() => {
    const updatePageWidth = () => {
      if (!viewerRef.current) return;
      const next = Math.max(320, Math.min(viewerRef.current.clientWidth - 48, 1100));
      setPageWidth(next);
    };
    updatePageWidth();
    window.addEventListener('resize', updatePageWidth);
    return () => window.removeEventListener('resize', updatePageWidth);
  }, []);

  const downloadFile = async (filePath) => {
    try {
      if (needsAuthPdfFetch(filePath)) {
        const blob = await api.fetchManualPdfBlob(filePath);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = String(filePath).split('/').pop() || 'document.pdf';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        window.open(resolveFile(filePath), '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      toast(err?.message || 'ดาวน์โหลดไม่สำเร็จ', 'error');
    }
  };

  const handleEditCategory = (doc) => {
    setEditingCategory(doc.id);
    setEditCategoryData({ title: doc.title, description: doc.description });
  };

  const handleSaveCategory = async (docId) => {
    const next = documents.map((doc) => (doc.id === docId ? { ...doc, ...editCategoryData } : doc));
    setDocuments(next);
    setEditingCategory(null);
    setEditCategoryData({});
    await persistDocuments(next);
  };

  const handleCancelEditCategory = () => {
    setEditingCategory(null);
    setEditCategoryData({});
  };

  const handleDeleteCategory = async (docId) => {
    if (!window.confirm('คุณต้องการลบหัวข้อหลักนี้หรือไม่?')) return;
    const next = documents.filter((doc) => doc.id !== docId);
    setDocuments(next);
    if (openDocument === docId) setOpenDocument(null);
    await persistDocuments(next, 'ลบหัวข้อหลักแล้ว');
  };

  const handleAddCategory = async () => {
    const next = [
      ...documents,
      {
        id: newId('cat'),
        type: 'content',
        title: 'หัวข้อหลักใหม่',
        description: 'คำอธิบาย',
        iconKey: 'form',
        iconBg: 'bg-yellow-100',
        iconColor: 'text-yellow-500',
        subcategories: [],
      },
    ];
    setDocuments(next);
    await persistDocuments(next, 'เพิ่มหัวข้อหลักแล้ว');
  };

  const handleEditSubcategory = (sub) => {
    setEditingSubcategory(sub.id);
    setEditSubcategoryData({ title: sub.title });
  };

  const handleSaveSubcategory = async (docId, subId) => {
    const next = documents.map((doc) => {
      if (doc.id !== docId) return doc;
      return {
        ...doc,
        subcategories: (doc.subcategories || []).map((sub) =>
          sub.id === subId ? { ...sub, title: editSubcategoryData.title || sub.title } : sub,
        ),
      };
    });
    setDocuments(next);
    setEditingSubcategory(null);
    setEditSubcategoryData({});
    await persistDocuments(next);
  };

  const handleCancelEditSubcategory = () => {
    setEditingSubcategory(null);
    setEditSubcategoryData({});
  };

  const handleDeleteSubcategory = async (docId, subId) => {
    if (!window.confirm('คุณต้องการลบหัวข้อย่อยนี้หรือไม่?')) return;
    const next = documents.map((doc) => {
      if (doc.id !== docId) return doc;
      return { ...doc, subcategories: (doc.subcategories || []).filter((sub) => sub.id !== subId) };
    });
    setDocuments(next);
    if (openSubcategory === subId) setOpenSubcategory(null);
    await persistDocuments(next, 'ลบหัวข้อย่อยแล้ว');
  };

  const handleAddSubcategory = async (docId) => {
    const next = documents.map((doc) => {
      if (doc.id !== docId) return doc;
      return {
        ...doc,
        subcategories: [
          ...(doc.subcategories || []),
          {
            id: newId('sub'),
            title: 'หัวข้อย่อยใหม่',
            content: [{ type: 'text', value: 'เนื้อหาใหม่' }],
          },
        ],
      };
    });
    setDocuments(next);
    await persistDocuments(next, 'เพิ่มหัวข้อย่อยแล้ว');
  };

  const handleEditContent = (docId, subId, contentIdx, content) => {
    setEditingContent(`${docId}-${subId}-${contentIdx}`);
    setEditContentData(
      content.type === 'list'
        ? { type: 'list', items: [...(content.items || [])] }
        : { ...content },
    );
  };

  const handleSaveContent = async (docId, subId, contentIdx) => {
    const next = documents.map((doc) => {
      if (doc.id !== docId) return doc;
      return {
        ...doc,
        subcategories: (doc.subcategories || []).map((sub) => {
          if (sub.id !== subId) return sub;
          const newContent = [...(sub.content || [])];
          newContent[contentIdx] = editContentData;
          return { ...sub, content: newContent };
        }),
      };
    });
    setDocuments(next);
    setEditingContent(null);
    setEditContentData({});
    await persistDocuments(next);
  };

  const handleCancelEditContent = () => {
    setEditingContent(null);
    setEditContentData({});
  };

  const handleDeleteContent = async (docId, subId, contentIdx) => {
    if (!window.confirm('ลบเนื้อหานี้หรือไม่?')) return;
    const next = documents.map((doc) => {
      if (doc.id !== docId) return doc;
      return {
        ...doc,
        subcategories: (doc.subcategories || []).map((sub) => {
          if (sub.id !== subId) return sub;
          return { ...sub, content: (sub.content || []).filter((_, idx) => idx !== contentIdx) };
        }),
      };
    });
    setDocuments(next);
    await persistDocuments(next, 'ลบเนื้อหาแล้ว');
  };

  const handleUploadSubcategoryPdf = async (docId, subId, file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.uploadManualPdf(file);
      const url = res?.url;
      if (!url) throw new Error('ไม่ได้รับ URL ไฟล์');
      const next = documents.map((doc) => {
        if (doc.id !== docId) return doc;
        return {
          ...doc,
          subcategories: (doc.subcategories || []).map((sub) => {
            if (sub.id !== subId) return sub;
            const withoutPdf = (sub.content || []).filter((item) => item.type !== 'pdf');
            return { ...sub, content: [...withoutPdf, { type: 'pdf', file: url }] };
          }),
        };
      });
      setDocuments(next);
      await persistDocuments(next, 'อัปโหลดเอกสารแล้ว');
    } catch (err) {
      toast(err?.message || 'อัปโหลด PDF ไม่สำเร็จ', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleUploadMainPdf = async (docId, file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.uploadManualPdf(file);
      const url = res?.url;
      if (!url) throw new Error('ไม่ได้รับ URL ไฟล์');
      const next = documents.map((doc) => (doc.id === docId ? { ...doc, type: 'pdf', file: url } : doc));
      setDocuments(next);
      await persistDocuments(next, 'อัปโหลดเอกสารแล้ว');
    } catch (err) {
      toast(err?.message || 'อัปโหลด PDF ไม่สำเร็จ', 'error');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className='w-full py-16 text-center text-gray-500 text-sm'>กำลังโหลด Manual...</div>
    );
  }

  return (
    <div className='w-full'>
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6'>
        <div className='flex items-center gap-3'>
          <div className='bg-[#F5C200] rounded-xl p-3 shadow-lg'>
            <HiHome className='text-white text-2xl' />
          </div>
          <div>
            <h1 className='text-2xl font-bold text-gray-800' style={getTextStyle('admin.manual.title')}>
              {getCopy('admin.manual.title', 'Manual')}
            </h1>
            <p className='text-sm text-gray-600' style={getTextStyle('admin.manual.subtitle')}>
              {getCopy('admin.manual.subtitle', 'คู่มือและเนื้อหาสำหรับทีม Support')}
              {(saving || uploading) ? ' — กำลังบันทึก...' : ''}
            </p>
          </div>
        </div>
        <div className='flex items-center gap-2 self-start'>
          <button
            type='button'
            onClick={loadManual}
            disabled={loading || saving}
            className='inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50'
            title='รีเฟรช'
          >
            <HiRefresh className='text-base' />
            รีเฟรช
          </button>
          {isAdmin && (
            <button
              type='button'
              onClick={() => setIsEditMode(!isEditMode)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg shadow-sm transition-all text-sm font-semibold ${
                isEditMode
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-white'
              }`}
            >
              {isEditMode ? <HiX className='text-base' /> : <HiPencil className='text-base' />}
              <span>{isEditMode ? 'ออกจากโหมดแก้ไข' : 'แก้ไข'}</span>
            </button>
          )}
        </div>
      </div>

      <div className='space-y-6'>
        {isEditMode && isAdmin && (
          <button
            type='button'
            onClick={handleAddCategory}
            disabled={saving}
            className='w-full flex items-center justify-center gap-2 bg-[#F5C200] hover:bg-[#F5D547] text-gray-800 font-semibold py-4 px-6 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50'
          >
            <HiPlus className='text-xl' />
            <span>เพิ่มหัวข้อหลักใหม่</span>
          </button>
        )}

        {documents.map((doc) => {
          const Icon = ICON_MAP[doc.iconKey] || HiLightBulb;
          return (
            <div key={doc.id} className='bg-white border border-gray-200 rounded-2xl p-4 md:p-6 shadow-sm relative'>
              {editingCategory === doc.id ? (
                <div className='space-y-4'>
                  <div className='flex items-center gap-3'>
                    <div className={`w-11 h-11 rounded-xl ${doc.iconBg || 'bg-yellow-100'} flex items-center justify-center shrink-0`}>
                      <Icon className={`${doc.iconColor || 'text-yellow-500'} text-2xl`} />
                    </div>
                    <div className='flex-1 space-y-2'>
                      <input
                        type='text'
                        value={editCategoryData.title || ''}
                        onChange={(e) => setEditCategoryData({ ...editCategoryData, title: e.target.value })}
                        className='w-full text-xl font-semibold text-gray-800 leading-tight border-2 border-[#F5C200] rounded-lg px-3 py-2 focus:outline-none focus:border-[#F0A500]'
                        placeholder='ชื่อหัวข้อหลัก'
                      />
                      <input
                        type='text'
                        value={editCategoryData.description || ''}
                        onChange={(e) => setEditCategoryData({ ...editCategoryData, description: e.target.value })}
                        className='w-full text-sm text-gray-600 border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-[#F5C200]'
                        placeholder='คำอธิบาย'
                      />
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <button
                      type='button'
                      onClick={() => handleSaveCategory(doc.id)}
                      disabled={saving}
                      className='px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50'
                    >
                      บันทึก
                    </button>
                    <button
                      type='button'
                      onClick={handleCancelEditCategory}
                      className='px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded-md text-sm font-medium transition-colors'
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type='button'
                  onClick={() => {
                    setOpenDocument(openDocument === doc.id ? null : doc.id);
                    setOpenSubcategory(null);
                  }}
                  className='w-full flex items-center justify-between gap-3 text-left hover:bg-gray-50 transition-colors rounded-lg px-2 py-2 -mx-2'
                >
                  <div className='flex items-center gap-3'>
                    <div className={`w-11 h-11 rounded-xl ${doc.iconBg || 'bg-yellow-100'} flex items-center justify-center shrink-0`}>
                      <Icon className={`${doc.iconColor || 'text-yellow-500'} text-2xl`} />
                    </div>
                    <div>
                      <h2 className='text-xl font-semibold text-gray-800 leading-tight'>{doc.title}</h2>
                      <p className='text-sm text-gray-500 mt-1'>{doc.description}</p>
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    {isEditMode && isAdmin && (
                      <>
                        <button
                          type='button'
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditCategory(doc);
                          }}
                          className='p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors'
                          title='แก้ไข'
                        >
                          <HiPencil className='text-sm' />
                        </button>
                        <button
                          type='button'
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCategory(doc.id);
                          }}
                          className='p-1.5 bg-red-500 hover:bg-red-600 text-white rounded transition-colors'
                          title='ลบ'
                        >
                          <HiTrash className='text-sm' />
                        </button>
                      </>
                    )}
                    {openDocument === doc.id ? (
                      <HiChevronDown className='text-gray-500 text-2xl shrink-0' />
                    ) : (
                      <HiChevronRight className='text-gray-500 text-2xl shrink-0' />
                    )}
                  </div>
                </button>
              )}

              {openDocument === doc.id && (
                <div className='border-t border-gray-100 mt-4 pt-4'>
                  {doc.type === 'pdf' ? (
                    <>
                      <div className='flex justify-end mb-4'>
                        {isEditMode && isAdmin ? (
                          <label className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-800 text-sm font-medium transition-colors cursor-pointer'>
                            <HiPlus className='text-base' />
                            {uploading ? 'กำลังอัปโหลด...' : 'เพิ่มเอกสาร'}
                            <input
                              type='file'
                              accept='application/pdf'
                              className='hidden'
                              disabled={uploading || saving}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadMainPdf(doc.id, file);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        ) : doc.file ? (
                          <button
                            type='button'
                            onClick={() => downloadFile(doc.file)}
                            className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-800 text-sm font-medium transition-colors'
                          >
                            <HiDownload className='text-base' />
                            ดาวน์โหลดเอกสาร
                          </button>
                        ) : null}
                      </div>
                      {doc.file && (
                        <div ref={viewerRef} className='rounded-xl overflow-auto bg-gray-100 h-[85vh] p-6'>
                          <AuthPdfDocument filePath={doc.file} pageWidth={pageWidth} />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className='space-y-3'>
                      {isEditMode && isAdmin && (
                        <button
                          type='button'
                          onClick={() => handleAddSubcategory(doc.id)}
                          disabled={saving}
                          className='w-full flex items-center justify-center gap-2 bg-[#F5D547] hover:bg-[#F5C200] text-gray-800 font-medium py-3 px-4 rounded-xl transition-all duration-200 border-2 border-dashed border-[#F5C200] disabled:opacity-50'
                        >
                          <HiPlus className='text-lg' />
                          <span>เพิ่มหัวข้อย่อย</span>
                        </button>
                      )}

                      {(doc.subcategories || []).map((subcat) => {
                        const pdfItem = (subcat.content || []).find((item) => item.type === 'pdf');
                        const hasPDF = Boolean(pdfItem);

                        return (
                          <div key={subcat.id} className='border border-gray-200 rounded-xl overflow-hidden'>
                            {editingSubcategory === subcat.id ? (
                              <div className='p-4 bg-gray-50 space-y-3'>
                                <input
                                  type='text'
                                  value={editSubcategoryData.title || ''}
                                  onChange={(e) => setEditSubcategoryData({ ...editSubcategoryData, title: e.target.value })}
                                  className='w-full text-base font-semibold text-gray-800 border-2 border-[#F5C200] rounded-lg px-3 py-2 focus:outline-none focus:border-[#F0A500]'
                                  placeholder='ชื่อหัวข้อย่อย'
                                />
                                <div className='flex items-center gap-2'>
                                  <button
                                    type='button'
                                    onClick={() => handleSaveSubcategory(doc.id, subcat.id)}
                                    disabled={saving}
                                    className='px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50'
                                  >
                                    บันทึก
                                  </button>
                                  <button
                                    type='button'
                                    onClick={handleCancelEditSubcategory}
                                    className='px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded-md text-sm font-medium transition-colors'
                                  >
                                    ยกเลิก
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type='button'
                                onClick={() => setOpenSubcategory(openSubcategory === subcat.id ? null : subcat.id)}
                                className='w-full flex items-center justify-between gap-3 p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left'
                              >
                                <h3 className='text-base font-semibold text-gray-800'>{subcat.title}</h3>
                                <div className='flex items-center gap-2'>
                                  {isEditMode && isAdmin && (
                                    <>
                                      <button
                                        type='button'
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEditSubcategory(subcat);
                                        }}
                                        className='p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors'
                                        title='แก้ไข'
                                      >
                                        <HiPencil className='text-sm' />
                                      </button>
                                      <button
                                        type='button'
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteSubcategory(doc.id, subcat.id);
                                        }}
                                        className='p-1.5 bg-red-500 hover:bg-red-600 text-white rounded transition-colors'
                                        title='ลบ'
                                      >
                                        <HiTrash className='text-sm' />
                                      </button>
                                    </>
                                  )}
                                  {openSubcategory === subcat.id ? (
                                    <HiChevronDown className='text-gray-500 text-lg shrink-0' />
                                  ) : (
                                    <HiChevronRight className='text-gray-500 text-lg shrink-0' />
                                  )}
                                </div>
                              </button>
                            )}

                            {openSubcategory === subcat.id && (
                              <div className='flex justify-end p-3 border-b border-gray-200'>
                                {isEditMode && isAdmin ? (
                                  <label className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-800 text-sm font-medium transition-colors cursor-pointer'>
                                    <HiPlus className='text-base' />
                                    {uploading ? 'กำลังอัปโหลด...' : 'เพิ่มเอกสาร'}
                                    <input
                                      type='file'
                                      accept='application/pdf'
                                      className='hidden'
                                      disabled={uploading || saving}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleUploadSubcategoryPdf(doc.id, subcat.id, file);
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                ) : hasPDF ? (
                                  <button
                                    type='button'
                                    onClick={() => downloadFile(pdfItem.file)}
                                    className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-800 text-sm font-medium transition-colors'
                                  >
                                    <HiDownload className='text-base' />
                                    ดาวน์โหลดเอกสาร
                                  </button>
                                ) : null}
                              </div>
                            )}

                            {openSubcategory === subcat.id && (
                              <div className={`${hasPDF ? 'p-4' : 'bg-white p-4 space-y-3'}`}>
                                {(subcat.content || []).map((item, idx) => {
                                  const contentKey = `${doc.id}-${subcat.id}-${idx}`;
                                  const isEditing = editingContent === contentKey;

                                  return (
                                    <div key={idx} className='relative group'>
                                      {isEditMode && isAdmin && (
                                        <div className='absolute -top-1 -right-1 flex gap-1 z-10'>
                                          {isEditing ? (
                                            <>
                                              <button
                                                type='button'
                                                onClick={() => handleSaveContent(doc.id, subcat.id, idx)}
                                                className='p-1 bg-green-500 hover:bg-green-600 text-white rounded shadow-md text-xs'
                                                title='บันทึก'
                                              >
                                                <HiSave className='text-xs' />
                                              </button>
                                              <button
                                                type='button'
                                                onClick={handleCancelEditContent}
                                                className='p-1 bg-gray-500 hover:bg-gray-600 text-white rounded shadow-md text-xs'
                                                title='ยกเลิก'
                                              >
                                                <HiX className='text-xs' />
                                              </button>
                                            </>
                                          ) : (
                                            <>
                                              {item.type !== 'pdf' && (
                                                <button
                                                  type='button'
                                                  onClick={() => handleEditContent(doc.id, subcat.id, idx, item)}
                                                  className='p-1 bg-blue-600 hover:bg-blue-700 text-white rounded shadow-md text-xs'
                                                  title='แก้ไข'
                                                >
                                                  <HiPencil className='text-xs' />
                                                </button>
                                              )}
                                              <button
                                                type='button'
                                                onClick={() => handleDeleteContent(doc.id, subcat.id, idx)}
                                                className='p-1 bg-red-500 hover:bg-red-600 text-white rounded shadow-md text-xs'
                                                title='ลบ'
                                              >
                                                <HiTrash className='text-xs' />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      )}

                                      {isEditing ? (
                                        <div className='border-2 border-[#F5C200] rounded-lg p-3 bg-yellow-50'>
                                          {item.type === 'text' && (
                                            <textarea
                                              value={editContentData.value || ''}
                                              onChange={(e) => setEditContentData({ ...editContentData, value: e.target.value })}
                                              className='w-full text-sm text-gray-700 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#F5C200] min-h-[60px]'
                                              placeholder='เนื้อหาข้อความ'
                                            />
                                          )}
                                          {item.type === 'price' && (
                                            <input
                                              type='text'
                                              value={editContentData.value || ''}
                                              onChange={(e) => setEditContentData({ ...editContentData, value: e.target.value })}
                                              className='w-full text-2xl font-bold text-green-600 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#F5C200]'
                                              placeholder='ราคา'
                                            />
                                          )}
                                          {item.type === 'list' && (
                                            <div className='space-y-2'>
                                              {(editContentData.items || []).map((listItem, listIdx) => (
                                                <div key={listIdx} className='flex items-center gap-2'>
                                                  <span className='text-blue-500'>•</span>
                                                  <input
                                                    type='text'
                                                    value={listItem}
                                                    onChange={(e) => {
                                                      const newItems = [...editContentData.items];
                                                      newItems[listIdx] = e.target.value;
                                                      setEditContentData({ ...editContentData, items: newItems });
                                                    }}
                                                    className='flex-1 text-sm text-gray-600 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#F5C200]'
                                                    placeholder='รายการ'
                                                  />
                                                  <button
                                                    type='button'
                                                    onClick={() => {
                                                      const newItems = editContentData.items.filter((_, i) => i !== listIdx);
                                                      setEditContentData({ ...editContentData, items: newItems });
                                                    }}
                                                    className='p-1 text-red-500 hover:bg-red-100 rounded'
                                                  >
                                                    <HiTrash className='text-xs' />
                                                  </button>
                                                </div>
                                              ))}
                                              <button
                                                type='button'
                                                onClick={() => {
                                                  const newItems = [...(editContentData.items || []), 'รายการใหม่'];
                                                  setEditContentData({ ...editContentData, items: newItems });
                                                }}
                                                className='text-xs text-blue-600 hover:text-blue-700 font-medium'
                                              >
                                                + เพิ่มรายการ
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <>
                                          {item.type === 'text' && (
                                            <p className='text-gray-700 text-sm leading-relaxed'>{item.value}</p>
                                          )}
                                          {item.type === 'price' && (
                                            <div className='text-2xl font-bold text-green-600 mb-2'>{item.value}</div>
                                          )}
                                          {item.type === 'list' && (
                                            <ul className='space-y-2 ml-4'>
                                              {(item.items || []).map((listItem, listIdx) => (
                                                <li key={listIdx} className='flex items-start gap-2 text-sm text-gray-600'>
                                                  <span className='text-blue-500 mt-1'>•</span>
                                                  <span>{listItem}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                          {item.type === 'pdf' && item.file && (
                                            <div className='rounded-xl overflow-hidden shadow-sm h-[80vh]'>
                                              <div className='h-full overflow-auto p-6'>
                                                <AuthPdfDocument
                                                  filePath={item.file}
                                                  pageWidth={Math.min(pageWidth, 1200)}
                                                />
                                              </div>
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Home;
