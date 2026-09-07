import { useEffect, useState } from 'react';
import { HiExclamation, HiOutlineMail, HiRefresh } from 'react-icons/hi';
import ntLogo from '../assets/images/nt-logo-on-yellow.png';
import { announcementAPI } from '../services/api';
import { useSystemConfig } from '../context/SystemConfigContext';

const POLL_MS = 15000;
const FALLBACK_EMAIL = 'aisupport@ntplc.co.th';

/**
 * ป๊อปอัปปิดปรับปรุงแบบประกาศทางการ — บังทั้งหน้า ไม่มีปุ่มปิด
 */
const MaintenanceOverlay = () => {
  const { appName } = useSystemConfig();
  const [state, setState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await announcementAPI.getMaintenance();
        if (!cancelled) setState(data || { enabled: false });
      } catch {
        if (!cancelled) setState((prev) => prev || { enabled: false });
      }
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!state?.enabled) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [state?.enabled]);

  if (!state?.enabled) return null;

  const email = String(state.contactEmail || FALLBACK_EMAIL).trim() || FALLBACK_EMAIL;
  const brand = appName || 'Enterprise AI Chatbot';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-5 md:p-8 bg-black/55"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="maintenance-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="border-b border-gray-200 px-7 py-3.5 flex items-center gap-3">
          <img
            src={ntLogo}
            alt="nt National Telecom"
            className="h-8 w-auto max-w-[180px] object-contain object-left"
          />
          <span className="h-6 w-px bg-gray-200" aria-hidden />
          <span className="text-sm font-medium text-gray-600 truncate">{brand}</span>
        </div>

        <div className="px-7 py-8 md:px-9 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-50 text-yellow-500 ring-1 ring-yellow-200">
            <HiExclamation className="text-4xl" aria-hidden />
          </div>
          <h1 id="maintenance-title" className="mt-5 text-2xl font-bold text-gray-900">
            ปิดปรับปรุงชั่วคราว
          </h1>
          <p className="mt-2 text-[15px] text-gray-600">
            ระบบไม่สามารถให้บริการได้ในขณะนี้
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-yellow-500 transition-colors"
          >
            <HiRefresh className="text-base" aria-hidden />
            ลองใหม่อีกครั้ง
          </button>

          <a
            href={`mailto:${email}`}
            className="mt-6 flex items-center justify-center gap-2 border-t border-gray-100 pt-5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <HiOutlineMail className="text-base" aria-hidden />
            <span className="font-medium text-gray-700">{email}</span>
          </a>
        </div>

        <div className="border-t border-gray-200 bg-gray-50 px-7 py-3 text-center text-xs text-gray-500">
          บริษัท โทรคมนาคมแห่งชาติ จำกัด (มหาชน)
        </div>
      </div>
    </div>
  );
};

export default MaintenanceOverlay;
