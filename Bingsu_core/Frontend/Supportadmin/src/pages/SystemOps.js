import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  HiRefresh,
  HiTrash,
  HiSpeakerphone,
  HiCloudUpload,
  HiCog,
  HiTranslate,
  HiCurrencyDollar,
  HiBadgeCheck,
} from 'react-icons/hi';
import { api } from '../services/api';
import { SynonymsPanel } from './Synonyms';
import { ServiceRatesPanel } from './ServiceRates';
import { ApprovalAuthorityPanel } from './ApprovalAuthority';

const fmtDate = (v) => {
  if (!v) return '-';
  try {
    return new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(v);
  }
};

const STATUS_LABELS = {
  uploading: { text: 'รออัปโหลด/รอคิว', cls: 'bg-gray-100 text-gray-700' },
  processing: { text: 'กำลังประมวลผล', cls: 'bg-blue-100 text-blue-700' },
  done: { text: 'สำเร็จ', cls: 'bg-green-100 text-green-700' },
  error: { text: 'ล้มเหลว', cls: 'bg-red-100 text-red-700' },
};

function SystemOps({ userRole }) {
  const canView = userRole === 'admin' || userRole === 'admin_metrics' || userRole === 'support';
  const canManage = userRole === 'admin' || userRole === 'support';
  const isAdmin = userRole === 'admin';

  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = useMemo(() => {
    const list = [];
    if (canManage) list.push({ id: 'announce', label: 'ประกาศ', icon: HiSpeakerphone });
    list.push({ id: 'uploads', label: 'สถานะไฟล์', icon: HiCloudUpload });
    if (isAdmin) {
      list.push({ id: 'synonyms', label: 'Synonyms', icon: HiTranslate });
      list.push({ id: 'rates', label: 'Service Rates', icon: HiCurrencyDollar });
      list.push({ id: 'authority', label: 'อำนาจอนุมัติ', icon: HiBadgeCheck });
    }
    return list;
  }, [canManage, isAdmin]);

  const tabFromUrl = searchParams.get('tab');
  const tab = tabs.some((t) => t.id === tabFromUrl) ? tabFromUrl : tabs[0]?.id || 'announce';

  const setTab = (id) => {
    setSearchParams(id === tabs[0]?.id ? {} : { tab: id }, { replace: true });
  };

  const [toast, setToast] = useState('');
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  // --- Tab: สถานะไฟล์ ---
  const [upStatus, setUpStatus] = useState('');
  const [upBatches, setUpBatches] = useState([]);
  const [upLoading, setUpLoading] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const loadUploads = useCallback(async () => {
    setUpLoading(true);
    try {
      const data = await api.getUploadBatches(upStatus);
      setUpBatches(Array.isArray(data?.batches) ? data.batches : []);
    } catch {
      showToast('โหลดสถานะไฟล์ไม่สำเร็จ');
    } finally {
      setUpLoading(false);
    }
  }, [upStatus]);

  // --- Tab: ประกาศ ---
  const [annList, setAnnList] = useState([]);
  const [annLoading, setAnnLoading] = useState(false);
  const [annMessage, setAnnMessage] = useState('');
  const [annLevel, setAnnLevel] = useState('info');
  const [annSaving, setAnnSaving] = useState(false);
  const loadAnnouncements = useCallback(async () => {
    if (!canManage) return;
    setAnnLoading(true);
    try {
      const data = await api.getAnnouncements();
      setAnnList(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch {
      showToast('โหลดประกาศไม่สำเร็จ');
    } finally {
      setAnnLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    if (!canView) return;
    if (tab === 'uploads') loadUploads();
    if (tab === 'announce') loadAnnouncements();
  }, [canView, tab, loadUploads, loadAnnouncements]);

  useEffect(() => {
    if (tab !== 'uploads') return undefined;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      loadUploads();
    }, 15000);
    return () => clearInterval(timer);
  }, [tab, loadUploads]);

  if (!canView) return <Navigate to="/knowledge" replace />;

  const handleRetry = async (id) => {
    setRetryingId(id);
    try {
      await api.retryUploadBatch(id);
      showToast('ส่งเข้าคิวประมวลผลใหม่แล้ว');
      loadUploads();
    } catch (e) {
      showToast(e?.message || 'retry ไม่สำเร็จ');
    } finally {
      setRetryingId(null);
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!annMessage.trim()) {
      showToast('กรอกข้อความประกาศก่อน');
      return;
    }
    setAnnSaving(true);
    try {
      await api.createAnnouncement({ message: annMessage.trim(), level: annLevel });
      setAnnMessage('');
      showToast('สร้างประกาศแล้ว');
      loadAnnouncements();
    } catch {
      showToast('สร้างประกาศไม่สำเร็จ');
    } finally {
      setAnnSaving(false);
    }
  };

  const handleToggleAnnouncement = async (item) => {
    try {
      await api.updateAnnouncement(item.id, { active: !item.active });
      loadAnnouncements();
    } catch {
      showToast('อัปเดตไม่สำเร็จ');
    }
  };

  const handleDeleteAnnouncement = async (item) => {
    try {
      await api.deleteAnnouncement(item.id);
      showToast('ลบประกาศแล้ว');
      loadAnnouncements();
    } catch {
      showToast('ลบไม่สำเร็จ');
    }
  };

  const handleRefresh = () => {
    if (tab === 'uploads') loadUploads();
    if (tab === 'announce') loadAnnouncements();
  };

  return (
    <div className="w-full">
      {/* Header — สไตล์เดียวกับหน้าอื่น */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
            <HiCog className="text-white text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">System</h1>
            <p className="text-sm text-gray-600">
              จัดการสถานะไฟล์ ประกาศ
              {isAdmin ? ' คำพ้อง และอัตราค่าบริการ' : ''}
            </p>
          </div>
        </div>
        {(tab === 'uploads' || tab === 'announce') && (
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 self-start"
          >
            <HiRefresh />
            รีเฟรช
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-[#F5C200] text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="text-base" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab: สถานะไฟล์ */}
      {tab === 'uploads' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <span>สถานะ:</span>
            {[
              { v: '', label: 'ทั้งหมด' },
              { v: 'processing', label: 'กำลังประมวลผล' },
              { v: 'error', label: 'ล้มเหลว' },
              { v: 'done', label: 'สำเร็จ' },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setUpStatus(o.v)}
                className={`px-3 py-1 rounded-full text-xs border ${
                  upStatus === o.v
                    ? 'bg-[#F5C200] text-gray-900 border-[#F5C200]'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {upLoading && upBatches.length === 0 ? (
            <p className="text-sm text-gray-500 py-6">กำลังโหลด...</p>
          ) : upBatches.length === 0 ? (
            <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-xl p-8 text-center">
              ไม่มีรายการ
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-left">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">ชื่อ</th>
                    <th className="px-4 py-2.5 font-medium w-36">ผู้อัปโหลด</th>
                    <th className="px-4 py-2.5 font-medium w-36">สถานะ</th>
                    <th className="px-4 py-2.5 font-medium">รายละเอียด</th>
                    <th className="px-4 py-2.5 font-medium w-44">อัปเดตล่าสุด</th>
                    <th className="px-4 py-2.5 font-medium w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {upBatches.map((b) => {
                    const st = STATUS_LABELS[b.status] || { text: b.status, cls: 'bg-gray-100 text-gray-700' };
                    return (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-800">
                          {b.displayName}
                          {b.files?.length > 0 && (
                            <span className="block text-xs text-gray-400">{b.files.map((f) => f.name).join(', ')}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{b.userName}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.text}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {b.status === 'error' ? (
                            <span className="text-red-600">{b.error || 'ไม่ทราบสาเหตุ'}</span>
                          ) : b.status === 'processing' ? (
                            <span className="text-gray-600">
                              {b.progressMessage || '-'}
                              {b.progressTotal > 0 && ` (${b.progressCurrent}/${b.progressTotal})`}
                            </span>
                          ) : (
                            <span className="text-gray-500">{b.documentName || b.progressMessage || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{fmtDate(b.updatedAt)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {canManage && b.status === 'error' && (
                            <button
                              type="button"
                              onClick={() => handleRetry(b.id)}
                              disabled={retryingId === b.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                            >
                              <HiRefresh className={`text-sm ${retryingId === b.id ? 'animate-spin' : ''}`} />
                              Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: ประกาศถึงผู้ใช้ */}
      {tab === 'announce' && canManage && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 flex flex-col gap-3">
            <p className="text-sm font-medium text-gray-700">สร้างประกาศใหม่ (แสดงเป็นแถบในหน้าแชทของผู้ใช้)</p>
            <textarea
              value={annMessage}
              onChange={(e) => setAnnMessage(e.target.value)}
              placeholder="เช่น ระบบจะปิดปรับปรุงวันเสาร์ 22:00-24:00 น."
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white"
            />
            <div className="flex items-center gap-3">
              <select
                value={annLevel}
                onChange={(e) => setAnnLevel(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white"
              >
                <option value="info">ทั่วไป (ฟ้า)</option>
                <option value="warning">สำคัญ (เหลือง)</option>
              </select>
              <button
                type="button"
                onClick={handleCreateAnnouncement}
                disabled={annSaving}
                className="px-4 py-1.5 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {annSaving ? 'กำลังบันทึก...' : 'ประกาศ'}
              </button>
            </div>
          </div>

          {annLoading ? (
            <p className="text-sm text-gray-500 py-4">กำลังโหลด...</p>
          ) : annList.length === 0 ? (
            <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-xl p-8 text-center">
              ยังไม่มีประกาศ
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {annList.map((a) => (
                <div key={a.id} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <span className={`mt-0.5 inline-flex px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                    a.level === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {a.level === 'warning' ? 'สำคัญ' : 'ทั่วไป'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${a.active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{a.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">อัปเดต {fmtDate(a.updatedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleAnnouncement(a)}
                      className={`px-2.5 py-1 text-xs rounded-lg border ${
                        a.active
                          ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                          : 'border-green-300 text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {a.active ? 'ปิดแสดง' : 'เปิดใหม่อีกครั้ง'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAnnouncement(a)}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                      title="ลบประกาศ"
                    >
                      <HiTrash className="text-base" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Synonyms */}
      {tab === 'synonyms' && isAdmin && (
        <SynonymsPanel canEdit showHeader={false} />
      )}

      {/* Tab: Service Rates */}
      {tab === 'rates' && isAdmin && (
        <ServiceRatesPanel showHeader={false} />
      )}

      {/* Tab: Approval Authority */}
      {tab === 'authority' && isAdmin && (
        <ApprovalAuthorityPanel showHeader={false} />
      )}

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

export default SystemOps;
