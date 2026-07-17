import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { HiRefresh, HiThumbDown, HiThumbUp, HiExclamationCircle, HiCheckCircle, HiChatAlt2, HiChevronDown, HiChevronUp, HiDocumentSearch } from 'react-icons/hi';
import { api } from '../services/api';

const fmtDate = (v) => {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(v);
  }
};

function FeedbackReview({ userRole }) {
  const canSee = userRole === 'admin' || userRole === 'admin_metrics' || userRole === 'support';

  // view: 'nodata' (ค่าเริ่มต้น) | 'up' | 'down'
  const [view, setView] = useState('nodata');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [metrics, setMetrics] = useState(null);

  const loadMetrics = useCallback(() => {
    api.getQualityMetrics(30).then(setMetrics).catch(() => setMetrics(null));
  }, []);

  useEffect(() => {
    if (!canSee) return;
    loadMetrics();
  }, [canSee, loadMetrics]);

  const load = useCallback(async () => {
    // โหลดรายการ feedback เฉพาะตอนดู "พอใจ / ไม่พอใจ"
    if (view !== 'up' && view !== 'down') {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.getFeedback(view, 100, 0);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total) || 0);
    } catch (e) {
      setError(e?.message || 'โหลดข้อมูล feedback ไม่สำเร็จ');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    if (canSee) load();
  }, [canSee, load]);

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refreshAll = () => {
    loadMetrics();
    load();
  };

  if (!canSee) return <Navigate to="/knowledge" replace />;

  const upCount = metrics?.feedback?.up ?? 0;
  const downCount = metrics?.feedback?.down ?? 0;
  const totalAnswers = metrics?.answers?.total ?? 0;
  const noData = metrics?.answers?.noData ?? 0;
  const noDataRate = (metrics?.answers?.noDataRate ?? 0) * 100;
  const downRate = (metrics?.feedback?.downRate ?? 0) * 100;
  const days = metrics?.days ?? 30;
  const knowledgeGaps = items.filter((it) => !it.hadContext).length;
  const noDataQuestions = Array.isArray(metrics?.topNoDataQuestions) ? metrics.topNoDataQuestions : [];

  return (
    <div className="w-full h-full p-6 min-h-screen">
      {/* Header — สไตล์เดียวกับหน้าอื่น */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
            <HiChatAlt2 className="text-white text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Feedback จากผู้ใช้</h1>
            <p className="text-sm text-gray-600 flex items-center gap-1.5 flex-wrap">
              <span>คลิกการ์ด</span>
              <span className="inline-flex items-center justify-center bg-green-100 text-green-600 rounded-md p-1">
                <HiThumbUp className="text-sm" />
              </span>
              <span>หรือ</span>
              <span className="inline-flex items-center justify-center bg-red-100 text-red-600 rounded-md p-1">
                <HiThumbDown className="text-sm" />
              </span>
              <span>เพื่อดูคำถามและคำตอบที่ผู้ใช้ให้ feedback ({days} วันล่าสุด)</span>
            </p>
          </div>
        </div>
        <button
          onClick={refreshAll}
          className="inline-flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 self-start"
        >
          <HiRefresh className={loading ? 'animate-spin' : ''} />
          รีเฟรช
        </button>
      </div>

      {/* Metric cards: 1.คำตอบทั้งหมด 2.ไม่มีข้อมูล(กดได้) 3.พอใจ(กดได้) 4.ไม่พอใจ(กดได้) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* 1. คำตอบทั้งหมด (ข้อมูล ไม่กด) */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-lg">
          <div className="text-sm font-medium text-gray-600">คำตอบทั้งหมด</div>
          <div className="text-3xl font-bold text-gray-800 mt-3">{totalAnswers}</div>
          <div className="text-xs text-gray-400 mt-1">ใน {days} วันล่าสุด</div>
        </div>

        {/* 2. คำตอบที่ไม่มีข้อมูล (กดได้ → nodata) */}
        <button
          type="button"
          onClick={() => setView('nodata')}
          className={`text-left bg-white rounded-2xl border p-5 shadow-lg transition-all duration-200 hover:-translate-y-0.5 ${
            view === 'nodata' ? 'border-amber-400 ring-2 ring-amber-300' : 'border-gray-100 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-600 text-sm font-medium">
              <span className="bg-amber-100 text-amber-600 rounded-lg p-1.5"><HiDocumentSearch className="text-lg" /></span>
              คำตอบที่ไม่มีข้อมูล
            </div>
            {view === 'nodata' && <span className="text-[11px] font-semibold text-amber-600">กำลังดู</span>}
          </div>
          <div className="text-3xl font-bold text-amber-600 mt-3">
            {noData}
            <span className="text-sm text-gray-400 font-medium ml-1">({noDataRate.toFixed(1)}%)</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">คลิกดูคำถามที่ตอบไม่ได้</div>
        </button>

        {/* 3. พอใจ (กดได้ → up) */}
        <button
          type="button"
          onClick={() => setView('up')}
          className={`text-left bg-white rounded-2xl border p-5 shadow-lg transition-all duration-200 hover:-translate-y-0.5 ${
            view === 'up' ? 'border-green-400 ring-2 ring-green-300' : 'border-gray-100 hover:border-green-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-600 text-sm font-medium">
              <span className="bg-green-100 text-green-600 rounded-lg p-1.5"><HiThumbUp className="text-lg" /></span>
              พอใจ
            </div>
            {view === 'up' && <span className="text-[11px] font-semibold text-green-600">กำลังดู</span>}
          </div>
          <div className="text-3xl font-bold text-green-600 mt-3">{upCount}</div>
          <div className="text-xs text-gray-400 mt-1">คลิกดูรายการที่ถูกใจ</div>
        </button>

        {/* 4. ไม่พอใจ (กดได้ → down) */}
        <button
          type="button"
          onClick={() => setView('down')}
          className={`text-left bg-white rounded-2xl border p-5 shadow-lg transition-all duration-200 hover:-translate-y-0.5 ${
            view === 'down' ? 'border-red-400 ring-2 ring-red-300' : 'border-gray-100 hover:border-red-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-600 text-sm font-medium">
              <span className="bg-red-100 text-red-600 rounded-lg p-1.5"><HiThumbDown className="text-lg" /></span>
              ไม่พอใจ
            </div>
            {view === 'down' && <span className="text-[11px] font-semibold text-red-600">กำลังดู</span>}
          </div>
          <div className="text-3xl font-bold text-red-600 mt-3">
            {downCount}
            <span className="text-sm text-gray-400 font-medium ml-1">({downRate.toFixed(1)}%)</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">คลิกดูรายการที่ไม่ถูกใจ</div>
        </button>
      </div>

      {/* ===== ส่วนแสดงผลตามการ์ดที่เลือก ===== */}
      {view === 'nodata' ? (
        /* โหมดเริ่มต้น: คำถามที่ไม่มีคำตอบ (ควรเติม Knowledge) */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-amber-50 flex items-center gap-2 font-semibold text-gray-800">
            <HiExclamationCircle className="text-amber-500" />
            คำถามที่ตอบไม่ได้บ่อย (ควรเติม Knowledge)
            <span className="text-sm font-normal text-gray-500">— {noDataQuestions.length} คำถาม</span>
          </div>
          {noDataQuestions.length === 0 ? (
            <div className="text-gray-500 py-14 text-center">ยังไม่มีคำถามที่ตอบไม่ได้ในช่วงนี้</div>
          ) : (
            <ul className="p-4 flex flex-col gap-2">
              {noDataQuestions.map((q, i) => (
                <li key={i} className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl px-4 py-3 hover:shadow-sm transition-shadow">
                  <span className="text-sm text-gray-800 min-w-0 break-words">{q.question}</span>
                  <span className="flex-shrink-0 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">{q.count} ครั้ง</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        /* โหมดพอใจ / ไม่พอใจ: รายการคำถาม + คำตอบ AI */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
          <div className={`px-5 py-3 border-b border-gray-100 flex items-center justify-between ${view === 'down' ? 'bg-red-50' : 'bg-green-50'}`}>
            <div className="flex items-center gap-2 font-semibold text-gray-800">
              {view === 'down' ? <HiThumbDown className="text-red-500" /> : <HiThumbUp className="text-green-500" />}
              {view === 'down' ? 'รายการที่ไม่พอใจ' : 'รายการที่พอใจ'}
              <span className="text-sm font-normal text-gray-500">— {total} รายการ</span>
            </div>
            {view === 'down' && knowledgeGaps > 0 && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-1 flex items-center gap-1">
                <HiExclamationCircle /> Knowledge อาจขาด {knowledgeGaps} รายการ
              </span>
            )}
          </div>

          {error && (
            <div className="m-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
          )}

          {loading ? (
            <div className="text-gray-500 py-14 text-center">กำลังโหลด...</div>
          ) : items.length === 0 ? (
            <div className="text-gray-500 py-14 text-center">
              ยังไม่มี feedback ในหมวด{view === 'down' ? 'ไม่พอใจ' : 'พอใจ'}
            </div>
          ) : (
            <div className="p-4 flex flex-col gap-3">
              {items.map((it) => {
                const isOpen = expanded.has(it.feedbackId);
                return (
                  <div key={it.feedbackId} className="border border-gray-200 rounded-xl bg-white hover:shadow-sm transition-shadow overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-400 mb-1">{fmtDate(it.createdAt)} · {it.conversationTitle || 'ไม่มีชื่อห้อง'}</div>
                          <div className="font-medium text-gray-800">
                            <span className="text-gray-400">คำถาม: </span>{it.question || '(ไม่พบคำถาม)'}
                          </div>
                        </div>
                        {it.hadContext ? (
                          <span className="flex-shrink-0 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-1 flex items-center gap-1">
                            <HiCheckCircle /> มี context ({it.groundingChunksCount})
                          </span>
                        ) : (
                          <span className="flex-shrink-0 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-1 flex items-center gap-1">
                            <HiExclamationCircle /> ไม่มี context
                          </span>
                        )}
                      </div>

                      <div className={`text-sm text-gray-600 mt-2 ${isOpen ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                        <span className="text-gray-400">คำตอบ AI: </span>{it.answer || '(ว่าง)'}
                      </div>

                      {it.comment && (
                        <div className="text-sm text-gray-700 mt-2 bg-gray-50 rounded-lg px-3 py-1.5">
                          💬 {it.comment}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-400">
                          โดย: {it.feedbackBy?.name || it.feedbackBy?.email || 'ไม่ทราบ'}
                        </span>
                        <button
                          onClick={() => toggle(it.feedbackId)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
                        >
                          {isOpen ? <HiChevronUp /> : <HiChevronDown />}
                          {isOpen ? 'ย่อ' : 'ดูคำตอบเต็ม'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FeedbackReview;
