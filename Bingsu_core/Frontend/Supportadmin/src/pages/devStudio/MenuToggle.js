export default function MenuToggle({ enabled, onChange, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      title={title || (enabled ? 'เปิดอยู่ — คลิกเพื่อปิด' : 'ปิดอยู่ — คลิกเพื่อเปิด')}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        enabled ? 'bg-emerald-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
