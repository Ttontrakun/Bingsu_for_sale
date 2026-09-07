import { useEffect, useRef, useState } from 'react';
import { HiX, HiSpeakerphone } from 'react-icons/hi';
import { announcementAPI } from '../services/api';

const DISMISSED_KEY = 'dismissedAnnouncements';
/** เลื่อนครบกี่รอบแล้วค่อยเอาออก */
const MARQUEE_ROUNDS = 2;
/** ความเร็วพิกเซลต่อวินาที */
const PX_PER_SEC = 42;
/** ข้อความสั้นที่ไม่ต้องเลื่อน — ค้างไว้กี่มิลลิวินาทีก่อนปิดเอง */
const STATIC_MS = 14000;

const getDismissedIds = () => {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistDismiss = (id) => {
  try {
    const next = [...new Set([...getDismissedIds(), id])].slice(-50);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
};

/**
 * แถบประกาศฝั่งผู้ใช้
 * - แสดงแค่ประกาศล่าสุด 1 ข้อความ (ไม่ทำสำเนาให้ดูเหมือนหลายบรรทัด)
 * - ข้อความยาวเกินกรอบจึงเลื่อนด้วย rAF ครบ 2 รอบแล้วหาย, สั้นกว่านั้นวางนิ่ง
 */
const AnnouncementBanner = () => {
  const [item, setItem] = useState(null);
  const wrapRef = useRef(null);
  const textRef = useRef(null);
  const itemRef = useRef(null);
  itemRef.current = item;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await announcementAPI.getActive();
        if (cancelled) return;
        const dismissed = new Set(getDismissedIds());
        // API เรียง updatedAt desc อยู่แล้ว — เอาอันล่าสุดที่ยังไม่ปิด แค่ 1 ชิ้น
        const latest = (list || []).find((a) => a?.id && !dismissed.has(a.id)) || null;
        setItem(latest);
      } catch {
        // เงียบไว้
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = (id) => {
    persistDismiss(id);
    setItem((prev) => (prev?.id === id ? null : prev));
  };

  // เลื่อนข้อความเดียวด้วย requestAnimationFrame — ลื่นกว่า CSS % และไม่โชว์ข้อความซ้ำ
  useEffect(() => {
    if (!item) return undefined;
    const wrap = wrapRef.current;
    const text = textRef.current;
    if (!wrap || !text) return undefined;

    // อ่านจบในบรรทัดเดียวอยู่แล้ว — เลื่อนไปมาทำให้อ่านยากกว่าเดิม
    if (text.offsetWidth <= wrap.clientWidth) {
      text.style.transform = 'translate3d(0,0,0)';
      const timer = window.setTimeout(() => {
        const id = itemRef.current?.id;
        if (id) dismiss(id);
      }, STATIC_MS);
      return () => window.clearTimeout(timer);
    }

    let rafId = 0;
    let cancelled = false;
    let round = 0;
    let x = wrap.clientWidth;
    let last = performance.now();

    text.style.transform = `translate3d(${x}px,0,0)`;

    const tick = (now) => {
      if (cancelled) return;
      // จำกัด dt กันเด้งเมื่อสลับแท็บกลับมา
      const dt = Math.min(0.032, Math.max(0, (now - last) / 1000));
      last = now;

      x -= PX_PER_SEC * dt;
      const textW = text.offsetWidth || 0;
      const wrapW = wrap.clientWidth || 0;

      if (x <= -textW) {
        round += 1;
        if (round >= MARQUEE_ROUNDS) {
          const id = itemRef.current?.id;
          if (id) dismiss(id);
          return;
        }
        // ข้อความอยู่นอกจอด้านซ้ายแล้ว — ย้ายไปขวานอกจอ (มองไม่เห็น) เริ่มรอบใหม่
        x = wrapW;
      }

      text.style.transform = `translate3d(${Math.round(x * 10) / 10}px,0,0)`;
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) return null;

  const isWarning = item.level === 'warning';

  return (
    <div className='px-4 pt-3'>
      <div
        className={`flex items-center gap-3 rounded-xl border-l-4 border-y border-r px-3 py-2.5 text-sm overflow-hidden shadow-sm ${
          isWarning
            ? 'border-red-500 border-y-red-200 border-r-red-200 bg-red-50'
            : 'border-yellow-400 border-y-yellow-300 border-r-yellow-300 bg-yellow-50'
        }`}
        role='status'
      >
        <span
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
            isWarning ? 'bg-red-500 text-white' : 'bg-yellow-400 text-gray-900'
          }`}
        >
          <HiSpeakerphone className='text-sm' aria-hidden />
        </span>
        <span
          className={`flex-shrink-0 text-xs font-bold ${
            isWarning ? 'text-red-700' : 'text-gray-700'
          }`}
        >
          {isWarning ? 'ประกาศสำคัญ' : 'ประกาศ'}
        </span>
        <div ref={wrapRef} className='flex-1 min-w-0 overflow-hidden relative h-5'>
          <p
            ref={textRef}
            className='absolute left-0 top-0 whitespace-nowrap leading-5 font-medium text-gray-900 will-change-transform'
            style={{ transform: 'translate3d(0,0,0)', backfaceVisibility: 'hidden' }}
          >
            {item.message}
          </p>
        </div>
        <button
          type='button'
          onClick={() => dismiss(item.id)}
          className={`flex-shrink-0 rounded-md p-1 transition-colors ${
            isWarning
              ? 'text-red-400 hover:bg-red-100 hover:text-red-700'
              : 'text-gray-500 hover:bg-yellow-200 hover:text-gray-800'
          }`}
          aria-label='ปิดประกาศ'
        >
          <HiX className='text-base' />
        </button>
      </div>
    </div>
  );
};

export default AnnouncementBanner;
