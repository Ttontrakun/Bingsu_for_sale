import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Bots from './pages/Bots';
import BotDetail from './pages/BotDetail';
import Knowledge from './pages/knowledge';
import KnowledgeDocumentRoute from './pages/KnowledgeDocumentRoute';
import SupportCreateKnowledge from './pages/SupportCreateKnowledge';
import UserBots from './pages/UserBots';
import SupportPanel from './pages/SupportPanel';
import ActivityLogs from './pages/ActivityLogs';
import FeedbackReview from './pages/FeedbackReview';
import SystemOps from './pages/SystemOps';
import DevStudio from './pages/DevStudio';
import Login from './pages/Login';
import Navbar from './components/Navbar';
import NotificationBell from './components/NotificationBell';
import { api, getStoredUser, mapAdminUserToDisplay, normalizeDashboardRole } from './services/api';
import { AdminSystemConfigProvider, useAdminSystemConfig } from './context/AdminSystemConfigContext';

function AppContent() {
  const USERS_POLL_MS = 60000;
  const [sessionUser, setSessionUser] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const { reload: reloadAdminConfig } = useAdminSystemConfig();
  const userRole = normalizeDashboardRole(sessionUser?.role || getStoredUser()?.role || 'support');
  const [users, setUsers] = useState([]);

  const loadUsers = useCallback(async () => {
    const sessionRole = normalizeDashboardRole(sessionUser?.role || getStoredUser()?.role || userRole || 'support');
    if (sessionRole === 'admin_dev') {
      setUsers([]);
      return;
    }
    try {
      if (sessionRole === 'admin' || sessionRole === 'admin_metrics') {
        const list = await api.getAdminUsers();
        setUsers((list || []).map(mapAdminUserToDisplay));
      } else {
        const list = await api.getSupportCustomers();
        setUsers((list || []).map(mapAdminUserToDisplay));
      }
    } catch {
      setUsers([]);
    }
  }, [userRole, sessionUser]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.getMe();
        const user = me?.user ?? me;
        if (!user?.id) throw new Error('no session');
        if (!cancelled) {
          setSessionUser(user);
          reloadAdminConfig();
          try {
            localStorage.setItem('supportadmin_user', JSON.stringify({
              id: user.id,
              role: user.role,
            }));
          } catch (_) {}
        }
      } catch {
        if (!cancelled) {
          setSessionUser(null);
          try {
            localStorage.removeItem('supportadmin_token');
            localStorage.removeItem('supportadmin_user');
          } catch (_) {}
        }
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadAdminConfig]);

  useEffect(() => {
    if (sessionUser) loadUsers();
  }, [loadUsers, sessionUser]);

  useEffect(() => {
    if (!sessionUser) return undefined;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      loadUsers();
    }, USERS_POLL_MS);
    return () => clearInterval(timer);
  }, [loadUsers, sessionUser]);

  const location = useLocation();
  const isLoginPage = location.pathname === '/login' || location.pathname === '/auth';
  if (isLoginPage) return <Login />;
  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-500 text-sm">
        กำลังตรวจสอบสิทธิ์...
      </div>
    );
  }
  if (!sessionUser) return <Navigate to="/login" replace />;

  const isAdmin = userRole === 'admin';
  const isAdminMetrics = userRole === 'admin_metrics';
  const isSupport = userRole === 'support';
  const isAdminDev = userRole === 'admin_dev';
  const canSeeDashboard = isAdmin || isAdminMetrics || isSupport;
  const canSeeLogs = isAdmin || isAdminMetrics;
  const canSeeBots = isAdmin || isSupport;
  const defaultPath = isAdminDev ? '/dev' : canSeeDashboard ? '/dashboard' : '/knowledge';
  const isKnowledgePage = location.pathname === '/knowledge' || location.pathname.startsWith('/knowledge/');

  return (
    <div className="flex h-screen bg-[#f7f7f8] relative">
      <Navbar userRole={userRole} />
      {/* rail ที่หุบแล้วยังกินพื้นที่จริงใน flex อยู่ ห้ามเว้น padding ซ้ำ ไม่งั้นจะเกิดช่องว่างข้างเมนู */}
      <main className={`flex-1 min-w-0 bg-[#f7f7f8] px-5 sm:px-8 py-5 overflow-auto flex flex-col transition-all duration-300 relative ${isKnowledgePage ? 'thin-scrollbar' : ''}`}>
          {!isAdminDev && (
            <div className="flex justify-end mb-4 shrink-0">
              <NotificationBell users={users} />
            </div>
          )}
          <Routes>
            <Route path="/" element={<Navigate to={defaultPath} replace />} />
            <Route path="/dev" element={isAdminDev ? <DevStudio /> : <Navigate to={defaultPath} replace />} />
            <Route path="/dashboard" element={canSeeDashboard ? <Dashboard users={users} groups={[]} userRole={userRole} /> : <Navigate to={defaultPath} replace />} />
            <Route path="/homepage" element={!isAdminDev ? <Home userRole={userRole} /> : <Navigate to="/dev" replace />} />
            <Route path="/home" element={<Navigate to="/homepage" replace />} />
            <Route path="/bots" element={canSeeBots ? <Bots userRole={userRole} /> : <Navigate to={defaultPath} replace />} />
            <Route path="/bots/create" element={isAdmin ? <BotDetail /> : <Navigate to="/bots" replace />} />
            <Route path="/bots/:id" element={canSeeBots ? <BotDetail /> : <Navigate to={defaultPath} replace />} />
            <Route path="/knowledge" element={!isAdminDev ? <Knowledge userRole={userRole} /> : <Navigate to="/dev" replace />} />
            <Route path="/knowledge/create" element={!isAdminDev ? <SupportCreateKnowledge /> : <Navigate to="/dev" replace />} />
            <Route path="/knowledge/:id/add-data" element={!isAdminDev ? <KnowledgeDocumentRoute /> : <Navigate to="/dev" replace />} />
            <Route path="/user-bots" element={canSeeBots ? <UserBots /> : <Navigate to={defaultPath} replace />} />
            <Route path="/user-knowledge" element={<Navigate to="/user-bots" replace />} />
            <Route path="/support-panel" element={!isAdminDev ? <SupportPanel users={users} setUsers={setUsers} onRefreshPending={loadUsers} /> : <Navigate to="/dev" replace />} />
            <Route path="/logs" element={canSeeLogs ? <ActivityLogs userRole={userRole} /> : <Navigate to={defaultPath} replace />} />
            <Route path="/feedback" element={!isAdminDev ? <FeedbackReview userRole={userRole} /> : <Navigate to="/dev" replace />} />
            <Route path="/synonyms" element={<Navigate to="/system?tab=synonyms" replace />} />
            <Route path="/service-rates" element={<Navigate to="/system?tab=rates" replace />} />
            <Route path="/approval-authority" element={<Navigate to="/system?tab=authority" replace />} />
            <Route path="/product-managers" element={<Navigate to="/system?tab=pm" replace />} />
            <Route path="/system" element={!isAdminDev ? <SystemOps userRole={userRole} /> : <Navigate to="/dev" replace />} />
          </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AdminSystemConfigProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/auth" element={<Login />} />
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/*" element={<AppContent />} />
          </Routes>
        </Router>
      </AdminSystemConfigProvider>
    </ToastProvider>
  );
}

export default App;
