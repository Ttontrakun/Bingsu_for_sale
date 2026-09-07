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
  HiExclamation,
} from 'react-icons/hi';
import { api } from '../services/api';
import { useAdminSystemConfig } from '../context/AdminSystemConfigContext';
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
  const { systemTabEnabled, getCopy, getTextStyle } = useAdminSystemConfig();

  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = useMemo(() => {
    const list = [];
    if (canManage && systemTabEnabled('announce')) {
      list.push({ id: 'announce', label: 'ประกาศ', icon: HiSpeakerphone });
    }
    if (isAdmin) {
      if (systemTabEnabled('synonyms')) {
        list.push({ id: 'synonyms', label: 'Synonyms', icon: HiTranslate });
      }
      if (systemTabEnabled('rates')) {
        list.push({ id: 'rates', label: 'Service Rates', icon: HiCurrencyDollar });
      }
      if (systemTabEnabled('authority')) {
        list.push({ id: 'authority', label: 'อำนาจอนุมัติ', icon: HiBadgeCheck });
      }
      if (systemTabEnabled('pm')) {
        list.push({ id: 'pm', label: 'Super PM / PM', icon: HiUserGroup });
      }
    }
    return list;
  }, [canManage, isAdmin, systemTabEnabled]);

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
  const [maintenance, setMaintenance] = useState({ enabled: false });
  const [maintLoading, setMaintLoading] = useState(false);
  const [maintSaving, setMaintSaving] = useState(false);
  const [maintConfirm, setMaintConfirm] = useState(null);

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

  const loadMaintenance = useCallback(async () => {
    if (!canManage) return;
    setMaintLoading(true);
    try {
      const data = await api.getMaintenance();
      setMaintenance({ enabled: Boolean(data?.enabled) });
    } catch {
      showToast('โหลดโหมดปิดปรับปรุงไม่สำเร็จ');
    } finally {
      setMaintLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    if (!canView) return;
    if (tab === 'announce') {
      loadAnnouncements();
      loadMaintenance();
    }
  }, [canView, tab, loadAnnouncements, loadMaintenance]);

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

  const handleConfirmMaintenance = async () => {
    if (!maintConfirm) return;
    const nextEnabled = maintConfirm === 'enable';
    setMaintSaving(true);
    try {
      const data = await api.updateMaintenance({ enabled: nextEnabled });
      setMaintenance({ enabled: Boolean(data?.enabled) });
      setMaintConfirm(null);
      showToast(nextEnabled ? 'เปิดโหมดปิดปรับปรุงแล้ว' : 'ปิดโหมดปิดปรับปรุงแล้ว');
    } catch {
      showToast('อัปเดตโหมดปิดปรับปรุงไม่สำเร็จ');
    } finally {
      setMaintSaving(false);
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
            <h1 className="text-2xl font-bold text-gray-800" style={getTextStyle('admin.system.title')}>
              {getCopy('admin.system.title', 'System')}
            </h1>
            <p className="text-sm text-gray-600" style={getTextStyle('admin.system.subtitle')}>
              {getCopy(
                'admin.system.subtitle',
                isAdmin
                  ? 'จัดการประกาศ คำพ้อง อัตราค่าบริการ และโครงสร้างบริการ'
                  : 'จัดการประกาศ',
              )}
            </p>
          </div>
        </div>
        {tab === 'announce' && (
          <button
            type="button"
            onClick={() => {
              loadAnnouncements();
              loadMaintenance();
            }}
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
        <div className="flex flex-col gap-5">
          <div
            className={`rounded-xl border bg-white px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 ${
              maintenance.enabled ? 'border-yellow-400' : 'border-gray-200'
            }`}
          >
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  maintenance.enabled ? 'bg-yellow-400 text-gray-900' : 'bg-gray-100 text-gray-600'
                }`}
              >
                <HiExclamation className="text-lg" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">โหมดปิดปรับปรุง</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  {maintenance.enabled
                    ? 'กำลังปิดเว็บผู้ใช้อยู่ — ผู้ใช้เห็นหน้าแจ้งปิดปรับปรุง และใช้ระบบไม่ได้'
                    : 'ปิดเว็บผู้ใช้ทั้งระบบชั่วคราวเมื่อมีปัญหา ผู้ใช้จะใช้ระบบไม่ได้จนกว่าจะกดปิด'}
                </p>
              </div>
            </div>
            {!maintenance.enabled ? (
              <button
                type="button"
                onClick={() => setMaintConfirm('enable')}
                disabled={maintSaving || maintLoading}
                className="shrink-0 self-start sm:self-center px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-800 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                เปิดโหมดปิดปรับปรุง
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMaintConfirm('disable')}
                disabled={maintSaving || maintLoading}
                className="shrink-0 self-start sm:self-center px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-800 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                ปิดโหมดปิดปรับปรุง
              </button>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">ประกาศถึงผู้ใช้</p>
              <p className="text-xs text-gray-500 mt-0.5">แสดงเป็นแถบข้อความในหน้าแชท</p>
            </div>
            <textarea
              value={annMessage}
              onChange={(e) => setAnnMessage(e.target.value)}
              placeholder="เช่น ระบบจะปิดปรับปรุงวันเสาร์ 22:00-24:00 น."
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white"
            />
            <div className="flex items-center gap-3">
              <select
                value={annLevel}
                onChange={(e) => setAnnLevel(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white text-gray-800"
              >
                <option value="info">ทั่วไป</option>
                <option value="warning">สำคัญ</option>
              </select>
              <button
                type="button"
                onClick={handleCreateAnnouncement}
                disabled={annSaving}
                className="ml-auto px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-800 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {annSaving ? 'กำลังสร้าง...' : 'สร้างประกาศ'}
              </button>
            </div>
          </div>

          {annLoading && annList.length === 0 ? (
            <p className="text-sm text-gray-500 py-6">กำลังโหลด...</p>
          ) : annList.length === 0 ? (
            <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-xl p-8 text-center bg-white">
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
                      {item.level === 'warning' ? 'สำคัญ' : 'ทั่วไป'} · {fmtDate(item.createdAt)}
                      {item.active ? ' · กำลังแสดง' : ' · ปิดอยู่'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleAnnouncement(item)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg border ${
                        item.active
                          ? 'border-yellow-400 bg-yellow-50 text-yellow-900'
                          : 'border-gray-300 text-gray-600 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {item.active ? 'กำลังแสดง' : 'ปิดอยู่'}
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

      {maintConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              {maintConfirm === 'enable' ? 'ยืนยันการเปิดโหมดปิดปรับปรุง' : 'ยืนยันการปิดโหมดปิดปรับปรุง'}
            </h3>
            <p className="text-gray-600 mb-6">
              {maintConfirm === 'enable'
                ? 'ผู้ใช้จะไม่สามารถใช้เว็บได้จนกว่าจะปิดโหมดนี้ ต้องการเปิดหรือไม่?'
                : 'ผู้ใช้จะกลับมาใช้เว็บได้ตามปกติ ต้องการปิดหรือไม่?'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setMaintConfirm(null)}
                disabled={maintSaving}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                ไม่
              </button>
              <button
                type="button"
                onClick={handleConfirmMaintenance}
                disabled={maintSaving}
                className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 transition-colors disabled:opacity-50"
              >
                {maintSaving ? 'กำลังบันทึก...' : 'ใช่'}
              </button>
            </div>
          </div>
        </div>
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
