import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineMail, HiLockClosed, HiOutlineUser, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';
import ntLogo from '../assets/images/NT_Logo.png';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import { api } from '../services/api';

function Login() {
  const navigate = useNavigate();
  const [isSignIn, setIsSignIn] = useState(true);

  // Form states for Sign In
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);
  
  // Form states for Sign Up
  const [signUpName, setSignUpName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState('');
  const [signUpError, setSignUpError] = useState('');
  const [signUpSuccess, setSignUpSuccess] = useState('');
  const [signUpLoading, setSignUpLoading] = useState(false);

  // Validation functions
  const isSignInValid = () => {
    return signInEmail.trim() !== '' && signInPassword.trim() !== '';
  };

  const isSignUpValid = () => {
    return signUpName.trim() !== '' && signUpEmail.trim() !== '' && signUpPassword.length >= 8 && signUpPassword === signUpConfirmPassword;
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setSignInError('');
    if (!isSignInValid()) return;
    setSignInLoading(true);
    try {
      const data = await api.login(signInEmail.trim(), signInPassword);
      const role = data.user?.role;
      const allowed = ['support', 'admin', 'admin_metrics'].includes(role);
      if (!allowed) {
        api.logout();
        setSignInError(role === 'user' ? 'บัญชีนี้เป็นผู้ใช้งานทั่วไป ไม่สามารถเข้า Support Admin ได้' : 'ไม่มีสิทธิ์เข้า Support Admin');
        return;
      }
      navigate('/dashboard');
    } catch (err) {
      setSignInError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setSignInLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setSignUpError('');
    setSignUpSuccess('');
    if (!isSignUpValid()) return;

    setSignUpLoading(true);
    try {
      await api.signup(signUpName.trim(), signUpEmail.trim(), signUpPassword);
      setSignUpSuccess('สมัครสำเร็จแล้ว กรุณาเข้าสู่ระบบ');
      setSignUpName('');
      setSignUpEmail('');
      setSignUpPassword('');
      setSignUpConfirmPassword('');
      setIsSignIn(true);
    } catch (err) {
      let msg = err?.message;
      if (msg != null && typeof msg !== 'string') msg = String(msg);
      else if (!msg) msg = String(err || '');
      // แทนที่ข้อความยาวเรื่อง Vector/docker/legacy ทุกแบบ (รวม "ดู docker compose logs legacy และ api")
      const confusing =
        /network\s*error|แปลง\s*vector|docker\s*compose|backend\s*ล้ม|บันทึก.*vector|legacy\s*และ\s*api|ถ้าเกิดตอนกดบันทึก|เชื่อมต่อเซิร์ฟเวอร์ไม่ได้|ดู\s*docker|logs\s*legacy/i.test(msg) ||
        (msg.includes('Vector') && msg.includes('backend')) ||
        msg.includes('ดู docker compose logs');
      setSignUpError(confusing
        ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบว่า backend รันอยู่ และใน .env ตั้ง REACT_APP_API_BASE_URL ให้ชี้ไปพอร์ตที่ backend รัน (เช่น 5052 หรือ 8083) แล้ว restart แอป'
        : (msg || 'ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่'));
    } finally {
      setSignUpLoading(false);
    }
  };

  return (
    <div className='relative flex items-center justify-center min-h-screen bg-[#D9D9D9]'>
      {/* Logo at top-left corner */}
      <div className="absolute top-5 left-5 z-10 hidden md:block">
        <a href="https://ntplc.co.th/home" target="_blank" rel="noopener noreferrer">
          <img src={ntLogo} alt="NT Logo" className="max-w-[150px] max-h-[150px] object-contain hover:opacity-80 transition-opacity cursor-pointer" />
        </a>
      </div>
      
      {/* Card - Centered */}
      <div className="relative w-full max-w-[520px] rounded-[2rem] bg-white p-10 shadow-[0_10px_30px_rgba(0,0,0,0.08)] m-4"
      style={{
        border: '4px solid rgba(252,186,3,0.95)',
        boxShadow: '0 0 20px rgba(252,186,3,0.3), 0 10px 30px rgba(0,0,0,0.08)'
      }}>
        <div className="flex flex-col items-center pt-8 transition-all duration-500 ease-in-out overflow-hidden">
          {/* Logo */}
          <div className="mb-6 h-20 w-20 flex items-center justify-center rounded-full bg-yellow-100 transition-all duration-500 ease-in-out hover:scale-110 hover:rotate-6 cursor-default overflow-hidden">
            <img src={bingsuLogo} alt="BingSu Logo" className="w-full h-full object-cover rounded-full" />
          </div>
          <h2 className="mb-6 text-2xl font-bold text-zinc-800 text-center transition-all duration-500 ease-in-out drop-shadow-lg" style={{ textShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(38, 0, 255, 0.06)' }}>
            <span className="block">BingSu</span>
            <span className="block">Support & Admin</span>
          </h2>

          <div className="w-full max-w-xs relative overflow-hidden" style={{ minHeight: '280px' }}>
            <div 
              className="transition-all duration-700 ease-in-out"
              style={{
                transform: isSignIn ? 'translateX(0) scale(1)' : 'translateX(-100%) scale(0.95)',
                opacity: isSignIn ? 1 : 0,
                maxHeight: isSignIn ? '500px' : '0',
                overflow: 'hidden',
                transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1), max-height 0.7s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              {/* Sign In Form */}
              <form 
                key="signin"
                className="w-full"
                onSubmit={handleSignIn}
              >
              <div className="mb-4 relative">
                <label htmlFor="login-email" className="block text-xs text-zinc-500 mb-2 transition-colors duration-400">Email</label>
                <div className="relative">
                  <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-all duration-500 group-focus-within:text-yellow-400" />
                  <input
                    id="login-email"
                    type="email"
                    placeholder="Enter your email"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-3 py-3 rounded-lg border border-zinc-300 text-sm text-black placeholder-zinc-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition-all duration-500 hover:border-zinc-400"
                  />
                </div>
              </div>

              <div className="mb-3 relative">
                <label htmlFor="login-password" className="block text-xs text-zinc-500 mb-2 transition-colors duration-400">Password</label>
                <div className="relative">
                  <HiLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-all duration-500 group-focus-within:text-yellow-400" />
                  <input
                    id="login-password"
                    type={showSignInPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    required
                    className="w-full pl-10 pr-10 py-3 rounded-lg border border-zinc-300 text-sm text-black placeholder-zinc-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition-all duration-500 hover:border-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignInPassword(!showSignInPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    {showSignInPassword ? <HiOutlineEye className="text-xl" /> : <HiOutlineEyeOff className="text-xl" />}
                  </button>
                </div>
              </div>

              {signInError && (
                <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-xs text-red-600">{signInError}</p>
                </div>
              )}

              <div className="text-right mb-4">
                <button 
                  type="button" 
                  onClick={() => navigate('/forgotpassword')}
                  className="text-xs text-zinc-500 hover:text-yellow-500 transition-all duration-400 hover:underline active:scale-95"
                >
                  Forgot password?
                </button>
              </div>

              <div className="flex justify-center">
                <button 
                  type="submit" 
                  disabled={!isSignInValid() || signInLoading}
                  className={`w-36 h-9 rounded-lg bg-yellow-400 text-sm font-medium text-white transition-all duration-500 transform shadow-md ${
                    isSignInValid() && !signInLoading
                      ? 'hover:bg-yellow-500 hover:scale-105 active:scale-95 hover:shadow-lg cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {signInLoading ? 'Signing in...' : 'Sign in'}
                </button>
              </div>
              </form>
            </div>
            <div 
              className="transition-all duration-700 ease-in-out"
              style={{
                transform: !isSignIn ? 'translateX(0) scale(1)' : 'translateX(100%) scale(0.95)',
                opacity: !isSignIn ? 1 : 0,
                maxHeight: !isSignIn ? '500px' : '0',
                overflow: 'hidden',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                width: '100%',
                transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1), max-height 0.7s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              {/* Sign Up Form */}
              <form 
                key="signup"
                className="w-full"
                onSubmit={handleSignUp}
              >
              <div className="mb-4 relative">
                <label htmlFor="signup-name" className="block text-xs text-zinc-500 mb-2 transition-colors duration-400">Full Name</label>
                <div className="relative">
                  <HiOutlineUser className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-all duration-500 group-focus-within:text-yellow-400" />
                  <input
                    id="signup-name"
                    type="text"
                    placeholder="Enter your full name"
                    value={signUpName}
                    onChange={(e) => setSignUpName(e.target.value)}
                    required
                    className="w-full pl-10 pr-3 py-3 rounded-lg border border-zinc-300 text-sm text-black placeholder-zinc-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition-all duration-500 hover:border-zinc-400"
                  />
                </div>
              </div>

              <div className="mb-4 relative">
                <label htmlFor="signup-email" className="block text-xs text-zinc-500 mb-2 transition-colors duration-400">Email</label>
                <div className="relative">
                  <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-all duration-500 group-focus-within:text-yellow-400" />
                  <input
                    id="signup-email"
                    type="email"
                    placeholder="Enter your email"
                    value={signUpEmail}
                    onChange={(e) => setSignUpEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-3 py-3 rounded-lg border border-zinc-300 text-sm text-black placeholder-zinc-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition-all duration-500 hover:border-zinc-400"
                  />
                </div>
              </div>

              <div className="mb-4 relative">
                <label htmlFor="signup-password" className="block text-xs text-zinc-500 mb-2 transition-colors duration-400">Password (อย่างน้อย 8 ตัว)</label>
                <div className="relative">
                  <HiLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    id="signup-password"
                    type="password"
                    placeholder="Enter password"
                    value={signUpPassword}
                    onChange={(e) => setSignUpPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full pl-10 pr-3 py-3 rounded-lg border border-zinc-300 text-sm text-black placeholder-zinc-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition-all duration-500 hover:border-zinc-400"
                  />
                </div>
              </div>

              <div className="mb-4 relative">
                <label htmlFor="signup-confirm-password" className="block text-xs text-zinc-500 mb-2 transition-colors duration-400">Confirm Password</label>
                <div className="relative">
                  <HiLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    id="signup-confirm-password"
                    type="password"
                    placeholder="Confirm password"
                    value={signUpConfirmPassword}
                    onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full pl-10 pr-3 py-3 rounded-lg border border-zinc-300 text-sm text-black placeholder-zinc-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition-all duration-500 hover:border-zinc-400"
                  />
                </div>
                {signUpConfirmPassword && signUpPassword !== signUpConfirmPassword && (
                  <p className="mt-1 text-xs text-red-600">รหัสผ่านไม่ตรงกัน</p>
                )}
              </div>

              {signUpSuccess && (
                <div className="mb-3 p-2 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-xs text-green-700">{signUpSuccess}</p>
                </div>
              )}
              {signUpError && (
                <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-xs text-red-600">{signUpError}</p>
                </div>
              )}

              <div className="flex justify-center mt-6">
                <button 
                  type="submit" 
                  disabled={!isSignUpValid() || signUpLoading}
                  className={`w-36 h-9 rounded-lg bg-yellow-400 text-sm font-medium text-white transition-all duration-500 transform shadow-md ${
                    isSignUpValid() && !signUpLoading
                      ? 'hover:bg-yellow-500 hover:scale-105 active:scale-95 hover:shadow-lg cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {signUpLoading ? 'Signing up...' : 'Sign up'}
                </button>
              </div>
              </form>
        </div>
        </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
