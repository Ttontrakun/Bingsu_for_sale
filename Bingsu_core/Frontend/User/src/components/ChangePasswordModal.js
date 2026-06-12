import { useState } from 'react';
import { HiX, HiLockClosed, HiOutlineEye, HiOutlineEyeOff, HiCheck } from 'react-icons/hi';
import { credentialAPI, getErrorMessage } from '../services/api';

function ChangePasswordModal({ isOpen, onClose }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Check password requirements
  const hasUpperCase = /[A-Z]/.test(newPassword);
  const hasLowerCase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const isLengthValid = newPassword.length > 6;
  const passwordsMatch = newPassword === confirmPassword && confirmPassword !== '';

  const isPasswordValid = hasUpperCase && hasLowerCase && hasNumber && isLengthValid;

  // Requirements list
  const requirements = [
    { id: 'length', label: 'รหัสผ่านต้องมีความยาวมากกว่า 6 ตัวอักษร', isValid: isLengthValid },
    { id: 'uppercase', label: 'ตัวอักษรพิมพ์ใหญ่ (A-Z)', isValid: hasUpperCase },
    { id: 'lowercase', label: 'ตัวอักษรพิมพ์เล็ก (a-z)', isValid: hasLowerCase },
    { id: 'number', label: 'ตัวเลข (0-9)', isValid: hasNumber },
  ];

  const validateForm = () => {
    const newErrors = {};

    if (!oldPassword.trim()) {
      newErrors.oldPassword = 'กรุณากรอกรหัสผ่านเก่า';
    }

    if (!newPassword.trim()) {
      newErrors.newPassword = 'กรุณากรอกรหัสผ่านใหม่';
    } else if (!isPasswordValid) {
      newErrors.newPassword = 'รหัสผ่านไม่ตรงตามข้อกำหนดทั้งหมด';
    }

    if (!confirmPassword.trim()) {
      newErrors.confirmPassword = 'กรุณายืนยันรหัสผ่านใหม่';
    } else if (!passwordsMatch) {
      newErrors.confirmPassword = 'รหัสผ่านไม่ตรงกัน';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Clear previous messages
    setSuccessMessage('');
    setErrorMessage('');
    
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Call API to change password
      await credentialAPI.changePassword(oldPassword, newPassword);
      
      // Success
      setSuccessMessage('รหัสผ่านถูกเปลี่ยนเรียบร้อยแล้ว');
      
      // Reset form after 1 second
      setTimeout(() => {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrors({});
        setSuccessMessage('');
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error changing password:', error);
      const errorMsg = getErrorMessage(error);
      setErrorMessage(errorMsg);
      
      // Set specific field errors if available
      if (errorMsg.includes('Current password is incorrect') || errorMsg.includes('รหัสผ่านเก่าไม่ถูกต้อง')) {
        setErrors({ oldPassword: 'รหัสผ่านเก่าไม่ถูกต้อง' });
      } else if (errorMsg.includes('New password must be different')) {
        setErrors({ newPassword: 'รหัสผ่านใหม่ต้องแตกต่างจากรหัสผ่านเก่า' });
      } else {
        setErrors({ general: errorMsg });
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4' onClick={onClose}>
      <div 
        className='bg-white rounded-lg shadow-xl max-w-md w-full'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className='flex items-center justify-between p-6 border-b border-gray-200'>
          <h2 className='text-2xl font-bold text-gray-800'>เปลี่ยนรหัสผ่าน</h2>
          <button
            onClick={onClose}
            className='text-gray-400 hover:text-gray-600 transition-colors'
          >
            <HiX className='text-2xl' />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className='p-6'>
          {/* Success Message */}
          {successMessage && (
            <div className='mb-4 p-3 bg-green-50 border border-green-200 rounded-lg'>
              <p className='text-green-700 text-sm'>{successMessage}</p>
            </div>
          )}
          
          {/* Error Message */}
          {errorMessage && (
            <div className='mb-4 p-3 bg-red-50 border border-red-200 rounded-lg'>
              <p className='text-red-700 text-sm'>{errorMessage}</p>
            </div>
          )}
          
          {/* Old Password */}
          <div className='mb-6'>
            <label htmlFor='old-password' className='block text-sm font-medium text-gray-700 mb-2'>
              รหัสผ่านเก่า
            </label>
            <div className='relative'>
              <HiLockClosed className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400' />
              <input
                id='old-password'
                type={showOldPassword ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder='กรุณากรอกรหัสผ่านเก่า'
                className={`w-full pl-10 pr-10 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400 ${
                  errors.oldPassword ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              <button
                type='button'
                onClick={() => setShowOldPassword(!showOldPassword)}
                className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors'
              >
                {showOldPassword ? <HiOutlineEye className='text-xl' /> : <HiOutlineEyeOff className='text-xl' />}
              </button>
            </div>
            {errors.oldPassword && (
              <p className='text-red-500 text-xs mt-1'>{errors.oldPassword}</p>
            )}
          </div>

          {/* New Password */}
          <div className='mb-6'>
            <label htmlFor='new-password' className='block text-sm font-medium text-gray-700 mb-2'>
              รหัสผ่านใหม่
            </label>
            <div className='relative'>
              <HiLockClosed className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400' />
              <input
                id='new-password'
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder='กรุณากรอกรหัสผ่านใหม่'
                className={`w-full pl-10 pr-10 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400 ${
                  errors.newPassword ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              <button
                type='button'
                onClick={() => setShowNewPassword(!showNewPassword)}
                className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors'
              >
                {showNewPassword ? <HiOutlineEye className='text-xl' /> : <HiOutlineEyeOff className='text-xl' />}
              </button>
            </div>
            
            {/* Password Requirements */}
            <div className='mt-3 mb-2'>
              <p className='font-semibold mb-2 text-xs text-gray-700'>ข้อกำหนดรหัสผ่าน</p>
              <ul className='space-y-1.5'>
                {requirements.map((requirement) => (
                  <li
                    key={requirement.id}
                    className={`flex items-center gap-2 text-xs transition-colors ${
                      newPassword && requirement.isValid
                        ? 'text-green-600'
                        : newPassword
                        ? 'text-red-500'
                        : 'text-gray-500'
                    }`}
                  >
                    {newPassword ? (
                      requirement.isValid ? (
                        <HiCheck className='text-green-600 text-base flex-shrink-0' />
                      ) : (
                        <HiX className='text-red-500 text-base flex-shrink-0' />
                      )
                    ) : (
                      <div className='w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0'></div>
                    )}
                    <span>{requirement.label}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            {errors.newPassword && (
              <p className='text-red-500 text-xs mt-1'>{errors.newPassword}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div className='mb-6'>
            <label htmlFor='confirm-password' className='block text-sm font-medium text-gray-700 mb-2'>
              ยืนยันรหัสผ่านใหม่
            </label>
            <div className='relative'>
              <HiLockClosed className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400' />
              <input
                id='confirm-password'
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder='กรุณายืนยันรหัสผ่านใหม่'
                className={`w-full pl-10 pr-10 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400 ${
                  errors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              <button
                type='button'
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors'
              >
                {showConfirmPassword ? <HiOutlineEye className='text-xl' /> : <HiOutlineEyeOff className='text-xl' />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className='text-red-500 text-xs mt-1'>{errors.confirmPassword}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className='flex justify-end gap-4 pt-4 border-t border-gray-200'>
            <button
              type='button'
              onClick={onClose}
              className='px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors'
            >
              ยกเลิก
            </button>
            <button
              type='submit'
              disabled={isLoading}
              className='px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {isLoading ? 'กำลังเปลี่ยนรหัสผ่าน...' : 'เปลี่ยนรหัสผ่าน'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChangePasswordModal;
