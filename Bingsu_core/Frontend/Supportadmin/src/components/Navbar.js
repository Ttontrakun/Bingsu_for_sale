import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  HiChevronLeft, 
  HiChevronRight, 
  HiHome, 
  HiDesktopComputer, 
  HiBookOpen, 
  HiSupport,
  HiViewGrid,
  HiClipboardList
} from 'react-icons/hi';
import bingsuLogo from '../assets/images/หน่องบิงไม่มีพื้นละ.png';
import ProfileModal from './ProfileModal';
import AccountModal from './AccountModal';
import { api } from '../services/api';
import avatarMale from '../assets/avatars/user_male.png';
import avatarFemale from '../assets/avatars/user_female.png';

const AVATAR_SRC_BY_KEY = {
  'preset:user_male': avatarMale,
  'preset:user_female': avatarFemale,
};

function Navbar({ onCollapseChange, userRole }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [profileName, setProfileName] = useState('Profile');
  const navigate = useNavigate();
  const location = useLocation();
  const profileInitial = (profileName?.trim()?.charAt(0) || 'P').toUpperCase();

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    if (onCollapseChange) {
      onCollapseChange(newState);
    }
  };

  const isActive = (path) => {
    if (path === '/chat') {
      return location.pathname.startsWith('/chat');
    }
    return location.pathname === path;
  };

  const handleManageAccount = () => {
    setIsAccountModalOpen(true);
  };

  const handleSignOut = () => {
    api.logout();
    navigate('/login');
  };

  const canSeeDashboard = userRole === 'admin' || userRole === 'admin_metrics';
  const canSeeBots = userRole === 'admin' || userRole === 'support';
  const canSeeLogs = userRole === 'admin' || userRole === 'admin_metrics';

  return (
    <>
    <aside className={`bg-gray-200 flex flex-col py-6 transition-all duration-500 ease-in-out relative ${
      isCollapsed ? 'w-0 px-0 overflow-hidden' : 'w-52 px-6 overflow-visible'
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
        className={`fixed left-0 top-8 bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-gray-400 rounded-r-full p-2.5 z-30 shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out ml-0 flex items-center justify-center ${
          isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 pointer-events-none scale-0'
        }`}
        title="ขยาย sidebar"
      >
        <HiChevronRight className='text-gray-700 text-base' />
      </button>

      {/* Logo */}
      <div 
        className={`flex items-center gap-2 mb-6 pb-6 border-b border-gray-300 cursor-pointer hover:opacity-80 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'opacity-0 overflow-hidden' : 'opacity-100'
        }`}
        onClick={() => navigate('/homepage')}
      >
        <img src={bingsuLogo} alt="logo" className='w-10 h-10 rounded-full object-cover flex-shrink-0' />
        <span className='text-orange-500 font-bold text-base leading-tight'>
          <span className='block'>Enterprise AI</span>
          <span className='block'>Chatbot</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className={`flex flex-col gap-6 flex-1 min-h-0 transition-all duration-300 ease-in-out ${
        isCollapsed ? 'opacity-0 overflow-hidden' : 'opacity-100'
      }`}>
        {/* Fixed Navigation Items */}
        <div className='flex flex-col gap-6 flex-shrink-0'>
          {canSeeDashboard && (
            <div 
              onClick={() => navigate('/dashboard')}
              className={`nav-item ${isActive('/dashboard') ? 'nav-item-active' : 'nav-item-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2`}
            >
              <HiViewGrid className='text-xl flex-shrink-0' />
              {!isCollapsed && <span>Dashboard</span>}
            </div>
          )}
          <div 
            onClick={() => navigate('/homepage')}
            className={`nav-item ${isActive('/homepage') ? 'nav-item-active' : 'nav-item-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2`}
          >
            <HiHome className='text-xl flex-shrink-0' />
            {!isCollapsed && <span>Manual</span>}
          </div>
          {canSeeBots && (
            <div 
              onClick={() => navigate('/bots')}
              className={`nav-item ${location.pathname.startsWith('/bots') || location.pathname.startsWith('/create-bot') ? 'nav-item-bots-active' : 'nav-item-bots-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2`}
            >
              <HiDesktopComputer className='text-xl flex-shrink-0' />
              {!isCollapsed && <span>Bots</span>}
            </div>
          )}
          <div 
            onClick={() => navigate('/knowledge')}
            className={`nav-item ${isActive('/knowledge') || location.pathname.includes('/knowledge') ? 'nav-item-knowledge-active' : 'nav-item-knowledge-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2`}
          >
            <HiBookOpen className='text-xl flex-shrink-0' />
            {!isCollapsed && <span>Knowledge</span>}
          </div>
          <div 
            onClick={() => navigate('/support-panel')}
            className={`nav-item ${isActive('/support-panel') || location.pathname.includes('/support-panel') ? 'nav-item-integration-active' : 'nav-item-integration-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2`}
          >
            <HiSupport className='text-xl flex-shrink-0' />
            {!isCollapsed && <span>Support Panel</span>}
          </div>
          {canSeeLogs && (
            <div
              onClick={() => navigate('/logs')}
              className={`nav-item ${isActive('/logs') ? 'nav-item-active' : 'nav-item-inactive'} hover:bg-gray-300 active:bg-gray-400 cursor-pointer rounded-lg transition-colors w-full py-1 px-2`}
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
          isCollapsed ? 'opacity-0 overflow-hidden' : 'opacity-100'
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
      selectedAvatar={selectedAvatar}
      onAvatarChange={setSelectedAvatar}
      profileName={profileName}
      onProfileNameChange={setProfileName}
      profileInitial={profileInitial}
    />
    </>
  );
}

export default Navbar;
