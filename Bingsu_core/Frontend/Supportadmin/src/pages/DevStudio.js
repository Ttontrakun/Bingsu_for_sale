import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  HiDesktopComputer,
  HiRefresh,
  HiPlus,
  HiCheck,
  HiChat,
  HiSearch,
  HiX,
  HiLockClosed,
  HiBookOpen,
  HiOutlineMail,
  HiOutlinePaperAirplane,
  HiOutlineEyeOff,
  HiOutlineUser,
  HiChevronDown,
  HiArrowLeft,
  HiHome,
  HiViewGrid,
  HiSupport,
  HiThumbUp,
  HiCog,
  HiClipboardList,
  HiUsers,
  HiSpeakerphone,
  HiTranslate,
  HiCurrencyDollar,
  HiBadgeCheck,
  HiUserGroup,
} from 'react-icons/hi';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import ntLogo from '../assets/images/nt-logo-on-yellow.png';
import { api, getApiBaseURL } from '../services/api';

const PAGE_BY_MENU = {
  home: 'homepage',
  private: 'private',
  createBot: 'bots',
  uploadDocs: 'knowledge',
};

const PAGE_BY_COPY_PREFIX = [
  ['user.login.', 'login'],
  ['user.verify.', 'verify'],
  ['user.emailVerify.', 'email'],
  ['user.homepage.', 'homepage'],
  ['user.private.', 'private'],
  ['user.search.', 'homepage'],
  ['user.bots.', 'bots'],
  ['user.knowledge.', 'knowledge'],
  ['admin.dashboard.', 'dashboard'],
  ['admin.manual.', 'manual'],
  ['admin.bots.', 'bots'],
  ['admin.knowledge.', 'knowledge'],
  ['admin.userBots.', 'userBots'],
  ['admin.supportPanel.', 'supportPanel'],
  ['admin.feedback.', 'feedback'],
  ['admin.system.', 'system'],
  ['admin.logs.', 'logs'],
];

const ADMIN_PAGE_META = {
  dashboard: { icon: HiViewGrid, titleKey: 'admin.dashboard.title', subtitleKey: 'admin.dashboard.subtitle' },
  manual: { icon: HiHome, titleKey: 'admin.manual.title', subtitleKey: 'admin.manual.subtitle' },
  bots: { icon: HiDesktopComputer, titleKey: 'admin.bots.title', subtitleKey: 'admin.bots.subtitle' },
  knowledge: { icon: HiBookOpen, titleKey: 'admin.knowledge.title', subtitleKey: 'admin.knowledge.subtitle' },
  userBots: { icon: HiUsers, titleKey: 'admin.userBots.title', subtitleKey: 'admin.userBots.subtitle' },
  supportPanel: { icon: HiSupport, titleKey: 'admin.supportPanel.title', subtitleKey: 'admin.supportPanel.subtitle' },
  feedback: { icon: HiThumbUp, titleKey: 'admin.feedback.title', subtitleKey: 'admin.feedback.subtitle' },
  system: { icon: HiCog, titleKey: 'admin.system.title', subtitleKey: 'admin.system.subtitle' },
  logs: { icon: HiClipboardList, titleKey: 'admin.logs.title', subtitleKey: 'admin.logs.subtitle' },
};

function pageForCopyKey(key) {
  const hit = PAGE_BY_COPY_PREFIX.find(([prefix]) => String(key || '').startsWith(prefix));
  return hit?.[1] || null;
}

const MOCK_CHATS = [
  { id: '1', name: 'สอบถามอัตราค่าบริการ', private: false, updatedAt: '2 ชม.ที่แล้ว' },
  { id: '2', name: 'สรุปรายละเอียดแพ็กเกจ', private: false, updatedAt: 'เมื่อวาน' },
  { id: '3', name: 'บันทึกส่วนตัว', private: true, updatedAt: '3 วันก่อน' },
];

function resolveAssetUrl(logoUrl) {
  if (!logoUrl) return bingsuLogo;
  if (/^https?:\/\//i.test(logoUrl) || logoUrl.startsWith('data:')) return logoUrl;
  const base = getApiBaseURL().replace(/\/$/, '');
  return `${base}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
}

function styleToCss(style) {
  if (!style || typeof style !== 'object') return {};
  const css = {};
  if (style.color) css.color = style.color;
  if (style.backgroundColor) css.backgroundColor = style.backgroundColor;
  if (style.fontSize) css.fontSize = `${style.fontSize}px`;
  if (style.bold === true) css.fontWeight = 700;
  if (style.italic === true) css.fontStyle = 'italic';
  if (style.underline === true) css.textDecoration = 'underline';
  return css;
}

function MenuToggle({ enabled, onChange, title }) {
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

/** คลิกข้อความใน preview เพื่อเลือกแก้ในแผงขวา */
function EditableText({
  editKey,
  value,
  selectedKey,
  onSelect,
  textStyle,
  as: Tag = 'span',
  className = '',
  multiline = false,
}) {
  const selected = selectedKey === editKey;
  const selectable = Boolean(editKey && onSelect);
  return (
    <Tag
      data-edit-key={editKey}
      onClick={(e) => {
        if (!selectable) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect(editKey);
      }}
      style={styleToCss(textStyle)}
      className={`${className} ${
        selectable
          ? `cursor-pointer rounded outline outline-2 outline-offset-2 transition-colors ${
              selected ? 'outline-amber-400 bg-amber-50/40' : 'outline-transparent hover:outline-sky-300'
            }`
          : ''
      }`}
    >
      {multiline
        ? String(value || '')
            .split('\n')
            .map((line, i, arr) => (
              <span key={i}>
                {line}
                {i < arr.length - 1 ? <br /> : null}
              </span>
            ))
        : value}
    </Tag>
  );
}

const ADMIN_NAV_ICONS = {
  dashboard: HiViewGrid,
  manual: HiHome,
  bots: HiDesktopComputer,
  knowledge: HiBookOpen,
  userBots: HiUsers,
  supportPanel: HiSupport,
  feedback: HiThumbUp,
  system: HiCog,
  logs: HiClipboardList,
};

const SYSTEM_TAB_ICONS = {
  announce: HiSpeakerphone,
  synonyms: HiTranslate,
  rates: HiCurrencyDollar,
  authority: HiBadgeCheck,
  pm: HiUserGroup,
};

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
          <NavBtn id="private" icon={HiLockClosed} label="Private" active={privateOn && !searchOpen} />
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

function applyAppNameTemplate(text, appName) {
  return String(text || '').replace(/\{\{appName\}\}/g, appName || 'Enterprise AI Chatbot');
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
          value={copy?.['user.private.title'] || 'โหมดส่วนตัว — ถามจากเนื้อหาของคุณเอง'}
          textStyle={styles?.['user.private.title']}
          selectedKey={selectedKey}
          onSelect={onSelect}
          as="h1"
          className="text-gray-800 text-2xl sm:text-3xl font-semibold text-center mb-3 max-w-3xl"
        />
      ) : (
        <EditableText
          editKey="user.homepage.title"
          value={title}
          textStyle={styles?.['user.homepage.title']}
          selectedKey={selectedKey}
          onSelect={onSelect}
          as="h1"
          className="text-gray-800 text-2xl sm:text-3xl font-semibold text-center mb-3 max-w-3xl"
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
              value={copy?.['user.private.bannerTitle'] || 'โหมดส่วนตัว'}
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

function StyleEditor({ value, onChange }) {
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

function DevStudio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const surface = searchParams.get('surface') === 'supportadmin' ? 'supportadmin' : 'user';
  const setSurface = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'supportadmin') params.set('surface', 'supportadmin');
    else params.delete('surface');
    setSearchParams(params, { replace: true });
  };

  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pageId, setPageId] = useState('homepage');
  const [adminPageId, setAdminPageId] = useState('dashboard');
  const [systemTabId, setSystemTabId] = useState('announce');
  const [selectedKey, setSelectedKey] = useState('user.homepage.title');
  const [rightTab, setRightTab] = useState('text');
  const [searchOpen, setSearchOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getDevConfig();
      setConfig(data);
      setDraft({
        copy: { ...(data.copy || {}) },
        styles: { ...(data.styles || {}) },
        menus: {
          user: (data.menus?.user || []).map((m) => ({ ...m })),
          admin: (data.menus?.admin || []).map((m) => ({ ...m })),
          systemTabs: (data.menus?.systemTabs || []).map((m) => ({ ...m })),
        },
        branding: { ...(data.branding || {}) },
        features: { ...(data.features || {}) },
      });
    } catch (err) {
      setError(err?.message || 'โหลด config ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (surface === 'supportadmin') {
      setSearchOpen(false);
      setAdminPageId((prev) => (prev && ADMIN_PAGE_META[prev] ? prev : 'dashboard'));
      if (!String(selectedKey || '').startsWith('admin.')) {
        setSelectedKey('admin.dashboard.title');
      }
    } else if (!String(selectedKey || '').startsWith('user.')) {
      setSelectedKey('user.homepage.title');
    }
  }, [surface]); // eslint-disable-line react-hooks/exhaustive-deps

  const catalogMenus = useMemo(() => config?.catalog?.userMenus || [], [config]);
  const catalogAdminMenus = useMemo(() => config?.catalog?.adminMenus || [], [config]);
  const catalogSystemTabs = useMemo(() => config?.catalog?.systemTabs || [], [config]);
  const copyKeys = useMemo(() => config?.catalog?.copyKeys || [], [config]);

  const previewMenus = useMemo(() => {
    const enabledMap = new Map((draft?.menus?.user || []).map((m) => [m.id, m.enabled !== false]));
    return catalogMenus.map((m) => ({
      ...m,
      enabled: enabledMap.has(m.id) ? enabledMap.get(m.id) : true,
    }));
  }, [catalogMenus, draft]);

  const previewAdminMenus = useMemo(() => {
    const enabledMap = new Map((draft?.menus?.admin || []).map((m) => [m.id, m.enabled !== false]));
    return catalogAdminMenus.map((m) => ({
      ...m,
      enabled: enabledMap.has(m.id) ? enabledMap.get(m.id) : true,
    }));
  }, [catalogAdminMenus, draft]);

  const previewSystemTabs = useMemo(() => {
    const enabledMap = new Map(
      (draft?.menus?.systemTabs || []).map((m) => [m.id, m.enabled !== false]),
    );
    return catalogSystemTabs.map((m) => ({
      ...m,
      enabled: enabledMap.has(m.id) ? enabledMap.get(m.id) : true,
    }));
  }, [catalogSystemTabs, draft]);

  const selectedMeta = useMemo(
    () => copyKeys.find((k) => k.key === selectedKey) || copyKeys[0] || null,
    [copyKeys, selectedKey],
  );

  useEffect(() => {
    if (!selectedKey && copyKeys[0]?.key) setSelectedKey(copyKeys[0].key);
  }, [copyKeys, selectedKey]);

  const dirty = useMemo(() => {
    if (!config || !draft) return false;
    return (
      JSON.stringify({
        copy: config.copy,
        styles: config.styles || {},
        menus: config.menus,
        branding: config.branding,
      }) !==
      JSON.stringify({
        copy: draft.copy,
        styles: draft.styles || {},
        menus: draft.menus,
        branding: draft.branding,
      })
    );
  }, [config, draft]);

  const setCopyValue = (key, value) => {
    setDraft((prev) => ({ ...prev, copy: { ...prev.copy, [key]: value } }));
  };

  const setStyleValue = (key, style) => {
    setDraft((prev) => {
      const next = { ...(prev.styles || {}) };
      if (!style || Object.keys(style).length === 0) delete next[key];
      else next[key] = style;
      return { ...prev, styles: next };
    });
  };

  const toggleMenuList = (listKey, menuId, enabled) => {
    setDraft((prev) => {
      const current = prev.menus?.[listKey] || [];
      const exists = current.some((m) => m.id === menuId);
      const nextList = exists
        ? current.map((m) => (m.id === menuId ? { ...m, enabled } : m))
        : [...current, { id: menuId, enabled }];
      return { ...prev, menus: { ...prev.menus, [listKey]: nextList } };
    });
  };

  const toggleUserMenu = (menuId, enabled) => toggleMenuList('user', menuId, enabled);
  const toggleAdminMenu = (menuId, enabled) => toggleMenuList('admin', menuId, enabled);
  const toggleSystemTab = (tabId, enabled) => toggleMenuList('systemTabs', tabId, enabled);

  const handleSelectText = (key) => {
    setSelectedKey(key);
    setRightTab('text');
    if (String(key || '').startsWith('admin.')) {
      const nextAdmin = pageForCopyKey(key);
      if (nextAdmin) setAdminPageId(nextAdmin);
      if (surface !== 'supportadmin') setSurface('supportadmin');
      return;
    }
    const nextPage = pageForCopyKey(key);
    if (nextPage) {
      if (key.startsWith('user.search.')) setSearchOpen(true);
      else setSearchOpen(false);
      setPageId(nextPage === 'search' ? 'homepage' : nextPage);
      if (surface !== 'user') setSurface('user');
    }
  };

  const handleMenuClick = (menuId) => {
    if (menuId === 'history') {
      setSearchOpen(true);
      return;
    }
    setSearchOpen(false);
    setPageId(PAGE_BY_MENU[menuId] || 'homepage');
  };

  const handleAdminMenuClick = (menuId) => {
    setAdminPageId(menuId);
    if (menuId === 'system') {
      setRightTab('menus');
      setSelectedKey('admin.system.title');
    } else if (ADMIN_PAGE_META[menuId]?.titleKey) {
      setSelectedKey(ADMIN_PAGE_META[menuId].titleKey);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await api.patchDevConfig({
        copy: draft.copy,
        styles: draft.styles,
        menus: draft.menus,
        branding: draft.branding,
      });
      setConfig((prev) => ({ ...prev, ...saved, catalog: prev?.catalog }));
      setDraft({
        copy: { ...(saved.copy || {}) },
        styles: { ...(saved.styles || {}) },
        menus: {
          user: (saved.menus?.user || []).map((m) => ({ ...m })),
          admin: (saved.menus?.admin || []).map((m) => ({ ...m })),
          systemTabs: (saved.menus?.systemTabs || []).map((m) => ({ ...m })),
        },
        branding: { ...(saved.branding || {}) },
        features: { ...(saved.features || {}) },
      });
      setNotice('บันทึกแล้ว');
    } catch (err) {
      setError(err?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file) => {
    if (!file) return;
    setError('');
    setNotice('');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });
      const result = await api.uploadDevLogo(dataUrl);
      setDraft((prev) => ({
        ...prev,
        branding: { ...prev.branding, logoUrl: result.logoUrl },
      }));
      setConfig((prev) =>
        prev
          ? { ...prev, branding: { ...(prev.branding || {}), ...(result.branding || {}) } }
          : prev,
      );
      setNotice('อัปโหลดโลโก้แล้ว');
    } catch (err) {
      setError(err?.message || 'อัปโหลดโลโก้ไม่สำเร็จ');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        กำลังโหลด Dev Studio...
      </div>
    );
  }

  if (error && !draft) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm">
        <p className="text-red-600">{error}</p>
        <button type="button" onClick={load} className="px-4 py-2 rounded-lg bg-gray-900 text-white">
          ลองใหม่
        </button>
      </div>
    );
  }

  const activeTextKey = selectedMeta?.key || selectedKey;

  return (
    <div className="flex flex-col h-full min-h-0 -mx-2">
      <div className="flex items-center justify-between gap-4 px-2 pb-4 border-b border-gray-100 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <HiDesktopComputer className="text-amber-500 text-xl shrink-0" />
            <h1 className="text-lg font-semibold text-gray-900 truncate">Dev Studio</h1>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 ml-7">
            {surface === 'supportadmin'
              ? 'พรีวิว Supportadmin — เปิด/ปิดเมนูและแท็บ System ได้จากแผงขวา'
              : 'คลิกข้อความใน preview เพื่อแก้ — หรือเลือกจากแผงขวา'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            title="รีโหลด"
          >
            <HiRefresh />
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm bg-gray-900 text-white disabled:opacity-35"
          >
            <HiCheck />
            {saving ? 'บันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div
          className={`mx-2 mb-3 text-sm px-3 py-2 rounded-lg ${
            error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {error || notice}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-12 gap-4 px-2">
        <div className="col-span-9 min-h-0 overflow-auto">
          <div className="mb-4 space-y-2">
            {surface === 'user' ? (
              (() => {
                const AUTH_PAGES = new Set(['login', 'verify', 'email']);
                const root = AUTH_PAGES.has(pageId) ? 'login' : 'homepage';
                const authSubs = [
                  { id: 'login', label: 'Login' },
                  { id: 'verify', label: 'Verify' },
                  { id: 'email', label: 'อีเมลยืนยัน' },
                ];
                const appSubs = [
                  { id: 'homepage', label: 'Homepage' },
                  { id: 'private', label: 'Private' },
                  { id: 'bots', label: 'Bots' },
                  { id: 'knowledge', label: 'Knowledge' },
                ];
                const subs = root === 'login' ? authSubs : appSubs;
                return (
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-1">
                      {[
                        { id: 'login', label: 'Login' },
                        { id: 'homepage', label: 'Homepage' },
                      ].map((p) => {
                        const active = p.id === root;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              setPageId(p.id);
                            }}
                            className={`h-8 px-4 rounded-full text-xs font-medium transition ${
                              active
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-800'
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-1">
                      {subs.map((p) => {
                        const active = pageId === p.id && !searchOpen;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              setPageId(p.id);
                            }}
                            className={`h-7 px-3 rounded-md text-xs transition ${
                              active
                                ? 'bg-gray-900 text-white'
                                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            ) : (
              <p className="text-[11px] text-gray-400 pl-1">
                คลิกเมนูใน sidebar ของพรีวิวเพื่อสลับหน้า — คลิกข้อความเพื่อแก้ไข
              </p>
            )}
          </div>

          {surface === 'supportadmin' ? (
            <SupportAdminShellPreview
              branding={draft.branding}
              menus={previewAdminMenus}
              systemTabs={previewSystemTabs}
              pageId={adminPageId}
              systemTabId={systemTabId}
              onMenuClick={handleAdminMenuClick}
              onSelectSystemTab={setSystemTabId}
              copy={draft.copy}
              styles={draft.styles}
              selectedKey={selectedKey}
              onSelect={handleSelectText}
            />
          ) : pageId === 'login' ? (
            <UserLoginPreview
              copy={draft.copy}
              styles={draft.styles}
              branding={draft.branding}
              selectedKey={selectedKey}
              onSelect={handleSelectText}
              onGoVerify={() => setPageId('verify')}
            />
          ) : pageId === 'verify' ? (
            <VerifyingPreview
              copy={draft.copy}
              styles={draft.styles}
              selectedKey={selectedKey}
              onSelect={handleSelectText}
              onBackLogin={() => setPageId('login')}
            />
          ) : pageId === 'email' ? (
            <EmailVerifyDocPreview
              copy={draft.copy}
              styles={draft.styles}
              branding={draft.branding}
              selectedKey={selectedKey}
              onSelect={handleSelectText}
            />
          ) : (
            <ShellPreview
              pageId={pageId}
              copy={draft.copy}
              styles={draft.styles}
              branding={draft.branding}
              menus={previewMenus}
              onMenuClick={handleMenuClick}
              searchOpen={searchOpen}
              onCloseSearch={() => setSearchOpen(false)}
              selectedKey={selectedKey}
              onSelect={handleSelectText}
            />
          )}
        </div>

        <div className="col-span-3 min-h-0 flex flex-col border border-gray-200 rounded-2xl bg-white overflow-hidden">
          <div className="flex border-b border-gray-100">
            {[
              { id: 'text', label: 'ข้อความ' },
              { id: 'brand', label: 'แบรนด์' },
              { id: 'menus', label: surface === 'supportadmin' && adminPageId === 'system' ? 'แท็บ System' : 'เมนู' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRightTab(tab.id)}
                className={`flex-1 text-xs py-2.5 font-bold transition ${
                  rightTab === tab.id
                    ? 'text-gray-900 border-b-2 border-amber-400'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-3">
            {rightTab === 'text' && (
              <div className="space-y-3">
                <label className="block text-[11px] text-gray-500 space-y-1">
                  <span className="font-bold text-gray-700">เลือกข้อความ</span>
                  <select
                    value={activeTextKey || ''}
                    onChange={(e) => handleSelectText(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white"
                  >
                    {copyKeys
                      .filter((k) =>
                        surface === 'supportadmin'
                          ? String(k.key).startsWith('admin.')
                          : String(k.key).startsWith('user.'),
                      )
                      .map((k) => (
                      <option key={k.key} value={k.key}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedMeta ? (
                  <>
                    <p className="text-[10px] text-gray-400 font-mono break-all">{selectedMeta.key}</p>
                    <textarea
                      rows={4}
                      value={draft.copy?.[selectedMeta.key] ?? ''}
                      onChange={(e) => setCopyValue(selectedMeta.key, e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                    />
                    <StyleEditor
                      value={draft.styles?.[selectedMeta.key]}
                      onChange={(style) => setStyleValue(selectedMeta.key, style)}
                    />
                  </>
                ) : (
                  <p className="text-sm text-gray-400 py-8 text-center">ไม่มีรายการข้อความ</p>
                )}
              </div>
            )}

            {rightTab === 'brand' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">โลโก้</label>
                  <div className="flex flex-col items-start gap-2">
                    <img
                      src={resolveAssetUrl(draft.branding?.logoUrl)}
                      alt=""
                      className="w-16 h-16 rounded-full object-cover border border-gray-200"
                    />
                    <label className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 w-fit">
                      <HiPlus />
                      อัปโหลด
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                      />
                    </label>
                    {draft.branding?.logoUrl && (
                      <button
                        type="button"
                        className="text-xs text-red-500 text-left"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            branding: { ...prev.branding, logoUrl: null },
                          }))
                        }
                      >
                        ใช้โลโก้เริ่มต้น
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">ชื่อแอป</label>
                  <input
                    type="text"
                    value={draft.branding?.appName || ''}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        branding: { ...prev.branding, appName: e.target.value },
                      }))
                    }
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
              </div>
            )}

            {rightTab === 'menus' && (
              <div className="space-y-4">
                {surface === 'user' ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-gray-700 mb-2 leading-relaxed">
                      เปิด/ปิดเมนู User — Chats = ค้นหาแชท
                    </p>
                    {catalogMenus.map((menu) => {
                      const entry = (draft.menus?.user || []).find((m) => m.id === menu.id);
                      const enabled = entry ? entry.enabled !== false : true;
                      return (
                        <div
                          key={menu.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-gray-50"
                        >
                          <button
                            type="button"
                            className="text-xs text-gray-800 text-left hover:underline leading-snug"
                            onClick={() => handleMenuClick(menu.id)}
                          >
                            {menu.label}
                          </button>
                          <MenuToggle
                            enabled={enabled}
                            onChange={(next) => toggleUserMenu(menu.id, next)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : adminPageId === 'system' ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-gray-700 leading-relaxed">
                      แท็บในหน้า System (ถอดออกได้) — แสดงเฉพาะตอนพรีวิวหน้า System
                    </p>
                    {catalogSystemTabs.map((tab) => {
                      const entry = (draft.menus?.systemTabs || []).find((m) => m.id === tab.id);
                      const enabled = entry ? entry.enabled !== false : true;
                      return (
                        <div
                          key={tab.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-amber-50/60"
                        >
                          <button
                            type="button"
                            className="text-xs text-gray-800 text-left hover:underline leading-snug"
                            onClick={() => setSystemTabId(tab.id)}
                          >
                            {tab.label}
                          </button>
                          <MenuToggle
                            enabled={enabled}
                            onChange={(next) => toggleSystemTab(tab.id, next)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-gray-700 leading-relaxed">
                      เมนู Sidebar Supportadmin
                    </p>
                    {catalogAdminMenus.map((menu) => {
                      const entry = (draft.menus?.admin || []).find((m) => m.id === menu.id);
                      const enabled = entry ? entry.enabled !== false : true;
                      return (
                        <div
                          key={menu.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-gray-50"
                        >
                          <button
                            type="button"
                            className="text-xs text-gray-800 text-left hover:underline leading-snug"
                            onClick={() => handleAdminMenuClick(menu.id)}
                          >
                            {menu.label}
                          </button>
                          <MenuToggle
                            enabled={enabled}
                            onChange={(next) => toggleAdminMenu(menu.id, next)}
                          />
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-gray-400 pt-2 leading-relaxed">
                      แท็บในหน้า System จะแสดงเมื่อกดเมนู System ในพรีวิว
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DevStudio;
