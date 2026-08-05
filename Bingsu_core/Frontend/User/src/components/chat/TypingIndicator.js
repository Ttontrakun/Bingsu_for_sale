import { HiChatBubbleLeftRight } from 'react-icons/hi2';

// ตัวบ่งชี้ "กำลังพิมพ์" ของบอท — แสดงเฉพาะตอนรอคำตอบแต่ยังไม่มีบับเบิลบอท (ไม่ทับตอนสตรีม)
const TypingIndicator = ({ isTyping, messages, typingStage }) => {
  if (!isTyping) return null;
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.sender === 'bot') return null;
  return (
    <div className='flex gap-3 justify-start'>
      <div className='flex-shrink-0 w-8 h-8 mt-1'>
        <div className='w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center shadow-sm'>
          <HiChatBubbleLeftRight className='text-white text-sm' />
        </div>
      </div>
      <div className='flex-1'>
        <div className='inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white border border-gray-200 shadow-sm'>
          <div className='flex gap-1.5'>
            <div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '0ms' }}></div>
            <div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '150ms' }}></div>
            <div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '300ms' }}></div>
          </div>
          <span className='text-xs text-gray-500'>
            {typingStage === 0
              ? 'กำลังค้นหาข้อมูลที่เกี่ยวข้อง…'
              : typingStage === 1
                ? 'กำลังเรียบเรียงคำตอบ…'
                : 'ใกล้เสร็จแล้ว กำลังตรวจสอบความถูกต้อง…'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
