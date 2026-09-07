import {
  HiOutlinePaperAirplane,
  HiClipboardCopy,
  HiCheck,
  HiPencil,
  HiThumbUp,
  HiThumbDown,
  HiRefresh,
} from 'react-icons/hi';
import bingsuLogo from '../../assets/images/หน่องบิงไม่มีพื้นละ.png';
import BotMarkdown from '../../components/chat/BotMarkdown';
import TypingIndicator from '../../components/chat/TypingIndicator';
import ReferenceChips from '../../components/chat/ReferenceChips';
import { normalizeMarkdownTable } from '../../utils/normalizeMarkdownTable';
import {
  getUserAvatarSrc,
  ENABLE_MESSAGE_EDIT_BUTTON,
  ENABLE_SOURCE_REFERENCES,
  resolveBotDescription,
  isPrivateCommandSuggestion,
  mergePrivateOrderStarters,
  BOT_FULL_WIDTH,
  SHORT_BOT_BUBBLE_CHAR_LIMIT,
  formatTime,
  formatDetailedTime,
} from './chatHelpers';

export default function ChatMessageList({
  messagesContainerRef,
  messagesEndRef,
  messages,
  selectedBot,
  messagesLoading,
  messagesError,
  onRetryLoadMessages,
  isTyping,
  typingStage,
  streamTextRef,
  streamBotIdRef,
  userAvatarUrl,
  isSelectingText,
  setIsSelectingText,
  hoveredMessageId,
  setHoveredMessageId,
  tooltipPosition,
  setTooltipPosition,
  editingUserMsgId,
  editingUserText,
  setEditingUserText,
  handleResendEditedUserMessage,
  handleCancelUserEdit,
  handleStartEdit,
  handleFeedback,
  handleRegenerate,
  handleStartUserEdit,
  handleCopyMessage,
  feedbackByMessageId,
  copiedMessageId,
  isHelpChat,
  getPreviousUserQuestion,
  getSuggestedFollowUps,
  aiFollowUps,
  followUpsLoading,
  followUpsReady,
  privateMode,
  hasPrivateInstructions,
  handleSendMessage,
  handleSuggestedFollowUpClick,
  handleEditFollowUp,
  openSourceReference,
}) {
  return (
    <>
        {/* Messages Area - Centered like ChatGPT/Gemini */}
        <div ref={messagesContainerRef} className='relative flex-1 overflow-y-auto bg-[#f7f7f8]'>
          <div className='max-w-3xl mx-auto px-4 sm:px-6 py-6'>
            {messages.length === 0 && messagesError ? (
              // ดึงข้อความไม่ได้ — บอกให้ชัด ไม่ปล่อยให้เข้าใจผิดว่าแชทว่าง
              <div className='flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-4'>
                <div className='mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 ring-1 ring-red-200'>
                  <HiRefresh className='text-2xl text-red-500' aria-hidden />
                </div>
                <h2 className='text-lg font-semibold text-gray-800 mb-1'>แสดงข้อความไม่ได้</h2>
                <p className='text-sm text-gray-600 max-w-md mb-5'>{messagesError}</p>
                <button
                  type='button'
                  onClick={onRetryLoadMessages}
                  className='inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-yellow-500 transition-colors'
                >
                  <HiRefresh className='text-base' aria-hidden />
                  ลองใหม่อีกครั้ง
                </button>
              </div>
            ) : messages.length === 0 && messagesLoading ? (
              // กำลังดึงข้อความ — ห้ามโชว์หน้าต้อนรับ ไม่งั้นดูเหมือนแชทว่าง
              <div className='space-y-8 min-h-[60vh]'>
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`animate-pulse rounded-2xl bg-gray-200/70 ${
                        i % 2 === 0 ? 'h-12 w-2/5' : 'h-24 w-3/5'
                      }`}
                    />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              // Empty state — ใช้ชื่อและคำอธิบายบอทที่ตั้งในฟอร์ม (สร้าง/แก้ไขบอท)
              <div className='flex flex-col items-center justify-center h-full min-h-[60vh]'>
                <div className='mb-6'>
                  <img src={bingsuLogo} alt="Enterprise AI Chatbot" className='w-20 h-20 rounded-full object-cover shadow-lg' />
                </div>
                <h2 className='text-2xl font-bold text-gray-800 mb-2'>
                  Welcome to {selectedBot?.name || 'Enterprise AI Chatbot Chat'}
                </h2>
                <p className='text-gray-500 text-sm text-center mb-8 max-w-2xl'>
                  {resolveBotDescription(selectedBot?.description)}
                </p>
              </div>
            ) : (
              <div className='space-y-8'>
                {messages.map((message, index) => {
                  const showTimestamp = index === 0 || 
                    new Date(message.timestamp) - new Date(messages[index - 1].timestamp) > 300000;
                  
                  const isUser = message.sender === 'user';
                  const botFullWidth = BOT_FULL_WIDTH && !isUser;
                  // บอทกำลังคิด (ยังไม่มีข้อความ) — โชว์แค่จุด ไม่ต้องมีกล่องบับเบิลเปล่า
                  const isBotThinking = message.sender === 'bot' && isTyping && index === messages.length - 1 && !(streamTextRef.current || message.text);
                  const plainBotText = !isUser
                    ? String(message.text || '')
                        .replace(/<br\s*\/?>/gi, '\n')
                        .trim()
                    : '';
                  const isShortBotReply =
                    botFullWidth &&
                    !isBotThinking &&
                    !!plainBotText &&
                    plainBotText.length <= SHORT_BOT_BUBBLE_CHAR_LIMIT &&
                    !plainBotText.includes('\n');
                  const bubbleClass = isBotThinking
                    ? 'block w-full bg-transparent px-2 py-1 relative group/timestamp'
                    : botFullWidth
                      ? `${isShortBotReply ? 'inline-block w-auto max-w-full' : 'block w-full'} bg-white text-gray-900 border border-gray-200 shadow-sm rounded-2xl rounded-tl-md px-4 py-2.5 relative group/timestamp`
                      : `inline-block max-w-full px-4 py-2.5 rounded-2xl relative group/timestamp ${isUser ? 'bg-gradient-to-r from-yellow-400 to-amber-400 text-gray-900 border border-amber-500/40 shadow-sm rounded-tr-md' : 'bg-white text-gray-900 border border-gray-200 shadow-sm rounded-tl-md'}`;

                  return (
                    <div key={message.id} className='group'>
                      {showTimestamp && (
                        <div className='flex justify-center my-4'>
                          <span className='text-xs text-gray-400 bg-white px-3 py-1.5 rounded-full shadow-sm'>
                            {formatTime(message.timestamp)}
                          </span>
                        </div>
                      )}
                      
                      <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                        {/* Avatar — โหมดเต็มความกว้าง: จอใหญ่ดัน avatar ไปช่องว่างซ้าย (lg:-ml-11) ให้บับเบิลกว้างเต็มตรงช่องพิมพ์; จอเล็กซ่อน avatar กันโดนขอบจอตัด (บับเบิลก็ยังเต็มความกว้าง) */}
                        <div className={`flex-shrink-0 w-8 h-8 mt-1 ${botFullWidth ? 'hidden lg:block lg:-ml-11' : ''}`}>
                          {isUser ? (
                            <img
                              src={getUserAvatarSrc(userAvatarUrl)}
                              alt="คุณ"
                              className="w-8 h-8 rounded-full object-cover shadow-sm ring-1 ring-gray-200"
                            />
                          ) : (
                            <img
                              src={bingsuLogo}
                              alt="บอท"
                              className="w-8 h-8 rounded-full object-cover shadow-sm ring-1 ring-gray-200"
                            />
                          )}
                        </div>
                        
                        {/* Message Content — min-w-0 ให้ flex อนุญาตให้หดตาม max-w-[80%] ได้ */}
                        <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : 'flex justify-start'}`}>
                          <div className={`${botFullWidth ? (isShortBotReply ? 'max-w-full pr-11' : 'w-full pr-11') : 'max-w-[80%]'} min-w-0 text-left relative group/message`}>
                            <div
                              className={bubbleClass}
                              style={{
                                maxWidth: '100%',
                                overflowWrap: 'anywhere',
                                wordBreak: 'normal',
                              }}
                              onMouseMove={(e) => {
                                // ปิด hover tracking สำหรับข้อความบอท เพื่อลด rerender ระหว่างลากเลือกข้อความ
                                if (message.sender === 'bot' || isSelectingText) return;
                                if (hoveredMessageId !== message.id) {
                                  setHoveredMessageId(message.id);
                                }
                                const rect = e.currentTarget.getBoundingClientRect();
                                const mouseY = e.clientY - rect.top;
                                setTooltipPosition(prev => ({
                                  ...prev,
                                  [message.id]: mouseY
                                }));
                              }}
                              onMouseLeave={() => {
                                if (message.sender === 'bot' || isSelectingText) return;
                                setHoveredMessageId(null);
                                setTooltipPosition(prev => {
                                  const newPos = { ...prev };
                                  delete newPos[message.id];
                                  return newPos;
                                });
                              }}
                              onMouseDown={(e) => {
                                if (e.button === 0 && isSelectingText) {
                                  // คลิกใหม่ขณะมี selection เดิม ให้ปลดโหมด selection ได้ทันที
                                  setIsSelectingText(false);
                                }
                              }}
                            >
                              {(
                                <>
                                  <div
                                    className='text-[15px] leading-relaxed break-words chat-message-content max-w-full min-w-0 select-text cursor-text'
                                    style={{
                                      // ใช้ anywhere เพื่อกันข้อความยาวมากล้นกรอบ แต่ไม่ "หั่นทุกตัวอักษร" แบบ break-all
                                      overflowWrap: 'anywhere',
                                      wordBreak: 'normal',
                                      maxWidth: '100%',
                                    }}
                                  >
                                    {(() => {
                                      if (isUser && editingUserMsgId === message.id) {
                                        return (
                                          <div className='min-w-[240px] sm:min-w-[320px]'>
                                            <textarea
                                              autoFocus
                                              value={editingUserText}
                                              onChange={(e) => setEditingUserText(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                  e.preventDefault();
                                                  handleResendEditedUserMessage();
                                                } else if (e.key === 'Escape') {
                                                  handleCancelUserEdit();
                                                }
                                              }}
                                              rows={2}
                                              className='w-full resize-none rounded-lg bg-white/85 text-gray-900 text-[15px] leading-relaxed px-3 py-2 outline-none border border-amber-500/50 focus:border-amber-600'
                                            />
                                            <div className='flex justify-end gap-2 mt-2'>
                                              <button type='button' onClick={handleCancelUserEdit} className='px-3 py-1 text-sm rounded-full bg-white/70 text-gray-800 hover:bg-white transition-colors'>ยกเลิก</button>
                                              <button type='button' onClick={handleResendEditedUserMessage} disabled={!editingUserText.trim()} className='px-3 py-1 text-sm rounded-full bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors'>ส่ง</button>
                                            </div>
                                          </div>
                                        );
                                      }
                                      const isStreamingThis = message.sender === 'bot' && message.id === streamBotIdRef.current;
                                      const displayText = isStreamingThis ? (streamTextRef.current || message.text) : message.text;
                                      const showDots = message.sender === 'bot' && !displayText && isTyping && index === messages.length - 1;
                                      if (showDots) {
                                        return (
                                          <span className='inline-flex items-center gap-1.5 text-gray-500' aria-label='กำลังคิด'>
                                            <span className='w-3 h-3 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '0ms' }} />
                                            <span className='w-3 h-3 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '150ms' }} />
                                            <span className='w-3 h-3 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '300ms' }} />
                                          </span>
                                        );
                                      }
                                      if (message.sender === 'bot' && displayText) {
                                        // normalize ตารางก่อน (กู้ <br> ในเซลล์) แล้วค่อยแปลง <br> ที่เหลือเป็นขึ้นบรรทัดใหม่
                                        const textNormalized = normalizeMarkdownTable(displayText)
                                          .replace(/<br\s*\/?>/gi, '\n');
                                        return (
                                          <BotMarkdown
                                            text={textNormalized}
                                            citationCount={Array.isArray(message.references) ? message.references.length : 0}
                                            references={Array.isArray(message.references) ? message.references : null}
                                          />
                                        );
                                      }
                                      return (
                                        <span
                                          className='whitespace-pre-wrap break-words'
                                          style={{ overflowWrap: 'anywhere', wordBreak: 'normal' }}
                                        >
                                          {displayText || ''}
                                        </span>
                                      );
                                    })()}
                                  </div>
                              {/* Timestamp Tooltip - แสดงเมื่อ hover ติดตาม cursor */}
                              {!isSelectingText && message.sender !== 'bot' && hoveredMessageId === message.id && tooltipPosition[message.id] !== undefined && (
                                <div className={`absolute ${
                                  isUser ? 'right-full mr-2' : 'left-full ml-2'
                                } opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap`}
                                style={{ 
                                  top: `${tooltipPosition[message.id]}px`, 
                                  transform: 'translateY(-50%)' 
                                }}
                                >
                                  <div className="bg-gray-900 text-white text-xs rounded-lg px-2 py-1.5 shadow-lg relative">
                                    {formatDetailedTime(message.timestamp)}
                                    <div className={`absolute ${
                                      isUser ? 'right-0' : 'left-0'
                                    } top-1/2 -translate-y-1/2 ${
                                      isUser ? '-mr-1' : '-ml-1'
                                    } w-0 h-0 border-t-4 border-b-4 ${
                                      isUser ? 'border-r-4 border-r-gray-900 border-l-0' : 'border-l-4 border-l-gray-900 border-r-0'
                                    } border-transparent`}></div>
                                  </div>
                                </div>
                              )}
                                </>
                              )}
                            </div>

                            {/* แหล่งอ้างอิง — การ์ดเอกสารใต้คำตอบ */}
                            {ENABLE_SOURCE_REFERENCES && !isUser && message.sender === 'bot' && (
                              <ReferenceChips
                                references={message.references}
                                onOpenReference={(ref) => openSourceReference(message, ref)}
                              />
                            )}
                            
                            {/* Copy, แก้ไข, โหวต (บอท) + แนะนำคำถามถัดไป */}
                            <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} items-center gap-1 mt-1 flex-wrap`}>
                              {message.sender === 'bot' && !String(message.id).startsWith('temp-') && (
                                <>
                                  {ENABLE_MESSAGE_EDIT_BUTTON && (
                                    <button
                                      type='button'
                                      onClick={(e) => { e.stopPropagation(); handleStartEdit(message); }}
                                      className='opacity-70 hover:opacity-100 text-gray-600 hover:text-gray-900 rounded p-1.5 hover:bg-gray-100'
                                      title='แก้ไขข้อความ'
                                    >
                                      <HiPencil className='text-base' />
                                    </button>
                                  )}
                                  <button
                                    type='button'
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await handleFeedback(message, 'up');
                                    }}
                                    className={`rounded p-1.5 hover:bg-gray-100 ${(feedbackByMessageId[message.id] || message.feedback) === 'up' ? 'text-green-600' : 'opacity-70 hover:opacity-100 text-gray-500 hover:text-gray-700'}`}
                                    title='มีประโยชน์'
                                  >
                                    <HiThumbUp className='text-base' />
                                  </button>
                                  <button
                                    type='button'
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await handleFeedback(message, 'down');
                                    }}
                                    className={`rounded p-1.5 hover:bg-gray-100 ${(feedbackByMessageId[message.id] || message.feedback) === 'down' ? 'text-red-600' : 'opacity-70 hover:opacity-100 text-gray-500 hover:text-gray-700'}`}
                                    title='ไม่มีประโยชน์'
                                  >
                                    <HiThumbDown className='text-base' />
                                  </button>
                                  <button
                                    type='button'
                                    onClick={(e) => { e.stopPropagation(); handleRegenerate(message); }}
                                    disabled={isTyping}
                                    className='rounded p-1.5 hover:bg-gray-100 opacity-70 hover:opacity-100 text-gray-500 hover:text-gray-700 disabled:opacity-40'
                                    title='ทำซ้ำ (สร้างคำตอบใหม่)'
                                  >
                                    <HiRefresh className='text-base' />
                                  </button>
                                </>
                              )}
                              {isUser && !String(message.id).startsWith('temp-') && editingUserMsgId !== message.id && (
                                <button
                                  type='button'
                                  onClick={(e) => { e.stopPropagation(); handleStartUserEdit(message); }}
                                  disabled={isTyping}
                                  className='opacity-70 hover:opacity-100 transition-all duration-150 text-yellow-800 hover:text-yellow-900 rounded p-1.5 hover:bg-gray-100 disabled:opacity-40'
                                  title='แก้ไขและส่งใหม่'
                                >
                                  <HiPencil className='text-base' />
                                </button>
                              )}
                              <div className="relative group/copy inline-block">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyMessage(message.text, message.id);
                                  }}
                                  className={`opacity-70 hover:opacity-100 transition-all duration-150 border border-transparent ${
                                    isUser
                                      ? 'text-yellow-800 hover:text-yellow-900'
                                      : 'text-gray-700 hover:text-gray-900'
                                  } rounded p-1.5 hover:bg-gray-100 hover:border-gray-300 flex items-center gap-1`}
                                >
                                  {copiedMessageId === message.id ? (
                                    <HiCheck className='text-base' />
                                  ) : (
                                    <HiClipboardCopy className='text-base' />
                                  )}
                                </button>
                                
                                {/* Tooltip - ใช้ absolute positioning และ pointer-events-none เพื่อไม่กระทบ layout */}
                                <div className={`absolute ${
                                  isUser ? 'right-0' : 'left-0'
                                } top-full mt-2 opacity-0 group-hover/copy:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-nowrap`}>
                                  <div className="bg-gray-900 text-white text-xs rounded-lg px-2 py-1.5 shadow-lg relative">
                                    {copiedMessageId === message.id ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}
                                    <div className={`absolute ${
                                      isUser ? 'right-2' : 'left-2'
                                    } bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900`}></div>
                                  </div>
                                </div>
                              </div>
                              {/* แนะนำคำถามถัดไป — แสดงใต้ข้อความบอทล่าสุดเท่านั้น */}
                              {!isHelpChat && message.sender === 'bot' && (() => {
                                let lastBotIdx = -1;
                                for (let i = messages.length - 1; i >= 0; i--) if (messages[i].sender === 'bot') { lastBotIdx = i; break; }
                                const isLastBot = index === lastBotIdx && !(isTyping && index === messages.length - 1);
                                if (!isLastBot) return null;
                                const previousQuestion = getPreviousUserQuestion(index);
                                const storedSuggestions = Array.isArray(message.suggestions)
                                  ? message.suggestions.filter(Boolean)
                                  : [];
                                const resolved = storedSuggestions.length > 0
                                  ? storedSuggestions
                                  : (aiFollowUps.length > 0 ? aiFollowUps : null);
                                // รอ AI เสร็จก่อน — ไม่โชว์ปุ่มกลางๆ แล้วสลับคำ (กระพริบ)
                                if (!resolved && (followUpsLoading || !followUpsReady)) {
                                  return (
                                    <div className='flex flex-col items-start gap-1.5 mt-2' aria-hidden>
                                      {[0, 1].map((i) => (
                                        <div
                                          key={`fu-skel-${i}`}
                                          className='h-8 rounded-full bg-gray-100 animate-pulse'
                                          style={{ width: i === 0 ? 168 : 132 }}
                                        />
                                      ))}
                                    </div>
                                  );
                                }
                                const suggestions = mergePrivateOrderStarters(
                                  resolved || getSuggestedFollowUps(message.text, previousQuestion),
                                  { privateMode, hasInstructions: hasPrivateInstructions },
                                );
                                if (!suggestions.length) return null;
                                const usingAiFollowUps = Boolean(resolved);
                                const suggestDisabled = isTyping || (selectedBot && selectedBot.enabled === false);
                                return (
                                  <div className='flex flex-col items-start gap-1.5 mt-2'>
                                    {suggestions.map((q) => (
                                      <div key={q} className='group flex items-center gap-1 max-w-full'>
                                        <button
                                          type='button'
                                          onClick={() => {
                                            if (isPrivateCommandSuggestion(q) || usingAiFollowUps) {
                                              handleSendMessage({ preventDefault: () => {} }, q);
                                            } else {
                                              handleSuggestedFollowUpClick(q, message, index);
                                            }
                                          }}
                                          disabled={suggestDisabled}
                                          title={isPrivateCommandSuggestion(q) ? 'บันทึกคำสั่งนี้' : 'ส่งคำถามนี้'}
                                          className={`inline-flex items-center gap-2 max-w-full rounded-full border px-3 py-1.5 text-xs shadow-sm transition-colors disabled:opacity-50 text-left ${
                                            isPrivateCommandSuggestion(q)
                                              ? 'border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-300 hover:bg-blue-100 font-medium'
                                              : 'border-gray-200 bg-white text-gray-700 hover:border-amber-300 hover:bg-amber-50/70'
                                          }`}
                                        >
                                          <span className='truncate'>{q}</span>
                                          <HiOutlinePaperAirplane className={`rotate-90 text-sm flex-shrink-0 ${isPrivateCommandSuggestion(q) ? 'text-blue-400' : 'text-gray-400'}`} />
                                        </button>
                                        {usingAiFollowUps && (
                                          <button
                                            type='button'
                                            onClick={() => handleEditFollowUp(q)}
                                            disabled={suggestDisabled}
                                            title='แก้ไขก่อนส่ง'
                                            className='p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex-shrink-0 disabled:opacity-0'
                                          >
                                            <HiPencil className='text-sm' />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Typing Indicator — แยกเป็น component TypingIndicator */}
                <TypingIndicator isTyping={isTyping} messages={messages} typingStage={typingStage} />
                
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>
    </>
  );
}
