import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { 
  HiUsers, 
  HiKey, 
  HiDesktopComputer, 
  HiBookOpen, 
  HiUserGroup,
  HiExclamationCircle,
  HiSparkles,
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
  ResponsiveContainer
} from 'recharts';
import { api } from '../services/api';
import {
  COLORS,
  GRADIENT_COLORS,
  isErrorLogEvent,
  getErrorTypeKey,
  getErrorCategoryKey,
  getErrorWindowStartMs,
  getErrorRangeLabel,
  TOKEN_RANGE_DAYS,
  getTokenRangeLabel,
  RANGE_DAYS,
  getRangeLabel,
  getLocalDateKey,
} from './dashboard/helpers';
import AnimatedCounter from './dashboard/AnimatedCounter';
import StatCard from './dashboard/StatCard';

/** บอกให้ชัดว่ากราฟกำลังโหลด หรือโหลดไม่ได้ — กันเข้าใจผิดว่าเลขศูนย์คือยอดจริง */
const ActivityNotice = ({ status, onRetry }) => {
  if (status === 'ready') return null;
  const loading = status === 'loading';
  return (
    <div
      className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        loading ? 'border-gray-200 bg-gray-50 text-gray-600' : 'border-red-200 bg-red-50 text-red-700'
      }`}
    >
      {loading ? (
        <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      ) : (
        <HiExclamationCircle className="flex-shrink-0 text-base" />
      )}
      <span className="flex-1">
        {loading
          ? 'กำลังโหลดข้อมูลจากระบบ...'
          : 'โหลดข้อมูลไม่สำเร็จ ตัวเลขที่เห็นเป็นศูนย์เพราะไม่มีข้อมูล ไม่ใช่ยอดจริง'}
      </span>
      {!loading && (
        <button
          type="button"
          onClick={onRetry}
          className="flex-shrink-0 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
        >
          ลองใหม่
        </button>
      )}
    </div>
  );
};

function Dashboard({ users = [], groups = [], userRole = 'support' }) {
  const [isVisible, setIsVisible] = useState(false);
  const [filter, setFilter] = useState('user'); // 'all', 'user', 'system'
  const [errorRange, setErrorRange] = useState('week');
  const [tokenRange, setTokenRange] = useState('month'); // day | week | month
  const [usersRange, setUsersRange] = useState('week'); // day | week | month
  const [reportData, setReportData] = useState(null);
  const [metricsData, setMetricsData] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [healthResponseTimeMs, setHealthResponseTimeMs] = useState(null);
  const [faqCategories, setFaqCategories] = useState(null);
  const [citedDocs, setCitedDocs] = useState(null); // เอกสารที่ถูกอ้างอิงบ่อย
  const [adminActivity, setAdminActivity] = useState(null);
  const [activityStatus, setActivityStatus] = useState('loading'); // loading | ready | error
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
    api.getMetrics().then(setMetricsData).catch(() => {});
  }, [userRole]);

  const loadAdminActivity = useCallback(() => {
    const days = RANGE_DAYS[usersRange] || 7;
    setActivityStatus('loading');
    api
      .getAdminActivity(days)
      .then((data) => {
        setAdminActivity(data);
        setActivityStatus('ready');
      })
      .catch(() => {
        setAdminActivity(null);
        setActivityStatus('error');
      });
  }, [usersRange]);

  useEffect(() => {
    loadAdminActivity();
  }, [userRole, loadAdminActivity]);

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
    if (filter === 'system') {
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
    if (filter === 'system') {
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
    if (filter === 'system') {
      setTokenUsageData(null);
      return;
    }
    const scope = filter === 'user' ? 'user' : 'all';
    const days = TOKEN_RANGE_DAYS[tokenRange] || 30;
    api
      .getTokenUsage(scope, days)
      .then((data) => setTokenUsageData(data || null))
      .catch(() => setTokenUsageData(null));
  }, [filter, userRole, tokenRange]);

  useEffect(() => {
    if (filter === 'system') {
      setUserRoleDistributionData(null);
      return;
    }
    api
      .getUserRoleDistribution()
      .then((data) => setUserRoleDistributionData(data?.distribution ?? null))
      .catch(() => setUserRoleDistributionData([]));
  }, [filter, userRole]);

  useEffect(() => {
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
              const label = d.toLocaleDateString('th-TH', {
                day: 'numeric',
                month: 'short',
                ...(range === 'week' ? { weekday: 'short' } : {}),
              });
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
            upload: { key: 'upload', label: 'อัปโหลดไฟล์', count: 0, latestAt: null, latestMessage: '' },
            ocr: { key: 'ocr', label: 'OCR', count: 0, latestAt: null, latestMessage: '' },
            vector: { key: 'vector', label: 'Vector / Embed', count: 0, latestAt: null, latestMessage: '' },
            http: { key: 'http', label: 'HTTP / API', count: 0, latestAt: null, latestMessage: '' },
            failed: { key: 'failed', label: 'งานที่ล้มเหลว', count: 0, latestAt: null, latestMessage: '' },
            other: { key: 'other', label: 'อื่นๆ', count: 0, latestAt: null, latestMessage: '' },
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
          { key: 'upload', label: 'อัปโหลดไฟล์', count: 0, latestAt: null, latestMessage: '' },
          { key: 'ocr', label: 'OCR', count: 0, latestAt: null, latestMessage: '' },
          { key: 'vector', label: 'Vector / Embed', count: 0, latestAt: null, latestMessage: '' },
          { key: 'http', label: 'HTTP / API', count: 0, latestAt: null, latestMessage: '' },
          { key: 'failed', label: 'งานที่ล้มเหลว', count: 0, latestAt: null, latestMessage: '' },
          { key: 'other', label: 'อื่นๆ', count: 0, latestAt: null, latestMessage: '' },
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

  // Dashboard เต็มรูปแบบเหมือน admin สำหรับ support / admin / admin_metrics
  const isAdmin = true;

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

    const buildLastNDays = (series, role, days) => {
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
      const n = Math.max(1, Number(days) || 7);
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        let label;
        if (n <= 7) {
          label = i === 0 ? 'วันนี้' : i === 1 ? 'เมื่อวาน' : `${i} วันก่อน`;
        } else {
          label = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        }
        out.push({ date: label, key, value: map.get(key) || 0 });
      }
      return out;
    };

    // Use real admin activity when available (admin/admin_metrics). Fallback to mock if not.
    if ((filter === 'all' || filter === 'user') && adminActivity?.series) {
      const usersDays = RANGE_DAYS[usersRange] || 7;
      const userSeries = buildLastNDays(adminActivity.series, 'user', usersDays);
      const modelSeries = buildLastNDays(adminActivity.series, 'model', usersDays);
      const todayUsers = userSeries[userSeries.length - 1]?.value || 0;
      const yesterdayUsers = userSeries.length > 1 ? (userSeries[userSeries.length - 2]?.value || 0) : 0;
      const usersChange = yesterdayUsers ? ((todayUsers - yesterdayUsers) / Math.max(1, yesterdayUsers)) * 100 : 0;

      const todayModel = modelSeries[modelSeries.length - 1]?.value || 0;
      const yesterdayModel = modelSeries.length > 1 ? (modelSeries[modelSeries.length - 2]?.value || 0) : 0;
      const modelChange = yesterdayModel ? ((todayModel - yesterdayModel) / Math.max(1, yesterdayModel)) * 100 : 0;

      dailyUsers = { today: todayUsers, yesterday: yesterdayUsers, change: Number(usersChange.toFixed(1)) };
      // ไม่มี token จริงใน endpoint นี้ → ใช้จำนวน model messages เป็น proxy เพื่อให้เป็นข้อมูลจริงจากระบบ
      tokenUsage = { today: todayModel, yesterday: yesterdayModel, change: Number(modelChange.toFixed(1)) };
      dailyUsersChart = userSeries.map((r) => ({ date: r.date, users: r.value }));
      tokenUsageChart = modelSeries.map((r) => ({ date: r.date, tokens: r.value }));
    } else {
      // ยังไม่มีข้อมูลจริง — คงโครงวันที่ไว้แต่ค่าเป็นศูนย์ ห้ามเดาตัวเลขให้ผู้ดูแลเห็น
      const emptySeries = buildLastNDays([], 'user', RANGE_DAYS[usersRange] || 7);
      dailyUsers = { today: 0, yesterday: 0, change: 0 };
      tokenUsage = { today: 0, yesterday: 0, change: 0 };
      dailyUsersChart = emptySeries.map((r) => ({ date: r.date, users: 0 }));
      tokenUsageChart = emptySeries.map((r) => ({ date: r.date, tokens: 0 }));
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
            ai: {
              status: 'loading',
              responseTime: '—',
              responseTimeLabel: 'เวลาตอบ',
              model: '—',
              error: '',
              gatewayLine: '—',
              methodLine: '',
              modelWarning: '',
            },
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
        const aiDeepMode = healthData.ai?.mode === 'completion';
        const aiResponseTimeLabel = aiDeepMode ? 'เวลาตอบ LLM' : 'เวลาตอบ gateway';
        const aiMethodLine = aiDeepMode
          ? 'ตรวจด้วยการถามโมเดลจริง (ใช้ token)'
          : 'ตรวจด้วย /models — ไม่ใช้ token';
        const aiModelWarning =
          healthData.ai?.modelAvailable === false ? 'ไม่พบโมเดลนี้ในรายการของ gateway' : '';
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
            responseTimeLabel: aiResponseTimeLabel,
            model: aiModel,
            error: aiError,
            gatewayLine,
            methodLine: aiMethodLine,
            modelWarning: aiModelWarning,
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
  }, [filter, users, groups, reportData, metricsData, adminActivity, healthData, healthResponseTimeMs, faqCategories, tokenUsageData, userRoleDistributionData, errorLogOverview, errorRange, usersRange]);

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
    <div className="w-full">
      {/* Header with Animation */}
      <div className={`mb-8 transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
              <HiSparkles className="text-white text-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
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
          title={`ผู้ใช้งาน ${getRangeLabel(usersRange)}`}
          value={metrics.dailyUsers.today}
          icon={HiUsers}
          change={metrics.dailyUsers.change}
          changeType="up"
          subtitle={usersRange === 'day' ? 'ข้อความจากผู้ใช้วันนี้' : `ข้อความจากผู้ใช้ · ${getRangeLabel(usersRange)}`}
          iconColor="bg-[#F5C200]"
          gradient={GRADIENT_COLORS.sandy}
          sparklineData={metrics.dailyUsersChart.map(d => d.users)}
          delay={200}
          bgColor="bg-white"
          onCardClick={() => scrollToChart(dailyUsersChartRef)}
          isVisible={isVisible}
        />
        <StatCard
          title="Service พร้อมใช้งาน"
          value={metrics.healthyServicesCount}
          valueSuffix={`/${metrics.totalServicesCount}`}
          icon={HiShieldCheck}
          subtitle="API, DB, Redis, Vector, AI, OCR, Server"
          iconColor="bg-[#F5C200]"
          gradient={['#8B8680', '#6B6560']}
          isVisible={isVisible}
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
          title={`Token ${getTokenRangeLabel(tokenRange)}`}
          value={metrics.tokenUsage.today}
          icon={HiKey}
          change={undefined}
          changeType="up"
          subtitle={`รวม token ${getTokenRangeLabel(tokenRange)}`}
          iconColor="bg-[#8B8680]"
          gradient={['#8B8680', '#8B8680']}
          sparklineData={metrics.tokenUsageChart.map(d => d.tokens / 10000)}
          delay={600}
          bgColor="bg-white"
          onCardClick={() => scrollToChart(tokenUsageChartRef)}
          isVisible={isVisible}
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
                <HiUsers className="text-white text-2xl" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">ผู้ใช้งาน</h3>
                <p className="text-sm text-gray-600">{getRangeLabel(usersRange)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {[
                { id: 'day', label: 'รายวัน' },
                { id: 'week', label: 'รายสัปดาห์' },
                { id: 'month', label: 'รายเดือน' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setUsersRange(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    usersRange === opt.id
                      ? 'bg-[#8B8680] text-white shadow'
                      : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <ActivityNotice status={activityStatus} onRetry={loadAdminActivity} />
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={metrics.dailyUsersChart}
              margin={{ top: 8, right: 8, left: 0, bottom: usersRange === 'month' ? 36 : 8 }}
            >
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
                interval={usersRange === 'month' ? 3 : 0}
                angle={usersRange === 'month' ? -30 : 0}
                textAnchor={usersRange === 'month' ? 'end' : 'middle'}
                height={usersRange === 'month' ? 48 : 28}
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
                <HiKey className="text-white text-2xl" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">Token</h3>
                <p className="text-sm text-gray-600">
                  {getTokenRangeLabel(tokenRange)}
                  <span className="text-gray-400"> · รวม </span>
                  <span className="font-semibold text-gray-700">
                    {Number(metrics.tokenUsage.today || 0).toLocaleString('th-TH')}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {[
                { id: 'day', label: 'รายวัน' },
                { id: 'week', label: 'รายสัปดาห์' },
                { id: 'month', label: 'รายเดือน' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTokenRange(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    tokenRange === opt.id
                      ? 'bg-[#8B8680] text-white shadow'
                      : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {!tokenUsageData && <ActivityNotice status={activityStatus} onRetry={loadAdminActivity} />}
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart
              data={metrics.tokenUsageChart}
              margin={{ top: 8, right: 8, left: 0, bottom: tokenRange === 'month' ? 36 : 8 }}
            >
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
                interval={tokenRange === 'month' ? 3 : 0}
                angle={tokenRange === 'month' ? -30 : 0}
                textAnchor={tokenRange === 'month' ? 'end' : 'middle'}
                height={tokenRange === 'month' ? 48 : 28}
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
              <h3 className="text-xl font-bold text-gray-800">บทบาทผู้ใช้</h3>
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
              <h3 className="text-xl font-bold text-gray-800">เอกสารที่ถูกอ้างอิงบ่อย</h3>
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

      {/* Error Logs Chart — แท่งเดียว = รวมทุกประเภท อ่านแนวโน้มง่าย / แยกประเภทดูในตารางด้านล่าง */}
      {filter !== 'system' && isAdmin && (
      <div
        ref={errorLogsChartRef}
        className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-8 hover:shadow-2xl transition-all duration-300"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-red-500 rounded-xl p-3 shadow-lg">
              <HiExclamationCircle className="text-white text-2xl" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-800">จำนวน Error</h3>
              <p className="text-sm text-gray-600">
                {getErrorRangeLabel(errorRange)}
                <span className="text-gray-400"> · รวม </span>
                <span className="font-semibold text-red-600">
                  {(metrics.errorLogsChart || []).reduce((s, d) => s + (Number(d.count) || 0), 0).toLocaleString('th-TH')}
                </span>
                <span className="text-gray-400"> ครั้ง</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[
              { id: 'day', label: '24 ชม.' },
              { id: 'week', label: '7 วัน' },
              { id: 'month', label: '30 วัน' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setErrorRange(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  errorRange === opt.id
                    ? 'bg-red-500 text-white shadow'
                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={metrics.errorLogsChart}
            margin={{ top: 8, right: 8, left: 0, bottom: errorRange === 'month' ? 36 : 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#9CA3AF"
              tickLine={false}
              axisLine={false}
              interval={errorRange === 'day' ? 2 : errorRange === 'month' ? 2 : 0}
              angle={errorRange === 'month' ? -30 : 0}
              textAnchor={errorRange === 'month' ? 'end' : 'middle'}
              height={errorRange === 'month' ? 48 : 28}
              tick={{ fontSize: 11, fontWeight: 500, fill: '#6B7280' }}
            />
            <YAxis
              stroke="#9CA3AF"
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={36}
              tick={{ fontSize: 11, fontWeight: 500, fill: '#6B7280' }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(220, 38, 38, 0.06)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload || {};
                const parts = [
                  row.httpError > 0 && `HTTP ${row.httpError}`,
                  row.httpException > 0 && `Exception ${row.httpException}`,
                  row.failed > 0 && `ล้มเหลว ${row.failed}`,
                  row.other > 0 && `อื่นๆ ${row.other}`,
                ].filter(Boolean);
                return (
                  <div className="bg-white px-3 py-2.5 border border-gray-200 rounded-xl shadow-xl min-w-[140px]">
                    <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                    <p className="text-lg font-bold text-red-600 leading-tight">
                      {(row.count || 0).toLocaleString('th-TH')} <span className="text-sm font-medium text-gray-500">ครั้ง</span>
                    </p>
                    {parts.length > 0 && (
                      <p className="text-[11px] text-gray-400 mt-1 leading-snug">{parts.join(' · ')}</p>
                    )}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="count"
              name="จำนวน Error"
              fill="#DC2626"
              radius={[6, 6, 0, 0]}
              maxBarSize={errorRange === 'day' ? 28 : 44}
            />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-5 rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-700">
            แยกตามประเภท ({getErrorRangeLabel(errorRange)})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white">
                <tr className="text-left text-gray-600 border-b border-gray-200">
                  <th className="px-4 py-2.5 font-semibold">ประเภท</th>
                  <th className="px-4 py-2.5 font-semibold w-24">จำนวน</th>
                  <th className="px-4 py-2.5 font-semibold w-40">ล่าสุด</th>
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
                    <td className="px-4 py-2.5 text-gray-600 max-w-md truncate" title={row.latestMessage || ''}>
                      {row.latestMessage || '—'}
                    </td>
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
              <h3 className="text-xl font-bold text-gray-800">สถานะระบบ</h3>
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
                <p>
                  {metrics.systemStatus.ai.responseTimeLabel}: {metrics.systemStatus.ai.responseTime}
                </p>
                <p>โมเดล: {metrics.systemStatus.ai.model}</p>
                {metrics.systemStatus.ai.methodLine && (
                  <p className="text-gray-500">{metrics.systemStatus.ai.methodLine}</p>
                )}
                {metrics.systemStatus.ai.modelWarning && (
                  <p className="text-red-600 break-words">{metrics.systemStatus.ai.modelWarning}</p>
                )}
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

