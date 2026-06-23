import { useEffect, useRef, useState } from 'react';
import { HiLightBulb, HiChevronDown, HiChevronRight, HiBookOpen, HiCurrencyDollar, HiPresentationChartBar, HiPencil, HiSave, HiX, HiPlus, HiTrash, HiDownload } from 'react-icons/hi';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function Home() {
  const viewerRef = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(900);
  const [openDocument, setOpenDocument] = useState(null);
  const [openSubcategory, setOpenSubcategory] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const initialDocuments = [
    { 
      id: 'form', 
      type: 'content',
      title: 'แบบฟอร์มบันทึก', 
      description: 'รวมแบบฟอร์มการใช้งานที่เกี่ยวข้องกับระบบ Enterprise AI Chatbot', 
      icon: HiLightBulb, 
      iconBg: 'bg-yellow-100', 
      iconColor: 'text-yellow-500',
      subcategories: [
        {
          id: 'form-trial',
          title: 'แบบฟอร์มขอทดลองใช้งาน Enterprise AI Chatbot',
          content: [
            { type: 'pdf', file: '/Enterprise AI Chatbot Trial Request Form.pdf' }
          ]
        },
        {
          id: 'form-issue',
          title: 'แบบฟอร์มสำหรับแจ้งปัญหาการใช้งาน Enterprise AI Chatbot',
          content: [
            { type: 'pdf', file: '/Enterprise AI Chatbot Issue Report Form.pdf' }
          ]
        },
        {
          id: 'form-poc',
          title: 'แบบฟอร์มสำหรับขอข้อมูล POC ของ Enterprise AI Chatbot',
          content: [
            { type: 'pdf', file: '/Enterprise AI Chatbot POC Request.pdf' }
          ]
        },
        {
          id: 'form-tech-issue',
          title: 'แบบฟอร์มแจ้งปัญหาการใช้งานด้านเทคนิค',
          content: [
            { type: 'pdf', file: '/Enterprise AI Chatbot Technical Issue Report Form.pdf' }
          ]
        }
      ]
    },
    { 
      id: 'manual', 
      type: 'content',
      title: 'คู่มือการใช้งาน', 
      description: 'คู่มือการใช้งานระบบอย่างละเอียด', 
      icon: HiBookOpen, 
      iconBg: 'bg-blue-100', 
      iconColor: 'text-blue-500',
      subcategories: [
        {
          id: 'manual-getting-started',
          title: 'เริ่มต้นใช้งาน',
          content: [
            { type: 'text', value: 'ขั้นตอนการเริ่มต้นใช้งานระบบ Enterprise AI Chatbot Support & Admin' },
            { type: 'list', items: ['สร้างบัญชีผู้ใช้งาน', 'ตั้งค่าโปรไฟล์', 'เชื่อมต่อบอท', 'จัดการฐานความรู้'] }
          ]
        },
        {
          id: 'manual-features',
          title: 'ฟีเจอร์หลัก',
          content: [
            { type: 'text', value: 'ฟีเจอร์และความสามารถต่างๆ ของระบบ' },
            { type: 'list', items: ['การจัดการบอท', 'ระบบ Knowledge Base', 'แดชบอร์ดและรายงาน', 'การจัดการผู้ใช้'] }
          ]
        },
        {
          id: 'manual-troubleshooting',
          title: 'แก้ไขปัญหา',
          content: [
            { type: 'text', value: 'วิธีแก้ไขปัญหาที่พบบ่อย' },
            { type: 'list', items: ['บอทไม่ตอบสนอง', 'ปัญหาการเชื่อมต่อ', 'ข้อผิดพลาดในการอัปโหลด', 'ติดต่อฝ่ายสนับสนุน'] }
          ]
        }
      ]
    },
    { 
      id: 'pricing', 
      type: 'content',
      title: 'ราคา', 
      description: 'รายละเอียดราคาและแพ็คเกจต่างๆ', 
      icon: HiCurrencyDollar, 
      iconBg: 'bg-green-100', 
      iconColor: 'text-green-500',
      subcategories: [
        {
          id: 'pricing-basic',
          title: 'แพ็คเกจ Basic',
          content: [
            { type: 'price', value: '฿999/เดือน' },
            { type: 'list', items: ['1 บอท', '1,000 conversations/เดือน', 'ฐานความรู้ 100 MB', 'รองรับพื้นฐาน'] }
          ]
        },
        {
          id: 'pricing-pro',
          title: 'แพ็คเกจ Pro',
          content: [
            { type: 'price', value: '฿2,999/เดือน' },
            { type: 'list', items: ['5 บอท', '10,000 conversations/เดือน', 'ฐานความรู้ 1 GB', 'รองรับ 24/7', 'วิเคราะห์ขั้นสูง'] }
          ]
        },
        {
          id: 'pricing-enterprise',
          title: 'แพ็คเกจ Enterprise',
          content: [
            { type: 'price', value: 'ติดต่อเรา' },
            { type: 'list', items: ['บอทไม่จำกัด', 'Conversations ไม่จำกัด', 'ฐานความรู้ไม่จำกัด', 'รองรับเฉพาะทาง', 'ปรับแต่งได้เต็มรูปแบบ'] }
          ]
        }
      ]
    },
    { 
      id: 'presentation', 
      type: 'content',
      title: 'สไลด์นำเสนอ', 
      description: 'สไลด์นำเสนอข้อมูลระบบ', 
      icon: HiPresentationChartBar, 
      iconBg: 'bg-purple-100', 
      iconColor: 'text-purple-500',
      subcategories: [
        {
          id: 'presentation-overview',
          title: 'ภาพรวมระบบ',
          content: [
            { type: 'text', value: 'แนะนำระบบ Enterprise AI Chatbot Support & Admin' },
            { type: 'list', items: ['ระบบ AI Chatbot อัจฉริยะ', 'รองรับหลายช่องทาง', 'จัดการง่าย ใช้งานสะดวก', 'รายงานและวิเคราะห์แบบ Real-time'] }
          ]
        },
        {
          id: 'presentation-benefits',
          title: 'ประโยชน์และข้อดี',
          content: [
            { type: 'text', value: 'ประโยชน์ที่คุณจะได้รับ' },
            { type: 'list', items: ['ลดต้นทุนการบริการลูกค้า', 'ตอบคำถามอัตโนมัติ 24/7', 'เพิ่มประสิทธิภาพทีมงาน', 'ข้อมูลเชิงลึกเพื่อการตัดสินใจ'] }
          ]
        },
        {
          id: 'presentation-demo',
          title: 'ตัวอย่างการใช้งาน',
          content: [
            { type: 'text', value: 'กรณีศึกษาและตัวอย่างการใช้งานจริง' },
            { type: 'list', items: ['E-commerce Support', 'การบริการลูกค้า', 'ศูนย์ช่วยเหลือภายใน', 'Lead Generation'] }
          ]
        }
      ]
    }
  ];

  const [documents, setDocuments] = useState(initialDocuments);

  // Edit state for category
  const [editingCategory, setEditingCategory] = useState(null);
  const [editCategoryData, setEditCategoryData] = useState({});

  // Edit state for subcategory
  const [editingSubcategory, setEditingSubcategory] = useState(null);
  const [editSubcategoryData, setEditSubcategoryData] = useState({});

  const handleEditCategory = (doc) => {
    setEditingCategory(doc.id);
    setEditCategoryData({
      title: doc.title,
      description: doc.description
    });
  };

  const handleSaveCategory = (docId) => {
    setDocuments(documents.map(doc => 
      doc.id === docId 
        ? { ...doc, ...editCategoryData }
        : doc
    ));
    setEditingCategory(null);
    setEditCategoryData({});
  };

  const handleCancelEditCategory = () => {
    setEditingCategory(null);
    setEditCategoryData({});
  };

  const handleDeleteCategory = (docId) => {
    if (window.confirm('คุณต้องการลบหัวข้อหลักนี้หรือไม่?')) {
      setDocuments(documents.filter(doc => doc.id !== docId));
    }
  };

  const handleAddCategory = () => {
    const newCategory = {
      id: `category-${Date.now()}`,
      type: 'content',
      title: 'หัวข้อใหม่',
      description: 'คำอธิบายหัวข้อใหม่',
      icon: HiBookOpen,
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-500',
      subcategories: []
    };
    setDocuments([...documents, newCategory]);
  };

  // Subcategory management
  const handleEditSubcategory = (subcat) => {
    setEditingSubcategory(subcat.id);
    setEditSubcategoryData({
      title: subcat.title
    });
  };

  const handleSaveSubcategory = (docId, subcatId) => {
    setDocuments(documents.map(doc => {
      if (doc.id === docId) {
        return {
          ...doc,
          subcategories: doc.subcategories.map(sub =>
            sub.id === subcatId
              ? { ...sub, ...editSubcategoryData }
              : sub
          )
        };
      }
      return doc;
    }));
    setEditingSubcategory(null);
    setEditSubcategoryData({});
  };

  const handleCancelEditSubcategory = () => {
    setEditingSubcategory(null);
    setEditSubcategoryData({});
  };

  const handleDeleteSubcategory = (docId, subcatId) => {
    if (window.confirm('คุณต้องการลบหัวข้อย่อยนี้หรือไม่?')) {
      setDocuments(documents.map(doc => {
        if (doc.id === docId) {
          return {
            ...doc,
            subcategories: doc.subcategories.filter(sub => sub.id !== subcatId)
          };
        }
        return doc;
      }));
    }
  };

  const handleAddSubcategory = (docId) => {
    const newSubcategory = {
      id: `subcat-${Date.now()}`,
      title: 'หัวข้อย่อยใหม่',
      content: [
        { type: 'text', value: 'เนื้อหาใหม่' }
      ]
    };
    setDocuments(documents.map(doc => {
      if (doc.id === docId) {
        return {
          ...doc,
          subcategories: [...doc.subcategories, newSubcategory]
        };
      }
      return doc;
    }));
  };

  // Content management
  const [editingContent, setEditingContent] = useState(null);
  const [editContentData, setEditContentData] = useState({});

  const handleEditContent = (docId, subcatId, contentIdx, content) => {
    setEditingContent(`${docId}-${subcatId}-${contentIdx}`);
    setEditContentData(content);
  };

  const handleSaveContent = (docId, subcatId, contentIdx) => {
    setDocuments(documents.map(doc => {
      if (doc.id === docId) {
        return {
          ...doc,
          subcategories: doc.subcategories.map(sub => {
            if (sub.id === subcatId) {
              const newContent = [...sub.content];
              newContent[contentIdx] = editContentData;
              return { ...sub, content: newContent };
            }
            return sub;
          })
        };
      }
      return doc;
    }));
    setEditingContent(null);
    setEditContentData({});
  };

  const handleCancelEditContent = () => {
    setEditingContent(null);
    setEditContentData({});
  };

  const handleDeleteContent = (docId, subcatId, contentIdx) => {
    if (window.confirm('คุณต้องการลบเนื้อหานี้หรือไม่?')) {
      setDocuments(documents.map(doc => {
        if (doc.id === docId) {
          return {
            ...doc,
            subcategories: doc.subcategories.map(sub => {
              if (sub.id === subcatId) {
                return {
                  ...sub,
                  content: sub.content.filter((_, idx) => idx !== contentIdx)
                };
              }
              return sub;
            })
          };
        }
        return doc;
      }));
    }
  };

  const handleUploadMainPdf = (docId, file) => {
    if (!file) return;

    const pdfUrl = URL.createObjectURL(file);
    setDocuments(documents.map(doc =>
      doc.id === docId
        ? {
            ...doc,
            type: 'pdf',
            file: pdfUrl
          }
        : doc
    ));
  };

  const handleUploadSubcategoryPdf = (docId, subcatId, file) => {
    if (!file) return;

    const pdfUrl = URL.createObjectURL(file);
    setDocuments(documents.map(doc => {
      if (doc.id === docId) {
        return {
          ...doc,
          subcategories: doc.subcategories.map(sub => {
            if (sub.id === subcatId) {
              return {
                ...sub,
                content: [...sub.content, { type: 'pdf', file: pdfUrl }]
              };
            }
            return sub;
          })
        };
      }
      return doc;
    }));
  };

  useEffect(() => {
    const updatePageWidth = () => {
      if (!viewerRef.current) return;
      const width = viewerRef.current.clientWidth;
      setPageWidth(Math.max(320, Math.min(width - 48, 1400)));
    };

    updatePageWidth();
    window.addEventListener('resize', updatePageWidth);
    return () => window.removeEventListener('resize', updatePageWidth);
  }, []);

  const onDocumentLoadSuccess = ({ numPages: totalPages }) => {
    setNumPages(totalPages);
  };

  // Check if user is admin (get from window.userRole set by Navbar)
  const isAdmin = typeof window !== 'undefined' && window.userRole !== 'support';

  return (
    <div className='w-full h-full p-4 md:p-6'>
      <div className='mb-6 flex items-end justify-between gap-3'>
        <div>
          <h1 className='text-3xl font-bold text-gray-800 mb-2'>Manual</h1>
          <p className='text-sm text-gray-600'>เอกสารคู่มือการใช้งานระบบ</p>
        </div>
        {isAdmin && (
          <div className='flex items-center gap-2'>
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md shadow-sm hover:shadow transition-all duration-200 active:scale-95 text-sm font-semibold ${
                isEditMode
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <span>{isEditMode ? 'ออกจากโหมดแก้ไข' : 'แก้ไข'}</span>
              {isEditMode ? <HiX className='text-base' /> : <HiPencil className='text-base' />}
            </button>
          </div>
        )}
      </div>

      <div className='space-y-6'>
        {/* Add Category Button */}
        {isEditMode && isAdmin && (
          <button
            onClick={handleAddCategory}
            className='w-full flex items-center justify-center gap-2 bg-[#F5C200] hover:bg-[#F5D547] text-gray-800 font-semibold py-4 px-6 rounded-xl shadow-sm hover:shadow-md transition-all duration-200'
          >
            <HiPlus className='text-xl' />
            <span>เพิ่มหัวข้อหลักใหม่</span>
          </button>
        )}

        {documents.map((doc) => (
          <div key={doc.id} className='bg-white border border-gray-200 rounded-2xl p-4 md:p-6 shadow-sm relative'>
            {editingCategory === doc.id ? (
              // Edit Mode for Category
              <div className='space-y-4'>
                <div className='flex items-center gap-3'>
                  <div className={`w-11 h-11 rounded-xl ${doc.iconBg} flex items-center justify-center shrink-0`}>
                    <doc.icon className={`${doc.iconColor} text-2xl`} />
                  </div>
                  <div className='flex-1 space-y-2'>
                    <input
                      type='text'
                      value={editCategoryData.title || ''}
                      onChange={(e) => setEditCategoryData({...editCategoryData, title: e.target.value})}
                      className='w-full text-xl font-semibold text-gray-800 leading-tight border-2 border-[#F5C200] rounded-lg px-3 py-2 focus:outline-none focus:border-[#F0A500]'
                      placeholder='ชื่อหัวข้อหลัก'
                    />
                    <input
                      type='text'
                      value={editCategoryData.description || ''}
                      onChange={(e) => setEditCategoryData({...editCategoryData, description: e.target.value})}
                      className='w-full text-sm text-gray-600 border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-[#F5C200]'
                      placeholder='คำอธิบาย'
                    />
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <button
                    onClick={() => handleSaveCategory(doc.id)}
                    className='px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-md text-sm font-medium transition-colors'
                  >
                    บันทึก
                  </button>
                  <button
                    onClick={handleCancelEditCategory}
                    className='px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded-md text-sm font-medium transition-colors'
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : (
              // Normal Display Mode
              <button
                type='button'
                onClick={() => {
                  setOpenDocument(openDocument === doc.id ? null : doc.id);
                  setOpenSubcategory(null); // Reset subcategory when switching documents
                }}
                className='w-full flex items-center justify-between gap-3 text-left hover:bg-gray-50 transition-colors rounded-lg px-2 py-2 -mx-2'
              >
                <div className='flex items-center gap-3'>
                  <div className={`w-11 h-11 rounded-xl ${doc.iconBg} flex items-center justify-center shrink-0`}>
                    <doc.icon className={`${doc.iconColor} text-2xl`} />
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
              <>
                <div className='border-t border-gray-100 mt-4 pt-4'>
                  {doc.type === 'pdf' ? (
                    // PDF Viewer
                    <>
                      <div className='flex justify-end mb-4'>
                        {isEditMode && isAdmin ? (
                          <label className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-800 text-sm font-medium transition-colors cursor-pointer'>
                            <HiPlus className='text-base' />
                            เพิ่มเอกสาร
                            <input
                              type='file'
                              accept='application/pdf'
                              className='hidden'
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleUploadMainPdf(doc.id, file);
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        ) : (
                          <a
                            href={doc.file}
                            download
                            className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-800 text-sm font-medium transition-colors'
                          >
                            <HiDownload className='text-base' />
                            ดาวน์โหลดเอกสาร
                          </a>
                        )}
                      </div>
                      <div ref={viewerRef} className='rounded-xl overflow-auto bg-gray-100 h-[85vh] p-6'>
                        <Document
                          file={doc.file}
                          onLoadSuccess={onDocumentLoadSuccess}
                          loading={<p className='text-sm text-gray-500 text-center py-6'>กำลังโหลดเอกสาร...</p>}
                          error={<p className='text-sm text-red-500 text-center py-6'>ไม่สามารถโหลดไฟล์ PDF ได้</p>}
                        >
                          <div className='flex flex-col items-center gap-4'>
                            {Array.from(new Array(numPages), (_, index) => (
                              <Page
                                key={`${doc.id}-page-${index + 1}`}
                                pageNumber={index + 1}
                                width={pageWidth}
                                renderTextLayer={false}
                                renderAnnotationLayer={false}
                              />
                            ))}
                          </div>
                        </Document>
                      </div>
                    </>
                  ) : (
                    // Content with Subcategories
                    <div className='space-y-3'>
                      {/* Add Subcategory Button */}
                      {isEditMode && isAdmin && (
                        <button
                          onClick={() => handleAddSubcategory(doc.id)}
                          className='w-full flex items-center justify-center gap-2 bg-[#F5D547] hover:bg-[#F5C200] text-gray-800 font-medium py-3 px-4 rounded-xl transition-all duration-200 border-2 border-dashed border-[#F5C200]'
                        >
                          <HiPlus className='text-lg' />
                          <span>เพิ่มหัวข้อย่อย</span>
                        </button>
                      )}

                      {doc.subcategories.map((subcat) => {
                        const hasPDF = subcat.content.some(item => item.type === 'pdf');

                        return (
                        <div key={subcat.id} className='border border-gray-200 rounded-xl overflow-hidden'>

                          {editingSubcategory === subcat.id ? (
                            // Edit Mode for Subcategory
                            <div className='p-4 bg-gray-50 space-y-3'>
                              <input
                                type='text'
                                value={editSubcategoryData.title || ''}
                                onChange={(e) => setEditSubcategoryData({...editSubcategoryData, title: e.target.value})}
                                className='w-full text-base font-semibold text-gray-800 border-2 border-[#F5C200] rounded-lg px-3 py-2 focus:outline-none focus:border-[#F0A500]'
                                placeholder='ชื่อหัวข้อย่อย'
                              />
                              <div className='flex items-center gap-2'>
                                <button
                                  onClick={() => handleSaveSubcategory(doc.id, subcat.id)}
                                  className='px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-md text-sm font-medium transition-colors'
                                >
                                  บันทึก
                                </button>
                                <button
                                  onClick={handleCancelEditSubcategory}
                                  className='px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded-md text-sm font-medium transition-colors'
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            </div>
                          ) : (
                            // Normal Display Mode
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
                                  เพิ่มเอกสาร
                                  <input
                                    type='file'
                                    accept='application/pdf'
                                    className='hidden'
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        handleUploadSubcategoryPdf(doc.id, subcat.id, file);
                                      }
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              ) : hasPDF && (
                                <a
                                  href={subcat.content.find(item => item.type === 'pdf')?.file}
                                  download
                                  className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-800 text-sm font-medium transition-colors'
                                >
                                  <HiDownload className='text-base' />
                                  ดาวน์โหลดเอกสาร
                                </a>
                              )}
                            </div>
                          )}
                          
                          {openSubcategory === subcat.id && (
                            <div className={`${hasPDF ? 'p-4' : 'bg-white p-4 space-y-3'}`}>
                              {subcat.content.map((item, idx) => {
                                const contentKey = `${doc.id}-${subcat.id}-${idx}`;
                                const isEditing = editingContent === contentKey;

                                return (
                                <div key={idx} className='relative group'>
                                  {isEditMode && isAdmin && (
                                    <div className='absolute -top-1 -right-1 flex gap-1 z-10'>
                                      {isEditing ? (
                                        <>
                                          <button
                                            onClick={() => handleSaveContent(doc.id, subcat.id, idx)}
                                            className='p-1 bg-green-500 hover:bg-green-600 text-white rounded shadow-md text-xs'
                                            title='บันทึก'
                                          >
                                            <HiSave className='text-xs' />
                                          </button>
                                          <button
                                            onClick={handleCancelEditContent}
                                            className='p-1 bg-gray-500 hover:bg-gray-600 text-white rounded shadow-md text-xs'
                                            title='ยกเลิก'
                                          >
                                            <HiX className='text-xs' />
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => handleEditContent(doc.id, subcat.id, idx, item)}
                                            className='p-1 bg-blue-600 hover:bg-blue-700 text-white rounded shadow-md text-xs'
                                            title='แก้ไข'
                                          >
                                            <HiPencil className='text-xs' />
                                          </button>
                                          <button
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
                                    // Edit Mode for Content
                                    <div className='border-2 border-[#F5C200] rounded-lg p-3 bg-yellow-50'>
                                      {item.type === 'text' && (
                                        <textarea
                                          value={editContentData.value || ''}
                                          onChange={(e) => setEditContentData({...editContentData, value: e.target.value})}
                                          className='w-full text-sm text-gray-700 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#F5C200] min-h-[60px]'
                                          placeholder='เนื้อหาข้อความ'
                                        />
                                      )}
                                      {item.type === 'price' && (
                                        <input
                                          type='text'
                                          value={editContentData.value || ''}
                                          onChange={(e) => setEditContentData({...editContentData, value: e.target.value})}
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
                                                  setEditContentData({...editContentData, items: newItems});
                                                }}
                                                className='flex-1 text-sm text-gray-600 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#F5C200]'
                                                placeholder='รายการ'
                                              />
                                              <button
                                                onClick={() => {
                                                  const newItems = editContentData.items.filter((_, i) => i !== listIdx);
                                                  setEditContentData({...editContentData, items: newItems});
                                                }}
                                                className='p-1 text-red-500 hover:bg-red-100 rounded'
                                              >
                                                <HiTrash className='text-xs' />
                                              </button>
                                            </div>
                                          ))}
                                          <button
                                            onClick={() => {
                                              const newItems = [...(editContentData.items || []), 'รายการใหม่'];
                                              setEditContentData({...editContentData, items: newItems});
                                            }}
                                            className='text-xs text-blue-600 hover:text-blue-700 font-medium'
                                          >
                                            + เพิ่มรายการ
                                          </button>
                                        </div>
                                      )}
                                      {item.type === 'pdf' && (
                                        <input
                                          type='text'
                                          value={editContentData.file || ''}
                                          onChange={(e) => setEditContentData({...editContentData, file: e.target.value})}
                                          className='w-full text-sm text-gray-700 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#F5C200]'
                                          placeholder='URL หรือ path ของไฟล์ PDF (เช่น /document.pdf)'
                                        />
                                      )}
                                    </div>
                                  ) : (
                                    // Normal Display Mode
                                    <>
                                      {item.type === 'text' && (
                                        <p className='text-gray-700 text-sm leading-relaxed'>{item.value}</p>
                                      )}
                                      {item.type === 'price' && (
                                        <div className='text-2xl font-bold text-green-600 mb-2'>{item.value}</div>
                                      )}
                                      {item.type === 'list' && (
                                        <ul className='space-y-2 ml-4'>
                                          {item.items.map((listItem, listIdx) => (
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
                                          <Document
                                            file={item.file}
                                            onLoadSuccess={onDocumentLoadSuccess}
                                            loading={<p className='text-sm text-gray-500 text-center py-6'>กำลังโหลดเอกสาร...</p>}
                                            error={<p className='text-sm text-red-500 text-center py-6'>ไม่สามารถโหลดไฟล์ PDF ได้</p>}
                                          >
                                            <div className='flex flex-col items-center gap-4'>
                                              {Array.from(new Array(numPages), (_, index) => (
                                                <Page
                                                  key={`subcat-pdf-page-${index + 1}`}
                                                  pageNumber={index + 1}
                                                  width={Math.min(pageWidth, 1200)}
                                                  renderTextLayer={false}
                                                  renderAnnotationLayer={false}
                                                />
                                              ))}
                                            </div>
                                          </Document>
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              )})}
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Home;
