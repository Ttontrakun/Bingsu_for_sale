import { HiX, HiDownload, HiEye, HiDocumentText } from 'react-icons/hi';
import BotMarkdown from '../../components/chat/BotMarkdown';
import { normalizeMarkdownTable } from '../../utils/normalizeMarkdownTable';
import { showToast } from '../../components/ToastNotification';
import { knowledgeAPI, getErrorMessage } from '../../services/api';
import { ENABLE_SOURCE_REFERENCES, stripAiHelperSections } from './chatHelpers';

export default function CitationModal({
  isSourceModalOpen,
  sourceModalData,
  originalPreviewPopup,
  setOriginalPreviewPopup,
  setIsSourceModalOpen,
}) {
  return (
    <>
      {ENABLE_SOURCE_REFERENCES && isSourceModalOpen && sourceModalData && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50'
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              if (originalPreviewPopup?.url) URL.revokeObjectURL(originalPreviewPopup.url);
              setOriginalPreviewPopup(null);
              setIsSourceModalOpen(false);
            }
          }}
          role='dialog'
          aria-modal='true'
        >
          <div className='bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden'>
            <div className='h-1 bg-gradient-to-r from-yellow-400 to-amber-400' />
            <div className='px-5 sm:px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3'>
              <div className='min-w-0 flex items-start gap-3'>
                <div className='mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-yellow-50 text-amber-600'>
                  <HiDocumentText className='text-lg' aria-hidden />
                </div>
                <div className='min-w-0'>
                  <h2 className='text-base font-semibold text-gray-900'>แหล่งอ้างอิงคำตอบ</h2>
                  <p className='mt-0.5 text-sm text-gray-500 truncate' title={sourceModalData.displayName}>
                    {sourceModalData.displayName}
                  </p>
                </div>
              </div>
              <button
                type='button'
                onClick={() => {
                  if (originalPreviewPopup?.url) URL.revokeObjectURL(originalPreviewPopup.url);
                  setOriginalPreviewPopup(null);
                  setIsSourceModalOpen(false);
                }}
                className='rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                aria-label='ปิด'
              >
                <HiX className='text-lg' />
              </button>
            </div>
            <div className='flex-1 overflow-auto bg-[#f7f7f8] p-4 sm:p-5 space-y-4 text-sm'>
              {!sourceModalData.isPrivate && (
                <section className='rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden'>
                  <div className='px-4 py-2.5 border-b border-gray-100'>
                    <p className='text-xs font-semibold text-gray-500'>เอกสารต้นฉบับ</p>
                  </div>
                  {sourceModalData.originalsLoading ? (
                    <p className='px-4 py-3 text-xs text-gray-500'>กำลังโหลดต้นฉบับ...</p>
                  ) : Array.isArray(sourceModalData.originals) && sourceModalData.originals.length > 0 ? (
                    <ul className='divide-y divide-gray-100 max-h-80 overflow-y-auto'>
                      {sourceModalData.originals.map((orig) => (
                        <li key={`orig-${orig.index}`} className='flex items-center justify-between gap-3 px-4 py-3'>
                          <div className='min-w-0 flex items-center gap-2.5'>
                            <HiDocumentText className='flex-shrink-0 text-base text-amber-500' aria-hidden />
                            <p className='text-sm font-medium text-gray-800 truncate' title={orig.name}>{orig.name}</p>
                          </div>
                          <div className='flex items-center gap-1.5 flex-shrink-0'>
                            {orig.isPdf ? (
                              <button
                                type='button'
                                onClick={async () => {
                                  setOriginalPreviewPopup({
                                    name: orig.name,
                                    url: null,
                                    loading: true,
                                  });
                                  try {
                                    const blob = await knowledgeAPI.fetchOriginalBlob(
                                      sourceModalData.docId,
                                      orig.index,
                                      { inline: true }
                                    );
                                    const url = URL.createObjectURL(blob);
                                    setOriginalPreviewPopup({
                                      name: orig.name,
                                      url,
                                      loading: false,
                                    });
                                  } catch (err) {
                                    setOriginalPreviewPopup(null);
                                    showToast(getErrorMessage(err) || 'เปิดพรีวิวไม่สำเร็จ', 'error');
                                  }
                                }}
                                className='inline-flex items-center gap-1.5 rounded-full bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-yellow-500'
                              >
                                <HiEye className='text-sm' />
                                พรีวิว
                              </button>
                            ) : null}
                            <button
                              type='button'
                              onClick={async () => {
                                try {
                                  const blob = await knowledgeAPI.fetchOriginalBlob(sourceModalData.docId, orig.index, { inline: false });
                                  const url = URL.createObjectURL(blob);
                                  const a = window.document.createElement('a');
                                  a.href = url;
                                  a.download = orig.name || 'document';
                                  window.document.body.appendChild(a);
                                  a.click();
                                  a.remove();
                                  URL.revokeObjectURL(url);
                                } catch (err) {
                                  showToast(getErrorMessage(err) || 'ดาวน์โหลดไม่สำเร็จ', 'error');
                                }
                              }}
                              className='inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50'
                            >
                              <HiDownload className='text-sm' />
                              ดาวน์โหลด
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className='px-4 py-3 text-xs text-gray-500 leading-relaxed'>
                      ยังไม่มีไฟล์ต้นฉบับในชุดความรู้นี้ — แสดงช่วงข้อความที่ใช้ตอบด้านล่าง
                    </p>
                  )}
                </section>
              )}
              {Array.isArray(sourceModalData.positions) && sourceModalData.positions.length > 0 && (
                <div className='flex flex-wrap items-center gap-1.5 px-0.5'>
                  <span className='text-xs font-medium text-gray-500 mr-0.5'>ตำแหน่ง</span>
                  {sourceModalData.positions.map((pos, idx) => (
                    <span
                      key={`${pos.chunkIndex ?? 'n'}-${idx}`}
                      className='inline-flex items-center rounded-full bg-white border border-gray-200 px-2.5 py-0.5 text-[11px] text-gray-600'
                    >
                      {pos.lineHint || pos.label || `ช่วงที่ ${(pos.chunkIndex ?? idx) + 1}`}
                    </span>
                  ))}
                </div>
              )}
              {sourceModalData.isPrivate ? (
                <div className='space-y-3'>
                  <div className='rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 space-y-1'>
                    <p className='text-sm font-medium text-violet-900'>อ้างอิงจากเนื้อหาส่วนตัวของคุณ</p>
                    <p className='text-xs text-violet-800/80 leading-relaxed'>
                      คำตอบส่วนนี้อ้างอิงจากข้อมูลที่คุณตั้งในโหมดส่วนตัว — แก้ไขด้วย /จำ หรือ /สั่ง
                    </p>
                  </div>
                  {sourceModalData.privateLoading ? (
                    <p className='text-sm text-gray-500 px-1'>กำลังโหลดเนื้อหาส่วนตัว...</p>
                  ) : sourceModalData.privateLoadError ? (
                    <p className='text-sm text-red-600 px-1'>โหลดเนื้อหาส่วนตัวไม่สำเร็จ ลองเปิดใหม่อีกครั้ง</p>
                  ) : (
                    <>
                      {sourceModalData.privateInstructions ? (
                        <div className='rounded-xl border border-violet-200 bg-white px-4 py-3'>
                          <p className='text-xs font-semibold text-violet-800 mb-1'>คำสั่ง AI (/สั่ง)</p>
                          <p className='text-sm text-gray-800 whitespace-pre-wrap leading-relaxed'>
                            {sourceModalData.privateInstructions}
                          </p>
                        </div>
                      ) : null}
                      {Array.isArray(sourceModalData.privateItems) && sourceModalData.privateItems.length > 0 ? (
                        <div className='space-y-2'>
                          <p className='text-xs font-semibold text-gray-500 px-0.5'>
                            ความจำที่บันทึกไว้ ({sourceModalData.privateItems.length})
                          </p>
                          {sourceModalData.privateItems.map((item, idx) => (
                            <div
                              key={`priv-${idx}`}
                              className='rounded-xl border border-violet-200 bg-white px-4 py-3'
                            >
                              <p className='text-xs font-semibold text-violet-800 mb-1'>รายการที่ {idx + 1}</p>
                              <p className='text-sm text-gray-900 whitespace-pre-wrap leading-relaxed'>
                                {item}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className='rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-gray-600 text-sm'>
                          ยังไม่พบข้อความในคลังส่วนตัว — ลองพิมพ์ <code className='text-xs'>/จำ ...</code> ในโหมดส่วนตัว
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : Array.isArray(sourceModalData.chunks) && sourceModalData.chunks.length > 0 ? (
                <section className='space-y-2.5'>
                  <p className='text-xs font-semibold text-gray-500 px-0.5'>ช่วงข้อความที่ใช้ตอบ</p>
                  {sourceModalData.chunks.map((chunk, idx) => {
                    const displayText = stripAiHelperSections(
                      normalizeMarkdownTable(String(chunk.text || '')).replace(/<br\s*\/?>/gi, '\n')
                    );
                    const helperOnly = !displayText;
                    return (
                    <div key={chunk.id || idx} className='rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden'>
                      <div className='flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/80'>
                        <span className='inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-yellow-400 px-1.5 text-[10px] font-bold text-gray-900'>
                          {idx + 1}
                        </span>
                        <p className='text-xs font-semibold text-gray-700'>
                          {chunk.lineHint || (Number.isFinite(chunk.page) ? `หน้า ${chunk.page}` : `ช่วงที่ ${idx + 1}`)}
                        </p>
                      </div>
                      <div className='px-4 py-3 border-l-[3px] border-yellow-400'>
                        {chunk.quote && !helperOnly ? (
                          <p className='text-xs text-gray-500 italic mb-2'>“{chunk.quote}”</p>
                        ) : null}
                        <div className='text-sm text-gray-800 leading-relaxed'>
                          {displayText ? (
                            <BotMarkdown text={displayText} />
                          ) : (
                            <p className='text-xs text-gray-500 italic'>อ้างอิงจากเอกสารนี้ — ดูต้นฉบับสำหรับรายละเอียด</p>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </section>
              ) : (
                <div className='rounded-xl border border-dashed border-gray-200 bg-white px-4 py-4 text-gray-600 space-y-1'>
                  <p className='text-sm font-medium text-gray-800'>ยังไม่มีช่วงข้อความย่อย</p>
                  <p className='text-xs leading-relaxed'>
                    เปิดต้นฉบับด้านบนได้ หรือถามต่อแบบเจาะจงเพื่อให้ระบบดึงบริบทเพิ่ม
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {originalPreviewPopup && (
        <div
          className='fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60'
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              if (originalPreviewPopup.url) URL.revokeObjectURL(originalPreviewPopup.url);
              setOriginalPreviewPopup(null);
            }
          }}
          role='dialog'
          aria-modal='true'
          aria-label='พรีวิวเอกสารต้นฉบับ'
        >
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden'>
            <div className='px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3'>
              <div className='min-w-0'>
                <p className='text-sm font-semibold text-gray-900 truncate' title={originalPreviewPopup.name}>
                  {originalPreviewPopup.name || 'เอกสารต้นฉบับ'}
                </p>
                <p className='text-xs text-gray-500'>พรีวิวต้นฉบับ</p>
              </div>
              <button
                type='button'
                onClick={() => {
                  if (originalPreviewPopup.url) URL.revokeObjectURL(originalPreviewPopup.url);
                  setOriginalPreviewPopup(null);
                }}
                className='rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                aria-label='ปิดพรีวิว'
              >
                <HiX className='text-lg' />
              </button>
            </div>
            <div className='flex-1 bg-gray-100 min-h-0'>
              {originalPreviewPopup.loading || !originalPreviewPopup.url ? (
                <div className='h-full flex items-center justify-center text-sm text-gray-600'>กำลังโหลดพรีวิว...</div>
              ) : (
                <iframe
                  title={`popup-preview-${originalPreviewPopup.name}`}
                  src={originalPreviewPopup.url}
                  className='w-full h-full border-0 bg-white'
                  sandbox='allow-same-origin'
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
