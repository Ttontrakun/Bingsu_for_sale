import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { HiOutlineClock, HiOutlineLink, HiOutlineSearch } from 'react-icons/hi';
import ntLogo from '../assets/images/nt-logo-on-yellow.png';
import mascot from '../assets/images/bingsu-mascot.png';
import NtBrandBar from '../components/NtBrandBar';
import { userAPI } from '../services/api';
import { useSystemConfig } from '../context/SystemConfigContext';

const COPY = {
  th: {
    subtitle: 'ผู้ช่วยตอบจากเอกสารองค์กร',
    features: [
      { Icon: HiOutlineSearch, text: 'ค้นหาเอกสารอย่างแม่นยำ' },
      { Icon: HiOutlineClock, text: 'เช็คอำนาจอนุมัติได้ชัดเจน' },
      { Icon: HiOutlineLink, text: 'อ้างอิงแหล่งที่มาให้ตรวจสอบ' },
    ],
    signup: 'สมัครใช้งาน',
    login: 'เข้าสู่ระบบ',
  },
  en: {
    subtitle: 'Enterprise document assistant',
    features: [
      { Icon: HiOutlineSearch, text: 'Accurate document search' },
      { Icon: HiOutlineClock, text: 'Clear approval authority checks' },
      { Icon: HiOutlineLink, text: 'Cited sources you can verify' },
    ],
    signup: 'Sign up',
    login: 'Log in',
  },
};

function Platform() {
  const navigate = useNavigate();
  const { appName } = useSystemConfig();
  const [authed, setAuthed] = useState(false);
  const [lang, setLang] = useState('th');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {}, 2500);

    (async () => {
      try {
        await Promise.race([
          userAPI.getCurrentUser(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
        ]);
        if (!cancelled) setAuthed(true);
      } catch {
        /* guest */
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (authed) {
    return <Navigate to="/homepage" replace />;
  }

  const brand = appName || 'Enterprise AI Chatbot';
  const t = COPY[lang];

  return (
    <div className="platform-page relative flex min-h-screen flex-col overflow-hidden bg-[#D9D9D9]">
      <NtBrandBar
        logoSrc={ntLogo}
        className="relative z-20 flex h-[55px] shrink-0 items-center bg-white px-6 shadow-sm md:px-10 lg:px-14"
        logoClassName="h-9 w-auto max-w-[240px] object-contain object-left"
        trailing={
          <div
            className="platform-font-body inline-flex items-center rounded-full border border-zinc-300 bg-zinc-100 p-0.5 text-xs font-semibold shadow-sm md:text-sm"
            role="group"
            aria-label="Language"
          >
            <button
              type="button"
              onClick={() => setLang('th')}
              className={`rounded-full px-2.5 py-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-800 focus-visible:ring-offset-1 ${
                lang === 'th'
                  ? 'bg-[#FFD100] text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
              aria-pressed={lang === 'th'}
            >
              TH
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`rounded-full px-2.5 py-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-800 focus-visible:ring-offset-1 ${
                lang === 'en'
                  ? 'bg-[#FFD100] text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
              aria-pressed={lang === 'en'}
            >
              EN
            </button>
          </div>
        }
      />

      <main className="relative min-h-0 flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 70% at 78% 72%, rgba(255,209,0,0.55) 0%, rgba(252,186,3,0.18) 38%, transparent 70%), linear-gradient(165deg, #E8E8E8 0%, #D9D9D9 45%, #C8C8C8 100%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(-18deg, #3f3f46 0 1px, transparent 1px 14px)',
          }}
        />

        <div className="absolute inset-0 z-10 mx-auto w-full max-w-7xl px-6 md:px-10 lg:px-14">
          <div className="relative z-10 flex h-full max-w-xl flex-col justify-center py-8 md:max-w-[48%]">
            <div className="platform-hero-copy">
              <p
                className="platform-font-brand mb-3 text-[clamp(2.4rem,4.8vw,3.75rem)] font-semibold leading-[1.08] tracking-tight text-zinc-900"
                aria-label={brand}
              >
                {brand}
              </p>
              <h1 className="platform-font-body mb-6 text-[clamp(1.15rem,2vw,1.45rem)] font-semibold leading-snug text-zinc-800">
                {t.subtitle}
              </h1>

              <ul className="platform-font-body mb-8 space-y-3">
                {t.features.map(({ Icon, text }) => (
                  <li key={text} className="flex items-center gap-3 text-[0.95rem] text-zinc-700 md:text-base">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-zinc-700 shadow-sm ring-1 ring-zinc-300/60">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/auth"
                  className="platform-font-body inline-flex min-w-[148px] items-center justify-center rounded-lg bg-[#FFD100] px-6 py-3.5 text-sm font-semibold text-zinc-900 shadow-[0_8px_20px_-12px_rgba(0,0,0,0.35)] transition hover:bg-[#FCBA03] focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-800 focus-visible:ring-offset-2"
                >
                  {t.login}
                </Link>
                <button
                  type="button"
                  onClick={() => navigate('/auth', { state: { mode: 'signup' } })}
                  className="platform-font-body inline-flex min-w-[148px] items-center justify-center rounded-lg border border-zinc-400/70 bg-white/85 px-6 py-3.5 text-sm font-semibold text-zinc-800 backdrop-blur-sm transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-800 focus-visible:ring-offset-2"
                >
                  {t.signup}
                </button>
              </div>
            </div>
          </div>

          <div className="platform-mascot-stage pointer-events-none absolute bottom-24 right-0 flex w-[55%] max-w-[560px] items-end justify-end md:bottom-32 md:w-[52%] md:max-w-none lg:right-2 lg:bottom-36">
            <img
              src={mascot}
              alt=""
              className="h-[min(42vh,320px)] w-auto max-h-[calc(100vh-7rem)] object-contain object-bottom select-none md:h-[min(70vh,620px)]"
              draggable={false}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default Platform;
