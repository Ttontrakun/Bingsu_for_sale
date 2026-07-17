import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { HiRefresh, HiPlus, HiTrash, HiPencil, HiCheck, HiX, HiTranslate } from 'react-icons/hi';
import { api } from '../services/api';

const fmtDate = (v) => {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(v);
  }
};

const joinSyn = (arr) => (Array.isArray(arr) ? arr.join(', ') : '');

function Synonyms({ userRole }) {
  const canView = userRole === 'admin';
  const canEdit = userRole === 'admin';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  // ฟอร์มเพิ่มใหม่
  const [term, setTerm] = useState('');
  const [synonyms, setSynonyms] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // แก้ไขแถว
  const [editId, setEditId] = useState(null);
  const [editTerm, setEditTerm] = useState('');
  const [editSyn, setEditSyn] = useState('');
  const [editNote, setEditNote] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getSynonyms();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError('โหลดรายการไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => { load(); }, [load]);

  if (!canView) return <Navigate to="/knowledge" replace />;

  const handleCreate = async () => {
    if (!term.trim() || !synonyms.trim()) {
      showToast('กรอกคำในเอกสาร และคำที่คนพิมพ์อย่างน้อย 1 คำ');
      return;
    }
    setSaving(true);
    try {
      await api.createSynonym({ term: term.trim(), synonyms, note });
      setTerm(''); setSynonyms(''); setNote('');
      showToast('เพิ่มคำพ้องแล้ว');
      load();
    } catch (e) {
      showToast('เพิ่มไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (it) => {
    setEditId(it.id);
    setEditTerm(it.term || '');
    setEditSyn(joinSyn(it.synonyms));
    setEditNote(it.note || '');
  };
  const cancelEdit = () => { setEditId(null); };

  const saveEdit = async (id) => {
    try {
      await api.updateSynonym(id, { term: editTerm.trim(), synonyms: editSyn, note: editNote });
      setEditId(null);
      showToast('บันทึกแล้ว');
      load();
    } catch (e) {
      showToast('บันทึกไม่สำเร็จ');
    }
  };

  const toggleEnabled = (it) => {
    const next = !it.enabled;
    setConfirmDialog({
      title: next ? 'เปิดใช้งานคำนี้?' : 'ปิดใช้งานคำนี้?',
      message: `คำ “${it.term}” จะถูก${next ? 'เปิด' : 'ปิด'}ใช้งาน`,
      confirmLabel: next ? 'เปิดใช้งาน' : 'ปิดใช้งาน',
      onConfirm: async () => {
        try {
          await api.updateSynonym(it.id, { enabled: next });
          showToast(next ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว');
          load();
        } catch (e) {
          showToast('อัปเดตไม่สำเร็จ');
        }
      },
    });
  };

  const remove = (it) => {
    setConfirmDialog({
      title: 'ลบคำนี้?',
      message: `ต้องการลบคำ “${it.term}” ออกจากระบบ`,
      confirmLabel: 'ลบ',
      danger: true,
      onConfirm: async () => {
        try {
          await api.deleteSynonym(it.id);
          showToast('ลบแล้ว');
          load();
        } catch (e) {
          showToast('ลบไม่สำเร็จ');
        }
      },
    });
  };

  return (
    <div className="w-full h-full p-6 min-h-screen">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
            <HiTranslate className="text-white text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">คำพ้องความหมาย (Synonyms)</h1>
            <p className="text-sm text-gray-600">
              จับคู่ “คำที่คนพิมพ์” (ภาษาพูด) กับ “คำในเอกสาร” ช่วยให้บอทเจอคำตอบแม้ผู้ใช้ใช้ภาษาพูด · มีผลทั้งระบบ (อัปเดต ~1 นาที)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700"
          >
            <HiRefresh className={loading ? 'animate-spin' : ''} />
            รีเฟรช
          </button>
        </div>
      </div>

      {canEdit && (
        <div className="border border-gray-200 rounded-xl p-4 mb-6 bg-gray-50/60">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">คำในเอกสาร (คำทางการ)</label>
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="เช่น เกินอัตรา floor price"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">คำที่คนพิมพ์ (ภาษาพูด) — ใส่หลายคำได้ คั่นด้วย ,</label>
              <input
                value={synonyms}
                onChange={(e) => setSynonyms(e.target.value)}
                placeholder="เช่น ต่ำกว่า floor, หลุด floor, ต่ำกว่าราคาขั้นต่ำ"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
          </div>
          <div className="mt-3 flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-600 mb-1">หมายเหตุ (ไม่บังคับ)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="อธิบายสั้นๆ ว่าใช้กับเรื่องอะไร"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="inline-flex items-center gap-1.5 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              <HiPlus className="w-4 h-4" /> เพิ่ม
            </button>
          </div>
        </div>
      )}

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      {loading && <div className="text-sm text-gray-500">กำลังโหลด...</div>}

      {!loading && items.length === 0 && (
        <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-xl p-8 text-center">
          ยังไม่มีคำพ้อง — เพิ่มคำแรกได้จากฟอร์มด้านบน
        </div>
      )}

      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="border border-gray-200 rounded-xl p-3">
            {editId === it.id ? (
              <div className="space-y-2">
                <input value={editTerm} onChange={(e) => setEditTerm(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" placeholder="คำในเอกสาร (คำทางการ)" />
                <input value={editSyn} onChange={(e) => setEditSyn(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" placeholder="คำที่คนพิมพ์ (ภาษาพูด) คั่นด้วย ," />
                <input value={editNote} onChange={(e) => setEditNote(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" placeholder="หมายเหตุ" />
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(it.id)} className="inline-flex items-center gap-1 text-sm bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800">
                    <HiCheck className="w-4 h-4" /> บันทึก
                  </button>
                  <button onClick={cancelEdit} className="inline-flex items-center gap-1 text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                    <HiX className="w-4 h-4" /> ยกเลิก
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(it.synonyms || []).map((s, i) => (
                      <span key={i} className="text-sm bg-amber-50 text-amber-800 px-2 py-1 rounded-full">{s}</span>
                    ))}
                    <span className="text-gray-400">→</span>
                    <span className="font-semibold text-gray-900">{it.term}</span>
                    <span className="text-xs text-gray-400">(ในเอกสาร)</span>
                    {!it.enabled && <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">ปิดใช้งาน</span>}
                  </div>
                  {it.note && <div className="text-xs text-gray-500 mt-1">{it.note}</div>}
                  <div className="text-xs text-gray-400 mt-1">แก้ไขล่าสุด {fmtDate(it.updatedAt)}</div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleEnabled(it)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${it.enabled ? 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'border-gray-200 text-gray-500 bg-gray-50 hover:bg-gray-100'}`}
                      title={it.enabled ? 'กดเพื่อปิดใช้งาน' : 'กดเพื่อเปิดใช้งาน'}
                    >
                      {it.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}
                    </button>
                    <button
                      onClick={() => startEdit(it)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                      title="แก้ไข"
                    >
                      <HiPencil className="w-5 h-5" /> แก้ไข
                    </button>
                    <button
                      onClick={() => remove(it)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:text-red-700 hover:bg-red-50 transition-colors"
                      title="ลบ"
                    >
                      <HiTrash className="w-5 h-5" /> ลบ
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {confirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">{confirmDialog.title}</h3>
            <p className="text-sm text-gray-600 mb-5">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); if (fn) fn(); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${confirmDialog.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-800'}`}
              >
                {confirmDialog.confirmLabel || 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Synonyms;
