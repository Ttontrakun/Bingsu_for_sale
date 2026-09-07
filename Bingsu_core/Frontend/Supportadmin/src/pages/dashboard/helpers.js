export const COLORS = ['#F5C200', '#F5D547', '#F0A500', '#8B8680', '#A89A91', '#6B6560'];
export const GRADIENT_COLORS = {
  sandy: ['#F5C200', '#8B8680'],
  gold: ['#F5C200', '#8B8680'],
  tan: ['#F5C200', '#8B8680'],
  warmgray: ['#F5C200', '#8B8680'],
  light: ['#F5C200', '#8B8680'],
  pale: ['#F5C200', '#8B8680']
};

export const isErrorLogEvent = (message) => {
  const key = String(message || '').toLowerCase();
  return key === 'http.error' || key === 'http.exception' || key.endsWith('.failed');
};

export const getErrorTypeKey = (message) => {
  const key = String(message || '').toLowerCase();
  if (key === 'http.error') return 'httpError';
  if (key === 'http.exception') return 'httpException';
  if (key.endsWith('.failed')) return 'failed';
  return 'other';
};

export const getErrorCategoryKey = (row) => {
  const key = String(row?.message || '').toLowerCase();
  const meta = row?.meta && typeof row.meta === 'object' ? row.meta : {};
  const raw = `${key} ${String(meta?.error || '').toLowerCase()} ${String(meta?.url || '').toLowerCase()} ${String(meta?.path || '').toLowerCase()}`;

  if (raw.includes('ocr')) return 'ocr';
  if (raw.includes('vector') || raw.includes('qdrant') || raw.includes('embed')) return 'vector';
  if (raw.includes('upload')) return 'upload';
  if (key === 'http.error' || key === 'http.exception') return 'http';
  if (key.endsWith('.failed')) return 'failed';
  return 'other';
};

export const getErrorWindowStartMs = (range) => {
  const now = Date.now();
  if (range === 'day') return now - (24 * 60 * 60 * 1000);
  if (range === 'month') return now - (30 * 24 * 60 * 60 * 1000);
  return now - (7 * 24 * 60 * 60 * 1000);
};

export const getErrorRangeLabel = (range) => {
  if (range === 'day') return 'วันล่าสุด';
  if (range === 'month') return 'เดือนล่าสุด';
  return 'สัปดาห์ล่าสุด';
};

export const TOKEN_RANGE_DAYS = { day: 1, week: 7, month: 30 };
export const getTokenRangeLabel = (range) => {
  if (range === 'day') return '1 วันล่าสุด';
  if (range === 'week') return '7 วันล่าสุด';
  return '30 วันล่าสุด';
};
export const RANGE_DAYS = TOKEN_RANGE_DAYS;
export const getRangeLabel = getTokenRangeLabel;

export const getLocalDateKey = (value) => {
  const d = value instanceof Date ? value : new Date(value || 0);
  if (!Number.isFinite(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
