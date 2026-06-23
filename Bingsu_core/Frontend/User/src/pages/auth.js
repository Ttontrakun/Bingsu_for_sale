import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineMail, HiLockClosed, HiOutlineUser, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';
import ntLogo from '../assets/images/NT_Logo.png';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import { authAPI, userAPI, getErrorMessage } from '../services/api';

function Auth() {
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
  const [signUpAcceptedTerms, setSignUpAcceptedTerms] = useState(false);
  const [signUpError, setSignUpError] = useState('');
  const [signUpLoading, setSignUpLoading] = useState(false);

  // Function to toggle between Sign in and Sign up
  const toggleAuthMode = (mode) => {
    setIsSignIn(mode);
  };

  // Validation functions
  const isSignInValid = () => {
    return signInEmail.trim() !== '' && signInPassword.trim() !== '';
  };

  const isSignUpValid = () => {
    return signUpName.trim() !== '' && signUpEmail.trim() !== '' && signUpAcceptedTerms;
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setSignInError('');
    
    if (!isSignInValid()) {
      return;
    }

    setSignInLoading(true);
    try {
      const loginResponse = await authAPI.login(signInEmail, signInPassword);
      
      // Store only minimal user data in localStorage (id only — no PII)
      if (loginResponse.user) {
        localStorage.setItem('user', JSON.stringify({ id: loginResponse.user.id }));
      } else {
        // If user data not in response, fetch it
        try {
          const user = await userAPI.getCurrentUser();
          localStorage.setItem('user', JSON.stringify({ id: user.id }));
        } catch (fetchError) {
          console.error('Error fetching user data:', fetchError);
        }
      }
      
      // Redirect to homepage
      navigate('/homepage');
    } catch (error) {
      // Handle error with special handling for rate limiting
      let errorMessage = getErrorMessage(error) || 'Login failed. Please try again.';
      
      // Special handling for rate limiting (429) - show user-friendly message
      if (error.response?.status === 429) {
        errorMessage = getErrorMessage(error) || 
          'คุณพยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง';
      }
      
      setSignInError(errorMessage);
    } finally {
      setSignInLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setSignUpError('');
    
    if (!isSignUpValid()) {
      if (!signUpAcceptedTerms) {
        setSignUpError('กรุณายืนยันยอมรับเงื่อนไขก่อนสมัครสมาชิก');
      }
      return;
    }

    setSignUpLoading(true);
    try {
      const response = await authAPI.register(signUpEmail, signUpName, signUpAcceptedTerms);
      if (response?.onboardingState === 'approval_pending') {
        navigate('/approval');
        return;
      }

      if (response?.passwordSetupRequired && response?.passwordSetupToken) {
        navigate(`/create-password?token=${response.passwordSetupToken}`, {
          state: {
            email: signUpEmail,
            verified: true,
          },
        });
        return;
      }

      // Registration/recovery successful - redirect to verifying page
      navigate('/verifying', {
        state: {
          email: signUpEmail,
          token: response.verificationToken // Store token for development/testing
        }
      });
    } catch (error) {
      // Handle error
      const errorMessage = getErrorMessage(error) || 'Registration failed. Please try again.';
      setSignUpError(errorMessage);
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
      <div className="relative w-full max-w-[500px] rounded-[1.75rem] bg-white p-8 md:p-9 shadow-[0_10px_30px_rgba(0,0,0,0.08)] m-4"
      style={{
        border: '4px solid rgba(252,186,3,0.95)',
        boxShadow: '0 0 20px rgba(252,186,3,0.3), 0 10px 30px rgba(0,0,0,0.08)'
      }}>
        {/* Tabs */}
        <div className="absolute top-0 left-0 right-0 flex items-end bg-gray-200 rounded-tl-[28px] rounded-tr-[28px] transition-all duration-500 ease-in-out">
          <button
            onClick={() => toggleAuthMode(true)}
            className={`text-sm font-medium py-2.5 flex-1 flex items-center justify-center transition-all duration-500 ease-in-out transform ${
              isSignIn
                ? 'bg-white text-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.1)] relative z-10 rounded-tl-[48px] rounded-br-[70px] scale-100'
                : 'text-zinc-500 relative z-0 hover:text-zinc-600 hover:scale-[1.02] rounded-tl-[48px] rounded-tr-[48px] rounded-br-[16px] active:scale-[0.98]'
            }`}
          >
            Sign in
          </button>
          <button
            onClick={() => toggleAuthMode(false)}
            className={`text-sm font-medium py-2.5 flex-1 flex items-center justify-center transition-all duration-500 ease-in-out transform ${
              !isSignIn
                ? 'bg-white text-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.1)] relative z-10 rounded-bl-[70px] rounded-tr-[48px] scale-100'
                : 'text-zinc-500 relative z-0 hover:text-zinc-600 hover:scale-[1.02] rounded-tl-[48px] rounded-tr-[48px] rounded-br-[16px] active:scale-[0.98]'
            }`}
            style={{ marginLeft: '-8px' }}
          >
            Register
          </button>
        </div>

        <div className="flex flex-col items-center pt-8 transition-all duration-500 ease-in-out overflow-hidden">
          {/* Logo */}
          <div className="mb-3 h-[72px] w-[72px] flex items-center justify-center rounded-full bg-yellow-100 transition-all duration-500 ease-in-out hover:scale-110 hover:rotate-6 cursor-default overflow-hidden">
            <img src={bingsuLogo} alt="Enterprise AI Chatbot Logo" className="w-full h-full object-cover rounded-full" />
          </div>
          <h2 className="mb-5 text-2xl font-bold text-zinc-800 transition-all duration-500 ease-in-out drop-shadow-lg" style={{ textShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)' }}>Enterprise AI Chatbot</h2>

          <div className="w-full max-w-xs relative overflow-hidden" style={{ minHeight: '355px' }}>
            <div 
              className="transition-all duration-500 ease-in-out"
              style={{
                transform: isSignIn ? 'translateX(0)' : 'translateX(-100%)',
                opacity: isSignIn ? 1 : 0,
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                width: '100%',
                pointerEvents: isSignIn ? 'auto' : 'none',
                transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
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
                    className="hide-native-password-toggle w-full pl-10 pr-10 py-3 rounded-lg border border-zinc-300 text-sm text-black placeholder-zinc-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition-all duration-500 hover:border-zinc-400"
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
              className="transition-all duration-500 ease-in-out"
              style={{
                transform: !isSignIn ? 'translateX(0)' : 'translateX(100%)',
                opacity: !isSignIn ? 1 : 0,
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                width: '100%',
                pointerEvents: !isSignIn ? 'auto' : 'none',
                transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
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

              <div className="mb-4 p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={signUpAcceptedTerms}
                    onChange={(e) => setSignUpAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-yellow-500 focus:ring-yellow-400"
                  />
                  <span className="text-xs text-zinc-700 leading-relaxed">
                    ฉันยอมรับนโยบายความเป็นส่วนตัว (Privacy Policy) และเงื่อนไขการใช้งานของระบบ
                    {' '}
                    (<a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-700 hover:underline font-medium">Privacy Policy</a>)
                  </span>
                </label>
              </div>

              {signUpError && (
                <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-xs text-red-600">{signUpError}</p>
                </div>
              )}

              <div className="flex justify-center mt-4">
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

export default Auth;
