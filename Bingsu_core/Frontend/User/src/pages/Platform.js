import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { HiOutlineClock, HiOutlineLink, HiOutlineSearch } from 'react-icons/hi';
import ntLogo from '../assets/images/nt-logo-on-yellow.png';
import campusBg from '../assets/images/nt-hq-campus.png';
import NtBrandBar from '../components/NtBrandBar';
import { userAPI } from '../services/api';
import { useSystemConfig } from '../context/SystemConfigContext';

const COPY = {
  th: {
    subtitle: 'ผู้ช่วยตอบจากเอกสารองค์กร',
    highlight: 'ค้นจากเอกสารจริง พร้อมอ้างอิงให้ตรวจได้',
    detail: 'ถามจากคลังเอกสารในระบบ ตรวจอำนาจอนุมัติ และเปิดแหล่งที่มาได้ทันที',
    features: [
      { Icon: HiOutlineSearch, text: 'ค้นหาเอกสารอย่างแม่นยำ' },
      { Icon: HiOutlineClock, text: 'เช็คอำนาจอนุมัติได้ชัดเจน' },
      { Icon: HiOutlineLink, text: 'อ้างอิงแหล่งที่มาให้ตรวจสอบ' },
    ],
    sectionTitle: 'ความสามารถ',
    authCta: 'สมัครใช้งาน / เข้าสู่ระบบ',
  },
  en: {
    subtitle: 'Enterprise document assistant',
    highlight: 'Search real documents with sources you can verify',
    detail: 'Ask from the official document library, check approval authority, and open the cited source.',
    features: [
      { Icon: HiOutlineSearch, text: 'Accurate document search' },
      { Icon: HiOutlineClock, text: 'Clear approval authority checks' },
      { Icon: HiOutlineLink, text: 'Cited sources you can verify' },
    ],
    sectionTitle: 'CAPABILITIES',
    authCta: 'Sign up / Log in',
  },
};

function Platform() {
  const { appName, logoSrc } = useSystemConfig();
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
    <div className="platform-page relative flex h-screen flex-col overflow-hidden bg-white">
      <NtBrandBar
        logoSrc={ntLogo}
        className="relative z-20 flex h-[55px] shrink-0 items-center bg-white px-5 shadow-sm md:px-10 lg:px-14"
        logoClassName="h-9 w-auto max-w-[240px] object-contain object-left"
        trailing={
          <div className="flex items-center gap-3 md:gap-5">
            <div
              className="platform-font-body inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 p-0.5 text-xs font-semibold"
              role="group"
              aria-label="Language"
            >
              <button
                type="button"
                onClick={() => setLang('th')}
                className={`rounded-full px-2.5 py-1 transition ${
                  lang === 'th' ? 'bg-[#FFD100] text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                }`}
                aria-pressed={lang === 'th'}
              >
                TH
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`rounded-full px-2.5 py-1 transition ${
                  lang === 'en' ? 'bg-[#FFD100] text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                }`}
                aria-pressed={lang === 'en'}
              >
                EN
              </button>
            </div>
            <Link
              to="/auth"
              className="platform-font-body inline-flex rounded-full bg-[#FFD100] px-5 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-[#FCBA03]"
            >
              {t.authCta}
            </Link>
          </div>
        }
      />

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <img
          src={campusBg}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_32%] select-none"
          draggable={false}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0.20) 36%, rgba(255,255,255,0.16) 62%, rgba(255,255,255,0.55) 100%)',
          }}
        />

        <section className="relative z-10 flex min-h-0 flex-1 flex-col justify-center px-5 py-6 md:px-10 lg:px-14">
          <div className="platform-hero-copy mx-auto w-full max-w-xl text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#FFD100] shadow-md ring-4 ring-white md:h-[4.5rem] md:w-[4.5rem]">
              <img src={logoSrc} alt="" className="h-full w-full object-cover" />
            </div>
            <p
              className="platform-font-brand mb-2 text-[clamp(2rem,4.2vw,3rem)] font-bold leading-[1.1] tracking-tight text-zinc-950"
              style={{ textShadow: '0 1px 12px rgba(255,255,255,0.85)' }}
            >
              {brand}
            </p>
            <h1
              className="platform-font-body mb-3 text-[clamp(1.15rem,2.1vw,1.5rem)] font-semibold leading-snug text-zinc-900"
              style={{ textShadow: '0 1px 10px rgba(255,255,255,0.8)' }}
            >
              {t.subtitle}
            </h1>
            <p
              className="platform-font-body mx-auto mb-2 max-w-md text-sm font-semibold text-zinc-900"
              style={{ textShadow: '0 1px 10px rgba(255,255,255,0.85)' }}
            >
              {t.highlight}
            </p>
            <p
              className="platform-font-body mx-auto max-w-md text-[15px] font-medium leading-7 text-zinc-800"
              style={{ textShadow: '0 1px 10px rgba(255,255,255,0.85)' }}
            >
              {t.detail}
            </p>
          </div>
        </section>

        <section id="capabilities" className="relative z-10 shrink-0 px-5 pb-8 pt-2 md:px-10 md:pb-10 lg:px-14">
          <div className="mx-auto max-w-5xl">
            <h2
              className="platform-font-body mb-4 text-center text-sm font-bold tracking-[0.22em] text-zinc-900"
              style={{ textShadow: '0 1px 8px rgba(255,255,255,0.85)' }}
            >
              {t.sectionTitle}
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {t.features.map(({ Icon, text }) => (
                <div
                  key={text}
                  className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-3.5 shadow-sm backdrop-blur-[2px]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFD100] text-zinc-950">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="platform-font-body text-sm font-semibold leading-snug text-zinc-900">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Platform;
