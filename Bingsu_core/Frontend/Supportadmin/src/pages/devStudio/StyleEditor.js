export default function StyleEditor({ value, onChange }) {
  const style = value || {};
  const set = (patch) => onChange({ ...style, ...patch });

  return (
    <div className="space-y-2.5 pt-2 border-t border-gray-100">
      <p className="text-[11px] font-bold text-gray-700">รูปแบบข้อความ</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-gray-500 space-y-1">
          <span className="font-bold text-gray-700">สีตัวอักษร</span>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={style.color || '#1f2937'}
              onChange={(e) => set({ color: e.target.value })}
              className="h-8 w-9 rounded border border-gray-200 cursor-pointer"
            />
            <button type="button" className="text-[10px] text-gray-400" onClick={() => set({ color: '' })}>
              ล้าง
            </button>
          </div>
        </label>
        <label className="text-[11px] text-gray-500 space-y-1">
          <span className="font-bold text-gray-700">พื้นหลัง</span>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={style.backgroundColor || '#ffffff'}
              onChange={(e) => set({ backgroundColor: e.target.value })}
              className="h-8 w-9 rounded border border-gray-200 cursor-pointer"
            />
            <button type="button" className="text-[10px] text-gray-400" onClick={() => set({ backgroundColor: '' })}>
              ล้าง
            </button>
          </div>
        </label>
      </div>
      <label className="block text-[11px] text-gray-500 space-y-1">
        <span className="font-bold text-gray-700">ขนาดตัวอักษร (px)</span>
        <input
          type="number"
          min={10}
          max={72}
          value={style.fontSize || ''}
          placeholder="ค่าเริ่มต้น"
          onChange={(e) => {
            const n = Number(e.target.value);
            set({ fontSize: e.target.value === '' || !Number.isFinite(n) ? undefined : n });
          }}
          className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5"
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => set({ bold: !style.bold })}
          className={`px-2.5 py-1 rounded-md text-sm border font-bold ${
            style.bold ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'
          }`}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => set({ italic: !style.italic })}
          className={`px-2.5 py-1 rounded-md text-sm border italic ${
            style.italic ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'
          }`}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => set({ underline: !style.underline })}
          className={`px-2.5 py-1 rounded-md text-sm border underline ${
            style.underline ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'
          }`}
        >
          U
        </button>
        <button
          type="button"
          onClick={() => onChange({})}
          className="px-2 py-1 rounded-md text-[11px] border border-gray-200 text-gray-500"
        >
          รีเซ็ต
        </button>
      </div>
    </div>
  );
}
