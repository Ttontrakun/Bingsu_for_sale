import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { HiOutlineMail, HiLockClosed, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';
import ntLogo from '../assets/images/nt-logo-on-yellow.png';
import mascot from '../assets/images/bingsu-mascot.png';
import NtBrandBar from '../components/NtBrandBar';
import { api } from '../services/api';
import { useAdminSystemConfig } from '../context/AdminSystemConfigContext';

function Platform({ forceSignIn = false } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { appName, getCopy, getTextStyle, logoSrc } = useAdminSystemConfig();
  const [authedPath, setAuthedPath] = useState(null);
  const [showSignIn, setShowSignIn] = useState(
    forceSignIn || searchParams.get('signin') === '1',
  );

  const titleLine1 = getCopy('admin.login.titleLine1', 'Enterprise AI Chatbot');
  const titleLine2 = getCopy('admin.login.titleLine2', 'Support & Admin');

  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await Promise.race([
          api.getMe(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
        ]);
        const user = me?.user ?? me;
        const role = user?.role;
        if (!cancelled && user?.id && ['support', 'admin', 'admin_metrics', 'admin_dev'].includes(role)) {
          setAuthedPath(role === 'admin_dev' ? '/dev' : '/dashboard');
        }
      } catch {
        /* guest */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (forceSignIn || searchParams.get('signin') === '1') {
      setShowSignIn(true);
    }
  }, [forceSignIn, searchParams]);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setSignInError('');
    if (!signInEmail.trim() || !signInPassword.trim()) return;
    setSignInLoading(true);
    try {
      const data = await api.login(signInEmail.trim(), signInPassword);
      const role = data.user?.role;
      const allowed = ['support', 'admin', 'admin_metrics', 'admin_dev'].includes(role);
      if (!allowed) {
        try { api.logout(); } catch (_) {}
        setSignInError(role === 'user' ? 'บัญชีนี้เป็นผู้ใช้งานทั่วไป ไม่สามารถเข้า Support Admin ได้' : 'ไม่มีสิทธิ์เข้า Support Admin');
        return;
      }
      navigate(role === 'admin_dev' ? '/dev' : '/dashboard', { replace: true });
    } catch (err) {
      setSignInError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setSignInLoading(false);
    }
  };

  if (authedPath) {
    return <Navigate to={authedPath} replace />;
  }

  const brand = appName || 'Enterprise AI Chatbot';

  return (
    <div className="platform-page relative flex min-h-screen flex-col overflow-hidden bg-[#D9D9D9]">
      <NtBrandBar
        logoSrc={ntLogo}
        className="relative z-20 flex h-[55px] shrink-0 items-center justify-start bg-white px-4 shadow-sm md:px-6"
        logoClassName="h-9 w-auto max-w-[240px] object-contain object-left"
      />

      <main className="relative flex min-h-0 flex-1 flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 78% 42%, rgba(255,209,0,0.55) 0%, rgba(252,186,3,0.22) 38%, transparent 70%), linear-gradient(165deg, #E8E8E8 0%, #D9D9D9 45%, #CFCFCF 100%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(-18deg, #3f3f46 0 1px, transparent 1px 14px)',
          }}
        />

        <div className="pointer-events-none absolute bottom-0 right-0 z-[1] flex w-[55%] max-w-[420px] items-end justify-end md:w-[50%] md:max-w-none lg:w-[48%]">
          <img
            src={mascot}
            alt=""
            className="platform-mascot-float h-[42vh] w-auto max-w-full object-contain object-bottom select-none md:h-[min(88vh,760px)]"
            draggable={false}
          />
        </div>

        <div className="relative z-10 flex flex-1 flex-col justify-center px-6 py-10 md:px-12 lg:px-16">
          {!showSignIn ? (
            <div className="platform-hero-copy max-w-xl">
              <p className="platform-font-brand mb-3 text-[clamp(2.4rem,6vw,4.25rem)] font-semibold leading-[1.05] tracking-tight text-zinc-900">
                {brand}
              </p>
              <h1 className="platform-font-display mb-4 text-[clamp(1.35rem,2.8vw,2rem)] font-medium leading-snug text-zinc-800">
                Support & Admin
              </h1>
              <p className="platform-font-body mb-8 max-w-md text-base leading-relaxed text-zinc-600 md:text-lg">
                จัดการบอท ความรู้ ผู้ใช้ และติดตามการใช้งานระบบในที่เดียว
              </p>
              <button
                type="button"
                onClick={() => setShowSignIn(true)}
                className="platform-font-body inline-flex items-center justify-center rounded-lg bg-[#FFD100] px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-[#FCBA03] focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-800 focus-visible:ring-offset-2"
              >
                เข้าสู่ระบบ
              </button>
            </div>
          ) : (
            <div className="platform-hero-copy w-full max-w-[420px]">
              <div
                className="rounded-[1.75rem] bg-white p-8 shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
                style={{
                  border: '4px solid rgba(252,186,3,0.95)',
                  boxShadow: '0 0 20px rgba(252,186,3,0.3), 0 10px 30px rgba(0,0,0,0.08)',
                }}
              >
                <div className="mb-5 flex flex-col items-center">
                  <div className="mb-4 h-16 w-16 overflow-hidden rounded-full bg-yellow-100">
                    <img src={logoSrc} alt="" className="h-full w-full object-cover" />
                  </div>
                  <h2 className="text-center text-xl font-bold text-zinc-800">
                    <span className="block" style={getTextStyle('admin.login.titleLine1')}>{titleLine1}</span>
                    <span className="block" style={getTextStyle('admin.login.titleLine2')}>{titleLine2}</span>
                  </h2>
                </div>

                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="relative">
                    <HiOutlineMail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="email"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      placeholder="Email"
                      autoComplete="username"
                      className="w-full rounded-lg border border-zinc-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#FCBA03]"
                    />
                  </div>
                  <div className="relative">
                    <HiLockClosed className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type={showSignInPassword ? 'text' : 'password'}
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      placeholder="Password"
                      autoComplete="current-password"
                      className="hide-native-password-toggle w-full rounded-lg border border-zinc-200 py-2.5 pl-10 pr-10 text-sm outline-none focus:border-[#FCBA03]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignInPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      aria-label={showSignInPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                    >
                      {showSignInPassword ? <HiOutlineEyeOff /> : <HiOutlineEye />}
                    </button>
                  </div>
                  {signInError ? <p className="text-sm text-red-600">{signInError}</p> : null}
                  <button
                    type="submit"
                    disabled={signInLoading || !signInEmail.trim() || !signInPassword.trim()}
                    className="w-full rounded-lg bg-[#FFD100] py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-[#FCBA03] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {signInLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSignIn(false);
                      setSignInError('');
                      navigate('/', { replace: true });
                    }}
                    className="w-full text-center text-sm text-zinc-500 hover:text-zinc-700"
                  >
                    ← กลับหน้าแรก
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Platform;
