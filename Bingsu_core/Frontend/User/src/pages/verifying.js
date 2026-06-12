import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { HiOutlineMail } from 'react-icons/hi';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import ntLogo from '../assets/images/NT_Logo.png';
import { authAPI, getErrorMessage } from '../services/api';

function Verifying() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [email, setEmail] = useState('');

  const handleVerifyEmail = useCallback(async (token, userEmail) => {
    if (!token) {
      setError('กรุณาคลิกลิงก์ในอีเมลเพื่อยืนยันอีเมลของคุณ');
      return;
    }

    setError('');
    setSuccess('');

    try {
      await authAPI.verifyEmail(token);
      // Verification successful - redirect to create password with token
      navigate(`/create-password?token=${token}`, {
        state: { email: userEmail || email, verified: true }
      });
    } catch (error) {
      console.error('Error verifying email:', error);
      const errorMessage = getErrorMessage(error) || 'เกิดข้อผิดพลาดในการยืนยันอีเมล';
      setError(errorMessage);
    }
  }, [navigate, email]);

  // Get email and token from location state or search params
  useEffect(() => {
    const emailFromState = location.state?.email;
    const emailFromParams = searchParams.get('email');
    const tokenFromParams = searchParams.get('token');
    const tokenFromState = location.state?.token;
    
    if (emailFromState) {
      setEmail(emailFromState);
    } else if (emailFromParams) {
      setEmail(emailFromParams);
    }

    // If token is provided in URL (from email link), auto-verify
    if (tokenFromParams) {
      handleVerifyEmail(tokenFromParams, emailFromState || emailFromParams);
    } else if (tokenFromState) {
      // For development: show verification link if token is in state
      const userEmail = emailFromState || emailFromParams;
      const verificationLink = `${window.location.origin}/verifying?token=${tokenFromState}&email=${encodeURIComponent(userEmail || '')}`;
      setSuccess(`Development: คลิกลิงก์นี้เพื่อยืนยันอีเมล - ${verificationLink}`);
    }
  }, [location, searchParams, handleVerifyEmail]);

  const handleResendVerification = async () => {
    if (!email) {
      setError('ไม่พบอีเมล กรุณาลองใหม่อีกครั้ง');
      return;
    }

    setIsResending(true);
    setError('');
    setSuccess('');

    try {
      const response = await authAPI.resendVerification(email);
      
      // For development/testing: show verification link if token is returned
      if (response.verificationToken) {
        const verificationLink = `${window.location.origin}/verifying?token=${response.verificationToken}&email=${encodeURIComponent(email)}`;
        setSuccess(`Development: คลิกลิงก์นี้เพื่อยืนยันอีเมล - ${verificationLink}`);
      } else {
        setSuccess('ส่งอีเมลยืนยันเรียบร้อยแล้ว กรุณาตรวจสอบอีเมลของคุณ');
    }
    } catch (error) {
      console.error('Error resending verification:', error);
      const errorMessage = getErrorMessage(error) || 'เกิดข้อผิดพลาดในการส่งอีเมล';
      setError(errorMessage);
    } finally {
      setIsResending(false);
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

      {/* กลางจอ */}
      <div className="relative w-full max-w-[380px] m-4">
        {/* BingSu Logo at center top above card */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <img src={bingsuLogo} alt="BingSu Logo" className="h-12 w-12 object-cover rounded-full" />
          <h2 className="text-2xl font-bold text-zinc-800">BingSu</h2>
        </div>
        {/* Card */}
        <div className="relative w-full rounded-[2rem] bg-white p-12 shadow-[0_10px_30px_rgba(0,0,0,0.08)] min-h-[400px] flex flex-col justify-center"
          style={{
            border: '4px solid rgba(252,186,3,0.95)',
            boxShadow: '0 0 20px rgba(252,186,3,0.3), 0 10px 30px rgba(0,0,0,0.08)'
          }}>
          <div className="flex flex-col items-center">
            <div className="flex justify-center mb-6">
              <HiOutlineMail className="text-7xl text-gray-700" />
            </div>

            <h2 className="text-sm font-semibold text-gray-800 mb-3 text-center">
              Please verify your email
            </h2>

            <p className="text-xs text-gray-500 leading-relaxed mb-6 text-center">
              กรุณาตรวจสอบอีเมลของคุณ (รวมถึง spam หรือ junk folder)
              {email && (
                <span className="block mt-2 font-medium text-gray-700">
                  อีเมล: {email}
                </span>
              )}
            </p>

            {error && (
              <div className="mb-4 p-2 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs text-red-600 text-center">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
                <p className="text-xs text-green-700 text-center break-all">{success}</p>
              </div>
            )}

            {/* Resend Verification Email Button */}
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={isResending || !email}
              className={`w-40 h-9 mb-3 rounded-full bg-yellow-400 text-xs font-semibold text-black shadow-md cursor-pointer transition-all duration-200 hover:bg-yellow-500 hover:shadow-lg active:scale-95 focus:outline-none focus:ring-2 focus:ring-yellow-300 ${
                isResending || !email ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isResending ? 'กำลังส่ง...' : 'ส่งอีเมลยืนยัน'}
            </button>

            <p className="text-xs text-gray-400 mb-4 text-center">
              คลิกลิงก์ในอีเมลเพื่อยืนยันอีเมลของคุณ
            </p>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-xs text-gray-500 hover:text-yellow-500 hover:underline transition-all duration-400"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Verifying;
