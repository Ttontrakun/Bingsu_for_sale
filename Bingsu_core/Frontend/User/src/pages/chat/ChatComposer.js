import { HiArrowLeft, HiOutlinePaperAirplane, HiCheck, HiX, HiChevronDown, HiPlus } from 'react-icons/hi';
import { ENABLE_MODE_SELECTOR, parsePrivateCommand } from './chatHelpers';

export default function ChatComposer({
  showScrollDown,
  scrollToBottom,
  setShowScrollDown,
  selectedBot,
  isHelpChat,
  privateMode,
  usePrivateContent,
  setUsePrivateContent,
  navigate,
  handleSendMessage,
  privateCmdMenuOpen,
  setPrivateCmdMenuOpen,
  composerPrivateCommand,
  setComposerPrivateCommand,
  textareaRef,
  chatInput,
  setChatInput,
  adjustTextareaHeight,
  answerMode,
  modeMenuOpen,
  setModeMenuOpen,
  selectAnswerMode,
  isTyping,
  handleStopStreaming,
}) {
  return (
    <>
        {/* Chat Input - ChatGPT/Gemini style */}
        <div className='relative border-t border-gray-200 bg-white'>
          {showScrollDown && (
            <button
              type='button'
              onClick={() => { scrollToBottom('smooth'); setShowScrollDown(false); }}
              aria-label='เลื่อนลงล่างสุด'
              title='เลื่อนลงล่างสุด'
              className='absolute -top-12 left-1/2 -translate-x-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white border border-gray-300 shadow-md text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-all'
            >
              <HiArrowLeft className='text-lg -rotate-90' />
            </button>
          )}
          <div className='max-w-3xl mx-auto px-4 sm:px-6 py-4'>
            {/* Warning message if bot is inactive */}
            {selectedBot && selectedBot.enabled === false && (
              <div className='mb-4 p-3 bg-red-50 border-2 border-red-200 rounded-lg'>
                <div className='flex items-start gap-2'>
                  <span className='text-red-600 font-bold text-lg'>⚠️</span>
                  <div className='flex-1'>
                    <p className='text-red-800 text-sm font-semibold mb-1'>Bot นี้ถูก inactive แล้ว</p>
                    <p className='text-red-700 text-xs mb-2'>คุณไม่สามารถส่งข้อความได้จนกว่าจะไปเปิด Bot เป็น active ในหน้า Bots</p>
                    <button
                      onClick={() => navigate('/homepage')}
                      className='px-3 py-1.5 text-xs bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-sm hover:shadow-md transition-all'
                    >
                      ไปเปิด Bot เป็น Active
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* แจ้งเตือนเมื่อบอทยังไม่มีเอกสารความรู้ในระบบ */}
            {selectedBot && selectedBot.enabled !== false && !isHelpChat && !privateMode
              && Array.isArray(selectedBot.documentIds) && selectedBot.documentIds.length === 0 && (
              <div className='mb-4 p-3 bg-amber-50 border-2 border-amber-300 rounded-lg'>
                <div className='flex items-start gap-2'>
                  <span className='text-amber-600 text-lg'>⚠️</span>
                  <div className='flex-1'>
                    <p className='text-amber-900 text-sm font-bold mb-0.5'>ยังไม่มีเอกสารความรู้ในระบบ</p>
                    <p className='text-amber-800 text-xs'>
                      บอทนี้ยังไม่มี Knowledge ให้ใช้อ้างอิง คำตอบอาจไม่ครบถ้วนหรือไม่อ้างอิงจากเอกสาร — แนะนำให้เพิ่มเอกสารก่อนใช้งาน
                    </p>
                  </div>
                </div>
              </div>
            )}
            {privateMode && (
            <div className='mb-2'>
              <div className='flex items-center gap-2 flex-wrap'>
                <button
                  type='button'
                  role='switch'
                  aria-checked={usePrivateContent}
                  onClick={() => setUsePrivateContent((v) => !v)}
                  className='flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-gray-300 bg-white hover:border-yellow-400 transition-colors'
                  title='เปิด = ใช้หน่วยความจำส่วนตัวร่วมกับเอกสารระบบ, ปิด = ปิดเฉพาะส่วนตัว (ยังใช้เอกสารระบบ)'
                >
                  <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${usePrivateContent ? 'bg-yellow-400' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${usePrivateContent ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </span>
                  <span className='text-xs font-semibold text-gray-800'>ใช้หน่วยความจำส่วนตัว {usePrivateContent ? '(เปิด)' : '(ปิด)'}</span>
                </button>
              </div>
            </div>
            )}
            <form onSubmit={handleSendMessage} className='relative'>
              <div className={`flex items-end gap-2 bg-white border-2 rounded-2xl shadow-sm transition-colors ${
                selectedBot && selectedBot.enabled === false
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300 hover:border-yellow-400 focus-within:border-yellow-400'
              }`}>
                {privateMode && (
                  <div className='relative self-center ml-2 mb-1 flex-shrink-0'>
                    <button
                      type='button'
                      onClick={() => setPrivateCmdMenuOpen((v) => !v)}
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors ${
                        privateCmdMenuOpen || composerPrivateCommand
                          ? 'border-blue-300 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                      title='เลือกคำสั่ง /จำ หรือ /สั่ง'
                      aria-label='เลือกคำสั่งส่วนตัว'
                      aria-expanded={privateCmdMenuOpen}
                    >
                      <HiPlus className={`text-lg transition-transform ${privateCmdMenuOpen ? 'rotate-45' : ''}`} />
                    </button>
                    {privateCmdMenuOpen && (
                      <>
                        <button
                          type='button'
                          className='fixed inset-0 z-40 cursor-default'
                          aria-label='ปิดเมนู'
                          onClick={() => setPrivateCmdMenuOpen(false)}
                        />
                        <div className='absolute left-0 bottom-full mb-2 z-50 w-56 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden'>
                          <button
                            type='button'
                            onClick={() => {
                              setComposerPrivateCommand('remember');
                              setPrivateCmdMenuOpen(false);
                              requestAnimationFrame(() => textareaRef.current?.focus());
                            }}
                            className='w-full px-3 py-2.5 text-left hover:bg-blue-50 transition-colors'
                          >
                            <span className='inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700'>/จำ</span>
                            <span className='block text-[11px] text-gray-500 mt-1'>บอกข้อมูลให้ระบบจำไว้ใช้ตอบ</span>
                          </button>
                          <button
                            type='button'
                            onClick={() => {
                              setComposerPrivateCommand('instruction');
                              setPrivateCmdMenuOpen(false);
                              requestAnimationFrame(() => textareaRef.current?.focus());
                            }}
                            className='w-full px-3 py-2.5 text-left border-t border-gray-100 hover:bg-blue-50 transition-colors'
                          >
                            <span className='inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700'>/สั่ง</span>
                            <span className='block text-[11px] text-gray-500 mt-1'>บอกว่าระบบควรตอบแบบไหน เช่น ตอบสั้น เป็นข้อๆ</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {privateMode && composerPrivateCommand && (
                  <button
                    type='button'
                    onClick={() => setComposerPrivateCommand(null)}
                    className='self-center mb-1 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700'
                    title='ปิดโหมดคำสั่ง'
                  >
                    <span className='font-semibold'>{composerPrivateCommand === 'remember' ? '/จำ' : '/สั่ง'}</span>
                    <HiX className='text-xs' />
                  </button>
                )}
                <textarea
                  ref={textareaRef}
                  value={chatInput}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (privateMode && !composerPrivateCommand) {
                      const cmd = parsePrivateCommand(next);
                      if (cmd) {
                        setComposerPrivateCommand(cmd.kind);
                        setChatInput(cmd.payload || '');
                        adjustTextareaHeight();
                        return;
                      }
                    }
                    setChatInput(next);
                    adjustTextareaHeight();
                  }}
                  onKeyDown={(e) => {
                    if (privateMode && composerPrivateCommand && e.key === 'Backspace' && !chatInput) {
                      setComposerPrivateCommand(null);
                      return;
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      const hasMultipleLines = String(chatInput || '').includes('\n');
                      const explicitSend = e.ctrlKey || e.metaKey;
                      // Safety for long multi-line test text:
                      // - Enter keeps editing
                      // - Ctrl/Cmd+Enter sends
                      if (hasMultipleLines && !explicitSend) {
                        return;
                      }
                      e.preventDefault();
                      handleSendMessage(e);
                    } else {
                      adjustTextareaHeight();
                    }
                  }}
                  placeholder={
                    selectedBot && selectedBot.enabled === false
                      ? 'Bot นี้ถูก inactive แล้ว...'
                      : privateMode
                        ? (composerPrivateCommand
                          ? (composerPrivateCommand === 'remember' ? 'พิมพ์ข้อมูลที่ต้องการให้ระบบจำ...' : 'พิมพ์คำสั่งการตอบของ AI...')
                          : 'พิมพ์ข้อความ... หรือใช้ /จำ ข้อมูล และ /สั่ง คำสั่ง AI')
                        : 'พิมพ์ข้อความ...'
                  }
                  rows={1}
                  disabled={selectedBot && selectedBot.enabled === false}
                  className={`flex-1 outline-none text-[15px] placeholder-gray-400 bg-transparent resize-none overflow-x-hidden overflow-y-auto min-h-[52px] max-h-[200px] px-4 py-3.5 ${
                    selectedBot && selectedBot.enabled === false
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700'
                  }`}
                />
                
                {/* โหมดคำตอบ (Flash/Detail) — ซ่อนไว้ก่อน ใช้ Detail เป็นหลัก (เปิดคืนได้ที่ ENABLE_MODE_SELECTOR) */}
                {ENABLE_MODE_SELECTOR && (
                <div className='relative self-end mb-2 flex-shrink-0'>
                  <button
                    type='button'
                    onClick={() => setModeMenuOpen((o) => !o)}
                    className='flex items-center gap-1 px-2 py-1.5 rounded-full text-xs text-gray-600 hover:bg-gray-100 transition-colors'
                    title='เลือกโหมดคำตอบ'
                  >
                    <span>{answerMode === 'fast' ? '⚡' : '🎯'}</span>
                    <span className='font-medium'>{answerMode === 'fast' ? 'Flash' : 'Detail'}</span>
                    <HiChevronDown className={`text-sm text-gray-400 transition-transform ${modeMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {modeMenuOpen && (
                    <>
                      <div className='fixed inset-0 z-10' onClick={() => setModeMenuOpen(false)} aria-hidden='true' />
                      <div className='absolute bottom-full right-0 mb-2 w-80 max-w-[85vw] bg-white rounded-xl shadow-xl border border-gray-200 z-20 py-1'>
                        <button
                          type='button'
                          onClick={() => selectAnswerMode('fast')}
                          className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-start gap-2.5 ${answerMode === 'fast' ? 'bg-yellow-50' : ''}`}
                        >
                          <span className='text-lg leading-none mt-0.5'>⚡</span>
                          <span className='flex-1 min-w-0'>
                            <span className='block text-sm font-medium text-gray-800'>Flash · เร็ว</span>
                            <span className='block text-xs text-gray-500'>ตอบไวขึ้น เหมาะกับถาม-ตอบทั่วไป หาข้อมูลตรงๆ</span>
                          </span>
                          {answerMode === 'fast' && <HiCheck className='text-yellow-500 text-base mt-0.5 flex-shrink-0' />}
                        </button>
                        <button
                          type='button'
                          onClick={() => selectAnswerMode('detailed')}
                          className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-start gap-2.5 ${answerMode === 'detailed' ? 'bg-yellow-50' : ''}`}
                        >
                          <span className='text-lg leading-none mt-0.5'>🎯</span>
                          <span className='flex-1 min-w-0'>
                            <span className='block text-sm font-medium text-gray-800'>Detail · ละเอียด</span>
                            <span className='block text-xs text-gray-500'>วิเคราะห์ลึก เปรียบเทียบ สรุปหลายเงื่อนไข/หลายเอกสาร</span>
                          </span>
                          {answerMode === 'detailed' && <HiCheck className='text-yellow-500 text-base mt-0.5 flex-shrink-0' />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
                )}
                <div className='pr-2 pb-2 flex items-center justify-center'>
                  {isTyping ? (
                    <button
                      type='button'
                      onClick={handleStopStreaming}
                      className='rounded-lg p-2.5 transition-all flex items-center justify-center bg-red-500 text-white hover:bg-red-600 shadow-sm hover:shadow-md'
                      title='หยุดการตอบ'
                    >
                      <HiX className='text-lg' />
                    </button>
                  ) : (
                    <button
                      type='submit'
                      disabled={!chatInput.trim() || (selectedBot && selectedBot.enabled === false)}
                      className={`rounded-lg p-2.5 transition-all flex items-center justify-center ${
                        chatInput.trim() && (!selectedBot || selectedBot.enabled !== false)
                          ? 'bg-gradient-to-br from-yellow-400 to-yellow-500 text-gray-900 hover:from-yellow-500 hover:to-yellow-600 shadow-sm hover:shadow-md'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <HiOutlinePaperAirplane className='text-lg transform rotate-90' />
                    </button>
                  )}
                </div>
              </div>
            </form>
            <p className='text-xs text-gray-500 text-center mt-2'>
              Enterprise AI Chatbot อาจทำผิดพลาดได้ กรุณาตรวจสอบข้อมูลสำคัญ
            </p>
          </div>
        </div>
    </>
  );
}
