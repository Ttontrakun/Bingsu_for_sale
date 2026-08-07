import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  HiRefresh,
  HiTrash,
  HiSpeakerphone,
  HiCog,
  HiTranslate,
  HiCurrencyDollar,
  HiBadgeCheck,
  HiUserGroup,
} from 'react-icons/hi';
import { api } from '../services/api';
import { SynonymsPanel } from './Synonyms';
import { ServiceRatesPanel } from './ServiceRates';
import { ApprovalAuthorityPanel } from './ApprovalAuthority';
import { ProductManagersPanel } from './ProductManagers';

const fmtDate = (v) => {
  if (!v) return '-';
  try {
    return new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(v);
  }
};

function SystemOps({ userRole }) {
  const canView = userRole === 'admin' || userRole === 'support';
  const canManage = userRole === 'admin' || userRole === 'support';
  const isAdmin = userRole === 'admin';

  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = useMemo(() => {
    const list = [];
    if (canManage) list.push({ id: 'announce', label: 'ประกาศ', icon: HiSpeakerphone });
    if (isAdmin) {
      list.push({ id: 'synonyms', label: 'Synonyms', icon: HiTranslate });
      list.push({ id: 'rates', label: 'Service Rates', icon: HiCurrencyDollar });
      list.push({ id: 'authority', label: 'อำนาจอนุมัติ', icon: HiBadgeCheck });
      list.push({ id: 'pm', label: 'Super PM / PM', icon: HiUserGroup });
    }
    return list;
  }, [canManage, isAdmin]);

  const tabFromUrl = searchParams.get('tab');
  // ลิงก์เก่า ?tab=uploads → ไปแท็บแรก
  const tab = tabs.some((t) => t.id === tabFromUrl) ? tabFromUrl : tabs[0]?.id || 'announce';

  const setTab = (id) => {
    setSearchParams(id === tabs[0]?.id ? {} : { tab: id }, { replace: true });
  };

  const [toast, setToast] = useState('');
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

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
    if (tab === 'announce') loadAnnouncements();
  }, [canView, tab, loadAnnouncements]);

  if (!canView || tabs.length === 0) return <Navigate to="/knowledge" replace />;

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

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
            <HiCog className="text-white text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">System</h1>
            <p className="text-sm text-gray-600">
              จัดการประกาศ
              {isAdmin ? ' คำพ้อง อัตราค่าบริการ และโครงสร้างบริการ' : ''}
            </p>
          </div>
        </div>
        {tab === 'announce' && (
          <button
            type="button"
            onClick={loadAnnouncements}
            className="inline-flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 self-start"
          >
            <HiRefresh />
            รีเฟรช
          </button>
        )}
      </div>

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
                className="ml-auto px-4 py-1.5 rounded-lg bg-[#F5C200] text-gray-900 text-sm font-semibold hover:bg-[#e0b000] disabled:opacity-50"
              >
                {annSaving ? 'กำลังสร้าง...' : 'สร้างประกาศ'}
              </button>
            </div>
          </div>

          {annLoading && annList.length === 0 ? (
            <p className="text-sm text-gray-500 py-6">กำลังโหลด...</p>
          ) : annList.length === 0 ? (
            <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-xl p-8 text-center">
              ยังไม่มีประกาศ
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {annList.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{item.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {item.level} · {fmtDate(item.createdAt)}
                      {item.active ? ' · กำลังแสดง' : ' · ปิดอยู่'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleAnnouncement(item)}
                      className={`px-2.5 py-1 text-xs rounded-lg border ${
                        item.active
                          ? 'border-green-300 text-green-800 bg-green-50'
                          : 'border-gray-300 text-gray-600 bg-gray-50'
                      }`}
                    >
                      {item.active ? 'เปิดอยู่' : 'ปิดอยู่'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAnnouncement(item)}
                      className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                      title="ลบ"
                    >
                      <HiTrash />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'synonyms' && isAdmin && (
        <SynonymsPanel canEdit showHeader={false} />
      )}

      {tab === 'rates' && isAdmin && (
        <ServiceRatesPanel showHeader={false} />
      )}

      {tab === 'authority' && isAdmin && (
        <ApprovalAuthorityPanel showHeader={false} />
      )}

      {tab === 'pm' && isAdmin && (
        <ProductManagersPanel showHeader={false} />
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
