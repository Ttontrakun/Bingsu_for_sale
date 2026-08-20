import { memo, Fragment, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ตัวเรนเดอร์ Markdown ของบอท — แยกออกมาและหุ้ม memo เพื่อไม่ให้ re-render
// ตาม state อื่น ๆ ของหน้าแชท (โหลด quota ทุก 12 วิ, hover, scroll ฯลฯ)
// เพราะการ re-render ReactMarkdown ระหว่างลากเมาส์จะทำให้ selection หลุด
// ต้องกดค้างตลอด — memo ช่วยให้ DOM คงเดิม เลือก/คัดลอกได้เหมือนข้อความผู้ใช้
//
// ไม่ใช้ rehype-raw (XSS) — ไฮไลต์ข้อมูลส่วนตัวเรนเดอร์เป็น React nodes
// เลขอ้างอิง [n] ตัดทิ้ง (แหล่งที่มาอยู่ที่การ์ดใต้คำตอบ)

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

const PrivateHighlight = ({ children }) => (
  <mark
    className='bg-violet-200 text-violet-950 font-semibold rounded px-1 py-0.5 box-decoration-clone border border-violet-300/80'
    title='จากข้อมูลส่วนตัวของคุณ'
  >
    {children}
  </mark>
);

/** ตัดเลขอ้างอิง [n] / 【n】 และแปลงเศษ LaTeX ให้เป็นข้อความอ่านง่าย */
const stripCitationMarkers = (text) =>
  String(text || '')
    .replace(/【\d{1,2}】/g, '')
    .replace(/\[(\d{1,2})\](?!\()/g, '')
    .replace(/[ \t]{2,}/g, ' ');

const latexInnerToPlain = (inner) => {
  let t = String(inner || '');
  t = t.replace(/\\text\s*\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\mathrm\s*\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\mathbf\s*\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
  t = t.replace(/\\times/g, '×');
  t = t.replace(/\\cdot/g, '·');
  t = t.replace(/\\div/g, '÷');
  t = t.replace(/\\approx/g, '≈');
  t = t.replace(/\\%/g, '%');
  t = t.replace(/\\,/g, ' ');
  t = t.replace(/\\;/g, ' ');
  t = t.replace(/\\quad/g, ' ');
  t = t.replace(/~/g, ' ');
  t = t.replace(/\\\\/g, '\n');
  t = t.replace(/\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\([a-zA-Z]+)/g, '');
  return t.replace(/[ \t]{2,}/g, ' ').trim();
};

const stripLatexToPlainText = (text) => {
  let s = String(text || '');
  if (!s || !/\\[a-zA-Z]|\$\$|\\\[|\\\(/.test(s)) return s;
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => latexInnerToPlain(inner));
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => latexInnerToPlain(inner));
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => latexInnerToPlain(inner));
  s = s.replace(/\$([^$\n]+)\$/g, (_, inner) => latexInnerToPlain(inner));
  s = s.replace(/\[\s*((?:[^\]]|\\\])*\\(?:text|times|frac|cdot)[\s\S]*?)\]/g, (_, inner) => latexInnerToPlain(inner));
  if (/\\[a-zA-Z]/.test(s)) s = latexInnerToPlain(s);
  return s;
};

const sanitizeBotDisplayText = (text) => stripLatexToPlainText(stripCitationMarkers(text));

/** แยก ==ข้อความจากข้อมูลส่วนตัว== ภายในชิ้น Markdown */
const splitPrivateMarkParts = (text) => {
  const raw = sanitizeBotDisplayText(text);
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

const MdChunk = ({ text }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={BOT_MARKDOWN_COMPONENTS}>
    {text}
  </ReactMarkdown>
);

const BotMarkdown = memo(function BotMarkdown({ text, citationCount = 0, references = null }) {
  void citationCount;
  void references;

  const parts = useMemo(() => splitPrivateMarkParts(text), [text]);

  return (
    <div className='gemini-markdown max-w-full min-w-0 overflow-x-auto select-text [&_*]:select-text [&_ol_li>p]:inline [&_ol_li>p]:my-0 [&_ul_li>p]:inline [&_ul_li>p]:my-0'>
      {parts.map((part, i) => {
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
