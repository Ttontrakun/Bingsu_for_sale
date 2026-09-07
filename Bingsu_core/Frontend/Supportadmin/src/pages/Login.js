import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineMail, HiLockClosed, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';
import ntLogo from '../assets/images/nt-logo-on-yellow.png';
import NtBrandBar from '../components/NtBrandBar';
import { api } from '../services/api';
import { useAdminSystemConfig } from '../context/AdminSystemConfigContext';

function Login() {
  const navigate = useNavigate();
  const { getCopy, getTextStyle, logoSrc } = useAdminSystemConfig();
  const titleLine1 = getCopy('admin.login.titleLine1', 'Enterprise AI Chatbot');
  const titleLine2 = getCopy('admin.login.titleLine2', 'Support & Admin');
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);

  // Validation functions
  const isSignInValid = () => {
    return signInEmail.trim() !== '' && signInPassword.trim() !== '';
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setSignInError('');
    if (!isSignInValid()) return;
    setSignInLoading(true);
    try {
      const data = await api.login(signInEmail.trim(), signInPassword);
      const role = data.user?.role;
      const allowed = ['support', 'admin', 'admin_metrics', 'admin_dev'].includes(role);
      if (!allowed) {
        api.logout();
        setSignInError(role === 'user' ? 'บัญชีนี้เป็นผู้ใช้งานทั่วไป ไม่สามารถเข้า Support Admin ได้' : 'ไม่มีสิทธิ์เข้า Support Admin');
        return;
      }
      navigate(role === 'admin_dev' ? '/dev' : '/dashboard');
    } catch (err) {
      setSignInError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setSignInLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-[#D9D9D9]">
      <NtBrandBar
        logoSrc={ntLogo}
        className="relative z-30 flex h-[55px] shrink-0 items-center justify-start bg-white px-4 shadow-sm md:px-6"
        logoClassName="h-9 w-auto max-w-[240px] object-contain object-left"
      />

      <div className="relative flex flex-1 items-center justify-center px-4 py-8">
      {/* Card - Centered */}
      <div className="relative w-full max-w-[520px] rounded-[2rem] bg-white p-10 shadow-[0_10px_30px_rgba(0,0,0,0.08)] m-4"
      style={{
        border: '4px solid rgba(252,186,3,0.95)',
        boxShadow: '0 0 20px rgba(252,186,3,0.3), 0 10px 30px rgba(0,0,0,0.08)'
      }}>
        <div className="flex flex-col items-center pt-8 transition-all duration-500 ease-in-out overflow-hidden">
          {/* Logo */}
          <div className="mb-6 h-20 w-20 flex items-center justify-center rounded-full bg-yellow-100 transition-all duration-500 ease-in-out hover:scale-110 hover:rotate-6 cursor-default overflow-hidden">
            <img src={logoSrc} alt="Enterprise AI Chatbot Logo" className="w-full h-full object-cover rounded-full" />
          </div>
          <h2 className="mb-6 text-2xl font-bold text-zinc-800 text-center transition-all duration-500 ease-in-out drop-shadow-lg" style={{ textShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(38, 0, 255, 0.06)' }}>
            <span className="block" style={getTextStyle('admin.login.titleLine1')}>{titleLine1}</span>
            <span className="block" style={getTextStyle('admin.login.titleLine2')}>{titleLine2}</span>
          </h2>

          <div className="w-full max-w-xs">
              <form className="w-full" onSubmit={handleSignIn}>
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
        </div>
      </div>
      </div>
    </div>
  );
}

export default Login;
