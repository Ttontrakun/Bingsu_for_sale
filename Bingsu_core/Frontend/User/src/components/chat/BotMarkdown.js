import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

// ตัวเรนเดอร์ Markdown ของบอท — แยกออกมาและหุ้ม memo เพื่อไม่ให้ re-render
// ตาม state อื่น ๆ ของหน้าแชท (โหลด quota ทุก 12 วิ, hover, scroll ฯลฯ)
// เพราะการ re-render ReactMarkdown ระหว่างลากเมาส์จะทำให้ selection หลุด
// ต้องกดค้างตลอด — memo ช่วยให้ DOM คงเดิม เลือก/คัดลอกได้เหมือนข้อความผู้ใช้
const BOT_MARKDOWN_COMPONENTS = {
  h1: ({ node, children, ...props }) => <h1 className='text-lg font-semibold mt-3 mb-2 text-gray-900' {...props}>{children}</h1>,
  h2: ({ node, children, ...props }) => <h2 className='text-base font-semibold mt-3 mb-2 text-gray-900' {...props}>{children}</h2>,
  h3: ({ node, children, ...props }) => <h3 className='text-[15px] font-semibold mt-2.5 mb-1.5 text-gray-900' {...props}>{children}</h3>,
  // ตารางกว้างเกินกรอบแชทได้ แล้วเลื่อนแนวนอนแทนการบีบทุกช่องจนข้อความตกบรรทัด
  table: ({ node, ...props }) => (
    <div className='my-2 overflow-x-auto rounded-lg border border-gray-200'>
      <table className='w-auto min-w-full table-auto border-collapse text-sm' {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className='bg-gray-100' {...props} />,
  // min/max ต่อช่อง: ช่องสั้นไม่ถูกบีบ ช่องยาวตัดบรรทัดที่ความกว้างที่ยังอ่านสบาย
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
    // ถ้า list item มี blockquote อยู่ข้างใน (เกิดจาก AI เขียน "- > ...") → ซ่อนจุด bullet ที่ว่าง แต่เก็บกล่องเหลืองไว้
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
  // เลขอ้างอิงในเนื้อความ — <sup data-cite="n"> จาก applyCitationMarkup แสดงเป็นวงกลมเหลืองเล็ก ๆ
  sup: ({ node, children, ...props }) => {
    const cite = props['data-cite'] ?? props.dataCite;
    if (cite === undefined) return <sup {...props}>{children}</sup>;
    return (
      <sup
        className='inline-flex items-center justify-center align-super mx-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-amber-400 text-[10px] font-semibold leading-none text-gray-900 select-none'
        title={`อ้างอิงแหล่งที่ ${cite}`}
      >
        {children}
      </sup>
    );
  },
};

// เปลี่ยนเลขอ้างอิง [n] ที่โมเดลใส่ท้ายประโยค เป็นแท็ก <sup> เพื่อเรนเดอร์เป็นเลขยกกำลังวงกลมเหลือง
// แปลงเฉพาะเลขที่มีแหล่งอ้างอิงจริง (n <= citationCount) — ที่เหลือคงข้อความเดิมไว้
const applyCitationMarkup = (text, citationCount) => {
  if (!Number.isFinite(citationCount) || citationCount <= 0) return text;
  return String(text)
    .replace(/【(\d{1,2})】/g, '[$1]')
    .replace(/\[(\d{1,2})\](?!\()/g, (match, num) => {
      const n = Number(num);
      if (n < 1 || n > citationCount) return match;
      return `<sup data-cite="${n}">${n}</sup>`;
    });
};

const BotMarkdown = memo(function BotMarkdown({ text, citationCount = 0 }) {
  return (
    <div className='gemini-markdown max-w-full min-w-0 overflow-x-auto select-text [&_*]:select-text [&_ol_li>p]:inline [&_ol_li>p]:my-0 [&_ul_li>p]:inline [&_ul_li>p]:my-0'>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={BOT_MARKDOWN_COMPONENTS}
      >
        {applyCitationMarkup(text, citationCount)}
      </ReactMarkdown>
    </div>
  );
});

export default BotMarkdown;
