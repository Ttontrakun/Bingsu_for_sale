/** Catalog ของ edit-key / menu.id ที่ Dev Studio รู้จัก */

export const COPY_KEYS = [
  {
    key: "user.login.title",
    label: "ชื่อบนหน้า Login",
    page: "login",
    defaultValue: "Enterprise AI Chatbot",
  },
  {
    key: "user.verify.title",
    label: "หัวข้อหน้า Verify",
    page: "verify",
    defaultValue: "ยืนยันอีเมลของคุณ",
  },
  {
    key: "user.verify.body1",
    label: "คำอธิบาย Verify บรรทัด 1",
    page: "verify",
    defaultValue: "กรุณาเปิดกล่องจดหมายของคุณ แล้วคลิกลิงก์ในอีเมลเพื่อยืนยันอีเมลนี้",
  },
  {
    key: "user.verify.body2",
    label: "คำอธิบาย Verify บรรทัด 2",
    page: "verify",
    defaultValue: "หลังยืนยันอีเมล คำขอจะเข้าคิวรอ Support Team ตรวจสอบและอนุมัติสิทธิ์ใช้งาน",
  },
  {
    key: "user.verify.resend",
    label: "ข้อความส่งลิงก์ใหม่",
    page: "verify",
    defaultValue: "ส่งลิงก์ใหม่",
  },
  {
    key: "user.verify.spamHint",
    label: "คำแนะนำ spam (Verify)",
    page: "verify",
    defaultValue: "ลิงก์อาจใช้เวลา 1-2 นาที และอาจอยู่ใน spam",
  },
  {
    key: "user.emailVerify.subject",
    label: "หัวข้ออีเมลยืนยัน",
    page: "email",
    defaultValue: "[Enterprise AI Chatbot] กรุณายืนยันอีเมลเพื่อเปิดใช้งานบัญชี",
  },
  {
    key: "user.emailVerify.body1",
    label: "เนื้อหาอีเมลบรรทัด 1",
    page: "email",
    defaultValue: "ระบบได้รับคำขอสมัครใช้งานบัญชี {{appName}} ของท่านแล้ว",
  },
  {
    key: "user.emailVerify.body2",
    label: "เนื้อหาอีเมลบรรทัด 2",
    page: "email",
    defaultValue: "กรุณาคลิกปุ่มด้านล่างเพื่อยืนยันอีเมลและดำเนินการตั้งรหัสผ่าน",
  },
  {
    key: "user.emailVerify.button",
    label: "ปุ่มในอีเมลยืนยัน",
    page: "email",
    defaultValue: "ยืนยันอีเมล",
  },
  {
    key: "user.emailVerify.ignore",
    label: "ข้อความเพิกเฉยอีเมล",
    page: "email",
    defaultValue: "หากท่านไม่ได้เป็นผู้สมัครใช้งาน กรุณาเพิกเฉยอีเมลฉบับนี้",
  },
  {
    key: "user.homepage.title",
    label: "หัวข้อหน้า Homepage",
    page: "homepage",
    defaultValue: "Welcome to Enterprise AI Chatbot LLM",
  },
  {
    key: "user.homepage.description",
    label: "คำอธิบายหน้า Homepage",
    page: "homepage",
    defaultValue:
      "ค้นหาข้อมูลจากเอกสารที่มีในระบบ และตอบคำถามตามเนื้อหาในเอกสารนั้น พร้อมระบุแหล่งอ้างอิงให้ตรวจสอบได้",
  },
  {
    key: "user.homepage.placeholder",
    label: "Placeholder ช่องพิมพ์ (Homepage)",
    page: "homepage",
    defaultValue: 'ถามเกี่ยวกับเอกสารในระบบ เช่น "อัตราค่าบริการ NT Corporate Internet"',
  },
  {
    key: "user.private.title",
    label: "หัวข้อหน้า Private",
    page: "private",
    defaultValue: "โหมดส่วนตัว — ถามจากเนื้อหาของคุณเอง",
  },
  {
    key: "user.private.bannerTitle",
    label: "หัวข้อแบนเนอร์ Private",
    page: "private",
    defaultValue: "โหมดส่วนตัว",
  },
  {
    key: "user.private.bannerBody",
    label: "คำอธิบายแบนเนอร์ Private",
    page: "private",
    defaultValue: "ใช้ข้อมูลของท่านเองได้ โดยไม่กระทบเอกสารระบบหรือผู้ใช้อื่น",
  },
  {
    key: "user.private.placeholder",
    label: "Placeholder ช่องพิมพ์ (Private)",
    page: "private",
    defaultValue: "พิมพ์ข้อความ... หรือใช้ /จำ ข้อมูล และ /สั่ง คำสั่ง AI",
  },
  {
    key: "user.search.title",
    label: "หัวข้อหน้าต่างค้นหาแชท",
    page: "search",
    defaultValue: "แชททั้งหมด",
  },
  {
    key: "user.bots.title",
    label: "หัวข้อหน้า Bots",
    page: "bots",
    defaultValue: "Bots",
  },
  {
    key: "user.bots.subtitle",
    label: "คำอธิบายหน้า Bots",
    page: "bots",
    defaultValue: "บอทของคุณ — บัญชีผู้ใช้มีได้ 1 บอท",
  },
  {
    key: "user.knowledge.title",
    label: "หัวข้อหน้า Knowledge",
    page: "knowledge",
    defaultValue: "Knowledge",
  },
  {
    key: "user.knowledge.subtitle",
    label: "คำอธิบายหน้า Knowledge",
    page: "knowledge",
    defaultValue: "ฐานความรู้ของคุณ",
  },
  {
    key: "admin.login.titleLine1",
    label: "ชื่อบนหน้า Login (บรรทัด 1)",
    page: "admin.login",
    defaultValue: "Enterprise AI Chatbot",
  },
  {
    key: "admin.login.titleLine2",
    label: "ชื่อบนหน้า Login (บรรทัด 2)",
    page: "admin.login",
    defaultValue: "Support & Admin",
  },
  {
    key: "admin.dashboard.title",
    label: "หัวข้อหน้า Dashboard",
    page: "admin.dashboard",
    defaultValue: "Dashboard",
  },
  {
    key: "admin.dashboard.subtitle",
    label: "คำอธิบายหน้า Dashboard",
    page: "admin.dashboard",
    defaultValue: "ภาพรวมการใช้งานและสถานะระบบ",
  },
  {
    key: "admin.manual.title",
    label: "หัวข้อหน้า Manual",
    page: "admin.manual",
    defaultValue: "Manual",
  },
  {
    key: "admin.manual.subtitle",
    label: "คำอธิบายหน้า Manual",
    page: "admin.manual",
    defaultValue: "คู่มือและเนื้อหาสำหรับทีม Support",
  },
  {
    key: "admin.bots.title",
    label: "หัวข้อหน้า Bots",
    page: "admin.bots",
    defaultValue: "Bots",
  },
  {
    key: "admin.bots.subtitle",
    label: "คำอธิบายหน้า Bots",
    page: "admin.bots",
    defaultValue: "จัดการบอทและการตั้งค่า",
  },
  {
    key: "admin.knowledge.title",
    label: "หัวข้อหน้า Knowledge",
    page: "admin.knowledge",
    defaultValue: "Knowledge",
  },
  {
    key: "admin.knowledge.subtitle",
    label: "คำอธิบายหน้า Knowledge",
    page: "admin.knowledge",
    defaultValue: "จัดการฐานความรู้และเอกสาร",
  },
  {
    key: "admin.userBots.title",
    label: "หัวข้อหน้า User Bots",
    page: "admin.userBots",
    defaultValue: "User Bots",
  },
  {
    key: "admin.userBots.subtitle",
    label: "คำอธิบายหน้า User Bots",
    page: "admin.userBots",
    defaultValue: "บอทของผู้ใช้ — กดดูรายละเอียดเพื่อเห็นชื่อเอกสารที่แนบ",
  },
  {
    key: "admin.supportPanel.title",
    label: "หัวข้อหน้า Support Panel",
    page: "admin.supportPanel",
    defaultValue: "Support Panel",
  },
  {
    key: "admin.supportPanel.subtitle",
    label: "คำอธิบายหน้า Support Panel",
    page: "admin.supportPanel",
    defaultValue: "จัดการผู้ใช้และอนุมัติบัญชี",
  },
  {
    key: "admin.feedback.title",
    label: "หัวข้อหน้า Feedback",
    page: "admin.feedback",
    defaultValue: "Feedback จากผู้ใช้",
  },
  {
    key: "admin.feedback.subtitle",
    label: "คำอธิบายหน้า Feedback",
    page: "admin.feedback",
    defaultValue: "รีวิวคำถาม-คำตอบที่ผู้ใช้ให้คะแนน",
  },
  {
    key: "admin.system.title",
    label: "หัวข้อหน้า System",
    page: "admin.system",
    defaultValue: "System",
  },
  {
    key: "admin.system.subtitle",
    label: "คำอธิบายหน้า System",
    page: "admin.system",
    defaultValue: "จัดการประกาศ คำพ้อง อัตราค่าบริการ และโครงสร้างบริการ",
  },
  {
    key: "admin.logs.title",
    label: "หัวข้อหน้า Logs",
    page: "admin.logs",
    defaultValue: "กิจกรรมระบบ (Logs)",
  },
  {
    key: "admin.logs.subtitle",
    label: "คำอธิบายหน้า Logs",
    page: "admin.logs",
    defaultValue: "ติดตามเหตุการณ์และการทำงานของระบบ",
  },
];

export const USER_MENU_CATALOG = [
  { id: "home", label: "หน้าหลัก / New Chat", feature: null },
  { id: "private", label: "โหมดส่วนตัว", feature: null },
  { id: "history", label: "ค้นหาแชท (Chats)", feature: null },
  { id: "createBot", label: "Bots", feature: "user.createBot" },
  { id: "uploadDocs", label: "Knowledge", feature: "user.uploadDocuments" },
];

export const ADMIN_MENU_CATALOG = [
  { id: "dashboard", label: "Dashboard" },
  { id: "manual", label: "Manual" },
  { id: "bots", label: "Bots" },
  { id: "knowledge", label: "Knowledge" },
  { id: "userBots", label: "User Bots" },
  { id: "supportPanel", label: "Support Panel" },
  { id: "feedback", label: "Feedback" },
  { id: "system", label: "System" },
  { id: "logs", label: "Logs" },
];

/** แท็บในหน้า System ของ Supportadmin — เปิด/ปิดได้จาก Dev Studio */
export const ADMIN_SYSTEM_TAB_CATALOG = [
  { id: "announce", label: "ประกาศ", feature: "admin.system.announce" },
  { id: "synonyms", label: "Synonyms", feature: "admin.system.synonyms" },
  { id: "rates", label: "Service Rates", feature: "admin.system.rates" },
  { id: "authority", label: "อำนาจอนุมัติ", feature: "admin.system.authority" },
  { id: "pm", label: "Super PM / PM", feature: "admin.system.pm" },
];

export const DEFAULT_FEATURES = {
  "user.createBot": true,
  "user.uploadDocuments": true,
  "admin.system.announce": true,
  "admin.system.synonyms": true,
  "admin.system.rates": true,
  "admin.system.authority": true,
  "admin.system.pm": true,
};

export const DEFAULT_MENUS = {
  admin: ADMIN_MENU_CATALOG.map((m) => ({ id: m.id, enabled: true })),
  user: USER_MENU_CATALOG.map((m) => ({
    id: m.id,
    enabled: true,
  })),
  systemTabs: ADMIN_SYSTEM_TAB_CATALOG.map((m) => ({ id: m.id, enabled: true })),
};

export const DEFAULT_COPY = Object.fromEntries(
  COPY_KEYS.map((item) => [item.key, item.defaultValue]),
);

export const DEFAULT_BRANDING = {
  appName: "Enterprise AI Chatbot",
  logoUrl: null,
};

export const DEFAULT_STYLES = {};

export const DEFAULT_SYSTEM_CONFIG = {
  packageId: "pro",
  features: DEFAULT_FEATURES,
  menus: DEFAULT_MENUS,
  copy: DEFAULT_COPY,
  styles: DEFAULT_STYLES,
  branding: DEFAULT_BRANDING,
};
