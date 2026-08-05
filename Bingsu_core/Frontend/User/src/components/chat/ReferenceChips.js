import { HiOutlineCollection } from 'react-icons/hi';

// แหล่งอ้างอิง — ชิปเลขกำกับใต้คำตอบ เลขตรงกับ [n] ในเนื้อความ
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
            ? 'เนื้อหาส่วนตัว'
            : pos?.lineHint || (Number.isFinite(pos?.page) ? `หน้า ${pos.page}` : '');
          return (
            <button
              key={`${ref.docId || 'ref'}-${i}`}
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                onOpenReference(ref);
              }}
              className='inline-flex items-center gap-1.5 max-w-[260px] rounded-full border border-gray-200 bg-white pl-1 pr-2.5 py-[3px] text-xs text-gray-700 shadow-sm hover:border-amber-300 hover:bg-amber-50/70 transition-colors'
              title={`เปิดแหล่งที่มา: ${ref.displayName}${pageLabel ? ` (${pageLabel})` : ''}`}
            >
              <span className='inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-[10px] font-semibold text-gray-900 flex-shrink-0'>
                {i + 1}
              </span>
              <span className='truncate min-w-0'>{ref.displayName}</span>
              {pageLabel && (
                <span className='text-[11px] text-gray-500 flex-shrink-0'>{pageLabel}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ReferenceChips;
