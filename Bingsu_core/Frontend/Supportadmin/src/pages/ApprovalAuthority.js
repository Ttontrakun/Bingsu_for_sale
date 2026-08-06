import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { HiRefresh, HiPlus, HiTrash, HiCheck, HiBadgeCheck } from 'react-icons/hi';
import { api } from '../services/api';

const CONDITION_OPTIONS = [
  { value: 'pct_le_50', label: 'ไม่เกิน 50% Price List' },
  { value: 'pct_gt_50_floor', label: 'เกิน 50% ถึง Floor' },
  { value: 'over_floor', label: 'เกิน Floor Price' },
  { value: 'pct_range', label: 'ช่วง % ทั่วไป' },
  { value: 'other', label: 'อื่นๆ' },
];

const emptyForm = () => ({
  serviceKey: 'dark_fiber',
  serviceName: 'NT Dark Fiber',
  conditionKey: 'pct_range',
  conditionLabel: '',
  minPct: '',
  maxPct: '',
  approverAbbr: '',
  approverFull: '',
  note: '',
  sortOrder: '10',
  active: true,
});

/** ตารางอำนาจอนุมัติ — ใช้ทั้งหน้าเดี่ยวและแท็บใน System */
export function ApprovalAuthorityPanel({ showHeader = true }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [edited, setEdited] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await api.getApprovalAuthorityRules();
      setItems(Array.isArray(data) ? data : []);
      setEdited({});
    } catch (e) {
      setError('โหลดตารางอำนาจไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byService = useMemo(() => {
    const map = {};
    items.forEach((r) => {
      const k = r.serviceKey || 'other';
      if (!map[k]) map[k] = { name: r.serviceName || k, rows: [] };
      map[k].rows.push(r);
    });
    Object.values(map).forEach((g) => g.rows.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
    return map;
  }, [items]);

  const patchField = (id, field, value) => {
    setEdited((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }));
  };

  const draft = (item, field) => {
    if (edited[item.id] && Object.prototype.hasOwnProperty.call(edited[item.id], field)) {
      return edited[item.id][field];
    }
    return item[field] ?? '';
  };

  const saveItem = async (item) => {
    const d = edited[item.id] || {};
    const payload = {};
    ['serviceName', 'conditionKey', 'conditionLabel', 'approverAbbr', 'approverFull', 'note'].forEach((k) => {
      if (d[k] !== undefined) payload[k] = d[k];
    });
    if (d.minPct !== undefined) payload.minPct = d.minPct === '' ? null : Number(d.minPct);
    if (d.maxPct !== undefined) payload.maxPct = d.maxPct === '' ? null : Number(d.maxPct);
    if (d.sortOrder !== undefined) payload.sortOrder = Math.round(Number(d.sortOrder));
    if (d.active !== undefined) payload.active = !!d.active;
    if (Object.keys(payload).length === 0) { showToast('ไม่มีค่าที่แก้'); return; }
    try {
      const updated = await api.updateApprovalAuthorityRule(item.id, payload);
      setItems((prev) => prev.map((r) => (r.id === item.id ? updated : r)));
      setEdited((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
      showToast('บันทึกแล้ว');
    } catch (e) { showToast('บันทึกไม่สำเร็จ'); }
  };

  const addItem = async () => {
    const f = addForm;
    const serviceKey = String(f.serviceKey || '').trim();
    const serviceName = String(f.serviceName || '').trim();
    const conditionKey = String(f.conditionKey || '').trim();
    const approverAbbr = String(f.approverAbbr || '').trim();
    if (!serviceKey || !serviceName || !conditionKey || !approverAbbr) {
      showToast('กรอก serviceKey / ชื่อบริการ / เงื่อนไข / ผู้อนุมัติ');
      return;
    }
    try {
      await api.createApprovalAuthorityRule({
        serviceKey,
        serviceName,
        conditionKey,
        conditionLabel: f.conditionLabel || null,
        minPct: f.minPct === '' ? null : Number(f.minPct),
        maxPct: f.maxPct === '' ? null : Number(f.maxPct),
        approverAbbr,
        approverFull: f.approverFull || null,
        note: f.note || null,
        sortOrder: Math.round(Number(f.sortOrder || 0)),
        active: f.active !== false,
      });
      setAddForm(emptyForm());
      setShowAdd(false);
      showToast('เพิ่มกฎแล้ว');
      load();
    } catch (e) { showToast('เพิ่มไม่สำเร็จ'); }
  };

  const doDelete = async (item) => {
    try {
      await api.deleteApprovalAuthorityRule(item.id);
      setItems((prev) => prev.filter((r) => r.id !== item.id));
      setConfirmDelete(null);
      showToast('ลบแล้ว');
    } catch (e) { showToast('ลบไม่สำเร็จ'); }
  };

  const inputCls = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm';

  return (
    <div className={showHeader ? 'w-full h-full p-6 min-h-screen' : 'w-full'}>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">{toast}</div>
      )}

      {showHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
              <HiBadgeCheck className="text-white text-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">ตารางอำนาจอนุมัติ</h1>
              <p className="text-sm text-gray-600">
                Chat ใช้ค่าจากที่นี่ก่อน RAG · แก้แล้วมีผลภายใน ~1 นาที โดยไม่ต้องแก้โค้ด
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
      )}

      {!showHeader && (
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-sm text-gray-600">
            Chat lookup อำนาจอนุมัติจากตารางนี้ · แก้แล้วมีผลภายใน ~1 นาที
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="inline-flex items-center gap-1 bg-[#F5C200] text-gray-900 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-yellow-400"
            >
              <HiPlus /> เพิ่มกฎ
            </button>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 bg-gray-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-700"
            >
              <HiRefresh className={loading ? 'animate-spin' : ''} /> รีเฟรช
            </button>
          </div>
        </div>
      )}

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

      {showAdd && (
        <div className="mb-6 border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
          <div className="text-sm font-semibold text-gray-800">เพิ่มกฎอำนาจอนุมัติ</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="text-xs text-gray-600">serviceKey
              <input className={inputCls} value={addForm.serviceKey} onChange={(e) => setAddForm((p) => ({ ...p, serviceKey: e.target.value }))} placeholder="dark_fiber" />
            </label>
            <label className="text-xs text-gray-600">ชื่อบริการ
              <input className={inputCls} value={addForm.serviceName} onChange={(e) => setAddForm((p) => ({ ...p, serviceName: e.target.value }))} />
            </label>
            <label className="text-xs text-gray-600">conditionKey
              <select className={inputCls} value={addForm.conditionKey} onChange={(e) => setAddForm((p) => ({ ...p, conditionKey: e.target.value }))}>
                {CONDITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-600">คำอธิบายเงื่อนไข
              <input className={inputCls} value={addForm.conditionLabel} onChange={(e) => setAddForm((p) => ({ ...p, conditionLabel: e.target.value }))} />
            </label>
            <label className="text-xs text-gray-600">minPct
              <input className={inputCls} value={addForm.minPct} onChange={(e) => setAddForm((p) => ({ ...p, minPct: e.target.value }))} placeholder="ว่าง = ไม่จำกัด" />
            </label>
            <label className="text-xs text-gray-600">maxPct
              <input className={inputCls} value={addForm.maxPct} onChange={(e) => setAddForm((p) => ({ ...p, maxPct: e.target.value }))} placeholder="ว่าง = ไม่จำกัด" />
            </label>
            <label className="text-xs text-gray-600">ผู้อนุมัติ (ย่อ)
              <input className={inputCls} value={addForm.approverAbbr} onChange={(e) => setAddForm((p) => ({ ...p, approverAbbr: e.target.value }))} placeholder="รจญ." />
            </label>
            <label className="text-xs text-gray-600">ชื่อเต็ม
              <input className={inputCls} value={addForm.approverFull} onChange={(e) => setAddForm((p) => ({ ...p, approverFull: e.target.value }))} />
            </label>
            <label className="text-xs text-gray-600">ลำดับ
              <input className={inputCls} value={addForm.sortOrder} onChange={(e) => setAddForm((p) => ({ ...p, sortOrder: e.target.value }))} />
            </label>
            <label className="text-xs text-gray-600 sm:col-span-2 lg:col-span-3">หมายเหตุ
              <input className={inputCls} value={addForm.note} onChange={(e) => setAddForm((p) => ({ ...p, note: e.target.value }))} />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={addItem} className="inline-flex items-center gap-1 bg-gray-900 text-white px-3 py-1.5 rounded-lg text-sm">
              <HiCheck /> บันทึก
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setAddForm(emptyForm()); }} className="px-3 py-1.5 rounded-lg text-sm border border-gray-300">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {Object.keys(byService).length === 0 && !loading && (
        <div className="text-sm text-gray-500 py-8 text-center">ยังไม่มีกฎอำนาจอนุมัติ</div>
      )}

      <div className="space-y-6">
        {Object.entries(byService).map(([key, group]) => (
          <div key={key} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-800">
              {group.name} <span className="font-normal text-gray-500">({key})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white border-b border-gray-200 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2">เงื่อนไข</th>
                    <th className="px-3 py-2 w-20">min%</th>
                    <th className="px-3 py-2 w-20">max%</th>
                    <th className="px-3 py-2">ผู้อนุมัติ</th>
                    <th className="px-3 py-2">หมายเหตุ</th>
                    <th className="px-3 py-2 w-16">ลำดับ</th>
                    <th className="px-3 py-2 w-16">ใช้</th>
                    <th className="px-3 py-2 w-28" />
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((item) => {
                    const dirty = Boolean(edited[item.id] && Object.keys(edited[item.id]).length);
                    return (
                      <tr key={item.id} className="border-b border-gray-100 align-top">
                        <td className="px-3 py-2 space-y-1">
                          <select
                            className={inputCls}
                            value={draft(item, 'conditionKey')}
                            onChange={(e) => patchField(item.id, 'conditionKey', e.target.value)}
                          >
                            {CONDITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <input
                            className={inputCls}
                            value={draft(item, 'conditionLabel') ?? ''}
                            onChange={(e) => patchField(item.id, 'conditionLabel', e.target.value)}
                            placeholder="คำอธิบายเงื่อนไข"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={inputCls}
                            value={draft(item, 'minPct') ?? ''}
                            onChange={(e) => patchField(item.id, 'minPct', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={inputCls}
                            value={draft(item, 'maxPct') ?? ''}
                            onChange={(e) => patchField(item.id, 'maxPct', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2 space-y-1">
                          <input
                            className={inputCls}
                            value={draft(item, 'approverAbbr') ?? ''}
                            onChange={(e) => patchField(item.id, 'approverAbbr', e.target.value)}
                          />
                          <input
                            className={inputCls}
                            value={draft(item, 'approverFull') ?? ''}
                            onChange={(e) => patchField(item.id, 'approverFull', e.target.value)}
                            placeholder="ชื่อเต็ม"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <textarea
                            className={`${inputCls} min-h-[60px]`}
                            value={draft(item, 'note') ?? ''}
                            onChange={(e) => patchField(item.id, 'note', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={inputCls}
                            value={draft(item, 'sortOrder') ?? ''}
                            onChange={(e) => patchField(item.id, 'sortOrder', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={draft(item, 'active') !== false && draft(item, 'active') !== 'false'}
                            onChange={(e) => patchField(item.id, 'active', e.target.checked)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              disabled={!dirty}
                              onClick={() => saveItem(item)}
                              className={`inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-xs ${dirty ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-400'}`}
                            >
                              <HiCheck /> บันทึก
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(item)}
                              className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-xs text-red-700 bg-red-50 hover:bg-red-100"
                            >
                              <HiTrash /> ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="font-semibold text-gray-900">ลบกฎนี้?</div>
            <p className="text-sm text-gray-600">
              {confirmDelete.serviceName} · {confirmDelete.conditionLabel || confirmDelete.conditionKey} → {confirmDelete.approverAbbr}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded-lg border text-sm">ยกเลิก</button>
              <button type="button" onClick={() => doDelete(confirmDelete)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm">ลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalAuthority({ userRole }) {
  if (userRole !== 'admin') return <Navigate to="/system" replace />;
  return <ApprovalAuthorityPanel showHeader />;
}

export default ApprovalAuthority;
