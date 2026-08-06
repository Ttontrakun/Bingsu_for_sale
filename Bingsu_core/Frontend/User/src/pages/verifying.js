import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useEffect, useState, useCallback, useRef } from 'react';
import { HiOutlineMail, HiCheck, HiX, HiArrowLeft } from 'react-icons/hi';
import NtBrandBar from '../components/NtBrandBar';
import { authAPI, getErrorMessage } from '../services/api';

function Verifying() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [email, setEmail] = useState(() => {
    const fromState = location.state?.email;
    const fromParams = new URLSearchParams(window.location.search).get('email');
    return String(fromState || fromParams || '').trim();
  });
  const verifiedTokenRef = useRef('');
  const emailTouchedRef = useRef(false);
  const [showEmailField] = useState(() => {
    const fromState = location.state?.email;
    const fromParams = new URLSearchParams(window.location.search).get('email');
    return !String(fromState || fromParams || '').trim();
  });

  const isInvalidOrExpiredTokenError = (message) => {
    const text = String(message || '').toLowerCase();
    return text.includes('invalid or expired token');
  };
  const toFriendlyError = (message) => {
    if (isInvalidOrExpiredTokenError(message)) {
      return 'ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ กรุณากดส่งลิงก์ใหม่';
    }
    return message;
  };

  const handleVerifyEmail = useCallback(async (token, userEmail) => {
    if (!token) {
      setError('กรุณาคลิกลิงก์ในอีเมลเพื่อยืนยันอีเมลของคุณ');
      return;
    }

    setError('');
    setSuccess('');

    try {
      const verifyResponse = await authAPI.verifyEmail(token);
      const passwordSetupToken = verifyResponse?.passwordSetupToken || token;
      navigate(`/create-password?token=${passwordSetupToken}`, {
        state: { email: userEmail || email, verified: true },
      });
    } catch (err) {
      console.error('Error verifying email:', err);
      setError(toFriendlyError(getErrorMessage(err) || 'เกิดข้อผิดพลาดในการยืนยันอีเมล'));
    }
  }, [navigate, email]);

  useEffect(() => {
    if (emailTouchedRef.current) return;
    const emailFromState = location.state?.email;
    const emailFromParams = searchParams.get('email');
    const next = String(emailFromState || emailFromParams || '').trim();
    if (next) setEmail(next);
  }, [location.state, searchParams]);

  // ยืนยันเฉพาะจากลิงก์ในอีเมล (token ใน URL) — ไม่ auto จาก signup state
  useEffect(() => {
    const tokenFromParams = searchParams.get('token');
    if (!tokenFromParams) return;
    if (verifiedTokenRef.current === tokenFromParams) return;
    verifiedTokenRef.current = tokenFromParams;

    const emailHint = location.state?.email || searchParams.get('email') || email;
    window.history.replaceState(window.history.state, '', window.location.pathname);
    handleVerifyEmail(tokenFromParams, emailHint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleResendVerification = async () => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      setError('ไม่พบอีเมล กรุณากรอกอีเมลด้านล่างแล้วลองอีกครั้ง');
      return;
    }

    setIsResending(true);
    setError('');
    setSuccess('');

    try {
      await authAPI.resendVerification(normalizedEmail);
      setEmail(normalizedEmail);
      setSuccess('ส่งลิงก์ยืนยันใหม่เรียบร้อยแล้ว กรุณาตรวจสอบอีเมลของคุณ');
    } catch (err) {
      console.error('Error resending verification:', err);
      setError(toFriendlyError(getErrorMessage(err) || 'เกิดข้อผิดพลาดในการส่งอีเมล'));
    } finally {
      setIsResending(false);
    }
  };

  const goToSignIn = () => navigate('/auth', { state: { mode: 'signin' } });
  const goToRegister = () => navigate('/auth', { state: { mode: 'signup', email } });

  return (
    <div className="relative flex min-h-screen flex-col bg-[#D9D9D9]">
      <NtBrandBar />

      <div className="relative flex flex-1 items-center justify-center px-4 py-8">
      <div
        className="relative w-full max-w-[500px] rounded-[1.75rem] bg-white p-8 md:p-9 shadow-[0_10px_30px_rgba(0,0,0,0.08)] m-4"
        style={{
          border: '4px solid rgba(252,186,3,0.95)',
          boxShadow: '0 0 20px rgba(252,186,3,0.3), 0 10px 30px rgba(0,0,0,0.08)',
        }}
      >
        <button
          type="button"
          onClick={goToRegister}
          className="absolute top-4 left-4 z-20 p-1.5 text-yellow-500 hover:text-yellow-600 transition-colors"
          title="กลับไปหน้าสมัครสมาชิก"
          aria-label="กลับไปหน้าสมัครสมาชิก"
        >
          <HiArrowLeft className="text-xl" />
        </button>

        <button
          type="button"
          onClick={goToSignIn}
          className="absolute top-4 right-4 z-20 p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
          title="ปิด"
          aria-label="ปิด"
        >
          <HiX className="text-xl" />
        </button>

        <div className="flex flex-col items-center text-center pt-4 px-2 md:px-6">
          <h1 className="text-2xl md:text-[1.65rem] font-bold text-zinc-800 mb-5">
            ยืนยันอีเมลของคุณ
          </h1>

          <p className="text-sm text-gray-500 leading-relaxed mb-3 max-w-sm">
            กรุณาเปิดกล่องจดหมายของคุณ แล้วคลิกลิงก์ในอีเมลเพื่อยืนยันอีเมลนี้
          </p>
          <p className="text-sm text-gray-500 leading-relaxed mb-8 max-w-sm">
            หลังยืนยันอีเมล คำขอจะเข้าคิวรอ Support Team ตรวจสอบและอนุมัติสิทธิ์ใช้งาน
          </p>

          <div className="relative mb-8">
            <HiOutlineMail className="text-[5.5rem] text-gray-400" />
            <span className="absolute -top-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 shadow-sm">
              <HiCheck className="text-lg text-white" />
            </span>
          </div>

          {error && (
            <div className="mb-4 w-full max-w-sm p-2 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 w-full max-w-sm p-3 rounded-lg bg-green-50 border border-green-200">
              <p className="text-xs text-green-700">{success}</p>
            </div>
          )}

          {showEmailField && (
            <input
              type="email"
              value={email}
              onChange={(event) => {
                emailTouchedRef.current = true;
                setEmail(event.target.value);
              }}
              placeholder="ใส่อีเมลเพื่อส่งลิงก์ใหม่"
              autoComplete="email"
              className="w-full max-w-sm mb-4 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-300 bg-white"
            />
          )}

          <p className="text-sm text-gray-500 mb-2">
            ไม่ได้รับอีเมล?{' '}
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={isResending}
              className={`font-semibold text-[#D4A017] hover:text-[#b8860b] hover:underline transition-colors ${
                isResending ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isResending ? 'กำลังส่ง...' : 'ส่งลิงก์ใหม่'}
            </button>
          </p>
          <p className="text-xs text-gray-400 mb-8">
            ลิงก์อาจใช้เวลา 1-2 นาที และอาจอยู่ใน spam
          </p>

          <div className="w-full border-t border-gray-200 mb-5" />

          <button
            type="button"
            onClick={goToSignIn}
            className="text-sm text-gray-400 hover:text-yellow-600 hover:underline transition-colors"
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
