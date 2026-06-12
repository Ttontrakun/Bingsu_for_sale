import { HiPencilAlt, HiTrash } from 'react-icons/hi';
import { useEffect, useState } from 'react';

function ChatMenuModal({ isOpen, onClose, onEdit, onDelete, position }) {
  const [modalStyle, setModalStyle] = useState({});

  useEffect(() => {
    if (!isOpen || !position) return;

    const modalWidth = 160; // min-w-[160px]
    const padding = 10;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let style = {
      top: `${position.top}px`,
    };

    // ตรวจสอบว่ามีพื้นที่ด้านขวาพอหรือไม่
    const spaceOnRight = position.right;
    const spaceOnLeft = windowWidth - (position.right + modalWidth);

    // ถ้าพื้นที่ด้านขวาไม่พอ หรือพื้นที่ด้านซ้ายมากกว่า ให้ใช้ left แทน
    if (spaceOnRight < modalWidth + padding || spaceOnLeft > spaceOnRight) {
      // ใช้ left แทน right
      const leftPosition = windowWidth - position.right - modalWidth;
      style.left = `${Math.max(padding, leftPosition)}px`;
      style.right = 'auto';
    } else {
      // ใช้ right ตามปกติ
      style.right = `${Math.max(padding, position.right - padding)}px`;
      style.left = 'auto';
    }

    // ตรวจสอบว่ามีพื้นที่ด้านล่างพอหรือไม่ (modal สูงประมาณ 80px)
    const modalHeight = 80;
    const spaceBelow = windowHeight - position.top;
    if (spaceBelow < modalHeight) {
      // ถ้าไม่มีพื้นที่ด้านล่าง ให้แสดงด้านบนแทน
      style.top = `${Math.max(padding, position.top - modalHeight - 4)}px`;
      style.bottom = 'auto';
    }

    setModalStyle(style);
  }, [isOpen, position]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className='fixed inset-0 z-40' 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div
        className='fixed bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 min-w-[160px] max-w-[90vw] sm:max-w-none'
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(e);
          }}
          className='w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 transition-colors'
        >
          <HiPencilAlt className='text-base' />
          <span>แก้ไขชื่อ</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(e);
          }}
          className='w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors'
        >
          <HiTrash className='text-base' />
          <span>ลบ</span>
        </button>
      </div>
    </>
  );
}

export default ChatMenuModal;
