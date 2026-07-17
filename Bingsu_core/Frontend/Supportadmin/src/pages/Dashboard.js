import React, { useMemo, useState, useEffect } from 'react';
import { 
  HiUsers, 
  HiKey, 
  HiDesktopComputer, 
  HiBookOpen, 
  HiUserGroup,
  HiExclamationCircle,
  HiQuestionMarkCircle,
  HiTrendingUp,
  HiArrowUp,
  HiArrowDown,
  HiSparkles,
  HiLightningBolt,
  HiCheckCircle,
  HiShieldCheck
} from 'react-icons/hi';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { api } from '../services/api';

// Mock data for dashboard metrics (ใช้เมื่อ API ไม่มีหรือสำหรับ chart/รายละเอียดที่ backend ยังไม่มี)
const mockDashboardData = {
  // Overall stats - All filter
  totalBots: 17,
  totalKnowledge: 18,
  totalUsers: 23,
  usersExpiringSoon: 9,
  usersPendingApproval: 18,
  dailyUsers: {
    today: 16,
    yesterday: 14,
    change: 14.3
  },
  tokenUsage: {
    today: 2458934,
    yesterday: 2312456,
    change: 6.3
  },
  // 7 days data for charts
  dailyUsersChart: [
    { date: '6 วันก่อน', users: 12 },
    { date: '5 วันก่อน', users: 13 },
    { date: '4 วันก่อน', users: 14 },
    { date: '3 วันก่อน', users: 15 },
    { date: '2 วันก่อน', users: 15 },
    { date: 'เมื่อวาน', users: 14 },
    { date: 'วันนี้', users: 16 }
  ],
  tokenUsageChart: [
    { date: '6 วันก่อน', tokens: 2100456 },
    { date: '5 วันก่อน', tokens: 2156789 },
    { date: '4 วันก่อน', tokens: 2234567 },
    { date: '3 วันก่อน', tokens: 2289123 },
    { date: '2 วันก่อน', tokens: 2298765 },
    { date: 'เมื่อวาน', tokens: 2312456 },
    { date: 'วันนี้', tokens: 2458934 }
  ],
  frequentlyAskedQuestions: [
    { type: 'คำถามเกี่ยวกับบอท', count: 342, percentage: 28.5 },
    { type: 'คำถามเกี่ยวกับการใช้งาน', count: 298, percentage: 24.8 },
    { type: 'คำถามเกี่ยวกับการชำระเงิน', count: 187, percentage: 15.6 },
    { type: 'คำถามเกี่ยวกับบัญชี', count: 156, percentage: 13.0 },
    { type: 'คำถามเกี่ยวกับเทคนิค', count: 134, percentage: 11.2 },
    { type: 'คำถามอื่นๆ', count: 83, percentage: 6.9 }
  ],
  userRoleDistribution: [
    { role: 'ผู้ใช้งาน', count: 28 },
    { role: 'รอดำเนินการ', count: 15 },
    { role: 'ผู้ดูแล', count: 5 },
    { role: 'แอดมิน', count: 2 }
  ],
  hourlyActivity: [
    { hour: '00:00', users: 45, tokens: 89000 },
    { hour: '04:00', users: 32, tokens: 67000 },
    { hour: '08:00', users: 156, tokens: 320000 },
    { hour: '12:00', users: 289, tokens: 580000 },
    { hour: '16:00', users: 312, tokens: 640000 },
    { hour: '20:00', users: 198, tokens: 410000 }
  ],
  botKnowledgeAccuracy: {
    overallAccuracy: 94.1,
    totalQuestions: 4052,
    knowledgeMatches: 3828,
    nonKnowledgeAnswers: 224,
    averageResponseTime: '1.2s',
    improvement: 2.3
  },
  botIntegrations: {
    totalIntegrationLines: 15,
    totalWidgets: 8
  },
  systemStatus: {
    api: { status: 'healthy', uptime: '99.9%', responseTime: '120ms' },
    database: { status: 'healthy', uptime: '99.8%', responseTime: '45ms' },
    storage: { status: 'healthy', usage: '68%', available: '320GB' },
    ai: { status: 'healthy', uptime: '99.7%', responseTime: '250ms', model: 'GPT-4', requests: 12456 },
    ocr: { status: 'healthy', uptime: '99.6%', responseTime: '180ms', processed: 8934, accuracy: '96.8%' },
    server: { status: 'healthy', uptime: '99.95%', cpu: '45%', memory: '62%', disk: '68%' }
  },
  weekComparison: {
    users: { thisWeek: 8721, lastWeek: 8234, change: 5.9 },
    tokens: { thisWeek: 17234567, lastWeek: 16123456, change: 6.9 },
    interactions: { thisWeek: 12456, lastWeek: 11890, change: 4.8 }
  },
  // User-specific data
  userData: {
    totalBots: 17,
    totalKnowledge: 18,
    totalUsers: 23,
    totalGroups: 5,
    usersExpiringSoon: 9,
    usersPendingApproval: 18,
    dailyUsers: {
      today: 16,
      yesterday: 14,
      change: 14.3
    },
    tokenUsage: {
      today: 1823456,
      yesterday: 1712345,
      change: 6.5
    },
    dailyUsersChart: [
      { date: '6 วันก่อน', users: 12 },
      { date: '5 วันก่อน', users: 13 },
      { date: '4 วันก่อน', users: 14 },
      { date: '3 วันก่อน', users: 15 },
      { date: '2 วันก่อน', users: 15 },
      { date: 'เมื่อวาน', users: 14 },
      { date: 'วันนี้', users: 16 }
    ],
    tokenUsageChart: [
      { date: '6 วันก่อน', tokens: 1567890 },
      { date: '5 วันก่อน', tokens: 1612345 },
      { date: '4 วันก่อน', tokens: 1678901 },
      { date: '3 วันก่อน', tokens: 1701234 },
      { date: '2 วันก่อน', tokens: 1695678 },
      { date: 'เมื่อวาน', tokens: 1712345 },
      { date: 'วันนี้', tokens: 1823456 }
    ]
  },
  // System-specific data
  systemData: {
    totalBots: 17,
    totalKnowledge: 18,
    totalUsers: 23,
    usersExpiringSoon: 9,
    usersPendingApproval: 18,
    dailyUsers: {
      today: 16,
      yesterday: 14,
      change: 14.3
    },
    tokenUsage: {
      today: 635478,
      yesterday: 600111,
      change: 5.9
    },
    dailyUsersChart: [
      { date: '6 วันก่อน', users: 17 },
      { date: '5 วันก่อน', users: 18 },
      { date: '4 วันก่อน', users: 19 },
      { date: '3 วันก่อน', users: 21 },
      { date: '2 วันก่อน', users: 22 },
      { date: 'เมื่อวาน', users: 21 },
      { date: 'วันนี้', users: 23 }
    ],
    tokenUsageChart: [
      { date: '6 วันก่อน', tokens: 532567 },
      { date: '5 วันก่อน', tokens: 544444 },
      { date: '4 วันก่อน', tokens: 555666 },
      { date: '3 วันก่อน', tokens: 588777 },
      { date: '2 วันก่อน', tokens: 602087 },
      { date: 'เมื่อวาน', tokens: 600111 },
      { date: 'วันนี้', tokens: 635478 }
    ]
  }
};

const COLORS = ['#F5C200', '#F5D547', '#F0A500', '#8B8680', '#A89A91', '#6B6560'];
const GRADIENT_COLORS = {
  sandy: ['#F5C200', '#8B8680'],
  gold: ['#F5C200', '#8B8680'],
  tan: ['#F5C200', '#8B8680'],
  warmgray: ['#F5C200', '#8B8680'],
  light: ['#F5C200', '#8B8680'],
  pale: ['#F5C200', '#8B8680']
};

const isErrorLogEvent = (message) => {
  const key = String(message || '').toLowerCase();
  return key === 'http.error' || key === 'http.exception' || key.endsWith('.failed');
};

const getErrorTypeKey = (message) => {
  const key = String(message || '').toLowerCase();
  if (key === 'http.error') return 'httpError';
  if (key === 'http.exception') return 'httpException';
  if (key.endsWith('.failed')) return 'failed';
  return 'other';
};

const getErrorCategoryKey = (row) => {
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

const getErrorWindowStartMs = (range) => {
  const now = Date.now();
  if (range === 'day') return now - (24 * 60 * 60 * 1000);
  if (range === 'month') return now - (30 * 24 * 60 * 60 * 1000);
  return now - (7 * 24 * 60 * 60 * 1000);
};

const getErrorRangeLabel = (range) => {
  if (range === 'day') return 'วันล่าสุด';
  if (range === 'month') return 'เดือนล่าสุด';
  return 'สัปดาห์ล่าสุด';
};

const getLocalDateKey = (value) => {
  const d = value instanceof Date ? value : new Date(value || 0);
  if (!Number.isFinite(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Animated Counter Component
const AnimatedCounter = ({ value, duration = 2000 }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime = null;
    const startValue = 0;
    const endValue = value;

    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentCount = Math.floor(startValue + (endValue - startValue) * easeOutQuart);
      
      setCount(currentCount);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCount(endValue);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return <span>{count.toLocaleString('th-TH')}</span>;
};

// Sparkline Component
const Sparkline = ({ data, color = '#3B82F6', height = 40 }) => {
  const maxValue = Math.max(...data);
  const minValue = Math.min(...data);
  const range = maxValue - minValue || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((value - minValue) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width="100%" height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="drop-shadow-sm"
      />
      <polygon
        points={`0,100 ${points} 100,100`}
        fill={`url(#gradient-${color})`}
      />
    </svg>
  );
};

function Dashboard({ users = [], groups = [], userRole = 'support' }) {
  const [isVisible, setIsVisible] = useState(false);
  const [filter, setFilter] = useState('system'); // 'all', 'user', 'system'
  const [errorRange, setErrorRange] = useState('week');
  const [reportData, setReportData] = useState(null);
  const [metricsData, setMetricsData] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [healthResponseTimeMs, setHealthResponseTimeMs] = useState(null);
  const [faqCategories, setFaqCategories] = useState(null);
  const [citedDocs, setCitedDocs] = useState(null); // เอกสารที่ถูกอ้างอิงบ่อย
  const [adminActivity, setAdminActivity] = useState(null);
  const [tokenUsageData, setTokenUsageData] = useState(null);
  const [userRoleDistributionData, setUserRoleDistributionData] = useState(null);
  const [errorLogOverview, setErrorLogOverview] = useState(null);
  const dailyUsersChartRef = React.useRef(null);
  const tokenUsageChartRef = React.useRef(null);
  const userRoleDistributionChartRef = React.useRef(null);
  const errorLogsChartRef = React.useRef(null);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  useEffect(() => {
    api.getReport().then(setReportData).catch(() => {});
    if (userRole === 'admin' || userRole === 'admin_metrics') {
      api.getMetrics().then(setMetricsData).catch(() => {});
      api.getAdminActivity(14).then(setAdminActivity).catch(() => {});
    }
  }, [userRole]);

  useEffect(() => {
    const t0 = Date.now();
    api
      .getHealth()
      .then((data) => {
        setHealthData(data);
        setHealthResponseTimeMs(Date.now() - t0);
      })
      .catch(() => {
        setHealthResponseTimeMs(null);
        setHealthData({
          __fetchFailed: true,
          ok: false,
          database: { ok: false, error: 'เรียก /api/health ไม่สำเร็จ' },
          redis: { ok: false, enabled: false },
          qdrant: { ok: false },
          ai: { ok: false },
          storage: {
            ok: false,
            nearlyFull: false,
            provider: '—',
            usagePercent: null,
            disk: null,
            summary: 'เชื่อมต่อ backend ไม่ได้ — ตรวจ proxy / ว่า API รันอยู่',
          },
          ocr: {
            ok: false,
            typhoonConfigured: false,
            pdfProvider: '—',
            note: 'เชื่อมต่อ backend ไม่ได้ — ไม่ทราบการตั้งค่า OCR',
          },
          vectorDb: 'qdrant',
          server: {
            ok: false,
            memoryUsedPercent: null,
            loadAverage: null,
            uptimeHours: null,
            disk: null,
          },
        });
      });
  }, []);

  useEffect(() => {
    if (filter === 'system' || userRole === 'support') {
      setFaqCategories(null);
      return;
    }
    const scope = filter === 'user' ? 'user' : 'all';
    api
      .getFaqCategories(scope, 30)
      .then((data) => setFaqCategories(data?.categories ?? null))
      .catch(() => setFaqCategories([]));
  }, [filter, userRole]);

  // เอกสารที่ถูกอ้างอิงบ่อย (แทนการ์ด "ประเภทคำถามที่พบบ่อย")
  useEffect(() => {
    if (filter === 'system' || userRole === 'support') {
      setCitedDocs(null);
      return;
    }
    const scope = filter === 'user' ? 'user' : 'all';
    api
      .getTopCitedDocuments(scope, 30)
      .then((data) => setCitedDocs(data?.categories ?? null))
      .catch(() => setCitedDocs([]));
  }, [filter, userRole]);

  useEffect(() => {
    if (filter === 'system' || userRole === 'support') {
      setTokenUsageData(null);
      return;
    }
    const scope = filter === 'user' ? 'user' : 'all';
    api
      .getTokenUsage(scope, 30)
      .then((data) => setTokenUsageData(data || null))
      .catch(() => setTokenUsageData(null));
  }, [filter, userRole]);

  useEffect(() => {
    if (filter === 'system' || userRole === 'support') {
      setUserRoleDistributionData(null);
      return;
    }
    api
      .getUserRoleDistribution()
      .then((data) => setUserRoleDistributionData(data?.distribution ?? null))
      .catch(() => setUserRoleDistributionData([]));
  }, [filter, userRole]);

  useEffect(() => {
    if (userRole === 'support') {
      setErrorLogOverview(null);
      return;
    }
    api
      .getLogs({ take: 2000 })
      .then((data) => {
        const rows = Array.isArray(data) ? data : [];
        const errorRows = rows
          .filter((row) => isErrorLogEvent(row?.message))
          .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());

        const latest = errorRows[0] || null;
        const nowMs = Date.now();
        const last24hCount = errorRows.filter((row) => {
          const ts = new Date(row?.createdAt || 0).getTime();
          return Number.isFinite(ts) && nowMs - ts <= 24 * 60 * 60 * 1000;
        }).length;

        const buildRangeSummary = (range) => {
          const fromMs = getErrorWindowStartMs(range);
          const scopedRows = errorRows.filter((row) => {
            const ts = new Date(row?.createdAt || 0).getTime();
            return Number.isFinite(ts) && ts >= fromMs;
          });

          const byBucket = new Map();
          scopedRows.forEach((row) => {
            const d = new Date(row?.createdAt || 0);
            if (!Number.isFinite(d.getTime())) return;
            const bucketKey = range === 'day'
              ? `${getLocalDateKey(d)}T${String(d.getHours()).padStart(2, '0')}`
              : getLocalDateKey(d);
            const current = byBucket.get(bucketKey) || {
              total: 0,
              httpError: 0,
              httpException: 0,
              failed: 0,
              other: 0,
            };
            const typeKey = getErrorTypeKey(row?.message);
            current[typeKey] += 1;
            current.total += 1;
            byBucket.set(bucketKey, current);
          });

          const chart = [];
          if (range === 'day') {
            for (let i = 23; i >= 0; i -= 1) {
              const d = new Date();
              d.setMinutes(0, 0, 0);
              d.setHours(d.getHours() - i);
              const bucketKey = `${getLocalDateKey(d)}T${String(d.getHours()).padStart(2, '0')}`;
              const point = byBucket.get(bucketKey) || {
                total: 0,
                httpError: 0,
                httpException: 0,
                failed: 0,
                other: 0,
              };
              chart.push({
                date: `${String(d.getHours()).padStart(2, '0')}:00`,
                count: point.total,
                httpError: point.httpError,
                httpException: point.httpException,
                failed: point.failed,
                other: point.other,
              });
            }
          } else {
            const days = range === 'month' ? 30 : 7;
            for (let i = days - 1; i >= 0; i -= 1) {
              const d = new Date();
              d.setHours(0, 0, 0, 0);
              d.setDate(d.getDate() - i);
              const bucketKey = getLocalDateKey(d);
              const point = byBucket.get(bucketKey) || {
                total: 0,
                httpError: 0,
                httpException: 0,
                failed: 0,
                other: 0,
              };
              const label = range === 'week'
                ? (i === 0 ? 'วันนี้' : i === 1 ? 'เมื่อวาน' : `${i} วันก่อน`)
                : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
              chart.push({
                date: label,
                count: point.total,
                httpError: point.httpError,
                httpException: point.httpException,
                failed: point.failed,
                other: point.other,
              });
            }
          }

          const categoryStats = {
            upload: { key: 'upload', label: 'Upload Error', count: 0, latestAt: null, latestMessage: '' },
            ocr: { key: 'ocr', label: 'OCR Error', count: 0, latestAt: null, latestMessage: '' },
            vector: { key: 'vector', label: 'Vector Error', count: 0, latestAt: null, latestMessage: '' },
            http: { key: 'http', label: 'HTTP Error', count: 0, latestAt: null, latestMessage: '' },
            failed: { key: 'failed', label: 'งานที่ล้มเหลว (.failed)', count: 0, latestAt: null, latestMessage: '' },
            other: { key: 'other', label: 'Error อื่นๆ', count: 0, latestAt: null, latestMessage: '' },
          };
          scopedRows.forEach((row) => {
            const categoryKey = getErrorCategoryKey(row);
            const stat = categoryStats[categoryKey] || categoryStats.other;
            stat.count += 1;
            if (!stat.latestAt) {
              stat.latestAt = row?.createdAt || null;
              stat.latestMessage = row?.meta?.error
                ? String(row.meta.error).slice(0, 140)
                : String(row?.message || '—').slice(0, 140);
            }
          });

          return {
            chart,
            categories: [
              categoryStats.upload,
              categoryStats.ocr,
              categoryStats.vector,
              categoryStats.http,
              categoryStats.failed,
              categoryStats.other,
            ],
          };
        };

        const latestMessage = latest?.meta?.error
          ? String(latest.meta.error)
          : String(latest?.message || '—');

        setErrorLogOverview({
          count24h: last24hCount,
          latestAt: latest?.createdAt || null,
          latestMessage: latestMessage.slice(0, 140),
          ranges: {
            day: buildRangeSummary('day'),
            week: buildRangeSummary('week'),
            month: buildRangeSummary('month'),
          },
        });
      })
      .catch(() => {
        const emptyWeekChart = [
          { date: '6 วันก่อน', count: 0, httpError: 0, httpException: 0, failed: 0, other: 0 },
          { date: '5 วันก่อน', count: 0, httpError: 0, httpException: 0, failed: 0, other: 0 },
          { date: '4 วันก่อน', count: 0, httpError: 0, httpException: 0, failed: 0, other: 0 },
          { date: '3 วันก่อน', count: 0, httpError: 0, httpException: 0, failed: 0, other: 0 },
          { date: '2 วันก่อน', count: 0, httpError: 0, httpException: 0, failed: 0, other: 0 },
          { date: 'เมื่อวาน', count: 0, httpError: 0, httpException: 0, failed: 0, other: 0 },
          { date: 'วันนี้', count: 0, httpError: 0, httpException: 0, failed: 0, other: 0 },
        ];
        const emptyCategories = [
          { key: 'upload', label: 'Upload Error', count: 0, latestAt: null, latestMessage: '' },
          { key: 'ocr', label: 'OCR Error', count: 0, latestAt: null, latestMessage: '' },
          { key: 'vector', label: 'Vector Error', count: 0, latestAt: null, latestMessage: '' },
          { key: 'http', label: 'HTTP Error', count: 0, latestAt: null, latestMessage: '' },
          { key: 'failed', label: 'งานที่ล้มเหลว (.failed)', count: 0, latestAt: null, latestMessage: '' },
          { key: 'other', label: 'Error อื่นๆ', count: 0, latestAt: null, latestMessage: '' },
        ];
        setErrorLogOverview({
          count24h: 0,
          latestAt: null,
          latestMessage: 'โหลดข้อมูล error logs ไม่สำเร็จ',
          ranges: {
            day: { chart: [], categories: emptyCategories },
            week: { chart: emptyWeekChart, categories: emptyCategories },
            month: { chart: [], categories: emptyCategories },
          },
        });
      });
  }, [userRole]);

  // Lock filter to 'system' for Support users
  const isAdmin = userRole !== 'support';
  useEffect(() => {
    if (!isAdmin) {
      setFilter('system');
    }
  }, [isAdmin]);

  const scrollToChart = (ref) => {
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Calculate metrics from existing data
  const metrics = useMemo(() => {
    // Use users props if available, otherwise fall back to empty array
    const userList = users && users.length > 0 ? users : [];
    const groupList = groups && groups.length > 0 ? groups : [];
    
    // จาก API ถ้ามี ใช้ report/metrics ไม่ก็คำนวณจาก userList
    const totalUsersFromList = userList.filter(user => user.roleType === 'user' && user.isEnabled).length;
    const usersPendingFromList = userList.filter(user => user.roleType === 'pending').length;
    const usersInactivated = userList.filter(user => user.roleType === 'user' && !user.isEnabled).length;
    const totalUsers = reportData?.usersCount ?? totalUsersFromList;
    const usersPendingApproval = metricsData?.pendingUsersCount ?? usersPendingFromList;
    
    // Calculate users expiring soon (within 7 days)
    const today = new Date();
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);
    
    const usersExpiringSoon = userList.filter(user => {
      if (!user.expiresAt || user.expiresAt === '-') return false;
      const dateStr = user.expiresAt;
      const monthMap = {
        'มกราคม': 0, 'กุมภาพันธ์': 1, 'มีนาคม': 2, 'เมษายน': 3,
        'พฤษภาคม': 4, 'มิถุนายน': 5, 'กรกฎาคม': 6, 'สิงหาคม': 7,
        'กันยายน': 8, 'ตุลาคม': 9, 'พฤศจิกายน': 10, 'ธันวาคม': 11
      };
      
      const parts = dateStr.split(' ');
      if (parts.length >= 3) {
        const day = parseInt(parts[0]);
        const month = monthMap[parts[1]];
        const year = parseInt(parts[2]) - 543;
        
        if (month !== undefined && !isNaN(day) && !isNaN(year)) {
          const expireDate = new Date(year, month, day);
          return expireDate >= today && expireDate <= sevenDaysFromNow;
        }
      }
      return false;
    }).length;
    
    const totalAccounts = reportData?.usersCount ?? userList.length;
    
    // Count user role accounts
    const userRoleCount = userList.filter(user => user.roleType === 'user').length;

    // ค่าจาก API จริง (report/metrics) — ไม่ใช้ mock
    const totalBots = metricsData?.botsCount ?? 0;
    const totalKnowledge = reportData?.documentsCount ?? 0;
    const totalGroups = groupList.length;

    // Filter data based on selected filter
    let dailyUsers, tokenUsage, dailyUsersChart, tokenUsageChart;

    const buildLast7Days = (series, role) => {
      const map = new Map();
      (Array.isArray(series) ? series : [])
        .filter((r) => String(r?.role || '') === role)
        .forEach((r) => {
          const day = String(r.day || '').slice(0, 10);
          const count = Number(r.count || 0);
          if (!day) return;
          map.set(day, (map.get(day) || 0) + count);
        });

      const out = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const label =
          i === 0 ? 'วันนี้' :
          i === 1 ? 'เมื่อวาน' :
          `${i} วันก่อน`;
        out.push({ date: label, key, value: map.get(key) || 0 });
      }
      return out;
    };

    // Use real admin activity when available (admin/admin_metrics). Fallback to mock if not.
    if ((filter === 'all' || filter === 'user') && adminActivity?.series) {
      const userSeries7 = buildLast7Days(adminActivity.series, 'user');
      const modelSeries7 = buildLast7Days(adminActivity.series, 'model');
      const todayUsers = userSeries7[userSeries7.length - 1]?.value || 0;
      const yesterdayUsers = userSeries7[userSeries7.length - 2]?.value || 0;
      const usersChange = yesterdayUsers ? ((todayUsers - yesterdayUsers) / Math.max(1, yesterdayUsers)) * 100 : 0;

      const todayModel = modelSeries7[modelSeries7.length - 1]?.value || 0;
      const yesterdayModel = modelSeries7[modelSeries7.length - 2]?.value || 0;
      const modelChange = yesterdayModel ? ((todayModel - yesterdayModel) / Math.max(1, yesterdayModel)) * 100 : 0;

      dailyUsers = { today: todayUsers, yesterday: yesterdayUsers, change: Number(usersChange.toFixed(1)) };
      // ไม่มี token จริงใน endpoint นี้ → ใช้จำนวน model messages เป็น proxy เพื่อให้เป็นข้อมูลจริงจากระบบ
      tokenUsage = { today: todayModel, yesterday: yesterdayModel, change: Number(modelChange.toFixed(1)) };
      dailyUsersChart = userSeries7.map((r) => ({ date: r.date, users: r.value }));
      tokenUsageChart = modelSeries7.map((r) => ({ date: r.date, tokens: r.value }));
    } else {
      // fallback
      if (filter === 'user') {
        dailyUsers = mockDashboardData.userData.dailyUsers;
        tokenUsage = mockDashboardData.userData.tokenUsage;
        dailyUsersChart = mockDashboardData.userData.dailyUsersChart;
        tokenUsageChart = mockDashboardData.userData.tokenUsageChart;
      } else if (filter === 'system') {
        dailyUsers = mockDashboardData.systemData.dailyUsers;
        tokenUsage = mockDashboardData.systemData.tokenUsage;
        dailyUsersChart = mockDashboardData.systemData.dailyUsersChart;
        tokenUsageChart = mockDashboardData.systemData.tokenUsageChart;
      } else {
        dailyUsers = mockDashboardData.dailyUsers;
        tokenUsage = mockDashboardData.tokenUsage;
        dailyUsersChart = mockDashboardData.dailyUsersChart;
        tokenUsageChart = mockDashboardData.tokenUsageChart;
      }
    }

    // override token usage with real data (UsageDaily) when available
    if (tokenUsageData && (filter === 'all' || filter === 'user')) {
      tokenUsage = { today: tokenUsageData.rangeTotal ?? tokenUsageData.today, change: undefined };
      tokenUsageChart = Array.isArray(tokenUsageData.daily)
        ? tokenUsageData.daily.map((d) => ({ date: d.date, tokens: d.tokens }))
        : [];
    }

    const selectedErrorRange = errorLogOverview?.ranges?.[errorRange] || { chart: [], categories: [] };
    return {
      totalBots,
      totalKnowledge,
      totalUsers,
      totalAccounts,
      userRoleCount,
      totalGroups,
      usersExpiringSoon,
      usersPendingApproval,
      usersInactivated,
      dailyUsers,
      tokenUsage,
      dailyUsersChart,
      tokenUsageChart,
      frequentlyAskedQuestions: faqCategories ?? [],
      userRoleDistribution: userRoleDistributionData != null ? userRoleDistributionData : [],
      systemStatus: (() => {
        if (!healthData) {
          return {
            api: { status: 'loading', responseTime: '—', summaryLine: '—', detailLine: '' },
            database: { status: 'loading', error: '', detailLine: '—' },
            redis: { status: 'loading', detailLine: '—' },
            qdrant: { status: 'loading', error: '', providerLabel: '—', detailLine: '—' },
            storage: {
              status: 'loading',
              usage: '—',
              available: '—',
              provider: '',
              summary: '',
              storeRawLabel: '—',
              s3Line: '',
            },
            ai: { status: 'loading', responseTime: '—', model: '—', error: '', gatewayLine: '—' },
            ocr: {
              status: 'loading',
              typhoonLine: '—',
              pdfProvider: '—',
              detailLine: '—',
              note: '',
              unhealthyLabel: 'รอตั้งค่า',
            },
            server: {
              status: 'loading',
              cpu: '—',
              memory: '—',
              disk: '—',
              uptime: '—',
              diskPathLine: '',
              diskSizeLine: '',
              unhealthyLabel: 'Unhealthy',
            },
          };
        }
        const apiHealthy = healthData.ok === true;
        const dbHealthy = healthData.database?.ok === true;
        const redisHealthy = healthData.redis?.ok !== false;
        const qdrantHealthy = healthData.qdrant?.ok === true;
        const aiOk = healthData.ai?.ok === true;
        const resMs = healthResponseTimeMs != null ? `${healthResponseTimeMs}ms` : '—';
        const aiResponseMs = healthData.ai?.responseTimeMs != null ? `${healthData.ai.responseTimeMs}ms` : '—';
        const aiModel = healthData.ai?.model ?? '—';
        const aiError = healthData.ai?.error ?? '';
        const dbError = healthData.database?.error ?? '';
        const qdrantError = healthData.qdrant?.error ?? '';

        const st = healthData.storage;
        let storageStatus = 'unknown';
        if (st?.nearlyFull) storageStatus = 'unhealthy';
        else if (st?.ok) storageStatus = 'healthy';
        else if (st && !st.ok) storageStatus = 'unknown';

        const oc = healthData.ocr;
        const ocrStatus = oc ? (oc.ok ? 'healthy' : 'unhealthy') : 'unknown';

        const sv = healthData.server;
        const serverStatus =
          !sv ? 'unknown' : sv.ok === false ? 'unhealthy' : 'healthy';

        const fetchFailed = healthData.__fetchFailed === true;

        const vdb = (healthData.vectorDb || 'qdrant').toLowerCase();
        const vectorProviderLabel = vdb === 'pinecone' ? 'Pinecone' : 'Qdrant';

        let apiSummaryLine = '—';
        let apiDetailLine = '';
        if (fetchFailed) {
          apiSummaryLine = 'โหลดสถานะไม่สำเร็จ';
          apiDetailLine = '';
        } else if (healthData.ok) {
          apiSummaryLine = 'พร้อมใช้งาน';
          apiDetailLine = '';
        } else if (healthData.coreOk === false || healthData.database?.ok === false) {
          apiSummaryLine = 'ฐานข้อมูลไม่พร้อม';
          apiDetailLine = '';
        } else if (healthData.degraded === true || (healthData.database?.ok && !healthData.ok)) {
          apiSummaryLine = 'ทำงานแบบลดสเปก';
          apiDetailLine = '';
        } else {
          apiSummaryLine = 'บริการบางส่วนไม่พร้อม';
          apiDetailLine = '';
        }

        const redisEnabled = healthData.redis?.enabled === true;
        const redisDetailLine = redisEnabled
          ? 'ใช้สำหรับ session และคิวอัปโหลด (แนะนำ UPLOAD_QUEUE_MODE=redis)'
          : 'ไม่ได้ตั้ง REDIS_URL — ระบบไม่ใช้ Redis';

        const storeRawLabel = st?.storeRawFiles === true ? 'ไฟล์ดิบ: เปิด' : 'ไฟล์ดิบ: ปิด';
        const s3Line =
          st?.provider === 's3' && st?.s3?.bucket
            ? `S3 bucket: ${st.s3.bucket}`
            : st?.provider === 's3'
              ? 'โหมด S3 (ตรวจสอบ bucket/credential ใน .env)'
              : '';

        const gatewayHost = healthData.ai?.gatewayHost;
        const gatewayLine = gatewayHost ? `LLM gateway: ${gatewayHost}` : 'LLM gateway: —';

        const diskPathLine =
          sv?.disk?.path != null ? `Path อ่านดิสก์: ${sv.disk.path}` : '';
        const diskSizeLine =
          sv?.disk?.freeGb != null && sv?.disk?.totalGb != null
            ? `ความจุดิสก์ (path นี้): ~${sv.disk.freeGb} / ~${sv.disk.totalGb} GB`
            : '';

        return {
          api: {
            status: apiHealthy ? 'healthy' : 'unhealthy',
            responseTime: resMs,
            summaryLine: apiSummaryLine,
            detailLine: apiDetailLine,
          },
          database: {
            status: dbHealthy ? 'healthy' : 'unhealthy',
            error: dbError,
            detailLine: 'PostgreSQL · เชื่อมต่อผ่าน Prisma',
          },
          redis: {
            status: redisHealthy ? 'healthy' : 'unhealthy',
            detailLine: redisDetailLine,
          },
          qdrant: {
            status: qdrantHealthy ? 'healthy' : 'unhealthy',
            error: qdrantError,
            providerLabel: vectorProviderLabel,
            detailLine: `ดัชนีเวกเตอร์ knowledge — ${vectorProviderLabel}`,
          },
          storage: {
            status: storageStatus,
            usage: st?.usagePercent != null ? `${st.usagePercent}%` : '—',
            available: st?.disk ? `~${st.disk.freeGb} GB ว่าง` : '—',
            provider: st?.provider ?? '—',
            summary: st?.summary ?? '',
            storeRawLabel,
            s3Line,
          },
          ai: {
            status: aiOk ? 'healthy' : 'unhealthy',
            responseTime: aiResponseMs,
            model: aiModel,
            error: aiError,
            gatewayLine,
          },
          ocr: {
            status: ocrStatus,
            typhoonLine: fetchFailed
              ? '—'
              : oc?.typhoonConfigured
                ? 'ตั้งค่าแล้ว (Open Typhoon)'
                : 'ยังไม่ตั้งค่า',
            pdfProvider: oc?.pdfProvider ?? '—',
            detailLine: 'ดึงข้อความจากรูป / PDF สแกนเมื่อจำเป็น',
            note: oc?.note ?? '',
            unhealthyLabel: fetchFailed ? 'โหลดไม่ได้' : 'รอตั้งค่า',
          },
          server: {
            status: serverStatus,
            cpu: sv?.loadAverage != null ? String(sv.loadAverage) : '—',
            memory: sv?.memoryUsedPercent != null ? `${sv.memoryUsedPercent}%` : '—',
            disk: sv?.disk?.usedPercent != null ? `${sv.disk.usedPercent}%` : '—',
            uptime: sv?.uptimeHours != null ? `${sv.uptimeHours} ชม.` : '—',
            diskPathLine,
            diskSizeLine,
            unhealthyLabel: fetchFailed ? 'โหลดไม่ได้' : 'Unhealthy',
          },
        };
      })(),
      healthyServicesCount: (() => {
        if (!healthData) return 0;
        const statuses = [
          healthData.ok === true,
          healthData.database?.ok === true,
          healthData.redis?.ok !== false,
          healthData.qdrant?.ok === true,
          healthData.ai?.ok === true,
          healthData.ocr?.ok === true,
          healthData.server?.ok !== false,
        ];
        return statuses.filter(Boolean).length;
      })(),
      totalServicesCount: 7,
      storageUsagePercent: Number.isFinite(Number(healthData?.storage?.usagePercent))
        ? Number(healthData.storage.usagePercent)
        : 0,
      errorLogs24h: Number(errorLogOverview?.count24h || 0),
      errorLogsChart: Array.isArray(selectedErrorRange?.chart) ? selectedErrorRange.chart : [],
      errorCategoryRows: Array.isArray(selectedErrorRange?.categories) ? selectedErrorRange.categories : [],
      latestErrorAt: errorLogOverview?.latestAt || null,
      latestErrorMessage: errorLogOverview?.latestMessage || '—',
    };
  }, [filter, users, groups, reportData, metricsData, adminActivity, healthData, healthResponseTimeMs, faqCategories, tokenUsageData, userRoleDistributionData, errorLogOverview, errorRange]);

  const StatCard = ({ 
    title, 
    value, 
    valueSuffix,
    icon: Icon, 
    change, 
    changeType, 
    subtitle, 
    iconColor = 'bg-[#F5C200]',
    gradient = ['#3B82F6', '#1D4ED8'],
    sparklineData,
    delay = 0,
    onCardClick = null,
    bgColor = 'bg-white'
  }) => {
    const [isHovered, setIsHovered] = useState(false);
    
    return (
      <div 
        className={`${bgColor} rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
        style={{ transitionDelay: `${delay}ms` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onCardClick}
      >
        <div className="relative overflow-hidden">
          {/* Solid Color Background */}
          <div 
            className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-3xl transition-all duration-500"
            style={{ 
              background: gradient[0],
              transform: isHovered ? 'scale(1.5)' : 'scale(1)'
            }}
          />
          
          <div className="relative">
            {/* Icon + Title Section */}
            <div className="flex items-center gap-2 mb-3">
              <div 
                className="rounded-lg p-2 transition-all duration-300"
                style={{ background: gradient[0] }}
              >
                <Icon className="text-white text-lg" />
              </div>
              <p className="text-base font-bold text-gray-800">{title}</p>
            </div>
            
            {/* Value Section */}
            <div className="ml-10">
              <p className="text-4xl font-bold text-gray-900 mb-2">
                <AnimatedCounter value={value} />
                {valueSuffix ? <span>{valueSuffix}</span> : null}
              </p>
              {subtitle && (
                <p className="text-xs text-gray-500 mb-3">{subtitle}</p>
              )}
              {change !== undefined && (
                <div className={`flex items-center gap-1 ${changeType === 'up' ? 'text-[#F5C200]' : 'text-[#8B8680]'}`}>
                  {changeType === 'up' ? (
                    <HiArrowUp className="text-sm" />
                  ) : (
                    <HiArrowDown className="text-sm" />
                  )}
                  <span className="text-sm font-semibold">{Math.abs(change)}%</span>
                  <span className="text-sm text-gray-500 ml-1">จากเมื่อวาน</span>
                </div>
              )}
            </div>
            
            {/* Sparkline */}
            {sparklineData && (
              <div className="mt-4 h-12">
                <Sparkline 
                  data={sparklineData} 
                  color={gradient[0]}
                  height={48}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-xl">
          <p className="text-sm font-semibold text-gray-800 mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm flex items-center gap-2" style={{ color: entry.color }}>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></span>
              {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString('th-TH') : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for pie chart with percentage
  const PieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const total = metrics.userRoleDistribution.reduce((sum, item) => sum + item.count, 0);
      const percentage = ((data.value / total) * 100).toFixed(1);
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-xl">
          <p className="text-sm font-semibold text-gray-800 mb-2">{data.payload.role}</p>
          <p className="text-sm flex items-center gap-2" style={{ color: data.payload.fill }}>
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: data.payload.fill }}></span>
            {data.value.toLocaleString('th-TH')} ({percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };
  
  return (
    <div className="w-full h-full p-6 min-h-screen">
      {/* Header with Animation */}
      <div className={`mb-8 transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#8B8680] rounded-xl p-3 shadow-lg">
              <HiSparkles className="text-white text-3xl" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-[#8B8680]">
                Dashboard
              </h1>
              <p className="text-sm text-gray-600 mt-1">ภาพรวมระบบและสถิติการใช้งานแบบ Real-time</p>
            </div>
          </div>
          
          {/* Filter Tabs - Hide all filters for Support role, show only System */}
          {isAdmin ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter('user')}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
                filter === 'user'
                  ? 'bg-[#8B8680] text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <HiUsers className="inline mr-1" />
              User
            </button>
            <button
              onClick={() => setFilter('system')}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
                filter === 'system'
                  ? 'bg-[#8B8680] text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <HiDesktopComputer className="inline mr-1" />
              System
            </button>
          </div>
          ) : (
          <div className="flex items-center gap-2">
            <button
              disabled
              className="px-4 py-2 rounded-lg font-semibold text-sm bg-[#8B8680] text-white shadow-md cursor-not-allowed opacity-100"
            >
              <HiDesktopComputer className="inline mr-1" />
              System
            </button>
          </div>
          )}
        </div>
      </div>

      {/* Main Statistics Grid - Hide when System filter or Support role */}
      {filter !== 'system' && isAdmin && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
        {/* User Accounts Consolidated Card */}
        <div 
          onClick={() => scrollToChart(userRoleDistributionChartRef)}
          className={`bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{ transitionDelay: '0ms' }}
        >
          <div className="relative overflow-hidden">
            <div 
              className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-3xl transition-all duration-500"
              style={{ 
                background: `#F5C200`,
                transform: 'scale(1)'
              }}
            />
            <div className="relative">
              {/* Title with Icon */}
              <div className="flex items-center gap-2 mb-4">
                <div 
                  className="rounded-lg p-2"
                  style={{ background: `#F5C200` }}
                >
                  <HiUsers className="text-white text-lg" />
                </div>
                <h3 className="text-base font-bold text-gray-800">บทบาทผู้ใช้</h3>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                  <span className="text-xs text-gray-600">บัญชีทั้งหมด</span>
                  <span className="text-xl font-bold text-gray-900">
                    <AnimatedCounter value={metrics.totalAccounts} />
                  </span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                  <span className="text-xs text-gray-600">ผู้ใช้งาน</span>
                  <span className="text-xl font-bold text-[#8B8680]">
                    <AnimatedCounter value={metrics.userRoleCount} />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">รอดำเนินการ</span>
                  <span className="text-xl font-bold text-[#F5C200]">
                    <AnimatedCounter value={metrics.usersPendingApproval} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* User Status Consolidated Card */}
        <div 
          className={`bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{ transitionDelay: '100ms' }}
        >
          <div className="relative overflow-hidden">
            <div 
              className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-3xl transition-all duration-500"
              style={{ 
                background: `#8B8680`,
                transform: 'scale(1)'
              }}
            />
            <div className="relative">
              {/* Title with Icon */}
              <div className="flex items-center gap-2 mb-4">
                <div 
                  className="rounded-lg p-2"
                  style={{ background: `#8B8680` }}
                >
                  <HiExclamationCircle className="text-white text-lg" />
                </div>
                <h3 className="text-base font-bold text-gray-800">สถานะ User</h3>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                  <span className="text-xs text-gray-600">Active อยู่</span>
                  <span className="text-xl font-bold text-green-600">
                    <AnimatedCounter value={metrics.totalUsers} />
                  </span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                  <span className="text-xs text-gray-600">หมดอายุใน 7 วัน</span>
                  <span className="text-xl font-bold text-[#8B8680]">
                    <AnimatedCounter value={metrics.usersExpiringSoon} />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">ถูก Inactivate</span>
                  <span className="text-xl font-bold text-gray-600">
                    <AnimatedCounter value={metrics.usersInactivated} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <StatCard
          title="ผู้ใช้งานรายวัน"
          value={metrics.dailyUsers.today}
          icon={HiUsers}
          change={metrics.dailyUsers.change}
          changeType="up"
          subtitle="ผู้ใช้ที่ใช้งานวันนี้"
          iconColor="bg-[#F5C200]"
          gradient={GRADIENT_COLORS.sandy}
          sparklineData={metrics.dailyUsersChart.map(d => d.users)}
          delay={200}
          bgColor="bg-white"
          onCardClick={() => scrollToChart(dailyUsersChartRef)}
        />
        <StatCard
          title="Service พร้อมใช้งาน"
          value={metrics.healthyServicesCount}
          valueSuffix={`/${metrics.totalServicesCount}`}
          icon={HiShieldCheck}
          subtitle="API, DB, Redis, Vector, AI, OCR, Server"
          iconColor="bg-[#F5C200]"
          gradient={['#8B8680', '#6B6560']}
          delay={300}
          bgColor="bg-white"
        />
        <div
          onClick={() => scrollToChart(errorLogsChartRef)}
          className={`bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{ transitionDelay: '350ms' }}
        >
          <div className="relative overflow-hidden">
            <div
              className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-3xl"
              style={{ background: '#EF4444' }}
            />
            <div className="relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="rounded-lg p-2 bg-red-500">
                  <HiExclamationCircle className="text-white text-lg" />
                </div>
                <h3 className="text-base font-bold text-gray-800">Error ล่าสุด</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                  <span className="text-xs text-gray-600">Error ใน 24 ชั่วโมง</span>
                  <span className="text-2xl font-bold text-red-600">
                    <AnimatedCounter value={metrics.errorLogs24h} />
                  </span>
                </div>
                <p className="text-xs text-gray-600 line-clamp-2">{metrics.latestErrorMessage}</p>
                <p className="text-[11px] text-gray-500">
                  {metrics.latestErrorAt
                    ? `ล่าสุด: ${new Date(metrics.latestErrorAt).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}`
                    : 'ล่าสุด: —'}
                </p>
                <p className="text-[11px] font-semibold text-red-600">คลิกเพื่อดูกราฟ error</p>
              </div>
            </div>
          </div>
        </div>
        {/* Combined Bot and Knowledge Card */}
        <div 
          className={`bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{ transitionDelay: '400ms' }}
        >
          <div className="relative overflow-hidden">
            <div 
              className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-3xl transition-all duration-500"
              style={{ 
                background: `#8B8680`,
                transform: 'scale(1)'
              }}
            />
            <div className="relative">
              {/* Title with Icon */}
              <div className="flex items-center gap-2 mb-4">
                <div 
                  className="rounded-lg p-2"
                  style={{ background: `#8B8680` }}
                >
                  <HiDesktopComputer className="text-white text-lg" />
                </div>
                <h3 className="text-base font-bold text-gray-800">จำนวน Bot & Knowledge</h3>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HiDesktopComputer className="text-[#8B8680] text-base" />
                    <span className="text-xs text-gray-600">Bot ทั้งหมด</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    <AnimatedCounter value={metrics.totalBots} />
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HiBookOpen className="text-[#8B8680] text-base" />
                    <span className="text-xs text-gray-600">Knowledge Base</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    <AnimatedCounter value={metrics.totalKnowledge} />
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div 
          className={`bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{ transitionDelay: '500ms' }}
        >
          <div className="relative overflow-hidden">
            <div 
              className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-3xl transition-all duration-500"
              style={{ 
                background: `#F5C200`,
                transform: 'scale(1)'
              }}
            />
            <div className="relative">
              {/* Title with Icon */}
              <div className="flex items-center gap-2 mb-4">
                <div 
                  className="rounded-lg p-2"
                  style={{ background: `#F5C200` }}
                >
                  <HiDesktopComputer className="text-white text-lg" />
                </div>
                <h3 className="text-base font-bold text-gray-800">Storage</h3>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HiDesktopComputer className="text-[#F5C200] text-base" />
                    <span className="text-xs text-gray-600">Disk Usage</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    <AnimatedCounter value={metrics.storageUsagePercent} />
                    <span>%</span>
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HiBookOpen className="text-[#8B8680] text-base" />
                    <span className="text-xs text-gray-600">Knowledge Base</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    <AnimatedCounter value={metrics.totalKnowledge} />
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <StatCard
          title="Token 30 วันล่าสุด"
          value={metrics.tokenUsage.today}
          icon={HiKey}
          change={undefined}
          changeType="up"
          subtitle="รวม token 30 วันล่าสุด"
          iconColor="bg-[#8B8680]"
          gradient={['#8B8680', '#8B8680']}
          sparklineData={metrics.tokenUsageChart.map(d => d.tokens / 10000)}
          delay={600}
          bgColor="bg-white"
          onCardClick={() => scrollToChart(tokenUsageChartRef)}
        />
      </div>
      )}

      {/* Charts Section with Enhanced Design - Hide when System filter */}
      {filter !== 'system' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Daily Users Line Chart */}
        <div 
          ref={dailyUsersChartRef}
          className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
                <HiUsers className="text-white text-2xl" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-800">ผู้ใช้งานรายวัน</h3>
                <p className="text-sm text-gray-600">7 วันล่าสุด</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-[#F2E9DA] px-3 py-1 rounded-full">
              <HiTrendingUp className="text-[#8B8680]" />
              <span className="text-sm font-semibold text-[#8B8680]">+{metrics.dailyUsers.change}%</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={metrics.dailyUsersChart}>
              <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F5C200" stopOpacity={1}/>
                  <stop offset="95%" stopColor="#F5C200" stopOpacity={1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" opacity={0.5} />
              <XAxis 
                dataKey="date" 
                stroke="#6B7280"
                style={{ fontSize: '12px', fontWeight: '500' }}
                tickLine={false}
              />
              <YAxis 
                stroke="#6B7280"
                style={{ fontSize: '12px', fontWeight: '500' }}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="users" 
                name="จำนวนผู้ใช้"
                stroke="#B8A878" 
                strokeWidth={3}
                dot={{ fill: '#B8A878', r: 5, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 8, stroke: '#B8A878', strokeWidth: 2 }}
                fill="url(#colorUsers)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Token Usage Area Chart */}
        <div 
          ref={tokenUsageChartRef}
          className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
                <HiKey className="text-white text-2xl" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-800">Token 30 วันล่าสุด</h3>
                <p className="text-sm text-gray-600">30 วันล่าสุด</p>
              </div>
            </div>
            {metrics.tokenUsage.change !== undefined && (
              <div className="flex items-center gap-2 bg-[#F2E9DA] px-3 py-1 rounded-full">
                <HiLightningBolt className="text-[#8B8680]" />
                <span className="text-sm font-semibold text-[#8B8680]">+{metrics.tokenUsage.change}%</span>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={metrics.tokenUsageChart}>
              <defs>
                <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F5C200" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#F5C200" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" opacity={0.5} />
              <XAxis 
                dataKey="date" 
                stroke="#6B7280"
                style={{ fontSize: '12px', fontWeight: '500' }}
                tickLine={false}
              />
              <YAxis 
                stroke="#6B7280"
                style={{ fontSize: '12px', fontWeight: '500' }}
                tickLine={false}
                tickFormatter={(value) => Number(value).toLocaleString('th-TH')}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="tokens" 
                name="Token"
                stroke="#F5C200" 
                fillOpacity={1}
                fill="url(#colorTokens)"
                strokeWidth={3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Additional Charts Section - Hide when System filter or Support role */}
      {filter !== 'system' && isAdmin && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* User Role Distribution Pie Chart */}
        <div
          ref={userRoleDistributionChartRef}
          className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
              <HiUserGroup className="text-white text-2xl" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-800">บทบาทผู้ใช้</h3>
              <p className="text-sm text-gray-600">การกระจายตามบทบาท</p>
            </div>
          </div>
          {userRoleDistributionData === null ? (
            <div className="w-full h-[320px] flex items-center justify-center text-sm text-gray-500">
              กำลังโหลด...
            </div>
          ) : metrics.userRoleDistribution?.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={metrics.userRoleDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ role, count, percent }) => `${role}\n${count} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={110}
                  fill="#8884d8"
                  dataKey="count"
                  animationBegin={0}
                  animationDuration={800}
                >
                  {metrics.userRoleDistribution.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-[320px] flex items-center justify-center text-sm text-gray-500">
              ไม่มีข้อมูล
            </div>
          )}
        </div>

        {/* เอกสารที่ถูกอ้างอิงบ่อย (Most-cited knowledge documents) */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
              <HiBookOpen className="text-white text-2xl" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-800">เอกสารที่ถูกอ้างอิงบ่อย</h3>
              <p className="text-sm text-gray-600">จำนวนคำตอบที่อ้างอิงเอกสารแต่ละฉบับ (30 วันล่าสุด)</p>
            </div>
          </div>
          {citedDocs === null ? (
            <div className="w-full h-[320px] flex items-center justify-center text-sm text-gray-500">
              กำลังโหลด...
            </div>
          ) : citedDocs.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={citedDocs}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#F5C200" stopOpacity={1} />
                    <stop offset="100%" stopColor="#F5C200" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" opacity={0.5} />
                <XAxis
                  type="number"
                  stroke="#6B7280"
                  style={{ fontSize: '12px', fontWeight: '500' }}
                  tickLine={false}
                  domain={[0, 'dataMax']}
                  allowDecimals={false}
                />
                <YAxis
                  dataKey="type"
                  type="category"
                  stroke="#6B7280"
                  style={{ fontSize: '11px', fontWeight: '500' }}
                  width={180}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="count"
                  name="จำนวนการอ้างอิง"
                  fill="url(#barGradient)"
                  radius={[0, 8, 8, 0]}
                  animationDuration={1000}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-[320px] flex flex-col items-center justify-center text-sm text-gray-500 gap-1">
              <span>ยังไม่มีการอ้างอิงเอกสารในช่วงนี้</span>
              <span className="text-xs text-gray-400">เมื่อผู้ใช้ถามและบอทตอบโดยอ้างอิงเอกสาร จะแสดงที่นี่</span>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Error Logs Chart */}
      {filter !== 'system' && isAdmin && (
      <div
        ref={errorLogsChartRef}
        className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-8 hover:shadow-2xl transition-all duration-300"
      >
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-red-500 rounded-xl p-3 shadow-lg">
              <HiExclamationCircle className="text-white text-2xl" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-800">จำนวน Log ประเภท Error</h3>
              <p className="text-sm text-gray-600">{getErrorRangeLabel(errorRange)} (http.error, http.exception, *.failed)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setErrorRange('day')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                errorRange === 'day'
                  ? 'bg-red-500 text-white shadow'
                  : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              วัน
            </button>
            <button
              onClick={() => setErrorRange('week')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                errorRange === 'week'
                  ? 'bg-red-500 text-white shadow'
                  : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              สัปดาห์
            </button>
            <button
              onClick={() => setErrorRange('month')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                errorRange === 'month'
                  ? 'bg-red-500 text-white shadow'
                  : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              เดือน
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={metrics.errorLogsChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" opacity={0.5} />
            <XAxis
              dataKey="date"
              stroke="#6B7280"
              style={{ fontSize: '12px', fontWeight: '500' }}
              tickLine={false}
            />
            <YAxis
              stroke="#6B7280"
              style={{ fontSize: '12px', fontWeight: '500' }}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="httpError" name="HTTP Error (4xx/5xx)" stackId="errorType" fill="#DC2626" radius={[8, 8, 0, 0]} />
            <Bar dataKey="httpException" name="Exception ในระบบ" stackId="errorType" fill="#F97316" />
            <Bar dataKey="failed" name="งานที่ล้มเหลว (.failed)" stackId="errorType" fill="#F59E0B" />
            <Bar dataKey="other" name="Error อื่นๆ" stackId="errorType" fill="#A855F7" />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-5 rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-700">
            ตารางประเภท Error ({getErrorRangeLabel(errorRange)})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white">
                <tr className="text-left text-gray-600 border-b border-gray-200">
                  <th className="px-4 py-2.5 font-semibold">ประเภท</th>
                  <th className="px-4 py-2.5 font-semibold">จำนวน</th>
                  <th className="px-4 py-2.5 font-semibold">ล่าสุด</th>
                  <th className="px-4 py-2.5 font-semibold">ข้อความล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {metrics.errorCategoryRows.map((row) => (
                  <tr key={row.key} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-4 py-2.5 text-gray-800 font-medium">{row.label}</td>
                    <td className="px-4 py-2.5 text-gray-900 font-semibold">{row.count.toLocaleString('th-TH')}</td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {row.latestAt
                        ? new Date(row.latestAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{row.latestMessage || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}


      {/* System Status & Week Comparison */}
      <div className={`grid gap-6 mb-8 ${filter === 'system' ? 'grid-cols-1' : filter !== 'user' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* System Status - Only show when not User filter */}
        {filter !== 'user' && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-[#10B981] rounded-xl p-3 shadow-lg">
              <HiCheckCircle className="text-white text-2xl" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-800">สถานะระบบ</h3>
              <p className="text-sm text-gray-600">System Health</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-xl border ${metrics.systemStatus.api.status === 'healthy' ? 'bg-[#F0FDF4] border-[#D1FAE5]' : metrics.systemStatus.api.status === 'loading' ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">API Status</span>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${metrics.systemStatus.api.status === 'healthy' ? 'bg-[#10B981] animate-pulse' : metrics.systemStatus.api.status === 'loading' ? 'bg-gray-400' : 'bg-red-500 animate-pulse'}`}></span>
                  <span className={`text-xs font-semibold ${metrics.systemStatus.api.status === 'healthy' ? 'text-[#059669]' : metrics.systemStatus.api.status === 'loading' ? 'text-gray-500' : 'text-red-600'}`}>
                    {metrics.systemStatus.api.status === 'healthy' ? 'Healthy' : metrics.systemStatus.api.status === 'loading' ? 'กำลังโหลด...' : 'Unhealthy'}
                  </span>
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <p>เวลาตอบ health: {metrics.systemStatus.api.responseTime}</p>
                <p className="text-gray-700 font-medium">{metrics.systemStatus.api.summaryLine}</p>
              </div>
            </div>
            <div className={`p-4 rounded-xl border ${metrics.systemStatus.database.status === 'healthy' ? 'bg-[#F0FDF4] border-[#D1FAE5]' : metrics.systemStatus.database.status === 'loading' ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">Database</span>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${metrics.systemStatus.database.status === 'healthy' ? 'bg-[#10B981] animate-pulse' : metrics.systemStatus.database.status === 'loading' ? 'bg-gray-400' : 'bg-red-500 animate-pulse'}`}></span>
                  <span className={`text-xs font-semibold ${metrics.systemStatus.database.status === 'healthy' ? 'text-[#059669]' : metrics.systemStatus.database.status === 'loading' ? 'text-gray-500' : 'text-red-600'}`}>
                    {metrics.systemStatus.database.status === 'healthy' ? 'Healthy' : metrics.systemStatus.database.status === 'loading' ? 'กำลังโหลด...' : 'Unhealthy'}
                  </span>
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <p>สถานะ: {metrics.systemStatus.database.status === 'healthy' ? 'เชื่อมต่อได้' : metrics.systemStatus.database.status === 'loading' ? '—' : 'ผิดพลาด'}</p>
                {metrics.systemStatus.database.status === 'unhealthy' && metrics.systemStatus.database.error && (
                  <p className="text-red-600 mt-1 break-words">สาเหตุ: {metrics.systemStatus.database.error}</p>
                )}
              </div>
            </div>
            {/* Redis - ข้อมูลจริงจาก /api/health */}
            <div className={`p-4 rounded-xl border ${metrics.systemStatus.redis.status === 'healthy' ? 'bg-[#F0FDF4] border-[#D1FAE5]' : metrics.systemStatus.redis.status === 'loading' ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">Redis</span>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${metrics.systemStatus.redis.status === 'healthy' ? 'bg-[#10B981] animate-pulse' : metrics.systemStatus.redis.status === 'loading' ? 'bg-gray-400' : 'bg-red-500 animate-pulse'}`}></span>
                  <span className={`text-xs font-semibold ${metrics.systemStatus.redis.status === 'healthy' ? 'text-[#059669]' : metrics.systemStatus.redis.status === 'loading' ? 'text-gray-500' : 'text-red-600'}`}>
                    {metrics.systemStatus.redis.status === 'healthy' ? 'Healthy' : metrics.systemStatus.redis.status === 'loading' ? 'กำลังโหลด...' : 'Unhealthy'}
                  </span>
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <p>สถานะ: {metrics.systemStatus.redis.status === 'healthy' ? 'พร้อม' : metrics.systemStatus.redis.status === 'loading' ? '—' : 'ผิดพลาด'}</p>
              </div>
            </div>
            {/* Qdrant/Vector DB - ข้อมูลจริงจาก /api/health */}
            <div className={`p-4 rounded-xl border ${metrics.systemStatus.qdrant.status === 'healthy' ? 'bg-[#F0FDF4] border-[#D1FAE5]' : metrics.systemStatus.qdrant.status === 'loading' ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">Vector DB ({metrics.systemStatus.qdrant.providerLabel})</span>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${metrics.systemStatus.qdrant.status === 'healthy' ? 'bg-[#10B981] animate-pulse' : metrics.systemStatus.qdrant.status === 'loading' ? 'bg-gray-400' : 'bg-red-500 animate-pulse'}`}></span>
                  <span className={`text-xs font-semibold ${metrics.systemStatus.qdrant.status === 'healthy' ? 'text-[#059669]' : metrics.systemStatus.qdrant.status === 'loading' ? 'text-gray-500' : 'text-red-600'}`}>
                    {metrics.systemStatus.qdrant.status === 'healthy' ? 'Healthy' : metrics.systemStatus.qdrant.status === 'loading' ? 'กำลังโหลด...' : 'Unhealthy'}
                  </span>
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <p>สถานะ: {metrics.systemStatus.qdrant.status === 'healthy' ? 'เชื่อมต่อได้' : metrics.systemStatus.qdrant.status === 'loading' ? '—' : 'ผิดพลาด'}</p>
                {metrics.systemStatus.qdrant.status === 'unhealthy' && metrics.systemStatus.qdrant.error && (
                  <p className="text-red-600 mt-1 break-words">สาเหตุ: {metrics.systemStatus.qdrant.error}</p>
                )}
              </div>
            </div>
            {/* Storage — จาก /api/health (ดิสก์ / S3) */}
            <div className={`p-4 rounded-xl border ${
              metrics.systemStatus.storage.status === 'healthy' ? 'bg-[#F0FDF4] border-[#D1FAE5]' :
              metrics.systemStatus.storage.status === 'loading' ? 'bg-gray-50 border-gray-200' :
              metrics.systemStatus.storage.status === 'unknown' ? 'bg-amber-50 border-amber-200' :
              'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">Storage</span>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    metrics.systemStatus.storage.status === 'healthy' ? 'bg-[#10B981] animate-pulse' :
                    metrics.systemStatus.storage.status === 'loading' ? 'bg-gray-400' :
                    metrics.systemStatus.storage.status === 'unknown' ? 'bg-amber-500' :
                    'bg-red-500 animate-pulse'
                  }`}></span>
                  <span className={`text-xs font-semibold ${
                    metrics.systemStatus.storage.status === 'healthy' ? 'text-[#059669]' :
                    metrics.systemStatus.storage.status === 'loading' ? 'text-gray-500' :
                    metrics.systemStatus.storage.status === 'unknown' ? 'text-amber-800' :
                    'text-red-600'
                  }`}>
                    {metrics.systemStatus.storage.status === 'healthy' ? 'Healthy' :
                      metrics.systemStatus.storage.status === 'loading' ? 'กำลังโหลด...' :
                      metrics.systemStatus.storage.status === 'unknown' ? 'ข้อมูลจำกัด' :
                      'Unhealthy'}
                  </span>
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <p>ที่เก็บไฟล์: {metrics.systemStatus.storage.provider}</p>
                <p>{metrics.systemStatus.storage.storeRawLabel}</p>
                <p>ใช้ดิสก์: {metrics.systemStatus.storage.usage}</p>
                <p>ว่าง: {metrics.systemStatus.storage.available}</p>
              </div>
            </div>
            {/* AI Service - ข้อมูลจริงจาก /api/health (LLM gateway) */}
            <div className={`p-4 rounded-xl border ${metrics.systemStatus.ai.status === 'healthy' ? 'bg-[#F0FDF4] border-[#D1FAE5]' : metrics.systemStatus.ai.status === 'loading' ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">AI Service</span>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${metrics.systemStatus.ai.status === 'healthy' ? 'bg-[#10B981] animate-pulse' : metrics.systemStatus.ai.status === 'loading' ? 'bg-gray-400' : 'bg-red-500 animate-pulse'}`}></span>
                  <span className={`text-xs font-semibold ${metrics.systemStatus.ai.status === 'healthy' ? 'text-[#059669]' : metrics.systemStatus.ai.status === 'loading' ? 'text-gray-500' : 'text-red-600'}`}>
                    {metrics.systemStatus.ai.status === 'healthy' ? 'Healthy' : metrics.systemStatus.ai.status === 'loading' ? 'กำลังโหลด...' : 'Unhealthy'}
                  </span>
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <p>เวลาตอบ LLM: {metrics.systemStatus.ai.responseTime}</p>
                <p>โมเดล: {metrics.systemStatus.ai.model}</p>
                {metrics.systemStatus.ai.status === 'unhealthy' && metrics.systemStatus.ai.error && (
                  <p className="text-red-600 mt-1 break-words">สาเหตุ: {metrics.systemStatus.ai.error}</p>
                )}
              </div>
            </div>
            {/* OCR — จาก /api/health (Typhoon) */}
            <div className={`p-4 rounded-xl border ${
              metrics.systemStatus.ocr.status === 'healthy' ? 'bg-[#F0FDF4] border-[#D1FAE5]' :
              metrics.systemStatus.ocr.status === 'loading' ? 'bg-gray-50 border-gray-200' :
              metrics.systemStatus.ocr.status === 'unknown' ? 'bg-amber-50 border-amber-200' :
              'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">OCR Service</span>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    metrics.systemStatus.ocr.status === 'healthy' ? 'bg-[#10B981] animate-pulse' :
                    metrics.systemStatus.ocr.status === 'loading' ? 'bg-gray-400' :
                    metrics.systemStatus.ocr.status === 'unknown' ? 'bg-amber-500' :
                    'bg-red-500 animate-pulse'
                  }`}></span>
                  <span className={`text-xs font-semibold ${
                    metrics.systemStatus.ocr.status === 'healthy' ? 'text-[#059669]' :
                    metrics.systemStatus.ocr.status === 'loading' ? 'text-gray-500' :
                    metrics.systemStatus.ocr.status === 'unknown' ? 'text-amber-800' :
                    'text-red-600'
                  }`}>
                    {metrics.systemStatus.ocr.status === 'healthy' ? 'Healthy' :
                      metrics.systemStatus.ocr.status === 'loading' ? 'กำลังโหลด...' :
                      metrics.systemStatus.ocr.status === 'unknown' ? 'ข้อมูลจำกัด' :
                      metrics.systemStatus.ocr.unhealthyLabel}
                  </span>
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <p>Typhoon OCR: {metrics.systemStatus.ocr.typhoonLine}</p>
                <p>ตัวดึงข้อความ PDF: {metrics.systemStatus.ocr.pdfProvider}</p>
                {metrics.systemStatus.ocr.note ? (
                  <p className="text-gray-500 mt-1 break-words">{metrics.systemStatus.ocr.note}</p>
                ) : null}
              </div>
            </div>
            {/* Server — จาก /api/health (โหลด / RAM / ดิสก์โปรเซส) */}
            <div className={`p-4 rounded-xl border ${
              metrics.systemStatus.server.status === 'healthy' ? 'bg-[#F0FDF4] border-[#D1FAE5]' :
              metrics.systemStatus.server.status === 'loading' ? 'bg-gray-50 border-gray-200' :
              metrics.systemStatus.server.status === 'unknown' ? 'bg-amber-50 border-amber-200' :
              'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">Server</span>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    metrics.systemStatus.server.status === 'healthy' ? 'bg-[#10B981] animate-pulse' :
                    metrics.systemStatus.server.status === 'loading' ? 'bg-gray-400' :
                    metrics.systemStatus.server.status === 'unknown' ? 'bg-amber-500' :
                    'bg-red-500 animate-pulse'
                  }`}></span>
                  <span className={`text-xs font-semibold ${
                    metrics.systemStatus.server.status === 'healthy' ? 'text-[#059669]' :
                    metrics.systemStatus.server.status === 'loading' ? 'text-gray-500' :
                    metrics.systemStatus.server.status === 'unknown' ? 'text-amber-800' :
                    'text-red-600'
                  }`}>
                    {metrics.systemStatus.server.status === 'healthy' ? 'Healthy' :
                      metrics.systemStatus.server.status === 'loading' ? 'กำลังโหลด...' :
                      metrics.systemStatus.server.status === 'unknown' ? 'ข้อมูลจำกัด' :
                      metrics.systemStatus.server.unhealthyLabel}
                  </span>
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <p>โหลดเฉลี่ย (1 นาที): {metrics.systemStatus.server.cpu}</p>
                <p>RAM ที่ใช้ (เครื่อง): {metrics.systemStatus.server.memory}</p>
                <p>ดิสก์ที่ใช้: {metrics.systemStatus.server.disk}</p>
                <p>Uptime โปรเซส: {metrics.systemStatus.server.uptime}</p>
              </div>
            </div>
          </div>
        </div>
        )}

      </div>

    </div>
  );
}

export default Dashboard;

