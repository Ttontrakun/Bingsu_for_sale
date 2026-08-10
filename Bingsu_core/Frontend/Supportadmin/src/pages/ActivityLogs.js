import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { HiRefresh, HiClipboardList, HiFilter, HiChevronDown, HiChevronUp } from 'react-icons/hi';
import { api } from '../services/api';
import { useAdminSystemConfig } from '../context/AdminSystemConfigContext';

const EVENT_LABEL_TH = {
  'auth.login': 'เข้าสู่ระบบ',
  'auth.logout': 'ออกจากระบบ',
  'auth.login.rejected.invalid_user': 'ล็อกอินล้มเหลว — ไม่พบบัญชี',
  'auth.login.rejected.disabled': 'ล็อกอินล้มเหลว — บัญชีถูกปิด',
  'auth.login.rejected.email_not_verified': 'ล็อกอินล้มเหลว — ยังไม่ยืนยันอีเมล',
  'auth.login.rejected.pending_approval': 'ล็อกอินล้มเหลว — รออนุมัติ',
  'auth.login.rejected.locked': 'ล็อกอินล้มเหลว — บัญชีถูกล็อก',
  'auth.login.rejected.invalid_password': 'ล็อกอินล้มเหลว — รหัสผ่านผิด',
  'auth.email.verified': 'ยืนยันอีเมล',
  'auth.email.resend': 'ส่งอีเมลยืนยันอีกครั้ง',
  'auth.email.resend.ignored': 'ข้ามการส่งอีเมลยืนยัน',
  'auth.email.verification.sent': 'ส่งอีเมลยืนยันแล้ว',
  'auth.email.verification.failed': 'ส่งอีเมลยืนยันล้มเหลว',
  'auth.email.verification.resent': 'ส่งอีเมลยืนยันซ้ำแล้ว',
  'auth.email.verification.resend.failed': 'ส่งอีเมลยืนยันซ้ำล้มเหลว',
  'auth.email.verify.rejected.invalid_token': 'ยืนยันอีเมลล้มเหลว — token ไม่ถูกต้อง',
  'auth.email.verify.rejected.expired_token': 'ยืนยันอีเมลล้มเหลว — token หมดอายุ',
  'auth.password.reset.requested': 'ขอรีเซ็ตรหัสผ่าน',
  'auth.password.reset': 'รีเซ็ตรหัสผ่านแล้ว',
  'auth.password.reset.rejected.invalid_token': 'รีเซ็ตรหัสผ่านล้มเหลว — token ไม่ถูกต้อง',
  'auth.password.reset.email.sent': 'ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว',
  'auth.password.reset.email.failed': 'ส่งอีเมลรีเซ็ตรหัสผ่านล้มเหลว',
  'auth.password.reset.request.ignored': 'ข้ามคำขอรีเซ็ตรหัสผ่าน',
  'auth.password.set.initial': 'ตั้งรหัสผ่านครั้งแรก',
  'auth.password.set.initial.rejected.invalid_token': 'ตั้งรหัสผ่านครั้งแรกล้มเหลว — token ไม่ถูกต้อง',
  'auth.password.changed': 'เปลี่ยนรหัสผ่านแล้ว',
  'user.profile.updated': 'อัปเดตโปรไฟล์',
  'user.signup.pending': 'สมัครสมาชิก (รออนุมัติ)',
  'user.signup.approved': 'สมัครสมาชิก (อนุมัติอัตโนมัติ)',
  'user.signup.rejected.duplicate_email': 'สมัครสมาชิกล้มเหลว — อีเมลซ้ำ',
  'user.approval.updated': 'อนุมัติ/ปฏิเสธบัญชี',
  'user.approval.request.submitted': 'ส่งคำขออนุมัติบัญชี',
  'user.expiry.renewed': 'ต่ออายุการใช้งาน',
  'user.status.updated': 'เปลี่ยนสถานะผู้ใช้',
  'user.role.updated': 'เปลี่ยนบทบาทผู้ใช้',
  'user.private_context.updated': 'บันทึกความจำ/คำสั่งส่วนตัว (/จำ /สั่ง)',
  'http.error': 'ข้อผิดพลาดระบบ (HTTP)',
  'http.exception': 'ข้อผิดพลาดระบบ (Exception)',
  'email.send.failed': 'ส่งอีเมลล้มเหลว',
  'integration.line.updated': 'ตั้งค่า LINE Integration',
  'integration.updated': 'ตั้งค่า Integration',
  'integration.update.failed': 'ตั้งค่า Integration (ล้มเหลว)',
  'document.created': 'สร้าง Knowledge / เอกสาร',
  'document.updated': 'อัปเดต Knowledge / เอกสาร',
  'document.vectorize.failed': 'แปลงเป็น Vector (ล้มเหลว)',
  'document.ocr.structured': 'จัดเรียงข้อความด้วย AI',
  'document.deleted': 'ลบเอกสาร',
  'user.knowledge.created': 'ผู้ใช้สร้าง Knowledge',
  'user.knowledge.deleted': 'ผู้ใช้ลบ Knowledge',
  'user.knowledge.upload.completed': 'ผู้ใช้อัปโหลดไฟล์ Knowledge',
  'synonym.created': 'เพิ่มคำพ้องความหมาย',
  'synonym.updated': 'แก้ไขคำพ้องความหมาย',
  'synonym.enabled': 'เปิดใช้งานคำพ้องความหมาย',
  'synonym.disabled': 'ปิดใช้งานคำพ้องความหมาย',
  'synonym.deleted': 'ลบคำพ้องความหมาย',
  'service_rate.updated': 'อัปเดตอัตราค่าบริการ',
  'service_rate.deleted': 'ลบอัตราค่าบริการ',
  'approval_authority.created': 'เพิ่มกฎอำนาจอนุมัติ',
  'approval_authority.updated': 'แก้ไขกฎอำนาจอนุมัติ',
  'approval_authority.deleted': 'ลบกฎอำนาจอนุมัติ',
  'product_manager.created': 'เพิ่มรายชื่อ Super PM / PM',
  'product_manager.updated': 'แก้ไขรายชื่อ Super PM / PM',
  'product_manager.deleted': 'ลบรายชื่อ Super PM / PM',
  'upload.batch.completed': 'อัปโหลดไฟล์ (ครบชุด)',
  'upload.batch.failed': 'อัปโหลดไฟล์ (ล้มเหลว)',
  'admin.upload.batch.retry': 'Retry อัปโหลดไฟล์ (แอดมิน)',
  'admin.user.deleted': 'ลบผู้ใช้ (แอดมิน)',
  'admin.user.password.reset': 'รีเซ็ตรหัสผ่านผู้ใช้ (แอดมิน)',
  'support.user.deleted': 'ลบผู้ใช้',
  'support.pending_approval.email.failed': 'แจ้งอีเมลรออนุมัติล้มเหลว',
  'bot.created': 'สร้างบอท',
  'bot.updated': 'แก้ไขบอท',
  'user.bot.created': 'ผู้ใช้สร้างบอท',
  'admin.bot.created': 'สร้างบอท (แอดมิน)',
  'admin.bot.updated': 'แก้ไขบอท (แอดมิน)',
  'admin.guide.updated': 'แก้ไขคู่มือ (แอดมิน)',
  'manual.updated': 'แก้ไขหน้า Manual',
  'manual.pdf.uploaded': 'อัปโหลด PDF หน้า Manual',
  'bot.deleted': 'ลบบอท',
  'admin_dev.config.updated': 'Admin Dev แก้ไขระบบ',
  'admin_dev.branding.logo.updated': 'Admin Dev อัปโหลดโลโก้',
  'admin.announcement.created': 'สร้างประกาศ',
  'admin.announcement.updated': 'แก้ไขประกาศ',
  'admin.announcement.enabled': 'เปิดแสดงประกาศ',
  'admin.announcement.disabled': 'ปิดแสดงประกาศ',
  'admin.announcement.deleted': 'ลบประกาศ',
  'admin.restore': 'กู้คืนข้อมูล',
  'admin.restore.failed': 'กู้คืนข้อมูล (ล้มเหลว)',
  'chat.retention.pruned': 'ลบแชทเก่าอัตโนมัติ',
  'system.log.retention.pruned': 'ลบ log เก่าอัตโนมัติ',
};

const POLL_MS = 8000;

const APPROVAL_TH = {
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
  pending: 'รออนุมัติ',
};

const ROLE_TH = {
  user: 'ผู้ใช้งาน',
  support: 'ผู้ดูแล',
  admin: 'แอดมิน',
  admin_metrics: 'แอดมิน (รายงาน)',
  admin_dev: 'Admin Dev',
};

function formatEditedAtTh(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

const META_OMIT_KEYS = new Set(['ip', 'requestId']);

/** ชื่อประเภทในตาราง — ภาษาไทย; ถ้ายังไม่มีในรายการแสดงคำอธิบายสั้นๆ */
function typeLabelTh(messageKey) {
  if (!messageKey) return '—';
  return EVENT_LABEL_TH[messageKey] || `รายการอื่น (${messageKey})`;
}

function isErrorEvent(messageKey) {
  const key = String(messageKey || '').toLowerCase();
  return (
    key === 'http.error'
    || key === 'http.exception'
    || key.endsWith('.failed')
    || key.includes('.rejected.')
  );
}

/** สรุปการแก้บอท — แสดงว่าแก้ prompt / ชื่อ / Knowledge ฯลฯ */
function formatBotEditSummary(meta, byAdmin) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const q = (s) => (s == null || s === '' ? '' : `「${String(s)}」`);
  const botNm = m.botName || m.name;
  const labels = Array.isArray(m.changeLabels) ? m.changeLabels.filter(Boolean) : [];
  const kc = m.knowledgeCount != null ? m.knowledgeCount : m.documentCount;
  const head = byAdmin ? 'แอดมินแก้ไขบอท' : 'แก้ไขบอท';
  const nameStr = botNm ? ` ชื่อ ${q(botNm)}` : '';
  const changes =
    labels.length > 0
      ? ` — สิ่งที่ปรับ: ${labels.join(' · ')}`
      : ' — ปรับการตั้งค่าบอท (บันทึกเก่าอาจไม่ระบุรายการ)';
  const tail =
    kc != null && Number.isFinite(Number(kc))
      ? ` — หลังบันทึก ผูก Knowledge ${Number(kc)} ชุด`
      : '';
  return `${head}${nameStr}${changes}${tail}`;
}

/** สรุปเป็นประโยคภาษาไทยให้แอดมินเข้าใจว่าเกิดอะไรขึ้น */
function formatAdminSummary(eventMessage, meta) {
  const m = meta && typeof meta === 'object' ? { ...meta } : {};
  delete m.ip;

  const q = (s) => (s == null || s === '' ? '' : `「${String(s)}」`);
  const botNm = m.botName || m.name;
  const know = m.displayName;
  const url = m.url;

  switch (eventMessage) {
    case 'auth.login':
      return m.role
        ? `เข้าสู่ระบบ ในฐานะ ${ROLE_TH[m.role] || m.role}${m.email ? ` (${m.email})` : ''}`
        : 'เข้าสู่ระบบ';
    case 'auth.logout':
      return m.email
        ? `ออกจากระบบ — บัญชี ${m.email}`
        : 'ออกจากระบบ';
    case 'auth.login.rejected.invalid_user':
      return m.email ? `พยายามล็อกอินด้วยอีเมล ${m.email} แต่ไม่พบบัญชี` : 'พยายามล็อกอินแต่ไม่พบบัญชี';
    case 'auth.login.rejected.disabled':
      return m.email ? `บัญชี ${m.email} ถูกปิดใช้งาน จึงล็อกอินไม่ได้` : 'บัญชีถูกปิดใช้งาน จึงล็อกอินไม่ได้';
    case 'auth.login.rejected.email_not_verified':
      return m.email ? `บัญชี ${m.email} ยังไม่ได้ยืนยันอีเมล` : 'ยังไม่ได้ยืนยันอีเมล';
    case 'auth.login.rejected.pending_approval':
      return m.email ? `บัญชี ${m.email} ยังรออนุมัติ` : 'บัญชียังรออนุมัติ';
    case 'auth.login.rejected.locked':
      return m.email ? `บัญชี ${m.email} ถูกล็อกชั่วคราว (ล็อกอินผิดหลายครั้ง)` : 'บัญชีถูกล็อกชั่วคราว';
    case 'auth.login.rejected.invalid_password':
      return m.email ? `รหัสผ่านไม่ถูกต้องสำหรับ ${m.email}` : 'รหัสผ่านไม่ถูกต้อง';
    case 'auth.email.verified':
      return m.email ? `ยืนยันอีเมลสำเร็จ — ${m.email}` : 'ยืนยันอีเมลสำเร็จ';
    case 'auth.email.resend':
    case 'auth.email.verification.resent':
      return m.email ? `ส่งอีเมลยืนยันอีกครั้งไปที่ ${m.email}` : 'ส่งอีเมลยืนยันอีกครั้ง';
    case 'auth.email.resend.ignored':
      return m.email ? `ข้ามการส่งอีเมลยืนยัน (${m.email})` : 'ข้ามการส่งอีเมลยืนยัน';
    case 'auth.email.verification.sent':
      return m.email ? `ส่งอีเมลยืนยันไปที่ ${m.email}` : 'ส่งอีเมลยืนยันแล้ว';
    case 'auth.email.verification.failed':
    case 'auth.email.verification.resend.failed':
      return m.error
        ? `ส่งอีเมลยืนยันไม่สำเร็จ — ${String(m.error).slice(0, 160)}`
        : 'ส่งอีเมลยืนยันไม่สำเร็จ';
    case 'auth.email.verify.rejected.invalid_token':
      return 'ยืนยันอีเมลไม่สำเร็จ — token ไม่ถูกต้องหรือถูกใช้แล้ว';
    case 'auth.email.verify.rejected.expired_token':
      return m.email ? `ยืนยันอีเมลไม่สำเร็จ — token ของ ${m.email} หมดอายุ` : 'ยืนยันอีเมลไม่สำเร็จ — token หมดอายุ';
    case 'auth.password.reset.requested':
      return m.email ? `มีการขอรีเซ็ตรหัสผ่านทางอีเมล — ${m.email}` : 'มีการขอรีเซ็ตรหัสผ่านทางอีเมล';
    case 'auth.password.reset':
      return 'รีเซ็ตรหัสผ่านสำเร็จ';
    case 'auth.password.reset.rejected.invalid_token':
      return 'รีเซ็ตรหัสผ่านไม่สำเร็จ — token ไม่ถูกต้องหรือหมดอายุ';
    case 'auth.password.set.initial':
      return 'ตั้งรหัสผ่านครั้งแรกสำเร็จ';
    case 'auth.password.set.initial.rejected.invalid_token':
      return 'ตั้งรหัสผ่านครั้งแรกไม่สำเร็จ — token ไม่ถูกต้องหรือหมดอายุ';
    case 'auth.password.reset.email.sent':
      return m.email ? `ส่งอีเมลรีเซ็ตรหัสผ่านไปที่ ${m.email}` : 'ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว';
    case 'auth.password.reset.email.failed':
      return m.error
        ? `ส่งอีเมลรีเซ็ตรหัสผ่านไม่สำเร็จ — ${String(m.error).slice(0, 160)}`
        : 'ส่งอีเมลรีเซ็ตรหัสผ่านไม่สำเร็จ';
    case 'auth.password.reset.request.ignored':
      return m.email ? `ข้ามคำขอรีเซ็ตรหัสผ่าน (${m.email})` : 'ข้ามคำขอรีเซ็ตรหัสผ่าน';
    case 'auth.password.changed':
      return 'เปลี่ยนรหัสผ่านสำเร็จ';
    case 'user.profile.updated': {
      const changed = m.changed && typeof m.changed === 'object' ? m.changed : {};
      const labels = [];
      if (changed.name) labels.push('ชื่อ');
      if (changed.avatarUrl) labels.push('รูปโปรไฟล์');
      const what = labels.length ? `ปรับ: ${labels.join(' · ')}` : 'อัปเดตข้อมูลโปรไฟล์';
      const to = m.avatar?.to ? ` → ${q(m.avatar.to)}` : '';
      return `อัปเดตโปรไฟล์ผู้ใช้ — ${what}${to}`;
    }
    case 'user.signup.pending':
      return [m.name && `มีผู้สมัครใหม่ ชื่อ ${m.name}`, m.email && `อีเมล ${m.email}`]
        .filter(Boolean)
        .join(' — ') || 'มีผู้สมัครสมาชิกใหม่ (รออนุมัติ)';
    case 'user.signup.approved':
      return [m.name && `สมัครใหม่และอนุมัติอัตโนมัติ ชื่อ ${m.name}`, m.email && `อีเมล ${m.email}`]
        .filter(Boolean)
        .join(' — ') || 'สมัครสมาชิกใหม่ (อนุมัติอัตโนมัติ)';
    case 'user.signup.rejected.duplicate_email':
      return m.email ? `สมัครสมาชิกไม่สำเร็จ — อีเมล ${m.email} มีในระบบแล้ว` : 'สมัครสมาชิกไม่สำเร็จ — อีเมลซ้ำ';
    case 'user.approval.request.submitted':
      return m.email ? `ส่งคำขออนุมัติบัญชี — ${m.email}` : 'ส่งคำขออนุมัติบัญชี';
    case 'user.approval.updated': {
      const st = APPROVAL_TH[m.approvalStatus || m.status] || m.approvalStatus || m.status || '—';
      const who = [m.name, m.email].filter(Boolean).join(' · ');
      return who
        ? `พิจารณาบัญชีผู้ใช้ ${who} → ผลลัพธ์: ${st}`
        : `พิจารณาบัญชีผู้ใช้ → ผลลัพธ์: ${st}`;
    }
    case 'user.expiry.renewed': {
      const who = [m.name, m.email].filter(Boolean).join(' · ');
      const days = m.extendDays != null ? Number(m.extendDays) : null;
      const to = m.to ? ` → หมดอายุใหม่ ${q(m.to)}` : '';
      const dayStr = days != null && Number.isFinite(days) ? ` (+${days} วัน)` : '';
      return who ? `ต่ออายุการใช้งาน ${who}${dayStr}${to}` : `ต่ออายุการใช้งาน${dayStr}${to}`;
    }
    case 'user.status.updated': {
      const who = [m.name, m.email].filter(Boolean).join(' · ');
      const to = m.to === true ? 'เปิดใช้งาน' : m.to === false ? 'ปิดใช้งาน' : 'อัปเดตสถานะ';
      return who ? `เปลี่ยนสถานะผู้ใช้ ${who} → ${to}` : `เปลี่ยนสถานะผู้ใช้ → ${to}`;
    }
    case 'user.role.updated': {
      const who = [m.name, m.email].filter(Boolean).join(' · ');
      const fromRole = ROLE_TH[m.from] || m.from || '—';
      const toRole = ROLE_TH[m.to] || m.to || '—';
      return who ? `เปลี่ยนบทบาทผู้ใช้ ${who} จาก ${fromRole} เป็น ${toRole}` : `เปลี่ยนบทบาทผู้ใช้ ${fromRole} → ${toRole}`;
    }
    case 'http.error': {
      const status = m.status != null ? Number(m.status) : null;
      const method = m.method ? String(m.method).toUpperCase() : '';
      const statusStr = status != null && Number.isFinite(status) ? `HTTP ${status}` : 'HTTP error';
      const where = [method && url ? `${method} ${url}` : url].filter(Boolean).join('');
      const base = where ? `${statusStr} — ${where}` : statusStr;
      const rid = m.requestId ? ` — requestId: ${m.requestId}` : '';
      return `${base}${rid}`;
    }
    case 'http.exception': {
      const where = url ? `ที่ ${url}` : '';
      const rid = m.requestId ? ` (requestId: ${m.requestId})` : '';
      const msg = m.error ? String(m.error).slice(0, 180) : '—';
      return `ระบบเกิดข้อผิดพลาด${where}${rid} — ${msg}`;
    }
    case 'integration.line.updated': {
      const enabled = m.enabled === true ? 'เปิดใช้งาน' : m.enabled === false ? 'ปิดใช้งาน' : 'อัปเดต';
      const botId = m.botId ? String(m.botId) : null;
      const botHint = botId ? ` — botId: ${botId}` : '';
      const secret = m.hasChannelSecret === true ? 'มี secret' : 'ไม่มี secret';
      const token = m.hasChannelAccessToken === true ? 'มี access token' : 'ไม่มี access token';
      return `ตั้งค่า LINE Integration — ${enabled}${botHint} — ${secret} · ${token}`;
    }
    case 'integration.updated': {
      const enabled = m.enabled === true ? 'เปิดใช้งาน' : m.enabled === false ? 'ปิดใช้งาน' : 'อัปเดต';
      return `ตั้งค่า Integration — ${enabled}`;
    }
    case 'integration.update.failed': {
      const msg = m.error ? String(m.error).slice(0, 180) : '—';
      return `ตั้งค่า Integration ไม่สำเร็จ — ${msg}`;
    }
    case 'document.created':
      return know
        ? `สร้าง Knowledge ใหม่ ชื่อ ${q(know)} — ระบบนำไปจัดทำดัชนีค้นหา`
        : 'สร้าง Knowledge / เอกสารใหม่';
    case 'user.knowledge.created': {
      const when = formatEditedAtTh(m.createdAt);
      const who = m.actorEmail || m.actorName || '';
      const head = know ? `ผู้ใช้สร้าง Knowledge ชื่อ ${q(know)}` : 'ผู้ใช้สร้าง Knowledge ใหม่';
      const by = who ? ` โดย ${who}` : '';
      const at = when ? ` — เวลา ${when}` : '';
      return `${head}${by}${at}`;
    }
    case 'user.knowledge.deleted': {
      const when = formatEditedAtTh(m.deletedAt);
      const who = m.actorEmail || m.actorName || '';
      const head = know ? `ผู้ใช้ลบ Knowledge ชื่อ ${q(know)}` : 'ผู้ใช้ลบ Knowledge';
      const by = who ? ` โดย ${who}` : '';
      const at = when ? ` — เวลา ${when}` : '';
      return `${head}${by}${at}`;
    }
    case 'user.knowledge.upload.completed': {
      const n = m.fileCount != null ? Number(m.fileCount) : null;
      const files = n != null && Number.isFinite(n) ? `${n} ไฟล์` : 'ชุดไฟล์';
      const when = formatEditedAtTh(m.completedAt);
      const who = m.actorEmail || m.actorName || '';
      const head = know
        ? `ผู้ใช้อัปโหลด ${files} เข้า Knowledge ${q(know)}`
        : `ผู้ใช้อัปโหลด ${files} เข้า Knowledge`;
      const by = who ? ` โดย ${who}` : '';
      const at = when ? ` — เวลา ${when}` : '';
      return `${head}${by}${at}`;
    }
    case 'document.updated': {
      const changed = m.changed && typeof m.changed === 'object' ? m.changed : {};
      const labels = [];
      if (changed.displayName) labels.push('ชื่อ');
      if (changed.sourceFiles) labels.push('ไฟล์/ข้อมูล');
      if (changed.tags) labels.push('แท็ก');
      if (changed.link) labels.push('ลิงก์');
      const what = labels.length ? ` — ปรับ: ${labels.join(' · ')}` : '';
      const n = m.sourceFileCount != null ? Number(m.sourceFileCount) : null;
      const fileCount = n != null && Number.isFinite(n) ? ` — จำนวนไฟล์: ${n}` : '';
      return know ? `อัปเดต Knowledge ชื่อ ${q(know)}${what}${fileCount}` : `อัปเดต Knowledge${what}${fileCount}`;
    }
    case 'document.vectorize.failed': {
      const msg = m.error ? String(m.error).slice(0, 180) : '—';
      return know ? `แปลงเป็น Vector ไม่สำเร็จ — Knowledge ${q(know)} — ${msg}` : `แปลงเป็น Vector ไม่สำเร็จ — ${msg}`;
    }
    case 'document.deleted':
      return know
        ? `ลบ Knowledge ชื่อ ${q(know)} ออกจากระบบ`
        : 'ลบเอกสาร / Knowledge ออกจากระบบ';
    case 'upload.batch.completed': {
      const n = m.fileCount != null ? Number(m.fileCount) : null;
      const files =
        n != null && Number.isFinite(n) ? `จำนวน ${n} ไฟล์` : 'ครบทุกไฟล์ในชุด';
      return know
        ? `อัปโหลดชุดไฟล์เสร็จ ชื่อ ${q(know)} — ${files} กำลังเข้าคิวประมวลผลต่อ`
        : `อัปโหลดชุดไฟล์เสร็จ — ${files} กำลังเข้าคิวประมวลผลต่อ`;
    }
    case 'upload.batch.failed': {
      const msg = m.error ? String(m.error).slice(0, 180) : 'ไม่ทราบสาเหตุ';
      return know
        ? `ประมวลผลชุดไฟล์ล้มเหลว — ${q(know)} — ${msg}`
        : `ประมวลผลชุดไฟล์ล้มเหลว — ${msg}`;
    }
    case 'admin.upload.batch.retry':
      return know
        ? `แอดมินกด Retry ประมวลผลไฟล์ชุด ${q(know)} ใหม่`
        : 'แอดมินกด Retry ประมวลผลไฟล์ชุดใหม่';
    case 'bot.created':
    case 'user.bot.created':
    case 'admin.bot.created': {
      const byAdmin = eventMessage === 'admin.bot.created';
      const byUser = eventMessage === 'user.bot.created';
      const n = m.knowledgeCount != null ? Number(m.knowledgeCount) : m.documentCount != null ? Number(m.documentCount) : null;
      const head = byAdmin ? 'แอดมินสร้างบอท' : byUser ? 'ผู้ใช้สร้างบอท' : 'สร้างบอทใหม่';
      const when = formatEditedAtTh(m.createdAt);
      const who = byUser ? (m.actorEmail || m.actorName || '') : '';
      const by = who ? ` โดย ${who}` : '';
      const at = when ? ` — เวลา ${when}` : '';
      if (!botNm) return `${head}${by}${at}`;
      if (n != null && Number.isFinite(n) && n > 0) {
        return `${head} ชื่อ ${q(botNm)} — ผูก Knowledge ${n} ชุดตั้งแต่แรก${by}${at}`;
      }
      return `${head} ชื่อ ${q(botNm)} — ยังไม่ผูก Knowledge${by}${at}`;
    }
    case 'admin_dev.config.updated':
    case 'admin_dev.branding.logo.updated': {
      const when = formatEditedAtTh(m.editedAt);
      const who = m.actorEmail || m.actorName || 'Admin Dev';
      const summary = m.changeSummary || (Array.isArray(m.changedAreas) ? m.changedAreas.join(' · ') : 'แก้ไขระบบ');
      const at = when ? ` — เวลา ${when}` : '';
      return `${who} แก้ไข Dev Studio: ${summary}${at}`;
    }
    case 'bot.updated':
      return formatBotEditSummary(m, false);
    case 'admin.bot.updated':
      return formatBotEditSummary(m, true);
    case 'bot.deleted':
      return botNm
        ? `ลบบอท ${q(botNm)} ออกจากระบบ`
        : 'ลบบอทออกจากระบบ';
    case 'admin.user.deleted': {
      const who = [m.name, m.email].filter(Boolean).join(' · ');
      return who ? `ลบบัญชีผู้ใช้ ${who} ออกจากระบบ` : 'ลบบัญชีผู้ใช้ออกจากระบบ';
    }
    case 'admin.user.password.reset': {
      const who = [m.name, m.email].filter(Boolean).join(' · ');
      return who
        ? `แอดมินรีเซ็ตรหัสผ่านให้ ${who} (บังคับออกจากระบบทุก session)`
        : 'แอดมินรีเซ็ตรหัสผ่านผู้ใช้';
    }
    case 'support.user.deleted': {
      const who = [m.name, m.email].filter(Boolean).join(' · ');
      return who ? `ลบบัญชีผู้ใช้ ${who}` : 'ลบบัญชีผู้ใช้';
    }
    case 'support.pending_approval.email.failed':
      return m.error
        ? `แจ้งอีเมลรออนุมัติไม่สำเร็จ — ${String(m.error).slice(0, 160)}`
        : 'แจ้งอีเมลรออนุมัติไม่สำเร็จ';
    case 'admin.guide.updated':
      return know
        ? `อัปเดตเนื้อหาคู่มือ — เอกสาร ${q(know)}`
        : 'อัปเดตเนื้อหาคู่มือการใช้งาน';
    case 'manual.updated':
      return Number.isFinite(Number(m.documentCount))
        ? `อัปเดตหน้า Manual — ${Number(m.documentCount)} หัวข้อหลัก`
        : 'อัปเดตหน้า Manual';
    case 'manual.pdf.uploaded':
      return m.originalName
        ? `อัปโหลด PDF หน้า Manual — ${q(String(m.originalName).slice(0, 80))}`
        : 'อัปโหลด PDF หน้า Manual';
    case 'admin.announcement.created':
      return m.message
        ? `สร้างประกาศใหม่ — ${q(String(m.message).slice(0, 80))}`
        : 'สร้างประกาศใหม่ถึงผู้ใช้';
    case 'admin.announcement.updated':
      return m.message
        ? `แก้ไขประกาศ — ${q(String(m.message).slice(0, 80))}`
        : 'แก้ไขประกาศถึงผู้ใช้';
    case 'admin.announcement.enabled':
      return m.message
        ? `เปิดแสดงประกาศ — ${q(String(m.message).slice(0, 80))}`
        : 'เปิดแสดงประกาศถึงผู้ใช้';
    case 'admin.announcement.disabled':
      return m.message
        ? `ปิดแสดงประกาศ — ${q(String(m.message).slice(0, 80))}`
        : 'ปิดแสดงประกาศถึงผู้ใช้';
    case 'admin.announcement.deleted':
      return m.message
        ? `ลบประกาศ — ${q(String(m.message).slice(0, 80))}`
        : 'ลบประกาศถึงผู้ใช้';
    case 'synonym.created':
      return m.term ? `เพิ่มคำพ้อง — คำในเอกสาร ${q(m.term)}` : 'เพิ่มคำพ้องความหมาย';
    case 'synonym.updated':
      return m.term ? `แก้ไขคำพ้อง — คำในเอกสาร ${q(m.term)}` : 'แก้ไขคำพ้องความหมาย';
    case 'synonym.enabled':
      return m.term ? `เปิดใช้งานคำพ้อง ${q(m.term)}` : 'เปิดใช้งานคำพ้องความหมาย';
    case 'synonym.disabled':
      return m.term ? `ปิดใช้งานคำพ้อง ${q(m.term)}` : 'ปิดใช้งานคำพ้องความหมาย';
    case 'synonym.deleted':
      return m.term ? `ลบคำพ้อง ${q(m.term)}` : 'ลบคำพ้องความหมาย';
    case 'service_rate.updated': {
      const svc = m.service === 'lite' ? 'Lite' : m.service === 'corp' ? 'Corporate' : m.service || '';
      const kind = m.kind === 'intl' ? 'International' : m.kind === 'local' ? 'Local Access' : m.kind || '';
      const speed = m.speed != null ? `${Number(m.speed).toLocaleString('en-US')} Mbps` : '';
      const rate = m.rate != null ? `${Number(m.rate).toLocaleString('en-US')} บาท` : '';
      const parts = [svc, kind, speed, rate && `→ ${rate}`].filter(Boolean);
      return parts.length ? `อัปเดตอัตราค่าบริการ — ${parts.join(' · ')}` : 'อัปเดตอัตราค่าบริการ';
    }
    case 'service_rate.deleted': {
      const svc = m.service === 'lite' ? 'Lite' : m.service === 'corp' ? 'Corporate' : m.service || '';
      const kind = m.kind === 'intl' ? 'International' : m.kind === 'local' ? 'Local Access' : m.kind || '';
      const speed = m.speed != null ? `${Number(m.speed).toLocaleString('en-US')} Mbps` : '';
      const parts = [svc, kind, speed].filter(Boolean);
      return parts.length ? `ลบอัตราค่าบริการ — ${parts.join(' · ')}` : 'ลบอัตราค่าบริการ';
    }
    case 'approval_authority.created':
    case 'approval_authority.updated':
    case 'approval_authority.deleted': {
      const action = eventMessage.endsWith('.created')
        ? 'เพิ่มกฎอำนาจอนุมัติ'
        : eventMessage.endsWith('.deleted')
          ? 'ลบกฎอำนาจอนุมัติ'
          : 'แก้ไขกฎอำนาจอนุมัติ';
      const parts = [
        m.serviceName || m.serviceKey,
        m.conditionLabel || m.conditionKey,
        m.approverAbbr && `ผู้อนุมัติ ${m.approverAbbr}`,
      ].filter(Boolean);
      return parts.length ? `${action} — ${parts.join(' · ')}` : action;
    }
    case 'product_manager.created':
    case 'product_manager.updated':
    case 'product_manager.deleted': {
      const action = eventMessage.endsWith('.created')
        ? 'เพิ่มรายชื่อ Super PM / PM'
        : eventMessage.endsWith('.deleted')
          ? 'ลบรายชื่อ Super PM / PM'
          : 'แก้ไขรายชื่อ Super PM / PM';
      const who = [m.pmName, m.superPmName].filter(Boolean).join(' / ');
      const parts = [m.serviceGroup || m.serviceKey, who, m.businessGroup].filter(Boolean);
      return parts.length ? `${action} — ${parts.join(' · ')}` : action;
    }
    case 'admin.restore':
      return 'เริ่มกู้คืนข้อมูลจากสำรอง (backup)';
    case 'admin.restore.failed':
      return m.error
        ? `กู้คืนข้อมูลไม่สำเร็จ — ${String(m.error).slice(0, 160)}`
        : 'กู้คืนข้อมูลไม่สำเร็จ';
    case 'document.ocr.structured': {
      const chars = m.inputChars != null && Number.isFinite(Number(m.inputChars))
        ? ` (${Number(m.inputChars).toLocaleString('th-TH')} ตัวอักษร)`
        : '';
      return know
        ? `จัดเรียงข้อความด้วย AI — Knowledge ${q(know)}${chars}`
        : `จัดเรียงข้อความด้วย AI${chars}`;
    }
    case 'user.private_context.updated': {
      const parts = [];
      if (m.savedKnowledge) parts.push('บันทึกความจำ (/จำ)');
      if (m.savedInstructions) parts.push('ตั้งคำสั่ง AI (/สั่ง)');
      const what = parts.length ? parts.join(' · ') : 'อัปเดตเนื้อหาส่วนตัว';
      const state = m.enabled === true ? ' — เปิดโหมดส่วนตัว' : m.enabled === false ? ' — ปิดโหมดส่วนตัว' : '';
      return `ผู้ใช้ใช้งานโหมดส่วนตัว — ${what}${state}`;
    }
    case 'email.send.failed':
      return m.error
        ? `ส่งอีเมลไม่สำเร็จ — ${String(m.error).slice(0, 160)}`
        : 'ส่งอีเมลไม่สำเร็จ';
    case 'chat.retention.pruned': {
      const n = m.deletedCount != null ? Number(m.deletedCount) : m.count != null ? Number(m.count) : null;
      return n != null && Number.isFinite(n)
        ? `ระบบลบแชทเก่าอัตโนมัติ ${n.toLocaleString('th-TH')} รายการ`
        : 'ระบบลบแชทเก่าอัตโนมัติ';
    }
    case 'system.log.retention.pruned': {
      const n = m.deletedCount != null ? Number(m.deletedCount) : m.count != null ? Number(m.count) : null;
      return n != null && Number.isFinite(n)
        ? `ระบบลบ log เก่าอัตโนมัติ ${n.toLocaleString('th-TH')} รายการ`
        : 'ระบบลบ log เก่าอัตโนมัติ';
    }
    default:
      break;
  }

  if (m.term) return `เกี่ยวกับคำพ้อง ${q(m.term)}`;
  if (know) return `เกี่ยวกับ Knowledge ชื่อ ${q(know)}`;
  if (botNm) return `เกี่ยวกับบอท ชื่อ ${q(botNm)}`;
  if (m.fileCount != null) return `เกี่ยวกับการอัปโหลด จำนวน ${m.fileCount} ไฟล์`;
  if (m.email) return `เกี่ยวกับบัญชี ${m.email}`;
  if (m.error) return String(m.error).slice(0, 180);
  if (typeof m.message === 'string' && m.message && !String(eventMessage || '').startsWith('http.')) {
    return String(m.message).slice(0, 160);
  }
  return EVENT_LABEL_TH[eventMessage] || (eventMessage ? `เหตุการณ์: ${eventMessage}` : '—');
}

/** จัด meta เป็น key-value สำหรับอ่านใน panel รายละเอียด */
function buildMetaEntries(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
  return Object.entries(meta)
    .filter(([key, value]) => !META_OMIT_KEYS.has(key) && value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
    }));
}

/** กลุ่มประเภทในตัวกรอง — ชื่อกลุ่มและรายการเป็นภาษาไทยทั้งหมด */
const EVENT_FILTER_GROUPS = [
  {
    label: 'ปัญหา/ข้อผิดพลาดระบบ',
    keys: [
      'http.error',
      'http.exception',
      'email.send.failed',
      'upload.batch.failed',
      'document.vectorize.failed',
      'integration.update.failed',
      'admin.restore.failed',
    ],
  },
  {
    label: 'Security — ล็อกอินถูกปฏิเสธ',
    keys: [
      'auth.login.rejected.invalid_user',
      'auth.login.rejected.invalid_password',
      'auth.login.rejected.locked',
      'auth.login.rejected.disabled',
      'auth.login.rejected.email_not_verified',
      'auth.login.rejected.pending_approval',
    ],
  },
  {
    label: 'การเข้าใช้และรหัสผ่าน',
    keys: [
      'auth.login',
      'auth.logout',
      'auth.email.verified',
      'auth.email.resend',
      'auth.email.verification.sent',
      'auth.email.verification.failed',
      'auth.password.reset.requested',
      'auth.password.reset',
      'auth.password.reset.rejected.invalid_token',
      'auth.password.reset.email.sent',
      'auth.password.reset.email.failed',
      'auth.password.set.initial',
      'auth.password.changed',
      'admin.user.password.reset',
    ],
  },
  {
    label: 'สมัครสมาชิกและการอนุมัติ',
    keys: [
      'user.signup.pending',
      'user.signup.approved',
      'user.signup.rejected.duplicate_email',
      'user.approval.request.submitted',
      'user.approval.updated',
      'user.expiry.renewed',
    ],
  },
  {
    label: 'จัดการผู้ใช้',
    keys: [
      'user.profile.updated',
      'user.status.updated',
      'user.role.updated',
      'admin.user.deleted',
      'support.user.deleted',
    ],
  },
  {
    label: 'Knowledge และการอัปโหลด',
    keys: [
      'document.created',
      'document.updated',
      'document.ocr.structured',
      'document.vectorize.failed',
      'document.deleted',
      'user.knowledge.created',
      'user.knowledge.deleted',
      'user.knowledge.upload.completed',
      'upload.batch.completed',
      'upload.batch.failed',
      'admin.upload.batch.retry',
    ],
  },
  {
    label: 'ระบบ (Synonyms / Rates / อำนาจ / Super PM / ประกาศ)',
    keys: [
      'synonym.created',
      'synonym.updated',
      'synonym.enabled',
      'synonym.disabled',
      'synonym.deleted',
      'service_rate.updated',
      'service_rate.deleted',
      'approval_authority.created',
      'approval_authority.updated',
      'approval_authority.deleted',
      'product_manager.created',
      'product_manager.updated',
      'product_manager.deleted',
      'admin.announcement.created',
      'admin.announcement.updated',
      'admin.announcement.enabled',
      'admin.announcement.disabled',
      'admin.announcement.deleted',
    ],
  },
  {
    label: 'การใช้งานของผู้ใช้ (โหมดส่วนตัว)',
    keys: ['user.private_context.updated'],
  },
  {
    label: 'Integrations',
    keys: ['integration.line.updated', 'integration.updated', 'integration.update.failed'],
  },
  {
    label: 'บอทและการดูแลระบบ',
    keys: [
      'bot.created',
      'bot.updated',
      'user.bot.created',
      'admin.bot.created',
      'admin.bot.updated',
      'bot.deleted',
      'admin.guide.updated',
      'manual.updated',
      'manual.pdf.uploaded',
      'admin.restore',
      'admin.restore.failed',
      'chat.retention.pruned',
      'system.log.retention.pruned',
    ],
  },
  {
    label: 'Admin Dev Studio',
    keys: [
      'admin_dev.config.updated',
      'admin_dev.branding.logo.updated',
    ],
  },
];

function ActivityLogs({ userRole }) {
  const { getCopy, getTextStyle } = useAdminSystemConfig();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastSynced, setLastSynced] = useState(null);
  const [eventFilter, setEventFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedRowIds, setExpandedRowIds] = useState(() => new Set());

  const allowed = userRole === 'admin' || userRole === 'admin_metrics';

  const activeFilterCount = [
    eventFilter,
    keyword.trim(),
    fromDate,
    toDate,
  ].filter(Boolean).length;

  const load = useCallback(
    async (opts = {}) => {
      const silent = opts.silent === true;
      const f = opts.filters;
      const event = f !== undefined ? f.event : eventFilter;
      const q = f !== undefined ? f.q : keyword;
      const from = f !== undefined ? f.from : fromDate;
      const to = f !== undefined ? f.to : toDate;
      if (!silent) {
        setLoading(true);
        setError('');
      }
      try {
        const data = await api.getLogs({
          take: 500,
          mask: false,
          event: String(event || '').trim() || undefined,
          q: String(q || '').trim() || undefined,
          from: String(from || '').trim() || undefined,
          to: String(to || '').trim() || undefined,
        });
        setRows(Array.isArray(data) ? data : []);
        setLastSynced(new Date());
        setError('');
      } catch (e) {
        if (!silent) {
          setError(e?.message || 'โหลดไม่สำเร็จ');
          setRows([]);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [eventFilter, keyword, fromDate, toDate],
  );

  const resetFilters = () => {
    setEventFilter('');
    setKeyword('');
    setFromDate('');
    setToDate('');
    load({ silent: false, filters: { event: '', q: '', from: '', to: '' } });
  };

  const toggleExpanded = (id) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!allowed) return;
    load({ silent: false });
    const timer = setInterval(() => {
      load({ silent: true });
    }, POLL_MS);
    const onFocus = () => load({ silent: true });
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [allowed, load]);

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
            <HiClipboardList className="text-white text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800" style={getTextStyle('admin.logs.title')}>
              {getCopy('admin.logs.title', 'กิจกรรมระบบ (Logs)')}
            </h1>
            <p className="text-sm text-gray-600" style={getTextStyle('admin.logs.subtitle')}>
              {getCopy('admin.logs.subtitle', 'ติดตามเหตุการณ์และการทำงานของระบบ')}
              <span className="text-gray-500">
                {' '}
                · อัปเดตทุก {POLL_MS / 1000} วินาที
                {lastSynced
                  ? ` · ล่าสุด ${lastSynced.toLocaleTimeString('th-TH', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}`
                  : ''}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className={`inline-flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtersOpen || activeFilterCount
                ? 'border-[#F5C200] bg-[#FFF9E6] text-gray-900'
                : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
            }`}
          >
            <HiFilter className="text-lg" />
            ตัวกรอง
            {activeFilterCount > 0 ? (
              <span className="bg-[#F5C200] text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            ) : null}
            {filtersOpen ? <HiChevronUp /> : <HiChevronDown />}
          </button>
          <button
            type="button"
            onClick={() => load({ silent: false })}
            className="inline-flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700"
          >
            <HiRefresh className={loading ? 'animate-spin' : ''} />
            รีเฟรช
          </button>
        </div>
      </div>

      {filtersOpen ? (
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <p className="text-sm font-semibold text-gray-800 mb-3">ตั้งค่าตัวกรอง (ชื่อประเภทเป็นภาษาไทยตามกลุ่มด้านล่าง)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            <span>ประเภทเหตุการณ์ (ภาษาไทย)</span>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">ทั้งหมด — แสดงทุกประเภท</option>
              {EVENT_FILTER_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.keys.map((key) =>
                    EVENT_LABEL_TH[key] ? (
                      <option key={key} value={key}>
                        {EVENT_LABEL_TH[key]}
                      </option>
                    ) : null,
                  )}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600 md:col-span-2">
            <span>คำค้น (ข้อความเหตุการณ์ / อีเมล / ชื่อผู้ใช้)</span>
            <input
              type="search"
              placeholder="เช่น login, auth, @domain"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load({ silent: false })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            <span>ตั้งแต่วันที่</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            <span>ถึงวันที่</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </label>
          <div className="flex flex-wrap gap-2 pb-0.5">
            <button
              type="button"
              onClick={() => load({ silent: false })}
              className="border border-gray-800 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700"
            >
              ใช้ตัวกรอง
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="border border-gray-300 bg-white text-gray-800 px-4 py-2 rounded-lg text-sm hover:bg-gray-100"
            >
              ล้างตัวกรอง
            </button>
          </div>
        </div>
      </div>
      ) : null}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="max-h-[72vh] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5C200] border-b border-[#E6B800] text-left text-gray-900 shadow-sm sticky top-0 z-10">
                <th className="px-4 py-3 font-bold whitespace-nowrap">เวลา</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">ประเภท</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">ผู้ดำเนินการ</th>
                <th className="px-4 py-3 font-bold">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                    ไม่มีข้อมูล
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const u = row.user;
                  const whoName = u?.name || (row.meta?.email ? String(row.meta.email) : '—');
                  const whoEmail = u?.email || '';
                  const whoTitle = whoEmail ? `${whoName} · ${whoEmail}` : whoName;
                  const label = typeLabelTh(row.message);
                  const errorType = isErrorEvent(row.message);
                  const detail = formatAdminSummary(row.message, row.meta);
                  const metaEntries = buildMetaEntries(row.meta);
                  const isExpanded = expandedRowIds.has(row.id);
                  const isLong = typeof detail === 'string' && detail.length > 180;
                  return (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-[#FFFBF0]/80">
                      <td className="px-4 py-3 text-gray-600 align-top whitespace-nowrap">
                        {row.createdAt
                          ? new Date(row.createdAt).toLocaleString('th-TH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td
                        className={`px-4 py-3 align-top whitespace-nowrap ${
                          errorType ? 'text-red-700 font-medium' : 'text-gray-700'
                        }`}
                        title={label}
                      >
                        {label}
                      </td>
                      <td className="px-4 py-3 text-gray-700 align-top whitespace-nowrap" title={whoTitle}>
                        <div className="leading-tight">
                          <div>{whoName}</div>
                          {whoEmail ? <div className="text-xs text-gray-500">{whoEmail}</div> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-800 align-top text-sm leading-relaxed">
                        <div className="space-y-2">
                          <div className={isExpanded ? 'whitespace-pre-wrap break-words' : 'break-words line-clamp-2'}>
                            {detail}
                          </div>
                          {(isLong || metaEntries.length > 0) ? (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(row.id)}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8B8680] hover:text-[#5f5a53]"
                              title="สลับการแสดงรายละเอียด"
                            >
                              {isExpanded ? <HiChevronUp /> : <HiChevronDown />}
                              {isExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
                            </button>
                          ) : null}
                          {isExpanded ? (
                            <div className="rounded-lg border border-[#F3E3A3] bg-[#FFFDF5] p-3 max-h-72 overflow-auto">
                              <div className="text-xs font-semibold text-gray-700 mb-2">รายละเอียดเพิ่มเติม</div>
                              {metaEntries.length === 0 ? (
                                <p className="text-xs text-gray-500">ไม่มีข้อมูลเพิ่มเติม</p>
                              ) : (
                                <div className="space-y-2">
                                  {metaEntries.map((entry) => (
                                    <div key={`${row.id}-${entry.key}`} className="text-xs">
                                      <p className="font-semibold text-gray-700">{entry.key}</p>
                                      <pre className="mt-0.5 whitespace-pre-wrap break-words text-gray-600 font-mono">
                                        {entry.value}
                                      </pre>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ActivityLogs;
