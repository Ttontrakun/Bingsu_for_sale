import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineMail, HiLockClosed, HiArrowLeft } from 'react-icons/hi';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import ntLogo from '../assets/images/NT_Logo.png';
import { authAPI, getErrorMessage } from '../services/api';

function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (email.trim() === '') {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await authAPI.forgotPassword(email);
      setIsSubmitted(true);
      
      // For development: store reset token if provided
      if (response.resetToken) {
        setResetToken(response.resetToken);
        // Show reset link instead of navigating directly
        // User can click the link to go to reset password page
      } else {
        // In production, user should check email
        // For now, show success message
      setTimeout(() => {
          navigate('/auth');
      }, 3000);
      }
    } catch (error) {
      console.error('Error requesting password reset:', error);
      const errorMessage = getErrorMessage(error);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='relative flex items-center justify-center min-h-screen bg-[#D9D9D9]'>
      {/* NT Logo at top-left corner */}
      <div className="absolute top-5 left-5 z-10 hidden md:block">
        <a href="https://ntplc.co.th/home" target="_blank" rel="noopener noreferrer">
          <img src={ntLogo} alt="NT Logo" className="max-w-[150px] max-h-[150px] object-contain hover:opacity-80 transition-opacity cursor-pointer" />
        </a>
      </div>

      <div className="relative w-full max-w-[520px] m-4">
        {/* BingSu Logo at center top above card */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <img src={bingsuLogo} alt="BingSu Logo" className="h-12 w-12 object-cover rounded-full" />
          <h2 className="text-2xl font-bold text-zinc-800">BingSu</h2>
        </div>

      <div className="relative w-full rounded-[2rem] bg-white p-10 shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
      style={{
        border: '4px solid rgba(252,186,3,0.95)',
        boxShadow: '0 0 20px rgba(252,186,3,0.3), 0 10px 30px rgba(0,0,0,0.08)'
      }}>
        <div className="flex flex-col items-center">
          {/* Lock Icon */}
          <div className="mb-6 h-16 w-16 flex items-center justify-center">
            <HiLockClosed className="text-5xl text-zinc-800" />
          </div>

          {/* Title */}
          <h2 className="mb-3 text-2xl font-bold text-zinc-800">Forgot Password?</h2>
          
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          
          {/* Description */}
          <p className="text-sm text-zinc-500 mb-8 text-center">
            {isSubmitted 
              ? 'We\'ve sent a password reset link to your email. Please check your inbox.'
              : 'No worries, we will send your reset instruction'}
          </p>

          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="w-full max-w-xs">
              <div className="mb-6 relative w-full max-w-xs">
                <label htmlFor="reset-email" className="block text-xs text-zinc-500 mb-2 text-left transition-colors duration-400">Email</label>
                <div className="relative">
                  <input
                    id="reset-email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 text-sm text-black placeholder-zinc-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition-all duration-500 hover:border-zinc-400"
                  />
                </div>
              </div>

              <div className="flex justify-center w-full max-w-xs mb-6">
                <button 
                  type="submit"
                  disabled={email.trim() === '' || isLoading}
                  className={`w-full h-10 rounded-lg bg-yellow-400 text-sm font-medium text-zinc-800 transition-all duration-500 transform shadow-md ${
                    email.trim() !== '' && !isLoading
                      ? 'hover:bg-yellow-500 hover:scale-105 active:scale-95 hover:shadow-lg cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {isLoading ? 'กำลังส่ง...' : 'Reset password'}
                </button>
              </div>

              {/* Back to log in link at bottom */}
              <button
                onClick={() => navigate('/auth')}
                className="text-sm text-zinc-800 hover:text-yellow-500 transition-all duration-400 flex items-center gap-1 mx-auto"
              >
                <HiArrowLeft className="text-base" />
                Back to log in
              </button>
            </form>
          ) : (
            <div className="w-full max-w-xs">
              <div className="text-center">
                <div className="mb-4 flex justify-center">
                  <HiOutlineMail className="text-5xl text-gray-600" />
                </div>
                <p className="text-sm text-zinc-600 mb-4">
                  We've sent a password reset link to your email. Please check your inbox.
                </p>
                
                {/* Show reset link for development */}
                {resetToken && (
                  <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
                    <p className="text-xs text-green-700 mb-2 text-center">
                      Development: คลิกลิงก์นี้เพื่อรีเซ็ตรหัสผ่าน
                    </p>
                    <a
                      href={`${window.location.origin}/reset-password?token=${resetToken}`}
                      className="text-xs text-green-600 hover:text-green-700 underline break-all block text-center"
                    >
                      {`${window.location.origin}/reset-password?token=${resetToken}`}
                    </a>
                  </div>
                )}
                
                <button
                  onClick={() => navigate('/auth')}
                  className="text-sm text-zinc-800 hover:text-yellow-500 transition-all duration-400 flex items-center gap-1 mx-auto"
                >
                  <HiArrowLeft className="text-base" />
                  Back to log in
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
