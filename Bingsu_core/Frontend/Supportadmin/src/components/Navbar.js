import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  HiChevronLeft, 
  HiChevronRight, 
  HiHome, 
  HiDesktopComputer, 
  HiBookOpen, 
  HiSupport,
  HiViewGrid,
  HiClipboardList,
  HiThumbUp,
  HiCog,
  HiUsers,
  HiOutlineUser,
} from 'react-icons/hi';
import ProfileModal from './ProfileModal';
import AccountModal from './AccountModal';
import { api, userAPI } from '../services/api';
import { useAdminSystemConfig } from '../context/AdminSystemConfigContext';
import avatarMale from '../assets/avatars/user_male.png';
import avatarFemale from '../assets/avatars/user_female.png';

const AVATAR_SRC_BY_KEY = {
  'preset:user_male': avatarMale,
  'preset:user_female': avatarFemale,
};

function splitAppName(appName) {
  const parts = String(appName || 'Enterprise AI Chatbot').trim().split(/\s+/);
  const mid = Math.ceil(parts.length / 2);
  return {
    line1: parts.slice(0, mid).join(' ') || 'Enterprise AI',
    line2: parts.slice(mid).join(' '),
  };
}

function Navbar({ onCollapseChange, userRole }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState('preset:user_male');
  const [profileName, setProfileName] = useState('Profile');
  const navigate = useNavigate();
  const location = useLocation();
  const { menuEnabled, logoSrc, appName } = useAdminSystemConfig();
  const { line1: brandLine1, line2: brandLine2 } = splitAppName(appName);
  const profileInitial = (profileName?.trim()?.charAt(0) || 'P').toUpperCase();
  const surface = new URLSearchParams(location.search).get('surface');
  const isUserSurface = location.pathname.startsWith('/dev') && surface !== 'supportadmin';
  const isSupportSurface = location.pathname.startsWith('/dev') && surface === 'supportadmin';

  const applyProfile = useCallback((user) => {
    if (!user || typeof user !== 'object') return;
    if (user.name) setProfileName(String(user.name));
    const key = String(user.avatarUrl || '');
    if (AVATAR_SRC_BY_KEY[key]) setSelectedAvatar(key);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await userAPI.getCurrentUser();
        if (!cancelled) applyProfile(user);
      } catch {
        // ignore — keep defaults
      }
    })();
    return () => { cancelled = true; };
  }, [applyProfile]);

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    if (onCollapseChange) {
      onCollapseChange(newState);
    }
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const handleManageAccount = () => {
    setIsAccountModalOpen(true);
  };

  const handleSignOut = async () => {
    try {
      await api.logout();
    } catch (_) {
      /* ignore */
    }
    navigate('/login');
  };

  const isAdminDev = userRole === 'admin_dev';
  const canSeeDashboard = !isAdminDev && (userRole === 'admin' || userRole === 'admin_metrics' || userRole === 'support') && menuEnabled('dashboard');
  const canSeeBots = !isAdminDev && (userRole === 'admin' || userRole === 'support') && menuEnabled('bots');
  const canSeeUserBots = !isAdminDev && (userRole === 'admin' || userRole === 'support') && menuEnabled('userBots');
  const canSeeLogs = !isAdminDev && (userRole === 'admin' || userRole === 'admin_metrics') && menuEnabled('logs');
  const canSeeFeedback = !isAdminDev && (userRole === 'admin' || userRole === 'admin_metrics' || userRole === 'support') && menuEnabled('feedback');
  const canSeeSystem = !isAdminDev && (userRole === 'admin' || userRole === 'support') && menuEnabled('system');
  const canSeeKnowledge = !isAdminDev && menuEnabled('knowledge');
  const canSeeManual = !isAdminDev && menuEnabled('manual');
  const canSeeSupportPanel = !isAdminDev && menuEnabled('supportPanel');

  if (isAdminDev) {
    return (
      <>
        <aside
          className={`bg-white border-r border-gray-200 flex flex-col py-6 transition-all duration-500 ease-in-out relative ${
            isCollapsed ? 'w-16 px-2 overflow-visible' : 'w-56 px-5 overflow-visible'
          }`}
        >
          <button
            onClick={toggleSidebar}
            className={`absolute -right-3 top-8 bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-gray-400 rounded-full p-2 z-30 shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out flex items-center justify-center ${
              isCollapsed ? 'opacity-0 pointer-events-none scale-0' : 'opacity-100 scale-100'
            }`}
            title="หุบ sidebar"
          >
            <HiChevronLeft className="text-gray-700 text-base" />
          </button>
          <button
            onClick={toggleSidebar}
            className={`absolute -right-3 top-8 bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-gray-400 rounded-full p-2 z-30 shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out flex items-center justify-center ${
              isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 pointer-events-none scale-0'
            }`}
            title="ขยาย sidebar"
          >
            <HiChevronRight className="text-gray-700 text-base" />
          </button>

          <div
            className={`flex items-center gap-2 mb-6 pb-6 border-b border-gray-200 cursor-pointer hover:opacity-80 ${
              isCollapsed ? 'justify-center' : ''
            }`}
            onClick={() => navigate('/dev')}
          >
            <img src={logoSrc} alt="logo" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            {!isCollapsed && (
              <span className="text-orange-500 font-bold text-lg leading-tight">
                <span className="block">{brandLine1}</span>
                {brandLine2 ? <span className="block">{brandLine2}</span> : null}
              </span>
            )}
          </div>

          <nav className="flex flex-col gap-2 flex-1 min-h-0">
            {!isCollapsed && (
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-2 mb-1">
                Dev Studio
              </p>
            )}
            <button
              type="button"
              onClick={() => navigate('/dev')}
              className={`w-full py-2 px-2.5 flex items-center gap-2 rounded-lg text-sm font-medium transition-colors ${
                isUserSurface ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'
              } ${isCollapsed ? 'justify-center' : ''}`}
              title="User"
            >
              <HiOutlineUser className="text-lg flex-shrink-0" />
              {!isCollapsed && <span>User</span>}
            </button>
            <button
              type="button"
              onClick={() => navigate('/dev?surface=supportadmin')}
              className={`w-full py-2 px-2.5 flex items-center gap-2 rounded-lg text-sm font-medium transition-colors ${
                isSupportSurface ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'
              } ${isCollapsed ? 'justify-center' : ''}`}
              title="Supportadmin"
            >
              <HiSupport className="text-lg flex-shrink-0" />
              {!isCollapsed && <span>Supportadmin</span>}
            </button>
          </nav>

          <div
            className={`flex items-center gap-3 pt-4 border-t border-gray-200 cursor-pointer hover:bg-gray-50 rounded-lg p-2 ${
              isCollapsed ? 'justify-center' : ''
            }`}
            onClick={() => setIsProfileModalOpen(true)}
          >
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0 text-xl overflow-hidden">
              {AVATAR_SRC_BY_KEY[selectedAvatar] ? (
                <img
                  src={AVATAR_SRC_BY_KEY[selectedAvatar]}
                  alt="avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-gray-700 font-medium">{profileInitial}</span>
              )}
            </div>
            {!isCollapsed && <span className="text-gray-700 whitespace-nowrap">Profile</span>}
          </div>

          <ProfileModal
            isOpen={isProfileModalOpen}
            onClose={() => setIsProfileModalOpen(false)}
            onManageAccount={handleManageAccount}
            onSignOut={handleSignOut}
            selectedAvatar={selectedAvatar}
            profileInitial={profileInitial}
          />
        </aside>

        <AccountModal
          isOpen={isAccountModalOpen}
          onClose={() => setIsAccountModalOpen(false)}
          onProfileUpdated={applyProfile}
        />
      </>
    );
  }

  return (
    <>
    <aside className={`bg-gray-200 flex flex-col py-6 transition-all duration-500 ease-in-out relative ${
      isCollapsed ? 'w-16 px-2 overflow-visible' : 'w-52 px-6 overflow-visible'
    }`}>
      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        className={`absolute -right-3 top-8 bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-gray-400 rounded-full p-2 z-30 shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out flex items-center justify-center ${
          isCollapsed ? 'opacity-0 pointer-events-none scale-0' : 'opacity-100 scale-100'
        }`}
        title="หุบ sidebar"
      >
        <HiChevronLeft className='text-gray-700 text-base' />
      </button>

      {/* Expand Button (shown when collapsed) */}
      <button
        onClick={toggleSidebar}
        className={`absolute -right-3 top-8 bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-gray-400 rounded-full p-2 z-30 shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out flex items-center justify-center ${
          isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 pointer-events-none scale-0'
        }`}
        title="ขยาย sidebar"
      >
        <HiChevronRight className='text-gray-700 text-base' />
      </button>

      {/* Logo */}
      <div 
        className={`flex items-center gap-2 mb-6 pb-6 border-b border-gray-300 cursor-pointer hover:opacity-80 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'opacity-100 justify-center' : 'opacity-100'
        }`}
        onClick={() => navigate(isAdminDev ? '/dev' : '/homepage')}
      >
        <img src={logoSrc} alt="logo" className='w-10 h-10 rounded-full object-cover flex-shrink-0' />
        {!isCollapsed && (
          <span className='text-orange-500 font-bold text-lg leading-tight'>
            <span className='block'>{brandLine1}</span>
            {brandLine2 ? <span className='block'>{brandLine2}</span> : null}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-6 flex-1 min-h-0 transition-all duration-300 ease-in-out opacity-100">
        {/* Fixed Navigation Items */}
        <div className='flex flex-col gap-6 flex-shrink-0'>
          {canSeeDashboard && (
            <div 
              onClick={() => navigate('/dashboard')}
              className={`nav-item ${isActive('/dashboard') ? 'nav-item-active' : 'nav-item-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2 ${isCollapsed ? 'justify-center' : ''}`}
            >
              <HiViewGrid className='text-xl flex-shrink-0' />
              {!isCollapsed && <span>Dashboard</span>}
            </div>
          )}
          {canSeeManual && (
            <div 
              onClick={() => navigate('/homepage')}
              className={`nav-item ${isActive('/homepage') ? 'nav-item-active' : 'nav-item-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2 ${isCollapsed ? 'justify-center' : ''}`}
            >
              <HiHome className='text-xl flex-shrink-0' />
              {!isCollapsed && <span>Manual</span>}
            </div>
          )}
          {canSeeBots && (
            <div 
              onClick={() => navigate('/bots')}
              className={`nav-item ${location.pathname === '/bots' || location.pathname.startsWith('/bots/') ? 'nav-item-bots-active' : 'nav-item-bots-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2 ${isCollapsed ? 'justify-center' : ''}`}
            >
              <HiDesktopComputer className='text-xl flex-shrink-0' />
              {!isCollapsed && <span>Bots</span>}
            </div>
          )}
          {canSeeKnowledge && (
            <div 
              onClick={() => navigate('/knowledge')}
              className={`nav-item ${location.pathname === '/knowledge' || location.pathname.startsWith('/knowledge/') ? 'nav-item-knowledge-active' : 'nav-item-knowledge-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2 ${isCollapsed ? 'justify-center' : ''}`}
            >
              <HiBookOpen className='text-xl flex-shrink-0' />
              {!isCollapsed && <span>Knowledge</span>}
            </div>
          )}
          {canSeeUserBots && (
            <div
              onClick={() => navigate('/user-bots')}
              className={`nav-item ${isActive('/user-bots') ? 'nav-item-bots-active' : 'nav-item-bots-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2 ${isCollapsed ? 'justify-center' : ''}`}
              title="User Bots"
            >
              <HiUsers className="text-xl flex-shrink-0" />
              {!isCollapsed && <span>User Bots</span>}
            </div>
          )}
          {canSeeSupportPanel && (
            <div 
              onClick={() => navigate('/support-panel')}
              className={`nav-item ${isActive('/support-panel') || location.pathname.includes('/support-panel') ? 'nav-item-integration-active' : 'nav-item-integration-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2 ${isCollapsed ? 'justify-center' : ''}`}
            >
              <HiSupport className='text-xl flex-shrink-0' />
              {!isCollapsed && <span>Support Panel</span>}
            </div>
          )}
          {canSeeFeedback && (
            <div
              onClick={() => navigate('/feedback')}
              className={`nav-item ${isActive('/feedback') ? 'nav-item-active' : 'nav-item-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2 ${isCollapsed ? 'justify-center' : ''}`}
            >
              <HiThumbUp className="text-xl flex-shrink-0" />
              {!isCollapsed && <span>Feedback</span>}
            </div>
          )}
          {canSeeSystem && (
            <div
              onClick={() => navigate('/system')}
              className={`nav-item ${isActive('/system') || location.pathname.startsWith('/system') ? 'nav-item-active' : 'nav-item-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2 ${isCollapsed ? 'justify-center' : ''}`}
            >
              <HiCog className='text-xl flex-shrink-0' />
              {!isCollapsed && <span>System</span>}
            </div>
          )}
          {canSeeLogs && (
            <div
              onClick={() => navigate('/logs')}
              className={`nav-item ${isActive('/logs') ? 'nav-item-active' : 'nav-item-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2 ${isCollapsed ? 'justify-center' : ''}`}
            >
              <HiClipboardList className="text-xl flex-shrink-0" />
              {!isCollapsed && <span>Logs</span>}
            </div>
          )}
        </div>
      </nav>

      {/* Profile */}
      <div 
        className={`flex items-center gap-3 pt-4 border-t border-gray-300 cursor-pointer hover:bg-gray-100 rounded-lg p-2 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'opacity-100 justify-center' : 'opacity-100'
        }`}
        onClick={() => setIsProfileModalOpen(true)}
      >
        <div className='w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0 text-xl overflow-hidden'>
          {AVATAR_SRC_BY_KEY[selectedAvatar] ? (
            <img
              src={AVATAR_SRC_BY_KEY[selectedAvatar]}
              alt="avatar"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className='text-gray-700 font-medium'>{profileInitial}</span>
          )}
        </div>
        {!isCollapsed && <span className='text-gray-700 whitespace-nowrap'>Profile</span>}
      </div>

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onManageAccount={handleManageAccount}
        onSignOut={handleSignOut}
        selectedAvatar={selectedAvatar}
        profileInitial={profileInitial}
      />
    </aside>

    <AccountModal
      isOpen={isAccountModalOpen}
      onClose={() => setIsAccountModalOpen(false)}
      onProfileUpdated={applyProfile}
    />
    </>
  );
}

export default Navbar;
