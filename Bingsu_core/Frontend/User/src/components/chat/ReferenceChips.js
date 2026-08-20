import { HiOutlineCollection, HiLockClosed, HiDocumentText } from 'react-icons/hi';

// แหล่งอ้างอิงใต้คำตอบ — แสดงชื่อเอกสาร (ไม่มีเลขกำกับในเนื้อความ)
const ReferenceChips = ({ references, onOpenReference }) => {
  if (!Array.isArray(references) || references.length === 0) return null;
  return (
    <div className='mt-2 w-full min-w-0'>
      <p className='flex items-center gap-1.5 text-[11px] font-medium text-gray-500 mb-1.5'>
        <HiOutlineCollection className='text-sm' aria-hidden />
        แหล่งอ้างอิง
      </p>
      <div className='flex flex-wrap gap-1.5'>
        {references.map((ref, i) => {
          const isPrivateRef = String(ref.docId) === '__private__';
          const pos = Array.isArray(ref.positions) ? ref.positions[0] : null;
          const pageLabel = isPrivateRef
            ? 'ข้อมูลส่วนตัว'
            : pos?.lineHint || (Number.isFinite(pos?.page) ? `หน้า ${pos.page}` : '');
          return (
            <button
              key={`${ref.docId || 'ref'}-${i}`}
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                onOpenReference(ref);
              }}
              className={`inline-flex items-center gap-1.5 max-w-[280px] rounded-full border pl-2 pr-2.5 py-[4px] text-xs shadow-sm transition-colors ${
                isPrivateRef
                  ? 'border-violet-300 bg-violet-50 text-violet-900 hover:border-violet-400 hover:bg-violet-100 font-semibold'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-amber-300 hover:bg-amber-50/70'
              }`}
              title={`เปิดแหล่งที่มา: ${ref.displayName}${pageLabel ? ` (${pageLabel})` : ''}`}
            >
              {isPrivateRef ? (
                <HiLockClosed className='text-sm text-violet-600 flex-shrink-0' aria-hidden />
              ) : (
                <HiDocumentText className='text-sm text-amber-600 flex-shrink-0' aria-hidden />
              )}
              <span className='truncate min-w-0'>{ref.displayName}</span>
              {pageLabel && (
                <span className={`text-[11px] flex-shrink-0 ${isPrivateRef ? 'text-violet-700' : 'text-gray-500'}`}>{pageLabel}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ReferenceChips;
