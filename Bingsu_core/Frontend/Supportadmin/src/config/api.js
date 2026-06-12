// ชี้ไปที่ backend ของ bb (เดียวกับ Frontend/User)
function getBaseURL() {
  const envBase = String(process.env.REACT_APP_API_BASE_URL || '').trim();
  const browserOrigin =
    (typeof window !== 'undefined' && window.location?.origin) || '';
  const browserHost =
    (typeof window !== 'undefined' && window.location?.hostname) || '';
  const isBrowserLocal =
    browserHost === 'localhost' || browserHost === '127.0.0.1';
  const isEnvLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
    envBase
  );

  // If the app is opened from a public URL (e.g. ngrok), ignore localhost env.
  if (envBase && (!isEnvLocal || isBrowserLocal)) {
    return `${envBase.replace(/\/+$/, '')}/api`;
  }
  if (isBrowserLocal) {
    return 'http://localhost:5052/api';
  }
  return browserOrigin ? `${browserOrigin.replace(/\/+$/, '')}/api` : '/api';
}

const API_CONFIG = {
  get baseURL() {
    return getBaseURL();
  },
  timeout: parseInt(process.env.REACT_APP_API_TIMEOUT || '30000', 10),
};

export default API_CONFIG;
