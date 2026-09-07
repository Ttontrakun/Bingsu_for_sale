import { useState } from 'react';
import {
  HiPlus,
  HiSearch,
  HiChat,
  HiLockClosed,
  HiDesktopComputer,
  HiBookOpen,
  HiChevronDown,
  HiX,
  HiOutlineMail,
  HiOutlineEyeOff,
  HiOutlineUser,
  HiOutlinePaperAirplane,
  HiArrowLeft,
  HiCheck,
} from 'react-icons/hi';
import ntLogo from '../../assets/images/nt-logo-on-yellow.png';
import { MOCK_CHATS, resolveAssetUrl, applyAppNameTemplate } from './helpers';
import EditableText from './EditableText';

function PreviewSidebar({ branding, menus, pageId, searchOpen, onMenuClick }) {
  const logo = resolveAssetUrl(branding?.logoUrl);
  const appName = branding?.appName || 'Enterprise AI Chatbot';
  const nameParts = String(appName).trim().split(/\s+/);
  const line1 = nameParts.slice(0, Math.ceil(nameParts.length / 2)).join(' ');
  const line2 = nameParts.slice(Math.ceil(nameParts.length / 2)).join(' ');
  const enabled = (id) => (menus || []).find((m) => m.id === id)?.enabled !== false;
  const privateOn = pageId === 'private';

  const NavBtn = ({ id, icon: Icon, label, active, children }) => {
    if (!enabled(id)) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMenuClick(id);
        }}
        className={`w-full py-2 px-2.5 flex items-center justify-start gap-2 rounded-lg transition-colors text-sm font-medium ${
          active ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        <Icon className={`text-lg shrink-0 ${id === 'private' && privateOn ? 'text-green-600' : ''}`} />
        <span className="whitespace-nowrap">{label}</span>
        {children}
      </button>
    );
  };

  return (
    <aside className="w-60 shrink-0 bg-white border-r border-gray-200 px-6 py-6 flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-6 pb-6 border-b border-gray-200">
        <img src={logo} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
        <span className="text-orange-500 font-bold text-lg leading-tight">
          <span className="block">{line1}</span>
          {line2 ? <span className="block">{line2}</span> : null}
        </span>
      </div>

      <nav className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex flex-col gap-3 shrink-0">
          <NavBtn id="home" icon={HiPlus} label="New Chat" active={pageId === 'homepage' && !searchOpen} />
          <NavBtn id="history" icon={HiSearch} label="Chats" active={searchOpen} />
          <NavBtn id="private" icon={HiLockClosed} label="Personal" active={privateOn && !searchOpen} />
          <NavBtn id="createBot" icon={HiDesktopComputer} label="Bots" active={pageId === 'bots'} />
          <NavBtn id="uploadDocs" icon={HiBookOpen} label="Knowledge" active={pageId === 'knowledge'} />
        </div>

        {enabled('history') && (
          <>
            <div className="border-t border-gray-100 mt-1 mb-1 shrink-0" />
            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <div className="flex items-center gap-1.5 pl-2 text-xs font-medium text-gray-400 shrink-0">
                <HiChat className="text-sm" />
                <span>Chat History</span>
              </div>
              <div className="space-y-0.5 overflow-auto min-h-0">
                {MOCK_CHATS.map((c) => (
                  <div
                    key={c.id}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-gray-700"
                  >
                    {c.private ? (
                      <HiLockClosed className="text-base text-green-600 shrink-0" />
                    ) : (
                      <HiChat className="text-base text-gray-400 shrink-0" />
                    )}
                    <span className="truncate">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </nav>
    </aside>
  );
}

function SearchPreviewModal({ open, onClose, copy, styles, selectedKey, onSelect }) {
  if (!open) return null;
  const title = copy?.['user.search.title'] || 'แชททั้งหมด';
  return (
    <div
      className="absolute inset-0 z-20 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="bg-[#faf9f5] rounded-2xl shadow-2xl border border-gray-200 w-[min(94%,860px)] h-[min(88%,720px)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="ค้นหาแชท"
      >
        <div className="px-8 pt-6 pb-3 flex items-start justify-between gap-4 shrink-0">
          <EditableText
            editKey="user.search.title"
            value={title}
            textStyle={styles?.['user.search.title']}
            selectedKey={selectedKey}
            onSelect={onSelect}
            as="h2"
            className="text-2xl font-semibold text-gray-900"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-full border border-gray-300 bg-white text-gray-700 inline-flex items-center gap-1"
            >
              กรอง: ทั้งหมด <HiChevronDown />
            </button>
            <button type="button" className="px-3.5 py-1.5 text-sm font-medium rounded-full bg-gray-900 text-white">
              แชทใหม่
            </button>
            <button type="button" onClick={onClose} className="p-1.5 rounded-full text-gray-500 hover:bg-gray-200">
              <HiX className="text-lg" />
            </button>
          </div>
        </div>
        <div className="px-8 pb-3 shrink-0">
          <div className="relative">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
            <div className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-gray-300 bg-white text-gray-400">
              ค้นหาแชท...
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
          {MOCK_CHATS.map((chat) => (
            <div
              key={chat.id}
              className="w-full px-4 py-3 flex items-center gap-3 rounded-xl border-b border-gray-200/70 last:border-b-0"
            >
              {chat.private ? (
                <HiLockClosed className="text-base text-green-600 shrink-0" />
              ) : (
                <HiChat className="text-base text-gray-400 shrink-0" />
              )}
              <span className="flex-1 min-w-0 truncate text-sm text-gray-800">{chat.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{chat.updatedAt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UserLoginPreview({ copy, styles, branding, selectedKey, onSelect, onGoVerify }) {
  const [isSignIn, setIsSignIn] = useState(true);
  const logo = resolveAssetUrl(branding?.logoUrl);
  const title = copy?.['user.login.title'] || branding?.appName || 'Enterprise AI Chatbot';

  return (
    <div className="relative min-h-[640px] rounded-2xl overflow-hidden border border-gray-200 flex flex-col bg-[#D9D9D9]">
      <header className="relative z-10 flex h-[55px] shrink-0 items-center bg-[#FFD100] px-4 shadow-sm">
        <img src={ntLogo} alt="nt" className="h-9 w-auto max-w-[240px] object-contain object-left" />
      </header>
      <div className="relative flex flex-1 items-center justify-center px-4 py-8">
        <div
          className="relative w-full max-w-[500px] rounded-[1.75rem] bg-white p-8 md:p-9 m-4"
          style={{
            border: '4px solid rgba(252,186,3,0.95)',
            boxShadow: '0 0 20px rgba(252,186,3,0.3), 0 10px 30px rgba(0,0,0,0.08)',
          }}
        >
          <div className="absolute top-0 left-0 right-0 flex items-end bg-gray-200 rounded-tl-[28px] rounded-tr-[28px] z-20">
            <button
              type="button"
              onClick={() => setIsSignIn(true)}
              className={`text-sm font-medium py-2.5 flex-1 flex items-center justify-center transition ${
                isSignIn
                  ? 'bg-white text-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.1)] relative z-10 rounded-tl-[48px] rounded-br-[70px]'
                  : 'text-zinc-500 relative z-0 hover:text-zinc-600 rounded-tl-[48px] rounded-tr-[48px] rounded-br-[16px]'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setIsSignIn(false)}
              className={`text-sm font-medium py-2.5 flex-1 flex items-center justify-center transition ${
                !isSignIn
                  ? 'bg-white text-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.1)] relative z-10 rounded-bl-[70px] rounded-tr-[48px]'
                  : 'text-zinc-500 relative z-0 hover:text-zinc-600 rounded-tl-[48px] rounded-tr-[48px] rounded-br-[16px]'
              }`}
              style={{ marginLeft: '-8px' }}
            >
              Register
            </button>
          </div>

          <div className="flex flex-col items-center pt-8">
            <div className="mb-3 h-[72px] w-[72px] flex items-center justify-center rounded-full bg-yellow-100 overflow-hidden">
              <img src={logo} alt="" className="w-full h-full object-cover rounded-full" />
            </div>
            <EditableText
              editKey="user.login.title"
              value={title}
              textStyle={styles?.['user.login.title']}
              selectedKey={selectedKey}
              onSelect={onSelect}
              as="h2"
              className="mb-5 text-2xl font-bold text-zinc-800 drop-shadow-lg"
            />
            <div className="w-full max-w-xs space-y-4">
              {isSignIn ? (
                <>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-2">Email</label>
                    <div className="relative">
                      <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <div className="w-full pl-10 pr-3 py-3 rounded-lg border border-zinc-300 text-sm text-zinc-400">
                        Enter your email
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-2">Password</label>
                    <div className="relative">
                      <HiLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <div className="w-full pl-10 pr-10 py-3 rounded-lg border border-zinc-300 text-sm text-zinc-400">
                        Enter your password
                      </div>
                      <HiOutlineEyeOff className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xl" />
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-zinc-500">Forgot password?</span>
                  </div>
                  <div className="flex justify-center pt-1">
                    <div className="w-36 h-9 rounded-lg bg-yellow-400 text-sm font-medium text-white flex items-center justify-center shadow-md opacity-50">
                      Sign in
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-2">Full Name</label>
                    <div className="relative">
                      <HiOutlineUser className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <div className="w-full pl-10 pr-3 py-3 rounded-lg border border-zinc-300 text-sm text-zinc-400">
                        Enter your full name
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-2">Email</label>
                    <div className="relative">
                      <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <div className="w-full pl-10 pr-3 py-3 rounded-lg border border-zinc-300 text-sm text-zinc-400">
                        Enter your email
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                    <label className="flex items-start gap-2.5">
                      <input type="checkbox" checked readOnly className="mt-0.5 h-4 w-4 rounded border-zinc-300" />
                      <span className="text-xs text-zinc-700 leading-relaxed">
                        ฉันยอมรับนโยบายความเป็นส่วนตัว (Privacy Policy) และเงื่อนไขการใช้งานของระบบ
                      </span>
                    </label>
                  </div>
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => onGoVerify?.()}
                      className="w-36 h-9 rounded-lg bg-yellow-400 text-sm font-medium text-white flex items-center justify-center shadow-md hover:bg-yellow-500"
                    >
                      Sign up
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthShell({ children }) {
  return (
    <div className="relative min-h-[640px] rounded-2xl overflow-hidden border border-gray-200 flex flex-col bg-[#D9D9D9]">
      <header className="relative z-10 flex h-[55px] shrink-0 items-center bg-[#FFD100] px-4 shadow-sm">
        <img src={ntLogo} alt="nt" className="h-9 w-auto max-w-[240px] object-contain object-left" />
      </header>
      <div className="relative flex flex-1 items-center justify-center px-4 py-8">{children}</div>
    </div>
  );
}

function VerifyingPreview({ copy, styles, selectedKey, onSelect, onBackLogin }) {
  return (
    <AuthShell>
      <div
        className="relative w-full max-w-[500px] rounded-[1.75rem] bg-white p-8 md:p-9 m-4"
        style={{
          border: '4px solid rgba(252,186,3,0.95)',
          boxShadow: '0 0 20px rgba(252,186,3,0.3), 0 10px 30px rgba(0,0,0,0.08)',
        }}
      >
        <button
          type="button"
          onClick={onBackLogin}
          className="absolute top-4 left-4 z-20 p-1.5 text-yellow-500 hover:text-yellow-600"
          title="กลับไปหน้าสมัครสมาชิก"
        >
          <HiArrowLeft className="text-xl" />
        </button>
        <button type="button" onClick={onBackLogin} className="absolute top-4 right-4 z-20 p-1.5 text-gray-400">
          <HiX className="text-xl" />
        </button>
        <div className="flex flex-col items-center text-center pt-4 px-2 md:px-6">
          <EditableText
            editKey="user.verify.title"
            value={copy?.['user.verify.title'] || 'ยืนยันอีเมลของคุณ'}
            textStyle={styles?.['user.verify.title']}
            selectedKey={selectedKey}
            onSelect={onSelect}
            as="h1"
            className="text-2xl md:text-[1.65rem] font-bold text-zinc-800 mb-5"
          />
          <EditableText
            editKey="user.verify.body1"
            value={copy?.['user.verify.body1'] || ''}
            textStyle={styles?.['user.verify.body1']}
            selectedKey={selectedKey}
            onSelect={onSelect}
            as="p"
            className="text-sm text-gray-500 leading-relaxed mb-3 max-w-sm"
            multiline
          />
          <EditableText
            editKey="user.verify.body2"
            value={copy?.['user.verify.body2'] || ''}
            textStyle={styles?.['user.verify.body2']}
            selectedKey={selectedKey}
            onSelect={onSelect}
            as="p"
            className="text-sm text-gray-500 leading-relaxed mb-8 max-w-sm"
            multiline
          />
          <div className="relative mb-8">
            <HiOutlineMail className="text-[5.5rem] text-gray-400" />
            <span className="absolute -top-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 shadow-sm">
              <HiCheck className="text-lg text-white" />
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-2">
            ไม่ได้รับอีเมล?{' '}
            <EditableText
              editKey="user.verify.resend"
              value={copy?.['user.verify.resend'] || 'ส่งลิงก์ใหม่'}
              textStyle={styles?.['user.verify.resend']}
              selectedKey={selectedKey}
              onSelect={onSelect}
              as="span"
              className="font-semibold text-[#D4A017]"
            />
          </p>
          <EditableText
            editKey="user.verify.spamHint"
            value={copy?.['user.verify.spamHint'] || ''}
            textStyle={styles?.['user.verify.spamHint']}
            selectedKey={selectedKey}
            onSelect={onSelect}
            as="p"
            className="text-xs text-gray-400 mb-8"
          />
          <div className="w-full border-t border-gray-200 mb-5" />
          <button type="button" onClick={onBackLogin} className="text-sm text-gray-400 hover:text-yellow-600">
            Sign in
          </button>
        </div>
      </div>
    </AuthShell>
  );
}

function EmailVerifyDocPreview({ copy, styles, branding, selectedKey, onSelect }) {
  const appName = branding?.appName || 'Enterprise AI Chatbot';
  const body1 = applyAppNameTemplate(copy?.['user.emailVerify.body1'], appName);
  return (
    <div className="relative min-h-[640px] rounded-2xl overflow-hidden border border-gray-200 bg-[#f8fafc] p-6 flex items-start justify-center">
      <div className="w-full max-w-[560px] bg-white border border-gray-200 rounded-xl p-5 shadow-sm text-sm text-gray-900 leading-relaxed">
        <p className="text-xs text-gray-500 mb-1">โทรคมนาคมแห่งชาติ (จำกัด)</p>
        <p className="text-xs text-gray-500 mb-1">Enterprise AI Chatbot Support</p>
        <p className="text-xs text-gray-500 mb-3">
          เลขอ้างอิง: <strong>REG-PREVIEW</strong>
        </p>
        <EditableText
          editKey="user.emailVerify.subject"
          value={copy?.['user.emailVerify.subject'] || ''}
          textStyle={styles?.['user.emailVerify.subject']}
          selectedKey={selectedKey}
          onSelect={onSelect}
          as="p"
          className="mb-3 font-semibold text-gray-800 border-b border-gray-100 pb-2"
        />
        <p className="mb-3">เรียน คุณผู้ใช้งาน</p>
        <EditableText
          editKey="user.emailVerify.body1"
          value={body1}
          textStyle={styles?.['user.emailVerify.body1']}
          selectedKey={selectedKey}
          onSelect={onSelect}
          as="p"
          className="mb-3"
          multiline
        />
        <EditableText
          editKey="user.emailVerify.body2"
          value={copy?.['user.emailVerify.body2'] || ''}
          textStyle={styles?.['user.emailVerify.body2']}
          selectedKey={selectedKey}
          onSelect={onSelect}
          as="p"
          className="mb-4"
          multiline
        />
        <div className="mb-4">
          <EditableText
            editKey="user.emailVerify.button"
            value={copy?.['user.emailVerify.button'] || 'ยืนยันอีเมล'}
            textStyle={styles?.['user.emailVerify.button']}
            selectedKey={selectedKey}
            onSelect={onSelect}
            as="span"
            className="inline-block bg-amber-400 text-gray-900 font-bold px-4 py-2.5 rounded-lg text-sm"
          />
        </div>
        <p className="text-xs text-gray-500 mb-1">หากปุ่มไม่ทำงาน กรุณาคัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์:</p>
        <p className="text-xs text-sky-700 break-all mb-3">https://example.com/verifying?token=••••••••</p>
        <EditableText
          editKey="user.emailVerify.ignore"
          value={copy?.['user.emailVerify.ignore'] || ''}
          textStyle={styles?.['user.emailVerify.ignore']}
          selectedKey={selectedKey}
          onSelect={onSelect}
          as="p"
          className="text-xs text-gray-500 mb-1"
        />
        <p className="text-xs text-gray-500 mb-3">อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติ กรุณาอย่าตอบกลับ (Do not reply)</p>
        <p className="text-xs text-gray-500">
          ขอแสดงความนับถือ
          <br />
          Enterprise AI Chatbot Support
        </p>
      </div>
    </div>
  );
}

function ComposerPreview({
  placeholder,
  placeholderStyle,
  placeholderKey,
  privateMode,
  selectedKey,
  onSelect,
}) {
  return (
    <div className="w-full max-w-4xl flex justify-center">
      <div className="w-full">
        <div className="flex items-center gap-2 border-4 border-yellow-400 rounded-3xl px-4 sm:px-6 py-4 bg-white shadow-lg w-full">
          {privateMode && (
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-gray-50 text-gray-600 shrink-0">
              <HiPlus className="text-lg" />
            </div>
          )}
          <EditableText
            editKey={placeholderKey}
            value={placeholder || ''}
            textStyle={placeholderStyle}
            selectedKey={selectedKey}
            onSelect={onSelect}
            as="span"
            className="flex-1 text-base text-gray-400 min-h-[1.5rem]"
          />
          <HiOutlinePaperAirplane className="text-xl text-gray-300 transform rotate-90 shrink-0" />
        </div>
      </div>
    </div>
  );
}

function HomeMainPreview({ copy, styles, branding, privateMode, selectedKey, onSelect }) {
  const logo = resolveAssetUrl(branding?.logoUrl);
  const title = copy?.['user.homepage.title'] || `Welcome to ${branding?.appName || 'App'}`;
  const description = copy?.['user.homepage.description'] || '';
  const placeholder = privateMode
    ? copy?.['user.private.placeholder'] || ''
    : copy?.['user.homepage.placeholder'] || '';
  const placeholderKey = privateMode ? 'user.private.placeholder' : 'user.homepage.placeholder';

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 overflow-auto">
      <img src={logo} alt="" className="w-28 h-28 object-cover mb-4" />
      {privateMode ? (
        <EditableText
          editKey="user.private.title"
          value={copy?.['user.private.title'] || 'Personal — ถามจากเนื้อหาของคุณเอง'}
          textStyle={styles?.['user.private.title']}
          selectedKey={selectedKey}
          onSelect={onSelect}
          as="h1"
          className="text-gray-800 text-2xl font-bold text-center mb-3 max-w-3xl"
        />
      ) : (
        <EditableText
          editKey="user.homepage.title"
          value={title}
          textStyle={styles?.['user.homepage.title']}
          selectedKey={selectedKey}
          onSelect={onSelect}
          as="h1"
          className="text-gray-800 text-2xl font-bold text-center mb-3 max-w-3xl"
        />
      )}
      {!privateMode && (
        <EditableText
          editKey="user.homepage.description"
          value={description}
          textStyle={styles?.['user.homepage.description']}
          selectedKey={selectedKey}
          onSelect={onSelect}
          as="p"
          className="text-gray-600 text-center max-w-2xl leading-relaxed mb-10"
          multiline
        />
      )}
      {privateMode && (
        <div className="w-full max-w-4xl mb-4">
          <div className="px-4 py-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white text-left">
            <EditableText
              editKey="user.private.bannerTitle"
              value={copy?.['user.private.bannerTitle'] || 'Personal'}
              textStyle={styles?.['user.private.bannerTitle']}
              selectedKey={selectedKey}
              onSelect={onSelect}
              as="p"
              className="text-sm font-semibold text-gray-900"
            />
            <EditableText
              editKey="user.private.bannerBody"
              value={copy?.['user.private.bannerBody'] || ''}
              textStyle={styles?.['user.private.bannerBody']}
              selectedKey={selectedKey}
              onSelect={onSelect}
              as="p"
              className="text-xs text-gray-600 mt-1 leading-relaxed"
              multiline
            />
            <div className="mt-2 space-y-1.5 text-xs text-gray-700">
              <p className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  /จำ
                </span>
                <span>บอกข้อมูลที่ต้องการให้ระบบจำไว้ใช้ตอบ</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  /สั่ง
                </span>
                <span>บอกว่าระบบควรตอบแบบไหน เช่น ตอบสั้น เป็นข้อๆ</span>
              </p>
            </div>
            <p className="text-[11px] text-amber-800/80 mt-2">ยังไม่มีข้อมูลส่วนตัว — เริ่มด้วย /จำ หรือ /สั่ง</p>
          </div>
        </div>
      )}
      <ComposerPreview
        placeholder={placeholder}
        placeholderStyle={styles?.[placeholderKey]}
        placeholderKey={placeholderKey}
        privateMode={privateMode}
        selectedKey={selectedKey}
        onSelect={onSelect}
      />
    </div>
  );
}

function BotsMainPreview({ copy, styles, selectedKey, onSelect }) {
  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
            <HiDesktopComputer className="text-white text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              <EditableText
                editKey="user.bots.title"
                value={copy?.['user.bots.title'] || 'Bots'}
                textStyle={styles?.['user.bots.title']}
                selectedKey={selectedKey}
                onSelect={onSelect}
                as="span"
              />{' '}
              <span className="text-gray-600 font-normal">1</span>
            </h1>
            <EditableText
              editKey="user.bots.subtitle"
              value={copy?.['user.bots.subtitle'] || ''}
              textStyle={styles?.['user.bots.subtitle']}
              selectedKey={selectedKey}
              onSelect={onSelect}
              as="p"
              className="text-sm text-gray-600"
            />
          </div>
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-400 text-gray-800 font-semibold rounded-lg shadow-sm text-sm self-start">
          <HiPlus className="text-lg" />
          สร้างบอท
        </div>
      </div>
      <div className="relative max-w-md mb-6">
        <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl" />
        <div className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-gray-400 text-sm">
          Search Bots
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-blue-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-gray-800 truncate">บอทของฉัน</h3>
              <p className="text-xs text-gray-400 mt-0.5">ของฉัน</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 line-clamp-2 mb-4 min-h-[2.5rem]">ตัวอย่าง preview</p>
          <div className="flex items-center gap-2 mt-auto">
            <div className="px-4 py-2 bg-yellow-400 text-gray-800 font-medium rounded-lg text-sm">รายละเอียด</div>
            <div className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm">ลบ</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KnowledgeMainPreview({ copy, styles, selectedKey, onSelect }) {
  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
            <HiBookOpen className="text-white text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              <EditableText
                editKey="user.knowledge.title"
                value={copy?.['user.knowledge.title'] || 'Knowledge'}
                textStyle={styles?.['user.knowledge.title']}
                selectedKey={selectedKey}
                onSelect={onSelect}
                as="span"
              />{' '}
              <span className="text-gray-600 font-normal">1</span>
            </h1>
            <EditableText
              editKey="user.knowledge.subtitle"
              value={copy?.['user.knowledge.subtitle'] || ''}
              textStyle={styles?.['user.knowledge.subtitle']}
              selectedKey={selectedKey}
              onSelect={onSelect}
              as="p"
              className="text-sm text-gray-600"
            />
          </div>
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-400 text-gray-800 font-semibold rounded-lg shadow-sm text-sm self-start">
          <HiPlus className="text-lg" />
          สร้าง Knowledge
        </div>
      </div>
      <div className="relative max-w-md mb-6">
        <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl" />
        <div className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-gray-400 text-sm">
          Search Knowledge
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-base font-semibold text-gray-800">เอกสารตัวอย่าง</p>
          <p className="text-xs text-gray-400 mt-1">ของฉัน</p>
          <div className="flex items-center gap-2 mt-4">
            <div className="px-4 py-2 bg-yellow-400 text-gray-800 font-medium rounded-lg text-sm">รายละเอียด</div>
            <div className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm">ลบ</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShellPreview({
  pageId,
  copy,
  styles,
  branding,
  menus,
  onMenuClick,
  searchOpen,
  onCloseSearch,
  selectedKey,
  onSelect,
}) {
  const main = (() => {
    if (pageId === 'private') {
      return (
        <HomeMainPreview
          copy={copy}
          styles={styles}
          branding={branding}
          privateMode
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      );
    }
    if (pageId === 'bots') {
      return (
        <BotsMainPreview copy={copy} styles={styles} selectedKey={selectedKey} onSelect={onSelect} />
      );
    }
    if (pageId === 'knowledge') {
      return (
        <KnowledgeMainPreview
          copy={copy}
          styles={styles}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      );
    }
    return (
      <HomeMainPreview
        copy={copy}
        styles={styles}
        branding={branding}
        privateMode={false}
        selectedKey={selectedKey}
        onSelect={onSelect}
      />
    );
  })();

  return (
    <div className="relative h-full min-h-[640px] bg-white rounded-2xl overflow-hidden border border-gray-200 flex">
      <PreviewSidebar
        branding={branding}
        menus={menus}
        pageId={pageId}
        searchOpen={searchOpen}
        onMenuClick={onMenuClick}
      />
      <div className="flex-1 min-w-0 flex flex-col relative bg-white">{main}</div>
      <SearchPreviewModal
        open={searchOpen}
        onClose={onCloseSearch}
        copy={copy}
        styles={styles}
        selectedKey={selectedKey}
        onSelect={onSelect}
      />
    </div>
  );
}

export { UserLoginPreview, VerifyingPreview, EmailVerifyDocPreview, ShellPreview };
