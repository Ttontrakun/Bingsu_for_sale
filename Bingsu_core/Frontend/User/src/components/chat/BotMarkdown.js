import { memo, Fragment, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ตัวเรนเดอร์ Markdown ของบอท — แยกออกมาและหุ้ม memo เพื่อไม่ให้ re-render
// ตาม state อื่น ๆ ของหน้าแชท (โหลด quota ทุก 12 วิ, hover, scroll ฯลฯ)
// เพราะการ re-render ReactMarkdown ระหว่างลากเมาส์จะทำให้ selection หลุด
// ต้องกดค้างตลอด — memo ช่วยให้ DOM คงเดิม เลือก/คัดลอกได้เหมือนข้อความผู้ใช้
//
// ไม่ใช้ rehype-raw (XSS) — เลขอ้างอิง + ไฮไลต์ข้อมูลส่วนตัวเรนเดอร์เป็น React nodes

const BOT_MARKDOWN_COMPONENTS = {
  h1: ({ node, children, ...props }) => <h1 className='text-lg font-semibold mt-3 mb-2 text-gray-900' {...props}>{children}</h1>,
  h2: ({ node, children, ...props }) => <h2 className='text-base font-semibold mt-3 mb-2 text-gray-900' {...props}>{children}</h2>,
  h3: ({ node, children, ...props }) => <h3 className='text-[15px] font-semibold mt-2.5 mb-1.5 text-gray-900' {...props}>{children}</h3>,
  table: ({ node, ...props }) => (
    <div className='my-2 overflow-x-auto rounded-lg border border-gray-200'>
      <table className='w-auto min-w-full table-auto border-collapse text-sm' {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className='bg-gray-100' {...props} />,
  th: ({ node, ...props }) => (
    <th
      className='border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700 align-top whitespace-normal break-words'
      style={{ minWidth: '7rem', maxWidth: '22rem' }}
      {...props}
    />
  ),
  td: ({ node, ...props }) => (
    <td
      className='border border-gray-200 px-3 py-2 text-gray-800 align-top whitespace-pre-wrap break-words'
      style={{ minWidth: '7rem', maxWidth: '22rem' }}
      {...props}
    />
  ),
  tr: ({ node, ...props }) => <tr className='border-b border-gray-200' {...props} />,
  p: ({ node, ...props }) => <p className='whitespace-pre-wrap my-2 text-[15px] leading-7' {...props} />,
  strong: ({ node, ...props }) => <strong className='font-semibold' {...props} />,
  ul: ({ node, ...props }) => <ul className='list-disc list-inside my-2 space-y-1' {...props} />,
  ol: ({ node, ...props }) => <ol className='list-decimal list-inside my-2 space-y-1 pl-4' {...props} />,
  li: ({ node, children, ...props }) => {
    const hasBlockquote = Array.isArray(node?.children) && node.children.some((c) => c && c.tagName === 'blockquote');
    return <li className={`${hasBlockquote ? 'list-none ml-0 pl-0' : 'ml-1 pl-1'} leading-7`} {...props}>{children}</li>;
  },
  blockquote: ({ node, ...props }) => (
    <blockquote className='border-l-4 border-yellow-300 bg-yellow-50/60 rounded-r-md px-3 py-2 my-2 text-gray-700' {...props} />
  ),
  code: ({ inline, children, ...props }) =>
    inline ? (
      <code className='px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 text-[13px]' {...props}>
        {children}
      </code>
    ) : (
      <code className='block rounded-lg bg-gray-900 text-gray-100 p-3 text-[13px] leading-6 overflow-x-auto' {...props}>
        {children}
      </code>
    ),
};

const CiteBadge = ({ n, isPrivate = false }) => (
  <sup
    className={`inline-flex items-center justify-center align-super mx-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full text-[10px] font-semibold leading-none select-none ${
      isPrivate
        ? 'bg-violet-500 text-white'
        : 'bg-amber-400 text-gray-900'
    }`}
    title={isPrivate ? `อ้างอิงจากข้อมูลส่วนตัว [${n}]` : `อ้างอิงจากเอกสาร [${n}]`}
  >
    {n}
  </sup>
);

const PrivateHighlight = ({ children }) => (
  <mark
    className='bg-violet-100 text-gray-900 font-semibold rounded px-1 py-0.5 box-decoration-clone'
    title='จากข้อมูลส่วนตัวของคุณ'
  >
    {children}
  </mark>
);

/** แยก ==ข้อความจากข้อมูลส่วนตัว== ภายในชิ้น Markdown */
const splitPrivateMarkParts = (text) => {
  const raw = String(text || '');
  if (!raw.includes('==')) return [{ type: 'md', text: raw }];
  const parts = [];
  const re = /==([\s\S]+?)==/g;
  let last = 0;
  let m;
  while ((m = re.exec(raw))) {
    if (m.index > last) parts.push({ type: 'md', text: raw.slice(last, m.index) });
    const inner = String(m[1] || '').trim();
    if (inner) parts.push({ type: 'private', text: inner });
    last = m.index + m[0].length;
  }
  if (last < raw.length) parts.push({ type: 'md', text: raw.slice(last) });
  return parts.length ? parts : [{ type: 'md', text: raw }];
};

/** แยกเลขอ้างอิง [n] / 【n】 และไฮไลต์ประโยคก่อน cite ส่วนตัวถ้ายังไม่มี == */
const splitCitationParts = (text, citationCount, privateCiteSet) => {
  const raw = String(text || '');
  if (!Number.isFinite(citationCount) || citationCount <= 0) {
    return splitPrivateMarkParts(raw);
  }
  const parts = [];
  const re = /(?:【(\d{1,2})】|\[(\d{1,2})\])(?!\()/g;
  let last = 0;
  let m;
  while ((m = re.exec(raw))) {
    const n = Number(m[1] || m[2]);
    if (n >= 1 && n <= citationCount) {
      let before = raw.slice(last, m.index);
      const isPrivateCite = privateCiteSet.has(n);
      // ถ้า cite เป็นส่วนตัวและข้อความก่อนหน้ายังไม่มี == ให้ไฮไลต์บรรทัดท้าย
      if (isPrivateCite && before && !before.includes('==')) {
        const trimmedEnd = before.replace(/\s+$/, '');
        const ws = before.slice(trimmedEnd.length);
        const nl = trimmedEnd.lastIndexOf('\n');
        const head = nl >= 0 ? trimmedEnd.slice(0, nl + 1) : '';
        const tail = nl >= 0 ? trimmedEnd.slice(nl + 1) : trimmedEnd;
        if (head) parts.push(...splitPrivateMarkParts(head));
        if (tail.trim()) parts.push({ type: 'private', text: tail.trim() });
        if (ws) parts.push({ type: 'md', text: ws });
      } else if (before) {
        parts.push(...splitPrivateMarkParts(before));
      }
      parts.push({ type: 'cite', n, isPrivate: isPrivateCite });
      last = m.index + m[0].length;
    }
  }
  if (last < raw.length) parts.push(...splitPrivateMarkParts(raw.slice(last)));
  return parts.length ? parts : splitPrivateMarkParts(raw);
};

const MdChunk = ({ text }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={BOT_MARKDOWN_COMPONENTS}>
    {text}
  </ReactMarkdown>
);

const BotMarkdown = memo(function BotMarkdown({ text, citationCount = 0, references = null }) {
  const privateCiteSet = useMemo(() => {
    const s = new Set();
    if (!Array.isArray(references)) return s;
    references.forEach((ref, i) => {
      if (String(ref?.docId) === '__private__') s.add(i + 1);
    });
    return s;
  }, [references]);

  const parts = splitCitationParts(text, citationCount, privateCiteSet);
  const hasPrivateVisual = parts.some((p) => p.type === 'private' || p.isPrivate);

  return (
    <div className='gemini-markdown max-w-full min-w-0 overflow-x-auto select-text [&_*]:select-text [&_ol_li>p]:inline [&_ol_li>p]:my-0 [&_ul_li>p]:inline [&_ul_li>p]:my-0'>
      {hasPrivateVisual && (
        <p className='mb-2 text-[11px] text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-2 py-1 inline-flex items-center gap-1.5'>
          <span className='inline-block w-2 h-2 rounded-sm bg-violet-400' aria-hidden />
          ข้อความไฮไลต์ / เลขม่วง = จากข้อมูลส่วนตัว · เลขส้ม = จากเอกสารระบบ
        </p>
      )}
      {parts.map((part, i) => {
        if (part.type === 'cite') {
          return <CiteBadge key={`c-${i}-${part.n}`} n={part.n} isPrivate={Boolean(part.isPrivate)} />;
        }
        if (part.type === 'private' && part.text) {
          return (
            <PrivateHighlight key={`p-${i}`}>
              <span className='[&_p]:my-0 [&_p]:inline'>
                <MdChunk text={part.text} />
              </span>
            </PrivateHighlight>
          );
        }
        if (part.text) {
          return (
            <Fragment key={`m-${i}`}>
              <MdChunk text={part.text} />
            </Fragment>
          );
        }
        return null;
      })}
    </div>
  );
});

export default BotMarkdown;
