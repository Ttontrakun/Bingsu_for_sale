import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiRefresh, HiUserGroup, HiChevronDown, HiChevronUp, HiPlus, HiPencil, HiTrash } from 'react-icons/hi';
import { api } from '../services/api';

const emptyForm = (overrides = {}) => ({
  businessGroup: '',
  serviceGroup: '',
  serviceKey: '',
  superPmName: '',
  superPmTitle: '',
  superPmAbbr: '',
  pmName: '',
  pmTitle: '',
  pmAbbr: '',
  ...overrides,
});

/** รายชื่อ Super PM / Product Manager — ดูเป็นตารางสะอาด, เพิ่ม/แก้ใน popup */
export function ProductManagersPanel({ showHeader = true }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({});
  const [formModal, setFormModal] = useState(null); // { mode: 'add'|'edit', form, id? }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };
  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C200]/focus:border-[#F5C200]';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getProductManagers();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setError('โหลดรายชื่อ Super PM / PM ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((r) => {
      const blob = [
        r.businessGroup, r.serviceGroup, r.serviceKey,
        r.superPmName, r.superPmTitle, r.superPmAbbr,
        r.pmName, r.pmTitle, r.pmAbbr,
      ].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(needle);
    });
  }, [items, q]);

  const byBiz = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const k = r.businessGroup || 'อื่นๆ';
      if (!map[k]) map[k] = [];
      map[k].push(r);
    });
    Object.values(map).forEach((rows) => rows.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
    return map;
  }, [filtered]);

  const businessGroups = useMemo(() => {
    const set = new Set(items.map((r) => r.businessGroup).filter(Boolean));
    return [...set].sort();
  }, [items]);

  useEffect(() => {
    if (!q.trim()) return;
    const next = {};
    Object.keys(byBiz).forEach((k) => { next[k] = true; });
    setOpen((prev) => ({ ...prev, ...next }));
  }, [q, byBiz]);

  const openAdd = (businessGroup = '') => {
    setFormModal({
      mode: 'add',
      form: emptyForm({ businessGroup }),
    });
  };

  const openEdit = (row) => {
    setFormModal({
      mode: 'edit',
      id: row.id,
      form: emptyForm({
        businessGroup: row.businessGroup || '',
        serviceGroup: row.serviceGroup || '',
        serviceKey: row.serviceKey || '',
        superPmName: row.superPmName || '',
        superPmTitle: row.superPmTitle || '',
        superPmAbbr: row.superPmAbbr || '',
        pmName: row.pmName || '',
        pmTitle: row.pmTitle || '',
        pmAbbr: row.pmAbbr || '',
      }),
    });
  };

  const setFormField = (field, value) => {
    setFormModal((prev) => prev ? { ...prev, form: { ...prev.form, [field]: value } } : prev);
  };

  const saveForm = async () => {
    if (!formModal) return;
    const f = formModal.form;
    const businessGroup = String(f.businessGroup || '').trim();
    const serviceGroup = String(f.serviceGroup || '').trim();
    if (!businessGroup || !serviceGroup) {
      showToast('กรอกกลุ่มธุรกิจและกลุ่มบริการ');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        businessGroup,
        serviceGroup,
        serviceKey: f.serviceKey || null,
        superPmName: f.superPmName || null,
        superPmTitle: f.superPmTitle || null,
        superPmAbbr: f.superPmAbbr || null,
        pmName: f.pmName || null,
        pmTitle: f.pmTitle || null,
        pmAbbr: f.pmAbbr || null,
      };
      if (formModal.mode === 'edit') {
        const updated = await api.updateProductManager(formModal.id, payload);
        setItems((prev) => prev.map((r) => (r.id === formModal.id ? updated : r)));
        showToast('บันทึกแล้ว');
      } else {
        const nextOrder = items
          .filter((r) => r.businessGroup === businessGroup)
          .reduce((m, r) => Math.max(m, r.sortOrder || 0), 0) + 10;
        await api.createProductManager({ ...payload, sortOrder: nextOrder, active: true });
        showToast('เพิ่มรายชื่อแล้ว');
        await load();
        setOpen((prev) => ({ ...prev, [businessGroup]: true }));
      }
      setFormModal(null);
    } catch {
      showToast(formModal.mode === 'edit' ? 'บันทึกไม่สำเร็จ' : 'เพิ่มไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (item) => {
    try {
      await api.deleteProductManager(item.id);
      setItems((prev) => prev.filter((r) => r.id !== item.id));
      setConfirmDelete(null);
      showToast('ลบแล้ว');
    } catch {
      showToast('ลบไม่สำเร็จ');
    }
  };

  return (
    <div className={showHeader ? 'w-full h-full p-6 min-h-screen' : 'w-full'}>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">{toast}</div>
      )}

      {showHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
              <HiUserGroup className="text-white text-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Super PM / Product Manager</h1>
              <p className="text-sm text-gray-600">ดูเป็นตาราง · กดแก้ไข/เพิ่มเพื่อเปิดฟอร์ม</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button
              type="button"
              onClick={() => openAdd()}
              className="inline-flex items-center gap-1 bg-[#F5C200] text-gray-900 px-3 py-2 rounded-lg text-sm font-medium hover:bg-yellow-400"
            >
              <HiPlus /> เพิ่มรายชื่อ
            </button>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700"
            >
              <HiRefresh className={loading ? 'animate-spin' : ''} /> รีเฟรช
            </button>
          </div>
        </div>
      )}

      {!showHeader && (
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-sm text-gray-600">
            {items.length} รายการ · ดูเป็นตาราง · กดแก้ไขเพื่อเปิดฟอร์ม
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา..."
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40"
            />
            <button
              type="button"
              onClick={() => openAdd()}
              className="inline-flex items-center gap-1 bg-[#F5C200] text-gray-900 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-yellow-400"
            >
              <HiPlus /> เพิ่ม
            </button>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 bg-gray-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-700"
            >
              <HiRefresh className={loading ? 'animate-spin' : ''} /> รีเฟรช
            </button>
          </div>
        </div>
      )}

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

      {Object.keys(byBiz).length === 0 && !loading && (
        <div className="text-sm text-gray-500 py-8 text-center">ไม่พบรายการ — กด “เพิ่ม” เพื่อเริ่ม</div>
      )}

      <div className="space-y-3">
        {Object.entries(byBiz).map(([biz, rows]) => {
          const isOpen = !!open[biz];
          return (
            <div key={biz} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen((prev) => ({ ...prev, [biz]: !prev[biz] }))}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
              >
                <span className="font-semibold text-gray-800">
                  {biz}{' '}
                  <span className="text-gray-400 font-normal">({rows.length} รายการ)</span>
                </span>
                {isOpen
                  ? <HiChevronUp className="w-5 h-5 text-gray-500 shrink-0" />
                  : <HiChevronDown className="w-5 h-5 text-gray-500 shrink-0" />}
              </button>
              {isOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] table-fixed text-sm">
                    <colgroup>
                      <col className="w-[26%]" />
                      <col className="w-[24%]" />
                      <col className="w-[9%]" />
                      <col className="w-[22%]" />
                      <col className="w-[9%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead className="bg-white border-b border-gray-200 text-left text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2">กลุ่มบริการ</th>
                        <th className="px-3 py-2">Super Product Manager</th>
                        <th className="px-3 py-2">ย่อ</th>
                        <th className="px-3 py-2">Product Manager</th>
                        <th className="px-3 py-2">ย่อ</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-b border-gray-100 align-top hover:bg-gray-50/60">
                          <td className="px-3 py-2.5">
                            <div className="text-gray-800 break-words">{r.serviceGroup}</div>
                            {r.serviceKey && <div className="text-xs text-gray-400 mt-0.5">{r.serviceKey}</div>}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-gray-900 break-words">{r.superPmName || '-'}</div>
                            <div className="text-xs text-gray-500 break-words">{r.superPmTitle || ''}</div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.superPmAbbr || '-'}</td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-gray-900 break-words">{r.pmName || '-'}</div>
                            <div className="text-xs text-gray-500 break-words">{r.pmTitle || ''}</div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.pmAbbr || '-'}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEdit(r)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-700 bg-gray-100 hover:bg-gray-200"
                                title="แก้ไข"
                              >
                                <HiPencil /> แก้
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(r)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-700 bg-red-50 hover:bg-red-100"
                                title="ลบ"
                              >
                                <HiTrash />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => openAdd(biz)}
                      className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
                    >
                      <HiPlus className="w-4 h-4" /> เพิ่มในกลุ่มนี้
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {formModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setFormModal(null)}>
          <div
            className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl">
              <div className="text-lg font-semibold text-gray-900">
                {formModal.mode === 'edit' ? 'แก้ไขรายชื่อ' : 'เพิ่มรายชื่อ'}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">Super Product Manager / Product Manager</p>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* บริการ */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">บริการ</h3>
                <div>
                  <label className={labelCls}>กลุ่มธุรกิจ</label>
                  <input
                    className={inputCls}
                    list="pm-biz-groups"
                    value={formModal.form.businessGroup}
                    onChange={(e) => setFormField('businessGroup', e.target.value)}
                    placeholder="เช่น 1. Hard Infrastructure"
                  />
                  <datalist id="pm-biz-groups">
                    {businessGroups.map((g) => <option key={g} value={g} />)}
                  </datalist>
                </div>
                <div>
                  <label className={labelCls}>กลุ่มบริการ</label>
                  <input
                    className={inputCls}
                    value={formModal.form.serviceGroup}
                    onChange={(e) => setFormField('serviceGroup', e.target.value)}
                    placeholder="เช่น กลุ่มบริการ Dark Fiber"
                  />
                </div>
                <div className="max-w-xs">
                  <label className={labelCls}>รหัสบริการ <span className="font-normal text-gray-400">(ถ้ามี)</span></label>
                  <input
                    className={inputCls}
                    value={formModal.form.serviceKey}
                    onChange={(e) => setFormField('serviceKey', e.target.value)}
                    placeholder="dark_fiber"
                  />
                </div>
              </section>

              {/* Super PM */}
              <section className="rounded-xl bg-amber-50/70 border border-amber-100 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-amber-900">Super Product Manager</h3>
                <div>
                  <label className={labelCls}>ชื่อ</label>
                  <input className={inputCls} value={formModal.form.superPmName} onChange={(e) => setFormField('superPmName', e.target.value)} placeholder="นาย..." />
                </div>
                <div>
                  <label className={labelCls}>ตำแหน่ง</label>
                  <input className={inputCls} value={formModal.form.superPmTitle} onChange={(e) => setFormField('superPmTitle', e.target.value)} placeholder="ผู้ช่วยกรรมการผู้จัดการใหญ่..." />
                </div>
                <div className="max-w-[10rem]">
                  <label className={labelCls}>ย่อ</label>
                  <input className={inputCls} value={formModal.form.superPmAbbr} onChange={(e) => setFormField('superPmAbbr', e.target.value)} placeholder="ชจญ.สส." />
                </div>
              </section>

              {/* PM */}
              <section className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">Product Manager</h3>
                <div>
                  <label className={labelCls}>ชื่อ</label>
                  <input className={inputCls} value={formModal.form.pmName} onChange={(e) => setFormField('pmName', e.target.value)} placeholder="นาย..." />
                </div>
                <div>
                  <label className={labelCls}>ตำแหน่ง</label>
                  <input className={inputCls} value={formModal.form.pmTitle} onChange={(e) => setFormField('pmTitle', e.target.value)} placeholder="ผู้จัดการฝ่าย..." />
                </div>
                <div className="max-w-[10rem]">
                  <label className={labelCls}>ย่อ</label>
                  <input className={inputCls} value={formModal.form.pmAbbr} onChange={(e) => setFormField('pmAbbr', e.target.value)} placeholder="ผจก.ญสส." />
                </div>
              </section>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-2 rounded-b-2xl">
              <button type="button" onClick={() => setFormModal(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50" disabled={saving}>
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={saveForm}
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="font-semibold text-gray-900">ลบรายชื่อนี้?</div>
            <p className="text-sm text-gray-600">
              {confirmDelete.serviceGroup}
              {(confirmDelete.pmName || confirmDelete.superPmName)
                ? ` · ${confirmDelete.pmName || confirmDelete.superPmName}`
                : ''}
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

export default ProductManagersPanel;
