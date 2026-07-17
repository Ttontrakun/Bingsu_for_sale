import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { HiRefresh, HiCurrencyDollar, HiPlus, HiTrash, HiCheck, HiChevronDown, HiChevronUp } from 'react-icons/hi';
import { api } from '../services/api';

const GROUPS = [
  { service: 'corp', kind: 'intl', label: 'NT Corporate Internet — International Bandwidth' },
  { service: 'corp', kind: 'local', label: 'NT Corporate Internet — Local Access' },
  { service: 'lite', kind: 'intl', label: 'NT Corporate Internet Lite — International Bandwidth' },
  { service: 'lite', kind: 'local', label: 'NT Corporate Internet Lite — Local Access' },
];

const fmt = (n) => Number(n).toLocaleString('en-US');
const groupKey = (g) => `${g.service}:${g.kind}`;

function ServiceRates({ userRole }) {
  const isAdmin = userRole === 'admin';

  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [edited, setEdited] = useState({}); // { id: newRateString }
  const [open, setOpen] = useState({}); // พับทุกกลุ่มไว้ก่อน ให้ผู้ใช้กดเปิดดูเอง
  const [addForm, setAddForm] = useState({}); // { groupKey: {speed, rate} }
  const [confirmDelete, setConfirmDelete] = useState(null);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true); setError('');
    try {
      const data = await api.getServiceRates();
      setRates(Array.isArray(data) ? data : []);
      setEdited({});
    } catch (e) {
      setError('โหลดอัตราไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const byGroup = useMemo(() => {
    const map = {};
    GROUPS.forEach((g) => { map[groupKey(g)] = []; });
    rates.forEach((r) => {
      const k = `${r.service}:${r.kind}`;
      if (map[k]) map[k].push(r);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.speed - b.speed));
    return map;
  }, [rates]);

  if (!isAdmin) return <Navigate to="/knowledge" replace />;

  const saveRate = async (item) => {
    const val = Math.round(Number(edited[item.id]));
    if (!Number.isFinite(val) || val < 0) { showToast('กรอกตัวเลขให้ถูกต้อง'); return; }
    try {
      const updated = await api.updateServiceRate(item.id, { rate: val });
      setRates((prev) => prev.map((r) => (r.id === item.id ? updated : r)));
      setEdited((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
      showToast('บันทึกแล้ว');
    } catch (e) { showToast('บันทึกไม่สำเร็จ'); }
  };

  const addRate = async (g) => {
    const k = groupKey(g);
    const f = addForm[k] || {};
    const speed = Math.round(Number(f.speed));
    const rate = Math.round(Number(f.rate));
    if (!Number.isFinite(speed) || speed <= 0 || !Number.isFinite(rate) || rate < 0) {
      showToast('กรอกความเร็วและอัตราให้ถูกต้อง'); return;
    }
    try {
      await api.createServiceRate({ service: g.service, kind: g.kind, speed, rate });
      setAddForm((prev) => ({ ...prev, [k]: { speed: '', rate: '' } }));
      showToast('เพิ่มอัตราแล้ว');
      load();
    } catch (e) { showToast('เพิ่มไม่สำเร็จ'); }
  };

  const doDelete = async (item) => {
    try {
      await api.deleteServiceRate(item.id);
      setRates((prev) => prev.filter((r) => r.id !== item.id));
      showToast('ลบแล้ว');
    } catch (e) { showToast('ลบไม่สำเร็จ'); }
  };

  return (
    <div className="w-full h-full p-6 min-h-screen">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">{toast}</div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
            <HiCurrencyDollar className="text-white text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">อัตราค่าบริการ (Service Rates)</h1>
            <p className="text-sm text-gray-600">
              เครื่องคำนวณราคาใช้ค่าจากที่นี่ · แก้ตัวเลขแล้วมีผลทันที (ภายใน ~1 นาที) โดยไม่ต้องแก้โค้ด · ราคาปกติ = International + Local Access
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 self-start"
        >
          <HiRefresh className={loading ? 'animate-spin' : ''} /> รีเฟรช
        </button>
      </div>

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

      <div className="space-y-3">
        {GROUPS.map((g) => {
          const k = groupKey(g);
          const rows = byGroup[k] || [];
          const isOpen = !!open[k];
          const af = addForm[k] || { speed: '', rate: '' };
          return (
            <div key={k} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen((prev) => ({ ...prev, [k]: !prev[k] }))}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
              >
                <span className="font-semibold text-gray-800">{g.label} <span className="text-gray-400 font-normal">({rows.length} รายการ)</span></span>
                {isOpen ? <HiChevronUp className="w-5 h-5 text-gray-500" /> : <HiChevronDown className="w-5 h-5 text-gray-500" />}
              </button>
              {isOpen && (
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {rows.map((item) => {
                      const changed = edited[item.id] !== undefined && String(edited[item.id]) !== String(item.rate);
                      return (
                        <div key={item.id} className="flex items-center gap-2 border border-gray-100 rounded-lg px-2.5 py-1.5">
                          <span className="text-base text-gray-600 w-24 shrink-0">{fmt(item.speed)} Mbps</span>
                          <span className="text-gray-400">→</span>
                          <input
                            type="number"
                            value={edited[item.id] !== undefined ? edited[item.id] : item.rate}
                            onChange={(e) => setEdited((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-28 border border-gray-300 rounded-lg px-2 py-1 text-base focus:outline-none focus:ring-2 focus:ring-gray-300"
                          />
                          <span className="text-sm text-gray-400">บาท</span>
                          <div className="ml-auto flex items-center gap-1">
                            {changed && (
                              <button onClick={() => saveRate(item)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="บันทึก">
                                <HiCheck className="w-5 h-5" />
                              </button>
                            )}
                            <button onClick={() => setConfirmDelete(item)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="ลบ">
                              <HiTrash className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
                    <div>
                      <label className="block text-sm text-gray-500 mb-1">ความเร็ว (Mbps)</label>
                      <input
                        type="number"
                        value={af.speed}
                        onChange={(e) => setAddForm((prev) => ({ ...prev, [k]: { ...af, speed: e.target.value } }))}
                        placeholder="เช่น 800"
                        className="w-32 border border-gray-300 rounded-lg px-2.5 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500 mb-1">อัตรา (บาท/เดือน)</label>
                      <input
                        type="number"
                        value={af.rate}
                        onChange={(e) => setAddForm((prev) => ({ ...prev, [k]: { ...af, rate: e.target.value } }))}
                        placeholder="เช่น 92500"
                        className="w-36 border border-gray-300 rounded-lg px-2.5 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                    </div>
                    <button onClick={() => addRate(g)} className="inline-flex items-center gap-1.5 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800">
                      <HiPlus className="w-4 h-4" /> เพิ่ม/แก้ความเร็วนี้
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">ลบอัตรานี้?</h3>
            <p className="text-sm text-gray-600 mb-5">ความเร็ว {fmt(confirmDelete.speed)} Mbps ({confirmDelete.rate} บาท)</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">ยกเลิก</button>
              <button onClick={() => { const it = confirmDelete; setConfirmDelete(null); doDelete(it); }} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700">ลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServiceRates;
