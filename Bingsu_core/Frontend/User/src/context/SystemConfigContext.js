import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import API_CONFIG from '../config/api';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';

const SystemConfigContext = createContext(null);

const DEFAULT_COPY = {
  'user.login.title': 'Enterprise AI Chatbot',
  'user.verify.title': 'ยืนยันอีเมลของคุณ',
  'user.verify.body1': 'กรุณาเปิดกล่องจดหมายของคุณ แล้วคลิกลิงก์ในอีเมลเพื่อยืนยันอีเมลนี้',
  'user.verify.body2': 'หลังยืนยันอีเมล คำขอจะเข้าคิวรอ Support Team ตรวจสอบและอนุมัติสิทธิ์ใช้งาน',
  'user.verify.resend': 'ส่งลิงก์ใหม่',
  'user.verify.spamHint': 'ลิงก์อาจใช้เวลา 1-2 นาที และอาจอยู่ใน spam',
  'user.emailVerify.subject': '[Enterprise AI Chatbot] กรุณายืนยันอีเมลเพื่อเปิดใช้งานบัญชี',
  'user.emailVerify.body1': 'ระบบได้รับคำขอสมัครใช้งานบัญชี {{appName}} ของท่านแล้ว',
  'user.emailVerify.body2': 'กรุณาคลิกปุ่มด้านล่างเพื่อยืนยันอีเมลและดำเนินการตั้งรหัสผ่าน',
  'user.emailVerify.button': 'ยืนยันอีเมล',
  'user.emailVerify.ignore': 'หากท่านไม่ได้เป็นผู้สมัครใช้งาน กรุณาเพิกเฉยอีเมลฉบับนี้',
  'user.homepage.title': 'Welcome to Enterprise AI Chatbot LLM',
  'user.homepage.description':
    'ค้นหาข้อมูลจากเอกสารที่มีในระบบ และตอบคำถามตามเนื้อหาในเอกสารนั้น พร้อมระบุแหล่งอ้างอิงให้ตรวจสอบได้',
  'user.homepage.placeholder':
    'ถามเกี่ยวกับเอกสารในระบบ เช่น "อัตราค่าบริการ NT Corporate Internet"',
  'user.private.title': 'Personal — ถามจากเนื้อหาของคุณเอง',
  'user.private.bannerTitle': 'Personal',
  'user.private.bannerBody': 'ใช้ข้อมูลของท่านเองได้ โดยไม่กระทบเอกสารระบบหรือผู้ใช้อื่น',
  'user.private.placeholder': 'พิมพ์ข้อความ... หรือใช้ /จำ ข้อมูล และ /สั่ง คำสั่ง AI',
  'user.search.title': 'แชททั้งหมด',
  'user.bots.title': 'Bots',
  'user.bots.subtitle': 'บอทของคุณ — บัญชีผู้ใช้มีได้ 1 บอท',
  'user.knowledge.title': 'Knowledge',
  'user.knowledge.subtitle': 'ฐานความรู้ของคุณ',
};

const DEFAULT_BRANDING = {
  appName: 'Enterprise AI Chatbot',
  logoUrl: null,
};

const DEFAULT_MENUS = [
  { id: 'home', enabled: true },
  { id: 'private', enabled: true },
  { id: 'history', enabled: true },
  { id: 'createBot', enabled: true },
  { id: 'uploadDocs', enabled: true },
];

export function resolveBrandingLogoUrl(logoUrl) {
  if (!logoUrl) return bingsuLogo;
  if (/^https?:\/\//i.test(logoUrl) || logoUrl.startsWith('data:') || logoUrl.startsWith('blob:')) {
    return logoUrl;
  }
  const apiBase = String(API_CONFIG.baseURL || '').replace(/\/+$/, '');
  const origin = apiBase.replace(/\/api$/i, '') || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${origin}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
}

export function textStyleToCss(style) {
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

export function SystemConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_CONFIG.baseURL}/config/public`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setConfig(data);
      } catch {
        if (!cancelled) setConfig(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => {
    const copy = { ...DEFAULT_COPY, ...(config?.copy || {}) };
    const branding = { ...DEFAULT_BRANDING, ...(config?.branding || {}) };
    const styles = config?.styles && typeof config.styles === 'object' ? config.styles : {};
    const menusUser = Array.isArray(config?.menus?.user) ? config.menus.user : DEFAULT_MENUS;
    const menuEnabled = (id) => {
      const entry = menusUser.find((m) => m.id === id);
      if (!entry) return true;
      return entry.enabled !== false;
    };
    const features = {
      'user.createBot':
        config?.features?.['user.createBot'] === true || menuEnabled('createBot'),
      'user.uploadDocuments':
        config?.features?.['user.uploadDocuments'] === true || menuEnabled('uploadDocs'),
    };
    return {
      loaded,
      copy,
      styles,
      branding,
      menusUser,
      features,
      menuEnabled,
      getCopy: (key, fallback) => {
        const v = copy[key];
        if (v == null || String(v).trim() === '') return fallback ?? DEFAULT_COPY[key] ?? '';
        return v;
      },
      getTextStyle: (key) => textStyleToCss(styles[key]),
      logoSrc: resolveBrandingLogoUrl(branding.logoUrl),
      appName: branding.appName || DEFAULT_BRANDING.appName,
    };
  }, [config, loaded]);

  return (
    <SystemConfigContext.Provider value={value}>{children}</SystemConfigContext.Provider>
  );
}

export function useSystemConfig() {
  const ctx = useContext(SystemConfigContext);
  if (!ctx) {
    return {
      loaded: false,
      copy: DEFAULT_COPY,
      styles: {},
      branding: DEFAULT_BRANDING,
      menusUser: DEFAULT_MENUS,
      features: { 'user.createBot': true, 'user.uploadDocuments': true },
      menuEnabled: () => true,
      getCopy: (key, fallback) => fallback ?? DEFAULT_COPY[key] ?? '',
      getTextStyle: () => ({}),
      logoSrc: bingsuLogo,
      appName: DEFAULT_BRANDING.appName,
    };
  }
  return ctx;
}
