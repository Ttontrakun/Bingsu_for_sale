import {
  HiDesktopComputer,
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
  HiBookOpen,
  HiLockClosed,
} from 'react-icons/hi';
import bingsuLogo from '../../assets/images/หน่องบิงไม่มีพื้นละ.png';
import { getApiBaseURL } from '../../services/api';

export const PAGE_BY_MENU = {
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
  ['admin.login.', 'login'],
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

export const ADMIN_PAGE_META = {
  login: { icon: HiLockClosed, titleKey: 'admin.login.titleLine1', subtitleKey: 'admin.login.titleLine2' },
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

export function pageForCopyKey(key) {
  const hit = PAGE_BY_COPY_PREFIX.find(([prefix]) => String(key || '').startsWith(prefix));
  return hit?.[1] || null;
}

export const MOCK_CHATS = [
  { id: '1', name: 'สอบถามอัตราค่าบริการ', private: false, updatedAt: '2 ชม.ที่แล้ว' },
  { id: '2', name: 'สรุปรายละเอียดแพ็กเกจ', private: false, updatedAt: 'เมื่อวาน' },
  { id: '3', name: 'บันทึกส่วนตัว', private: true, updatedAt: '3 วันก่อน' },
];

export function resolveAssetUrl(logoUrl) {
  if (!logoUrl) return bingsuLogo;
  if (/^https?:\/\//i.test(logoUrl) || logoUrl.startsWith('data:')) return logoUrl;
  const base = getApiBaseURL().replace(/\/$/, '');
  return `${base}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
}

export function styleToCss(style) {
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

export const ADMIN_NAV_ICONS = {
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

export const SYSTEM_TAB_ICONS = {
  announce: HiSpeakerphone,
  synonyms: HiTranslate,
  rates: HiCurrencyDollar,
  authority: HiBadgeCheck,
  pm: HiUserGroup,
};

export function applyAppNameTemplate(text, appName) {
  return String(text || '').replace(/\{\{appName\}\}/g, appName || 'Enterprise AI Chatbot');
}
