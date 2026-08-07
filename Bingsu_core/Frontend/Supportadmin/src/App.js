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
import SupportPanel from './pages/SupportPanel';
import ActivityLogs from './pages/ActivityLogs';
import FeedbackReview from './pages/FeedbackReview';
import SystemOps from './pages/SystemOps';
import Login from './pages/Login';
import Navbar from './components/Navbar';
import NotificationBell from './components/NotificationBell';
import { api, getStoredUser, mapAdminUserToDisplay, normalizeDashboardRole } from './services/api';

function AppContent() {
  const USERS_POLL_MS = 60000;
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sessionUser, setSessionUser] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const userRole = normalizeDashboardRole(sessionUser?.role || getStoredUser()?.role || 'support');
  const [users, setUsers] = useState([]);

  const loadUsers = useCallback(async () => {
    const sessionRole = normalizeDashboardRole(sessionUser?.role || getStoredUser()?.role || userRole || 'support');
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
          // sync local cache from server role only
          try {
            localStorage.setItem('supportadmin_user', JSON.stringify({
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
            }));
          } catch (_) {}
        }
      } catch {
        if (!cancelled) {
          setSessionUser(null);
          try { api.logout(); } catch (_) {}
        }
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  useEffect(() => {
    if (typeof window !== 'undefined') window.userRole = userRole;
  }, [userRole]);

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
  const canSeeDashboard = isAdmin || isAdminMetrics || isSupport;
  const canSeeLogs = isAdmin || isAdminMetrics;
  const canSeeBots = isAdmin || isSupport;
  const defaultPath = canSeeDashboard ? '/dashboard' : '/knowledge';

  return (
    <div className="flex h-screen bg-white relative">
      <Navbar
        onCollapseChange={setIsSidebarCollapsed}
        userRole={userRole}
      />
      {/* Main Content */}
      <main className={`flex-1 bg-white px-8 py-6 overflow-auto flex flex-col transition-all duration-300 relative ${isSidebarCollapsed ? 'pl-16' : ''}`}>
          <div className="flex justify-end mb-3 shrink-0">
            <NotificationBell users={users} />
          </div>
          <Routes>
            <Route path="/" element={<Navigate to={defaultPath} replace />} />
            <Route path="/dashboard" element={canSeeDashboard ? <Dashboard users={users} groups={[]} userRole={userRole} /> : <Navigate to="/knowledge" replace />} />
            <Route path="/homepage" element={<Home userRole={userRole} />} />
            <Route path="/home" element={<Navigate to="/homepage" replace />} />
            <Route path="/bots" element={canSeeBots ? <Bots userRole={userRole} /> : <Navigate to="/knowledge" replace />} />
            <Route path="/bots/create" element={isAdmin ? <BotDetail /> : <Navigate to="/bots" replace />} />
            <Route path="/bots/:id" element={canSeeBots ? <BotDetail /> : <Navigate to="/knowledge" replace />} />
            <Route path="/knowledge" element={<Knowledge userRole={userRole} />} />
            <Route path="/knowledge/create" element={<SupportCreateKnowledge />} />
            <Route path="/knowledge/:id/add-data" element={<KnowledgeDocumentRoute />} />
            <Route path="/support-panel" element={<SupportPanel users={users} setUsers={setUsers} onRefreshPending={loadUsers} />} />
            <Route path="/logs" element={canSeeLogs ? <ActivityLogs userRole={userRole} /> : <Navigate to="/knowledge" replace />} />
            <Route path="/feedback" element={<FeedbackReview userRole={userRole} />} />
            <Route path="/synonyms" element={<Navigate to="/system?tab=synonyms" replace />} />
            <Route path="/service-rates" element={<Navigate to="/system?tab=rates" replace />} />
            <Route path="/approval-authority" element={<Navigate to="/system?tab=authority" replace />} />
            <Route path="/product-managers" element={<Navigate to="/system?tab=pm" replace />} />
            <Route path="/system" element={<SystemOps userRole={userRole} />} />
          </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth" element={<Login />} />
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}

export default App;
