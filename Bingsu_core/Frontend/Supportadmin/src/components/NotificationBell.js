import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiBell } from 'react-icons/hi';

const EXPIRY_ALERT_DAYS = 7;

function parseThaiDate(thaiDateStr) {
  const thaiMonths = {
    'มกราคม': 0, 'กุมภาพันธ์': 1, 'มีนาคม': 2, 'เมษายน': 3,
    'พฤษภาคม': 4, 'มิถุนายน': 5, 'กรกฎาคม': 6, 'สิงหาคม': 7,
    'กันยายน': 8, 'ตุลาคม': 9, 'พฤศจิกายน': 10, 'ธันวาคม': 11
  };

  const parts = thaiDateStr.split(' ');
  const day = parseInt(parts[0], 10);
  const month = thaiMonths[parts[1]];
  const year = parseInt(parts[2], 10) - 543;

  return new Date(year, month, day);
}

function parseDisplayDate(value) {
  if (!value || value === '-') return null;

  if (value.includes('/')) {
    const [day, month, shortYear] = value.split('/').map((part) => parseInt(part, 10));
    const buddhistYear = 2500 + shortYear;
    return new Date(buddhistYear - 543, month - 1, day);
  }

  return parseThaiDate(value);
}

function formatShortDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String((date.getFullYear() + 543) % 100).padStart(2, '0');
  return `${day}/${month}/${year}`;
}

function NotificationBell({ users }) {
  const navigate = useNavigate();
  const popupRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');

  const pendingUsers = useMemo(() => users.filter((user) => user.roleType === 'pending'), [users]);

  const expiringUsers = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return users
      .filter((user) => user.roleType === 'user')
      .map((user) => {
        const expiryDate = parseDisplayDate(user.expiresAt);
        if (!expiryDate || Number.isNaN(expiryDate.getTime())) return null;

        expiryDate.setHours(0, 0, 0, 0);
        const diffTime = expiryDate.getTime() - today.getTime();
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysLeft <= 0 || daysLeft > EXPIRY_ALERT_DAYS) return null;

        return { ...user, daysLeft, expiryDateText: formatShortDate(expiryDate) };
      })
      .filter(Boolean)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [users]);

  const totalNotifications = pendingUsers.length + expiringUsers.length;

  const normalizedSearchQuery = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return keyword;
  }, [searchQuery]);

  const filteredPendingUsers = useMemo(() => {
    if (!normalizedSearchQuery) return pendingUsers;
    return pendingUsers.filter((user) => {
      const email = (user.email || '').toLowerCase();
      return user.username.toLowerCase().includes(normalizedSearchQuery) || email.includes(normalizedSearchQuery);
    });
  }, [normalizedSearchQuery, pendingUsers]);

  const filteredExpiringUsers = useMemo(() => {
    if (!normalizedSearchQuery) return expiringUsers;
    return expiringUsers.filter((user) => {
      const email = (user.email || '').toLowerCase();
      return user.username.toLowerCase().includes(normalizedSearchQuery) || email.includes(normalizedSearchQuery);
    });
  }, [normalizedSearchQuery, expiringUsers]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleBellClick = () => {
    setSearchQuery('');
    setIsOpen((prev) => !prev);
  };

  const handleOpenUser = (userId) => {
    setIsOpen(false);
    navigate('/support-panel', {
      state: {
        focusUserId: userId,
        fromNotification: true
      }
    });
  };

  const tabClassName = (tab) => `px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
    activeTab === tab
      ? 'border-gray-900 text-gray-900'
      : 'border-transparent text-gray-500 hover:text-gray-700'
  }`;

  return (
    <div className="relative" ref={popupRef}>
      <button
        onClick={handleBellClick}
        className="relative text-gray-600 hover:text-gray-900"
        aria-label="Notifications"
      >
        <HiBell className="w-8 h-8" />
        {totalNotifications > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-white">
            {totalNotifications > 99 ? '99+' : totalNotifications}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-10 right-0 w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-[200] overflow-hidden">
          <div className="border-b border-gray-200 px-4 pt-3">
            <div className="flex items-center gap-3">
              <button className={tabClassName('pending')} onClick={() => setActiveTab('pending')}>
                ขอสิทธิ์ ({pendingUsers.length})
              </button>
              <button className={tabClassName('expiring')} onClick={() => setActiveTab('expiring')}>
                ใกล้หมดอายุ ({expiringUsers.length})
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto p-3">
            {(activeTab === 'pending' || activeTab === 'expiring') && (
              <div className="mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="ค้นหาชื่อหรืออีเมล"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {activeTab === 'pending' && (
              filteredPendingUsers.length > 0 ? (
                <div className="space-y-2">
                  {filteredPendingUsers.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleOpenUser(user.id)}
                      className="w-full text-left p-3 rounded-lg hover:bg-yellow-50 border border-transparent hover:border-yellow-300 transition-all cursor-pointer active:scale-95"
                    >
                      <p className="text-sm font-semibold text-gray-900 hover:text-gray-700">{user.username}</p>
                      {user.email ? (
                        <p className="text-xs text-gray-600 mt-0.5 break-all">{user.email}</p>
                      ) : null}
                      <p className="text-xs text-gray-500 mt-1">ขอสิทธิ์การใช้งาน</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-6">
                  {normalizedSearchQuery ? 'ไม่พบผู้ใช้ที่ค้นหา' : 'ไม่มีรายการขอสิทธิ์'}
                </p>
              )
            )}

            {activeTab === 'expiring' && (
              filteredExpiringUsers.length > 0 ? (
                <div className="space-y-2">
                  {filteredExpiringUsers.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleOpenUser(user.id)}
                      className="w-full text-left p-3 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-300 transition-all cursor-pointer active:scale-95"
                    >
                      <p className="text-sm font-semibold text-gray-900 hover:text-gray-700">{user.username}</p>
                      {user.email ? (
                        <p className="text-xs text-gray-600 mt-0.5 break-all">{user.email}</p>
                      ) : null}
                      <p className="text-xs text-red-500 mt-1">เหลืออีก {user.daysLeft} วัน (หมดอายุ {user.expiryDateText})</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-6">
                  {normalizedSearchQuery ? 'ไม่พบผู้ใช้ที่ค้นหา' : 'ไม่มีรายการใกล้หมดอายุ'}
                </p>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
