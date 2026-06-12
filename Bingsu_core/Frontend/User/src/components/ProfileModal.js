import { HiLogout } from 'react-icons/hi';
import { HiOutlineUser } from 'react-icons/hi2';

function ProfileModal({ isOpen, onClose, onManageAccount, onSignOut }) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className='fixed inset-0 bg-transparent z-40' onClick={onClose} />
      
      {/* Modal positioned above Profile */}
      <div 
        className='absolute bottom-20 left-6 bg-white rounded-lg shadow-xl w-56 z-50 border border-gray-200'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Options */}
        <div className='p-2'>
          <button
            onClick={() => {
              onManageAccount();
              onClose();
            }}
            className='w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors text-left'
          >
            <div className='w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0'>
              <HiOutlineUser className='text-gray-600 text-xl' />
            </div>
            <span className='text-gray-700 font-medium'>จัดการบัญชี</span>
          </button>

          <button
            onClick={() => {
              onSignOut();
              onClose();
            }}
            className='w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-50 transition-colors text-left'
          >
            <div className='w-10 h-10 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0'>
              <HiLogout className='text-red-600 text-xl' />
            </div>
            <span className='text-red-600 font-medium'>Sign out</span>
          </button>
        </div>
      </div>
    </>
  );
}

export default ProfileModal;
