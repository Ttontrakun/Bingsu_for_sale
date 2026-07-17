import { HiPencilAlt, HiTrash } from 'react-icons/hi';
import { BsPinAngle, BsPinAngleFill } from 'react-icons/bs';
import { useEffect, useState } from 'react';

function ChatMenuModal({ isOpen, onClose, onEdit, onDelete, onPin, isPinned = false, position }) {
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
      const leftPosition = windowWidth - position.right - modalWidth;
      style.left = `${Math.max(padding, leftPosition)}px`;
      style.right = 'auto';
    } else {
      style.right = `${Math.max(padding, position.right - padding)}px`;
      style.left = 'auto';
    }

    // ตรวจสอบว่ามีพื้นที่ด้านล่างพอหรือไม่
    const modalHeight = 120;
    const spaceBelow = windowHeight - position.top;
    if (spaceBelow < modalHeight) {
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
        {/* ปักหมุด / เลิกปักหมุด */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onPin) onPin(e);
          }}
          className='w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 transition-colors'
        >
          {isPinned ? <BsPinAngleFill className='text-base text-yellow-500' /> : <BsPinAngle className='text-base' />}
          <span>{isPinned ? 'เลิกปักหมุด' : 'ปักหมุด'}</span>
        </button>
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
        {/* pinned = ลบไม่ได้ (ต้องเลิกปักหมุดก่อน) */}
        {!isPinned && (
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
        )}
      </div>
    </>
  );
}

export default ChatMenuModal;
