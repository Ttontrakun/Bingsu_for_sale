import { HiX, HiExclamationCircle } from 'react-icons/hi';

function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'ยืนยัน', cancelText = 'ยกเลิก', type = 'danger' }) {
  if (!isOpen) return null;

  const getButtonColors = () => {
    if (type === 'danger') {
      return 'bg-red-600 hover:bg-red-700 text-white';
    }
    return 'bg-yellow-400 hover:bg-yellow-500 text-gray-800';
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className='fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4'
        onClick={onClose}
      >
        {/* Modal */}
        <div 
          className='bg-white rounded-lg shadow-xl max-w-md w-full border border-gray-200'
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className='flex items-center justify-between p-6 border-b border-gray-200'>
            <div className='flex items-center gap-3'>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                type === 'danger' ? 'bg-red-100' : 'bg-yellow-100'
              }`}>
                <HiExclamationCircle className={`text-xl ${
                  type === 'danger' ? 'text-red-600' : 'text-yellow-600'
                }`} />
              </div>
              <h2 className='text-xl font-bold text-gray-800'>{title || 'ยืนยันการดำเนินการ'}</h2>
            </div>
            <button
              onClick={onClose}
              className='text-gray-400 hover:text-gray-600 transition-colors'
            >
              <HiX className='text-2xl' />
            </button>
          </div>

          {/* Content */}
          <div className='p-6'>
            <p className='text-gray-700 text-base leading-relaxed'>
              {message || 'คุณต้องการดำเนินการต่อหรือไม่?'}
            </p>
          </div>

          {/* Footer */}
          <div className='flex justify-end gap-3 p-6 border-t border-gray-200'>
            <button
              onClick={onClose}
              className='px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium'
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`px-6 py-2 rounded-lg font-semibold transition-colors ${getButtonColors()}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default ConfirmModal;
