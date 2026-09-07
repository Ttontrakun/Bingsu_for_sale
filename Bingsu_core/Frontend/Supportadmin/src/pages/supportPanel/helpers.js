import { HiUser, HiUserGroup, HiShieldCheck } from 'react-icons/hi';
import { normalizeDashboardRole } from '../../services/api';

export const THAI_MONTH_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
export const THAI_MONTH_SHORT_INDEX = THAI_MONTH_SHORT.reduce((acc, label, index) => {
  acc[label] = index;
  return acc;
}, {});

export const isEnabledFlag = (value) => value === true;

export const normalizeGroup = (group) => {
  const name = String(group?.name || 'กลุ่ม').trim() || 'กลุ่ม';
  const members = Array.isArray(group?.members) ? group.members.map((id) => String(id)).filter(Boolean) : [];
  return {
    ...group,
    id: String(group?.id || ''),
    roomId: String(group?.roomId || group?.id || ''),
    name,
    description: String(group?.description || ''),
    members,
    memberCount: Number.isFinite(Number(group?.memberCount)) ? Number(group.memberCount) : members.length,
    avatar: (name[0] || 'ก').toUpperCase(),
  };
};

export const getAssignableRoles = () => [
  { value: 'user', label: 'ผู้ใช้งาน', Icon: HiUser },
  { value: 'support', label: 'ผู้ดูแล', Icon: HiUserGroup },
  { value: 'admin', label: 'แอดมิน', Icon: HiShieldCheck },
];

export const ROLE_OPTIONS = [
  { type: 'pending', label: 'รอดำเนินการ', color: 'bg-gray-200' },
  { type: 'user', label: 'ผู้ใช้งาน', color: 'bg-yellow-400' },
  { type: 'support', label: 'ผู้ดูแล', color: 'bg-blue-500' },
  { type: 'admin_metrics', label: 'แอดมิน (รายงาน)', color: 'bg-emerald-600' },
  { type: 'admin', label: 'แอดมิน', color: 'bg-green-400' },
];

export const EXPIRY_OPTIONS = [
  { type: '1-7', label: '1-7 วัน', min: 1, max: 7 },
  { type: '8-30', label: '8-30 วัน', min: 8, max: 30 },
  { type: '30+', label: 'มากกว่า 30 วัน', min: 31, max: Infinity },
  { type: 'expired', label: 'หมดอายุแล้ว', min: -Infinity, max: 0 },
];

export const ROLE_OPTION_HINTS = {
  user: 'ล็อกอินใช้งานบอทและคลังความรู้ในฐานะลูกค้า',
  support: 'ช่วยดูแลลูกค้า อนุมัติบัญชี และใช้แอป Support Admin',
  admin: 'จัดการระบบเต็มรูปแบบ รวมเปลี่ยนบทบาทและลบบัญชี',
};

export function parseThaiDate(thaiDateStr) {
  const thaiMonths = {
    'มกราคม': 0, 'กุมภาพันธ์': 1, 'มีนาคม': 2, 'เมษายน': 3,
    'พฤษภาคม': 4, 'มิถุนายน': 5, 'กรกฎาคม': 6, 'สิงหาคม': 7,
    'กันยายน': 8, 'ตุลาคม': 9, 'พฤศจิกายน': 10, 'ธันวาคม': 11,
  };
  const parts = thaiDateStr.split(' ');
  const day = parseInt(parts[0]);
  const month = thaiMonths[parts[1]];
  const year = parseInt(parts[2]) - 543; // Convert Buddhist year to Christian year
  return new Date(year, month, day);
}

export function parseDisplayDateToDate(value) {
  if (!value || value === '-') return null;

  // รูปแบบเก่า: 05/08/69
  if (value.includes('/')) {
    const [day, month, shortYear] = value.split('/').map((part) => parseInt(part, 10));
    const buddhistYear = 2500 + shortYear;
    return new Date(buddhistYear - 543, month - 1, day);
  }

  // รูปแบบใหม่: 05 ส.ค. 69
  const shortMatch = String(value).trim().match(/^(\d{1,2})\s+([^\s]+)\s+(\d{2})$/);
  if (shortMatch) {
    const day = parseInt(shortMatch[1], 10);
    const month = THAI_MONTH_SHORT_INDEX[shortMatch[2]];
    const shortYear = parseInt(shortMatch[3], 10);
    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(shortYear)) {
      return new Date(2500 + shortYear - 543, month, day);
    }
  }

  return parseThaiDate(value);
}

export function formatShortDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = THAI_MONTH_SHORT[date.getMonth()];
  const year = String((date.getFullYear() + 543) % 100).padStart(2, '0');
  return `${day} ${month} ${year}`;
}

export function formatThaiDate(date) {
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
    'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
    'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];
  const day = date.getDate();
  const month = thaiMonths[date.getMonth()];
  const year = date.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

export function formatDisplayDate(value) {
  if (!value || value === '-') return '-';
  // แปลงทั้งรูปแบบเก่า (05/08/69) และชื่อเดือนเต็ม ให้เป็นชื่อย่อ
  const parsed = parseDisplayDateToDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return value;
  return formatShortDate(parsed);
}

export function getDaysUntilExpiry(expiresAtValue) {
  if (!expiresAtValue || expiresAtValue === '-') return null;
  const expiryDate = parseDisplayDateToDate(expiresAtValue);
  if (!expiryDate || Number.isNaN(expiryDate.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiryDate.setHours(0, 0, 0, 0);

  const diffTime = expiryDate.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return daysLeft;
}

export function isExpiryExpiredOrSoon(expiresAtValue) {
  const daysLeft = getDaysUntilExpiry(expiresAtValue);
  return daysLeft !== null && daysLeft <= 7;
}

export function isExpiryToday(expiresAtValue) {
  const d = parseDisplayDateToDate(expiresAtValue);
  if (!d || Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d.getTime() === today.getTime();
}

export function badgeRoleKey(user) {
  if (user?.role === 'ผู้ดูแล') return 'support';
  return normalizeDashboardRole(user?.roleType);
}

export function getRoleBadgeSurfaceClasses(roleKey) {
  const shell =
    'inline-flex items-center gap-1 rounded-full text-sm font-semibold tracking-tight px-3.5 py-1.5 border shadow-sm transition-all duration-200';
  switch (roleKey) {
    case 'pending':
      return `${shell} bg-gray-200 text-gray-600 border-gray-300/90`;
    case 'user':
      return `${shell} bg-yellow-400 text-gray-900 border-yellow-500/50`;
    case 'support':
      return `${shell} bg-blue-600 text-white border-blue-800/25`;
    case 'admin_metrics':
      return `${shell} bg-emerald-600 text-white border-emerald-800/30`;
    case 'admin':
      return `${shell} bg-green-600 text-white border-green-800/30`;
    default:
      return `${shell} bg-slate-500 text-white border-slate-600/40`;
  }
}

export function getRoleBadgeInteractionClasses(clickable, roleKey) {
  return clickable
    ? `cursor-pointer hover:shadow-md hover:-translate-y-px active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        roleKey === 'user'
          ? 'hover:bg-yellow-500 focus-visible:ring-yellow-400'
          : roleKey === 'pending'
            ? 'hover:bg-gray-300 focus-visible:ring-gray-400'
            : 'focus-visible:ring-amber-400'
      }`
    : '';
}
