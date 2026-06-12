import nodemailer from "nodemailer";
import {
  frontendUrl,
  isProduction,
  smtpFrom,
  smtpPassword,
  smtpPort,
  smtpSecure,
  smtpServer,
  smtpUser,
  supportAdminUrl,
  supportApprovalEmail,
} from "../config.js";

const isEmailConfigured = () =>
  Boolean(smtpServer && smtpPort && smtpUser && smtpPassword && smtpFrom);

const appBaseUrl = () => frontendUrl || "http://localhost:8083";
const supportLabel = "ศูนย์ดูแลระบบ BingSu (โทรคมนาคมแห่งชาติ (จำกัด))";
const buildEmailRef = (prefix) => {
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
};

let transporterInstance = null;
const getTransporter = () => {
  if (!transporterInstance) {
    transporterInstance = nodemailer.createTransport({
      host: smtpServer,
      port: smtpPort,
      secure: smtpSecure || smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPassword },
    });
  }
  return transporterInstance;
};

const sendMail = async ({ to, subject, text, html }) => {
  if (!isEmailConfigured()) {
    const msg = "SMTP is not configured";
    if (isProduction) throw new Error(msg);
    console.warn(`[email] ${msg}; skip sending in non-production.`);
    return { skipped: true };
  }
  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    text,
    html,
  });
  return { messageId: info?.messageId || null };
};

export const sendVerificationEmail = async ({ email, name, token }) => {
  if (!email || !token) return { skipped: true };
  const verifyLink = `${appBaseUrl()}/verifying?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  const refCode = buildEmailRef("REG");
  const subject = "[BingSu] กรุณายืนยันอีเมลเพื่อเปิดใช้งานบัญชี";
  const text = [
    `เรียน คุณ${name || "ผู้ใช้งาน"}`,
    "",
    "โทรคมนาคมแห่งชาติ (จำกัด)",
    supportLabel,
    `เลขอ้างอิง: ${refCode}`,
    "",
    "ระบบได้รับคำขอสมัครใช้งานบัญชี BingSu ของท่านแล้ว",
    "กรุณาคลิกลิงก์ด้านล่างเพื่อยืนยันอีเมลและดำเนินการตั้งรหัสผ่าน:",
    verifyLink,
    "",
    "หมายเหตุ:",
    "- ลิงก์นี้ใช้ได้ชั่วคราวและสำหรับบัญชีนี้เท่านั้น",
    "- หากท่านไม่ได้เป็นผู้สมัครใช้งาน กรุณาเพิกเฉยอีเมลฉบับนี้",
    "",
    "อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติ กรุณาอย่าตอบกลับ (Do not reply)",
    "หากต้องการความช่วยเหลือ กรุณาติดต่อทีมผู้ดูแลระบบ",
    "",
    "ขอแสดงความนับถือ",
    supportLabel,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;background:#f8fafc;padding:20px">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px">
        <p style="margin:0 0 6px;font-size:12px;color:#6b7280">โทรคมนาคมแห่งชาติ (จำกัด)</p>
        <p style="margin:0 0 6px;font-size:12px;color:#6b7280">${supportLabel}</p>
        <p style="margin:0 0 14px;font-size:12px;color:#6b7280">เลขอ้างอิง: <strong>${refCode}</strong></p>
        <p style="margin:0 0 12px">เรียน คุณ${name || "ผู้ใช้งาน"}</p>
        <p style="margin:0 0 12px">ระบบได้รับคำขอสมัครใช้งานบัญชี <strong>BingSu</strong> ของท่านแล้ว</p>
        <p style="margin:0 0 16px">กรุณาคลิกปุ่มด้านล่างเพื่อยืนยันอีเมลและดำเนินการตั้งรหัสผ่าน</p>
        <p style="margin:0 0 18px">
          <a href="${verifyLink}" style="display:inline-block;background:#f59e0b;color:#111;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:8px">ยืนยันอีเมล</a>
        </p>
        <p style="margin:0 0 8px;font-size:12px;color:#4b5563">หากปุ่มไม่ทำงาน กรุณาคัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์:</p>
        <p style="margin:0 0 14px;word-break:break-all;font-size:12px"><a href="${verifyLink}">${verifyLink}</a></p>
        <p style="margin:0;font-size:12px;color:#6b7280">หากท่านไม่ได้เป็นผู้สมัครใช้งาน กรุณาเพิกเฉยอีเมลฉบับนี้</p>
        <p style="margin:8px 0 0;font-size:12px;color:#6b7280">อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติ กรุณาอย่าตอบกลับ (Do not reply)</p>
        <p style="margin:14px 0 0;font-size:12px;color:#6b7280">ขอแสดงความนับถือ<br/>${supportLabel}</p>
      </div>
    </div>
  `;
  return sendMail({ to: email, subject, text, html });
};

export const sendPasswordResetEmail = async ({ email, name, token }) => {
  if (!email || !token) return { skipped: true };
  const resetLink = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const refCode = buildEmailRef("PWD");
  const subject = "[BingSu] คำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของท่าน";
  const text = [
    `เรียน คุณ${name || "ผู้ใช้งาน"}`,
    "",
    "โทรคมนาคมแห่งชาติ (จำกัด)",
    supportLabel,
    `เลขอ้างอิง: ${refCode}`,
    "",
    "ระบบได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี BingSu ของท่าน",
    "กรุณาคลิกลิงก์ด้านล่างเพื่อดำเนินการ:",
    resetLink,
    "",
    "หมายเหตุ:",
    "- ลิงก์นี้ใช้ได้ชั่วคราวและสามารถใช้ได้ครั้งเดียว",
    "- หากท่านไม่ได้เป็นผู้ดำเนินการ กรุณาเพิกเฉยอีเมลฉบับนี้เพื่อความปลอดภัย",
    "",
    "อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติ กรุณาอย่าตอบกลับ (Do not reply)",
    "หากต้องการความช่วยเหลือ กรุณาติดต่อทีมผู้ดูแลระบบ",
    "",
    "ขอแสดงความนับถือ",
    supportLabel,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;background:#f8fafc;padding:20px">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px">
        <p style="margin:0 0 6px;font-size:12px;color:#6b7280">โทรคมนาคมแห่งชาติ (จำกัด)</p>
        <p style="margin:0 0 6px;font-size:12px;color:#6b7280">${supportLabel}</p>
        <p style="margin:0 0 14px;font-size:12px;color:#6b7280">เลขอ้างอิง: <strong>${refCode}</strong></p>
        <p style="margin:0 0 12px">เรียน คุณ${name || "ผู้ใช้งาน"}</p>
        <p style="margin:0 0 12px">ระบบได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี <strong>BingSu</strong> ของท่าน</p>
        <p style="margin:0 0 16px">กรุณาคลิกปุ่มด้านล่างเพื่อดำเนินการ</p>
        <p style="margin:0 0 18px">
          <a href="${resetLink}" style="display:inline-block;background:#f59e0b;color:#111;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:8px">ตั้งรหัสผ่านใหม่</a>
        </p>
        <p style="margin:0 0 8px;font-size:12px;color:#4b5563">หากปุ่มไม่ทำงาน กรุณาคัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์:</p>
        <p style="margin:0 0 14px;word-break:break-all;font-size:12px"><a href="${resetLink}">${resetLink}</a></p>
        <p style="margin:0;font-size:12px;color:#6b7280">หากท่านไม่ได้เป็นผู้ดำเนินการ กรุณาเพิกเฉยอีเมลฉบับนี้เพื่อความปลอดภัย</p>
        <p style="margin:8px 0 0;font-size:12px;color:#6b7280">อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติ กรุณาอย่าตอบกลับ (Do not reply)</p>
        <p style="margin:14px 0 0;font-size:12px;color:#6b7280">ขอแสดงความนับถือ<br/>${supportLabel}</p>
      </div>
    </div>
  `;
  return sendMail({ to: email, subject, text, html });
};

export const sendSupportPendingApprovalEmail = async ({ email, name, userId }) => {
  if (!supportApprovalEmail) return { skipped: true };
  const adminHint = supportAdminUrl ? `\nหน้าอนุมัติ: ${supportAdminUrl}` : "";
  const subject = "มีผู้ใช้ใหม่รออนุมัติ";
  const text = [
    "มีผู้ใช้ใหม่สมัครเข้ามาและรอการอนุมัติ",
    `ชื่อ: ${name || "-"}`,
    `อีเมล: ${email || "-"}`,
    `userId: ${userId || "-"}`,
    adminHint,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <p>มีผู้ใช้ใหม่สมัครเข้ามาและรอการอนุมัติ</p>
      <ul>
        <li><strong>ชื่อ:</strong> ${name || "-"}</li>
        <li><strong>อีเมล:</strong> ${email || "-"}</li>
        <li><strong>userId:</strong> ${userId || "-"}</li>
      </ul>
      ${supportAdminUrl ? `<p>หน้าอนุมัติ: <a href="${supportAdminUrl}">${supportAdminUrl}</a></p>` : ""}
    </div>
  `;
  return sendMail({ to: supportApprovalEmail, subject, text, html });
};

export const emailFeatures = {
  isConfigured: isEmailConfigured,
};
