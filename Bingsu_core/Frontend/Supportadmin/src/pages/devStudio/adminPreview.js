import {
  HiSearch,
  HiPlus,
  HiCog,
  HiOutlineMail,
  HiLockClosed,
  HiOutlineEyeOff,
} from 'react-icons/hi';
import ntLogo from '../../assets/images/nt-logo-on-yellow.png';
import { ADMIN_PAGE_META, ADMIN_NAV_ICONS, SYSTEM_TAB_ICONS, resolveAssetUrl } from './helpers';
import EditableText from './EditableText';

function SupportAdminPreviewSidebar({ branding, menus, pageId, onMenuClick }) {
  const logo = resolveAssetUrl(branding?.logoUrl);
  const appName = branding?.appName || 'Enterprise AI Chatbot';
  const nameParts = String(appName).trim().split(/\s+/);
  const line1 = nameParts.slice(0, Math.ceil(nameParts.length / 2)).join(' ') || 'Enterprise AI';
  const line2 = nameParts.slice(Math.ceil(nameParts.length / 2)).join(' ') || 'Chatbot';
  const enabledMenus = (menus || []).filter((m) => m.enabled !== false);

  return (
    <aside className="w-52 shrink-0 bg-gray-200 px-4 py-6 flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-6 pb-6 border-b border-gray-300">
        <img src={logo} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
        <span className="text-orange-500 font-bold text-sm leading-tight">
          <span className="block">{line1}</span>
          {line2 ? <span className="block">{line2}</span> : null}
        </span>
      </div>
      <nav className="flex flex-col gap-3 flex-1 min-h-0 overflow-auto">
        {enabledMenus.map((menu) => {
          const Icon = ADMIN_NAV_ICONS[menu.id] || HiCog;
          const active = pageId === menu.id;
          return (
            <button
              key={menu.id}
              type="button"
              onClick={() => onMenuClick(menu.id)}
              className={`w-full py-1.5 px-2 flex items-center gap-2 rounded-lg text-sm transition-colors ${
                active ? 'bg-gray-300 text-gray-900 font-semibold' : 'text-gray-700 hover:bg-gray-300/70'
              }`}
            >
              <Icon className="text-lg shrink-0" />
              <span className="truncate">{menu.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function AdminPageHeader({ meta, copy, styles, selectedKey, onSelect, count }) {
  const Icon = meta.icon;
  const title = copy?.[meta.titleKey] || meta.titleKey;
  const subtitle = copy?.[meta.subtitleKey] || '';
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg shrink-0">
        <Icon className="text-white text-2xl" />
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
          <EditableText
            editKey={meta.titleKey}
            value={title}
            textStyle={styles?.[meta.titleKey]}
            selectedKey={selectedKey}
            onSelect={onSelect}
            as="h1"
            className="text-2xl font-bold text-gray-800"
          />
          {count != null ? (
            <span className="text-2xl font-normal text-gray-600">{count}</span>
          ) : null}
        </div>
        <EditableText
          editKey={meta.subtitleKey}
          value={subtitle}
          textStyle={styles?.[meta.subtitleKey]}
          selectedKey={selectedKey}
          onSelect={onSelect}
          as="p"
          className="text-sm text-gray-600 mt-0.5"
        />
      </div>
    </div>
  );
}

function MockSearchBar({ placeholder }) {
  return (
    <div className="relative max-w-md mb-6">
      <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl" />
      <div className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-400 bg-white">
        {placeholder}
      </div>
    </div>
  );
}

function MockCardGrid({ items }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-start gap-3"
        >
          <div className={`w-10 h-10 rounded-full shrink-0 ${item.color || 'bg-yellow-300'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SystemPagePreview({
  copy,
  styles,
  selectedKey,
  onSelect,
  systemTabs,
  activeTabId,
  onSelectTab,
}) {
  const meta = ADMIN_PAGE_META.system;
  const enabledTabs = (systemTabs || []).filter((t) => t.enabled !== false);
  const active = enabledTabs.find((t) => t.id === activeTabId) || enabledTabs[0] || null;

  return (
    <div className="flex-1 min-h-0 flex flex-col px-6 py-5 overflow-auto">
      <AdminPageHeader
        meta={meta}
        copy={copy}
        styles={styles}
        selectedKey={selectedKey}
        onSelect={onSelect}
      />

      {enabledTabs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl p-10 text-center">
          ปิดแท็บ System ทั้งหมดแล้ว — เปิดอย่างน้อย 1 แท็บจากแผงขวา
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-6">
            {enabledTabs.map((tab) => {
              const Icon = SYSTEM_TAB_ICONS[tab.id] || HiCog;
              const on = active?.id === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    on
                      ? 'border-[#F5C200] text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="text-base" /> {tab.label}
                </button>
              );
            })}
          </div>

          {active?.id === 'announce' ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 flex flex-col gap-3">
                <p className="text-sm font-medium text-gray-700">
                  สร้างประกาศใหม่ (แสดงเป็นแถบในหน้าแชทของผู้ใช้)
                </p>
                <div className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-400 bg-white min-h-[56px]">
                  เช่น ระบบจะปิดปรับปรุงวันเสาร์ 22:00-24:00 น.
                </div>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white text-gray-600">
                    ทั่วไป (ฟ้า)
                  </div>
                  <button
                    type="button"
                    className="ml-auto px-4 py-1.5 rounded-lg bg-[#F5C200] text-gray-900 text-sm font-semibold"
                  >
                    สร้างประกาศ
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-sm text-gray-800">ตัวอย่างประกาศ: ยินดีต้อนรับสู่ระบบ Enterprise AI Chatbot</p>
                <p className="text-xs text-gray-400 mt-1">info · กำลังแสดง</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-5 min-h-[220px]">
              <p className="text-sm font-semibold text-gray-800 mb-2">{active?.label}</p>
              <p className="text-xs text-gray-500 mb-4">
                พื้นที่จัดการ{active?.label} — รูปแบบเดียวกับหน้าจริงใน Supportadmin
              </p>
              <div className="space-y-2">
                <div className="h-9 rounded-lg border border-gray-200 bg-gray-50" />
                <div className="h-9 rounded-lg border border-gray-200 bg-gray-50" />
                <div className="h-9 rounded-lg border border-gray-200 bg-gray-50" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AdminGenericPagePreview({ pageId, copy, styles, selectedKey, onSelect }) {
  const meta = ADMIN_PAGE_META[pageId] || ADMIN_PAGE_META.dashboard;

  if (pageId === 'dashboard') {
    return (
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        <AdminPageHeader meta={meta} copy={copy} styles={styles} selectedKey={selectedKey} onSelect={onSelect} />
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { t: 'ผู้ใช้งาน', v: '128' },
            { t: 'Token วันนี้', v: '42.5k' },
            { t: 'ข้อความ', v: '1,204' },
            { t: 'Error', v: '3' },
          ].map((c) => (
            <div key={c.t} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500 mb-1">{c.t}</p>
              <p className="text-2xl font-bold text-gray-900">{c.v}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 h-36 flex items-end gap-2">
          {[40, 65, 45, 80, 55, 70, 50].map((h, i) => (
            <div key={i} className="flex-1 bg-yellow-300/80 rounded-t" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (pageId === 'bots' || pageId === 'userBots' || pageId === 'knowledge') {
    const items =
      pageId === 'knowledge'
        ? [
            { id: '1', title: 'คู่มือการใช้งาน', body: 'เอกสารหลักของระบบ', color: 'bg-yellow-300' },
            { id: '2', title: 'อัตราค่าบริการ', body: 'ตารางราคาและเงื่อนไข', color: 'bg-blue-300' },
          ]
        : [
            { id: '1', title: 'Enterprise AI Chatbot Assistant', body: 'บอทหลักขององค์กร', color: 'bg-blue-400' },
            { id: '2', title: 'บอทช่วยขาย', body: 'ตัวอย่างบอทในพรีวิว', color: 'bg-purple-400' },
          ];
    return (
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <AdminPageHeader
            meta={meta}
            copy={copy}
            styles={styles}
            selectedKey={selectedKey}
            onSelect={onSelect}
            count={items.length}
          />
          {(pageId === 'bots' || pageId === 'knowledge') && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-yellow-400 text-gray-800 font-semibold rounded-lg text-sm shrink-0"
            >
              <HiPlus /> สร้าง
            </button>
          )}
        </div>
        <MockSearchBar
          placeholder={
            pageId === 'knowledge' ? 'Search Knowledge' : 'Search Bots / Username'
          }
        />
        <MockCardGrid items={items} />
      </div>
    );
  }

  if (pageId === 'supportPanel') {
    return (
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        <AdminPageHeader meta={meta} copy={copy} styles={styles} selectedKey={selectedKey} onSelect={onSelect} />
        <MockSearchBar placeholder="ค้นหาชื่อ / อีเมลผู้ใช้" />
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          {['รออนุมัติ', 'ใช้งานได้', 'หมดอายุ'].map((status, i) => (
            <div
              key={status}
              className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0 bg-white"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">user{i + 1}@example.com</p>
                <p className="text-xs text-gray-500">role: user</p>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{status}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (pageId === 'feedback') {
    return (
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        <AdminPageHeader meta={meta} copy={copy} styles={styles} selectedKey={selectedKey} onSelect={onSelect} />
        <div className="space-y-3">
          {[
            { q: 'อัตราค่าบริการเท่าไหร่?', a: 'ตามเอกสารอัตราค่าบริการ...', vote: '👎' },
            { q: 'มีแพ็กเกจอะไรบ้าง?', a: 'มีแพ็กเกจมาตรฐานและองค์กร', vote: '👍' },
          ].map((row) => (
            <div key={row.q} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm font-medium text-gray-800">{row.vote} {row.q}</p>
              <p className="text-xs text-gray-500 mt-2 line-clamp-2">{row.a}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (pageId === 'logs') {
    return (
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        <AdminPageHeader meta={meta} copy={copy} styles={styles} selectedKey={selectedKey} onSelect={onSelect} />
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          {['user.login', 'bot.created', 'document.uploaded', 'chat.message'].map((ev) => (
            <div key={ev} className="px-4 py-3 border-b border-gray-100 last:border-b-0 flex justify-between gap-3">
              <span className="text-sm text-gray-800 font-mono">{ev}</span>
              <span className="text-xs text-gray-400">เมื่อสักครู่</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
      <AdminPageHeader meta={meta} copy={copy} styles={styles} selectedKey={selectedKey} onSelect={onSelect} />
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <div className="h-4 rounded bg-gray-100 w-1/3" />
        <div className="h-3 rounded bg-gray-100 w-full" />
        <div className="h-3 rounded bg-gray-100 w-5/6" />
        <div className="h-3 rounded bg-gray-100 w-4/6" />
        <div className="mt-4 rounded-lg border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400">
          พื้นที่เนื้อหา Manual / เอกสารคู่มือ
        </div>
      </div>
    </div>
  );
}

function SupportAdminShellPreview({
  branding,
  menus,
  systemTabs,
  pageId,
  systemTabId,
  onMenuClick,
  onSelectSystemTab,
  copy,
  styles,
  selectedKey,
  onSelect,
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex h-[680px] min-h-0">
        <SupportAdminPreviewSidebar
          branding={branding}
          menus={menus}
          pageId={pageId}
          onMenuClick={onMenuClick}
        />
        <main className="flex-1 min-w-0 bg-white flex flex-col min-h-0">
          {pageId === 'system' ? (
            <SystemPagePreview
              copy={copy}
              styles={styles}
              selectedKey={selectedKey}
              onSelect={onSelect}
              systemTabs={systemTabs}
              activeTabId={systemTabId}
              onSelectTab={onSelectSystemTab}
            />
          ) : (
            <AdminGenericPagePreview
              pageId={pageId}
              copy={copy}
              styles={styles}
              selectedKey={selectedKey}
              onSelect={onSelect}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function SupportAdminLoginPreview({ copy, styles, branding, selectedKey, onSelect }) {
  const logo = resolveAssetUrl(branding?.logoUrl);
  const line1 = copy?.['admin.login.titleLine1'] || branding?.appName || 'Enterprise AI Chatbot';
  const line2 = copy?.['admin.login.titleLine2'] || 'Support & Admin';

  return (
    <div className="relative min-h-[640px] rounded-2xl overflow-hidden border border-gray-200 flex flex-col bg-[#D9D9D9]">
      <header className="relative z-10 flex h-[55px] shrink-0 items-center bg-[#FFD100] px-4 shadow-sm">
        <img src={ntLogo} alt="nt" className="h-9 w-auto max-w-[240px] object-contain object-left" />
      </header>
      <div className="relative flex flex-1 items-center justify-center px-4 py-8">
        <div
          className="relative w-full max-w-[520px] rounded-[2rem] bg-white p-10 m-4"
          style={{
            border: '4px solid rgba(252,186,3,0.95)',
            boxShadow: '0 0 20px rgba(252,186,3,0.3), 0 10px 30px rgba(0,0,0,0.08)',
          }}
        >
          <div className="flex flex-col items-center pt-4">
            <div className="mb-6 h-20 w-20 flex items-center justify-center rounded-full bg-yellow-100 overflow-hidden">
              <img src={logo} alt="" className="w-full h-full object-cover rounded-full" />
            </div>
            <h2 className="mb-6 text-2xl font-bold text-zinc-800 text-center drop-shadow-lg">
              <EditableText
                editKey="admin.login.titleLine1"
                value={line1}
                textStyle={styles?.['admin.login.titleLine1']}
                selectedKey={selectedKey}
                onSelect={onSelect}
                as="span"
                className="block"
              />
              <EditableText
                editKey="admin.login.titleLine2"
                value={line2}
                textStyle={styles?.['admin.login.titleLine2']}
                selectedKey={selectedKey}
                onSelect={onSelect}
                as="span"
                className="block"
              />
            </h2>
            <div className="w-full max-w-xs space-y-4">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { SupportAdminShellPreview, SupportAdminLoginPreview };
