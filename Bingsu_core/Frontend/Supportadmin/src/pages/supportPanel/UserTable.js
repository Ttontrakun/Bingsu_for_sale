import {
  HiFilter,
  HiChevronDown,
  HiCalendar,
  HiOutlineKey,
  HiOutlineClock,
  HiTrash,
} from 'react-icons/hi';
import {
  isEnabledFlag,
  formatDisplayDate,
  isExpiryExpiredOrSoon,
  isExpiryToday,
  badgeRoleKey,
  getRoleBadgeSurfaceClasses,
  getRoleBadgeInteractionClasses,
  ROLE_OPTIONS,
  EXPIRY_OPTIONS,
} from './helpers';

export default function UserTable({
  tableScrollRef,
  filterRef,
  expiryFilterRef,
  actionMenuRef,
  showRoleFilter,
  setShowRoleFilter,
  roleFilters,
  setRoleFilters,
  handleRoleFilterToggle,
  showExpiryFilter,
  setShowExpiryFilter,
  expiryFilters,
  setExpiryFilters,
  handleExpiryFilterToggle,
  paginatedUsers,
  highlightedUserId,
  setHighlightedUserId,
  roleBadgeClickable,
  handleRoleClick,
  requestToggleStatus,
  getSessionRole,
  canDeleteUserFromSupport,
  openActionMenuUserId,
  setOpenActionMenuUserId,
  handleOpenPasswordModal,
  handleOpenExtendModal,
  handleDeleteUser,
  currentPage,
  setCurrentPage,
  totalPages,
  searchQuery = '',
}) {
  const roleOptions = ROLE_OPTIONS;
  const expiryOptions = EXPIRY_OPTIONS;
  const hasActiveFilter =
    Boolean(String(searchQuery).trim()) || roleFilters.length > 0 || expiryFilters.length > 0;

  return (
    <>
      {/* Users Table — เลื่อนเฉพาะส่วนนี้ */}
      <div ref={tableScrollRef} className="flex-1 min-h-0 overflow-auto bg-white rounded-lg border border-gray-100">
        <table className="w-full table-fixed divide-y divide-gray-200">
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="bg-white border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600 bg-white">
                <div className="flex items-center space-x-2 relative" ref={filterRef}>
                  <span>บทบาท</span>
                  <button
                    onClick={() => setShowRoleFilter(!showRoleFilter)}
                    className="text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <HiFilter className="w-4 h-4" />
                  </button>
                  {roleFilters.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                      {roleFilters.length}
                    </span>
                  )}
                  {showRoleFilter && (
                    <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-[50] w-48">
                      <div className="p-3 space-y-2">
                        {roleOptions.map((option) => (
                          <label
                            key={option.type}
                            className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={roleFilters.includes(option.type)}
                              onChange={() => handleRoleFilterToggle(option.type)}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className={`inline-block w-3 h-3 rounded ${option.color}`}></span>
                            <span className="text-sm text-gray-700">{option.label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="border-t border-gray-200 p-2">
                        <button
                          onClick={() => setRoleFilters([])}
                          className="w-full text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 py-1 rounded"
                        >
                          ล้างทั้งหมด
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </th>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600 bg-white">ชื่อ</th>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600 bg-white">อีเมล</th>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600 bg-white">
                <span className="block">ใช้งานล่าสุด</span>
              </th>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600 bg-white">สร้างเมื่อ</th>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600 bg-white">
                <div className="flex items-center space-x-2 relative" ref={expiryFilterRef}>
                  <span>วันหมดอายุ</span>
                  <button
                    onClick={() => setShowExpiryFilter(!showExpiryFilter)}
                    className="text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <HiFilter className="w-4 h-4" />
                  </button>
                  {expiryFilters.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                      {expiryFilters.length}
                    </span>
                  )}
                  {showExpiryFilter && (
                    <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-[50] w-52">
                      <div className="p-3 space-y-2">
                        {expiryOptions.map((option) => (
                          <label
                            key={option.type}
                            className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={expiryFilters.includes(option.type)}
                              onChange={() => handleExpiryFilterToggle(option.type)}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">{option.label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="border-t border-gray-200 p-2">
                        <button
                          onClick={() => setExpiryFilters([])}
                          className="w-full text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 py-1 rounded"
                        >
                          ล้างทั้งหมด
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </th>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600 bg-white">สถานะ</th>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600 bg-white">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedUsers.map((user) => (
              <tr
                key={user.id}
                onClick={() => highlightedUserId && setHighlightedUserId(null)}
                className={`hover:bg-gray-50 transition-colors ${
                  highlightedUserId === user.id
                    ? 'bg-red-50 animate-pulse'
                    : user.roleType === 'user' && !isEnabledFlag(user.isEnabled)
                      ? 'opacity-50'
                      : ''
                }`}
              >
                <td className="px-4 py-4">
                  {roleBadgeClickable(user) ? (
                    <button
                      type="button"
                      onClick={(ev) => handleRoleClick(ev, user.id, user.roleType)}
                      className={`${getRoleBadgeSurfaceClasses(badgeRoleKey(user))} ${getRoleBadgeInteractionClasses(true, badgeRoleKey(user))}`}
                      title={
                        user.roleType === 'pending'
                          ? 'คลิกเพื่อยืนยันการให้สิทธิ์'
                          : 'คลิกเพื่อเปลี่ยนบทบาท'
                      }
                      aria-label={
                        user.roleType === 'pending'
                          ? `ยืนยันสิทธิ์ ${user.email || user.username}`
                          : `เปลี่ยนบทบาท ${user.email || user.username}`
                      }
                    >
                      <span>{user.role}</span>
                      {user.roleType === 'pending' ? (
                        <HiChevronDown className="w-4 h-4 opacity-90 shrink-0" aria-hidden />
                      ) : (
                        <HiChevronDown className="w-3.5 h-3.5 opacity-80 shrink-0" aria-hidden />
                      )}
                    </button>
                  ) : (
                    <span
                      className={`${getRoleBadgeSurfaceClasses(badgeRoleKey(user))} ${getRoleBadgeInteractionClasses(false, badgeRoleKey(user))}`}
                    >
                      {user.role}
                    </span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-medium shrink-0 ${user.avatarColor}`}>
                      {user.avatar}
                    </div>
                    <span 
                      onClick={() => highlightedUserId && setHighlightedUserId(null)}
                      className="text-gray-900 truncate"
                      title={user.username}
                    >
                      {user.username}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-gray-600 truncate" title={user.email}>{user.email}</td>
                <td className="px-4 py-4 text-gray-600">
                  {user.roleType !== 'pending' ? (
                    <span className="text-sm text-gray-800 tabular-nums block truncate" title={user.lastActive}>{user.lastActive}</span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                  {user.roleType !== 'pending' ? formatDisplayDate(user.createdAt) : '-'}
                </td>
                <td className={`px-4 py-4 whitespace-nowrap ${
                  user.roleType === 'user' && isExpiryExpiredOrSoon(user.expiresAt) 
                    ? 'text-red-500 font-semibold' 
                    : 'text-gray-600'
                }`}>
                  {user.roleType === 'user' ? (
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{formatDisplayDate(user.expiresAt)}</span>
                      {isExpiryToday(user.expiresAt) ? (
                        <HiCalendar className="w-4 h-4 text-red-500 shrink-0" title="วันหมดอายุวันนี้" />
                      ) : null}
                    </div>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-4">
                  {(user.roleType === 'user' || user.roleType === 'pending') && (
                    <button
                      type="button"
                      onClick={() => user.roleType === 'user' && requestToggleStatus(user.id)}
                      disabled={user.roleType === 'pending' || !['support', 'admin', 'admin_metrics'].includes(getSessionRole())}
                      className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${
                        user.roleType === 'pending'
                          ? 'bg-gray-300'
                          : isEnabledFlag(user.isEnabled)
                            ? 'bg-green-500'
                            : 'bg-gray-300'
                      } ${
                        user.roleType === 'pending' || !['support', 'admin', 'admin_metrics'].includes(getSessionRole())
                          ? 'cursor-not-allowed opacity-70'
                          : ''
                      }`}
                    >
                      <span
                        className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                          user.roleType === 'pending'
                            ? 'translate-x-1'
                            : isEnabledFlag(user.isEnabled)
                              ? 'translate-x-6'
                              : 'translate-x-1'
                        }`}
                      />
                    </button>
                  )}
                </td>
                <td className="px-4 py-4">
                  {(() => {
                    const sessionRole = getSessionRole();
                    const isStaff = ['support', 'admin', 'admin_metrics'].includes(sessionRole);
                    const canRenew = isStaff && user.roleType === 'user';
                    const canEditPassword = sessionRole === 'admin' && user.roleType !== 'pending';
                    const canShowDelete = canDeleteUserFromSupport(user);
                    const hasMenuItems = canRenew || canEditPassword || canShowDelete;
                    const canOpenUserActionMenu = hasMenuItems;
                    const menuOpen = openActionMenuUserId === user.id && canOpenUserActionMenu;
                    return (
                      <div className="relative" ref={openActionMenuUserId === user.id ? actionMenuRef : null}>
                        {!canOpenUserActionMenu ? (
                          <button type="button" disabled className="text-gray-400 cursor-not-allowed">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setOpenActionMenuUserId((prev) => (prev === user.id ? null : user.id))}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                        )}

                        {menuOpen && (
                          <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[110] overflow-hidden">
                            {canEditPassword && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenPasswordModal(user.id)}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2"
                                >
                                  <HiOutlineKey className="w-4 h-4" />
                                  แก้ไขรหัสผ่าน
                                </button>
                              </>
                            )}
                            {canRenew && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenExtendModal(user.id)}
                                  className={`w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2 ${
                                    canEditPassword ? 'border-t border-gray-100' : ''
                                  }`}
                                >
                                  <HiOutlineClock className="w-4 h-4" />
                                  ต่อวันหมดอายุ
                                </button>
                              </>
                            )}
                            {canShowDelete && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(user.id)}
                                className={`w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 inline-flex items-center gap-2 ${
                                  canRenew || canEditPassword ? 'border-t border-gray-100' : ''
                                }`}
                              >
                                <HiTrash className="w-4 h-4" />
                                ลบบัญชี
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </td>
              </tr>
            ))}
            {paginatedUsers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <p className="text-gray-700 text-base mb-1">
                    {hasActiveFilter ? 'ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข' : 'ยังไม่มีผู้ใช้ในระบบ'}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {hasActiveFilter
                      ? 'ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองบทบาท/วันหมดอายุ'
                      : 'เมื่อมีผู้ใช้สมัครเข้ามา จะแสดงที่นี่'}
                  </p>
                  {hasActiveFilter && (roleFilters.length > 0 || expiryFilters.length > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setRoleFilters([]);
                        setExpiryFilters([]);
                      }}
                      className="mt-4 px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-800 text-sm font-semibold transition-colors"
                    >
                      ล้างตัวกรอง
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination — ตรึงล่างสุด ไม่เลื่อนตามตาราง */}
      <div className="shrink-0 flex items-center justify-center gap-2 pt-4 pb-1 border-t border-gray-100 bg-white mt-3">
        <button
          type="button"
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ก่อนหน้า
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => setCurrentPage(page)}
            className={`px-4 py-2 rounded-lg ${
              currentPage === page
                ? 'bg-yellow-400 text-gray-900'
                : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ถัดไป
        </button>
      </div>
    </>
  );
}
