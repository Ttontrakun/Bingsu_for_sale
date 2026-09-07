import {
  HiShieldCheck,
  HiEye,
  HiEyeOff,
  HiSearch,
} from 'react-icons/hi';
import { normalizeDashboardRole } from '../../services/api';
import {
  isEnabledFlag,
  formatShortDate,
  getAssignableRoles,
  ROLE_OPTION_HINTS,
} from './helpers';

export default function SupportPanelModals({
  users,
  showConfirmModal,
  selectedUserId,
  handleCancelApprove,
  handleConfirmApprove,
  showRoleChangeModal,
  roleChangeUserId,
  roleChangeSelection,
  setRoleChangeSelection,
  handleCancelRoleChange,
  handleConfirmRoleChange,
  showPasswordModal,
  showNewPassword,
  setShowNewPassword,
  newPassword,
  setNewPassword,
  confirmNewPassword,
  setConfirmNewPassword,
  showConfirmPassword,
  setShowConfirmPassword,
  passwordError,
  passwordSubmitting,
  setShowPasswordModal,
  setTargetUserId,
  handleConfirmPasswordChange,
  showExtendModal,
  extendDays,
  setExtendDays,
  calculatedExtendedDate,
  setShowExtendModal,
  handleConfirmExtendExpiry,
  showCreateGroupModal,
  handleCloseCreateGroupModal,
  newGroupName,
  setNewGroupName,
  newGroupDescription,
  setNewGroupDescription,
  handleCreateGroup,
  showGroupProfileModal,
  selectedGroup,
  setShowGroupProfileModal,
  groupProfileName,
  setGroupProfileName,
  groupProfileDescription,
  setGroupProfileDescription,
  handleConfirmGroupDescription,
  selectedGroupMembers,
  showEditMembersModal,
  setShowEditMembersModal,
  editMembersSearchQuery,
  setEditMembersSearchQuery,
  orderedSelectableMembers,
  selectedMemberIds,
  handleToggleMemberSelection,
  handleSaveGroupMembers,
  confirmToggleUserId,
  handleCancelToggleStatus,
  toggleTargetUser,
  toggleStatusSubmitting,
  handleConfirmToggleStatus,
  confirmDeleteUserId,
  deleteTargetUser,
  handleCancelDeleteUser,
  deleteUserSubmitting,
  handleConfirmDeleteUser,
  confirmDeleteGroupId,
  deleteTargetGroup,
  handleCancelDeleteGroup,
  handleConfirmDeleteGroup,
}) {
  return (
    <>
      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              ยืนยันการให้สิทธิ์
            </h3>
            <p className="text-gray-600 mb-2">
              ต้องการยืนยันการให้สิทธิ์การใช้งานผู้ใช้นี้หรือไม่?
            </p>
            {(() => {
              const u = users.find((x) => x.id === selectedUserId);
              if (!u?.email) return <div className="mb-6" />;
              return (
                <p className="text-sm text-gray-800 mb-6 break-all">
                  <span className="font-medium text-gray-600">อีเมล: </span>
                  {u.email}
                </p>
              );
            })()}
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancelApprove}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                ไม่
              </button>
              <button
                onClick={handleConfirmApprove}
                className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 transition-colors"
              >
                ใช่
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoleChangeModal &&
        (() => {
          const target = users.find((u) => String(u.id) === String(roleChangeUserId));
          if (!target) return null;
          const options = getAssignableRoles();
          const currentRoleValue =
            target.role === 'ผู้ดูแล' ? 'support' : normalizeDashboardRole(target.roleType);
          const inThree = ['user', 'support', 'admin'].includes(currentRoleValue);
          const unchanged = inThree && roleChangeSelection === currentRoleValue;
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
              role="presentation"
              onClick={handleCancelRoleChange}
            >
              <div
                className="bg-white rounded-2xl max-w-lg w-full shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] border border-slate-200/80 overflow-hidden"
                role="dialog"
                aria-labelledby="role-change-title"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative px-6 pt-7 pb-5 bg-gradient-to-br from-amber-50 via-white to-orange-50/40 border-b border-amber-100/80">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-200/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                  <div className="relative flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/25">
                      <HiShieldCheck className="w-7 h-7" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-800/80 mb-1">
                        จัดการสิทธิ์
                      </p>
                      <h3 id="role-change-title" className="text-xl font-bold text-slate-900 tracking-tight">
                        เลือกบทบาท
                      </h3>
                      <p className="mt-2 text-sm text-slate-600 break-all leading-relaxed">
                        <span className="font-semibold text-slate-700">บัญชี </span>
                        {target.email || target.username || '-'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-6 bg-slate-50/50">
                  <p className="text-sm font-semibold text-slate-700 mb-4">
                    บทบาทที่ใช้ในระบบ (3 แบบ)
                  </p>
                  <div className="grid gap-3 mb-6">
                    {options.map((opt) => {
                      const selected = roleChangeSelection === opt.value;
                      const IconComp = opt.Icon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setRoleChangeSelection(opt.value)}
                          className={`w-full text-left rounded-2xl border-2 px-4 py-3.5 transition-all duration-200 ${
                            selected
                              ? 'border-blue-500 bg-white shadow-md shadow-blue-500/10 ring-4 ring-blue-100'
                              : 'border-slate-200/90 bg-white/90 hover:border-slate-300 hover:shadow-md'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                                selected
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              <IconComp className="w-5 h-5" aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1 pt-0.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-slate-900">{opt.label}</span>
                                <span
                                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                    selected ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                                  }`}
                                  aria-hidden
                                >
                                  {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                                {ROLE_OPTION_HINTS[opt.value] || '—'}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t border-slate-200/80">
                    <button
                      type="button"
                      onClick={handleCancelRoleChange}
                      className="px-5 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmRoleChange}
                      disabled={unchanged}
                      className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold shadow-lg shadow-blue-600/25 hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                      บันทึกบทบาท
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">แก้ไขรหัสผ่าน</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">รหัสผ่านใหม่</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="กรอกรหัสผ่านใหม่"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showNewPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">ยืนยันรหัสผ่านใหม่</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(event) => setConfirmNewPassword(event.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ยืนยันรหัสผ่านใหม่"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showConfirmPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  if (passwordSubmitting) return;
                  setShowPasswordModal(false);
                  setTargetUserId(null);
                }}
                disabled={passwordSubmitting}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmPasswordChange}
                disabled={passwordSubmitting}
                className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 transition-colors"
              >
                {passwordSubmitting ? 'กำลังบันทึก...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExtendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">ต่อวันหมดอายุ</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">เลือกระยะเวลาการต่อ</label>
                <select
                  value={extendDays}
                  onChange={(event) => setExtendDays(event.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="30">30 วัน</option>
                  <option value="60">60 วัน</option>
                  <option value="90">90 วัน</option>
                </select>
              </div>

              <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
                {calculatedExtendedDate
                  ? `วันหมดอายุใหม่: ${formatShortDate(calculatedExtendedDate)}`
                  : 'ไม่พบวันหมดอายุเดิมสำหรับคำนวณ'}
              </div>

              <div className="bg-red-50 rounded-lg px-2 py-1.5">
                <p className="text-sm text-red-600 font-semibold text-center">
                  **เมื่อกดยืนยันแล้วไม่สามารถปรับลดวันหมดอายุได้**
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowExtendModal(false);
                  setTargetUserId(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmExtendExpiry}
                disabled={!calculatedExtendedDate}
                className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateGroupModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[130] px-4"
          onClick={handleCloseCreateGroupModal}
        >
          <div
            className="w-full max-w-2xl bg-gray-300 rounded-3xl p-8 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-5">
              <div>
                <label className="block text-lg font-medium text-gray-900 mb-2">ชื่อกลุ่ม</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  placeholder="ใส่ชื่อกลุ่ม"
                  className="w-full rounded-full px-5 py-3 text-base text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
              </div>

              <div>
                <label className="block text-lg font-medium text-gray-900 mb-2">คำอธิบาย</label>
                <textarea
                  value={newGroupDescription}
                  onChange={(event) => setNewGroupDescription(event.target.value)}
                  placeholder="ใส่คำอธิบาย"
                  rows={5}
                  className="w-full rounded-3xl px-5 py-4 text-base text-gray-900 placeholder-gray-400 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
              </div>

              <div className="flex items-center justify-center pt-2">
                <button
                  onClick={handleCreateGroup}
                  disabled={!newGroupName.trim()}
                  className="px-8 py-3 bg-yellow-400 text-gray-900 rounded-full hover:bg-yellow-500 transition-colors font-semibold text-base shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ยืนยันการสร้างกลุ่ม
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showGroupProfileModal && selectedGroup && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[135] px-4"
          onClick={() => setShowGroupProfileModal(false)}
        >
          <div
            className="w-full max-w-4xl bg-gray-100 rounded-3xl p-8 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-gray-900 mb-6">โปรไฟล์กลุ่ม</h3>

            <div className="mb-5 text-sm font-medium text-gray-900">
              <span className="mr-4">ชื่อ</span>
              <input
                type="text"
                value={groupProfileName}
                onChange={(event) => setGroupProfileName(event.target.value)}
                className="w-full mt-2 rounded-xl border border-gray-400 bg-transparent px-4 py-2 text-base text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                placeholder="ใส่ชื่อกลุ่ม"
              />
            </div>

            <div className="mb-6">
              <p className="text-sm font-medium text-gray-900 mb-2">คำอธิบาย</p>
              <textarea
                value={groupProfileDescription}
                onChange={(event) => setGroupProfileDescription(event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-gray-400 bg-transparent p-4 text-base text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-yellow-400"
                placeholder="ใส่คำอธิบาย"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleConfirmGroupDescription}
                  className="px-4 py-1.5 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 transition-colors text-sm font-medium"
                >
                  บันทึก
                </button>
              </div>
            </div>

            <div className="mb-7">
              <p className="text-sm font-medium text-gray-900 mb-3">สมาชิก</p>
              <div className="grid grid-cols-3 gap-y-4 gap-x-8">
                {selectedGroupMembers.map((member) => (
                  <div key={member.id} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm ${member.avatarColor}`}>
                      {member.avatar}
                    </div>
                    <span className="text-base text-gray-800 truncate">{member.username}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditMembersModal && selectedGroup && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[136] px-4"
          onClick={() => setShowEditMembersModal(false)}
        >
          <div
            className="w-full max-w-5xl bg-gray-100 rounded-3xl p-8 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-gray-900 mb-4">แก้ไขสมาชิก</h3>

            <div className="text-sm font-medium text-gray-900 mb-2">Users</div>
            <div className="relative mb-5 border-b border-gray-400 pb-2">
              <HiSearch className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={editMembersSearchQuery}
                onChange={(event) => setEditMembersSearchQuery(event.target.value)}
                placeholder="Search Bots"
                className="w-full pl-8 pr-2 text-base bg-transparent text-gray-700 placeholder-gray-400 focus:outline-none"
              />
            </div>

            <div className="max-h-[420px] overflow-y-auto pr-2 space-y-3">
              {orderedSelectableMembers.map((user) => {
                const isSelected = selectedMemberIds.includes(user.id);

                return (
                  <label key={user.id} className="flex items-center justify-between px-2 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleMemberSelection(user.id)}
                        className="w-5 h-5 accent-black"
                      />
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm ${user.avatarColor}`}>
                        {user.avatar}
                      </div>
                      <span className="text-base text-gray-800">{user.username}</span>
                    </div>

                    {isSelected && (
                      <span className="px-3 py-1 rounded-lg bg-lime-300 text-gray-900 text-sm font-medium">MEMBER</span>
                    )}
                  </label>
                );
              })}

              {orderedSelectableMembers.length === 0 && (
                <p className="text-base text-gray-500 px-2 py-4">ไม่มีผู้ใช้ที่เลือกได้</p>
              )}
            </div>

            <div className="flex justify-end mt-8">
              <button
                onClick={handleSaveGroupMembers}
                className="px-10 py-2.5 rounded-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-base font-semibold transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmToggleUserId !== null && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-6"
          onClick={handleCancelToggleStatus}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">ยืนยันการเปลี่ยนสถานะ</h3>
            <p className="text-sm text-gray-600 mb-5">
              {isEnabledFlag(toggleTargetUser?.isEnabled)
                ? 'ต้องการปิดการใช้งานบัญชี'
                : 'ต้องการเปิดการใช้งานบัญชี'}{' '}
              <span className="font-medium text-gray-800">
                {toggleTargetUser?.username || toggleTargetUser?.email || ''}
              </span>{' '}
              ใช่หรือไม่?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelToggleStatus}
                disabled={toggleStatusSubmitting}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleStatus}
                disabled={toggleStatusSubmitting}
                className="px-4 py-2 rounded-lg bg-yellow-400 text-gray-900 hover:bg-yellow-500 disabled:opacity-50"
              >
                {toggleStatusSubmitting ? 'กำลังอัปเดต…' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteUserId !== null && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-6">
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">ยืนยันการลบบัญชี</h3>
            <p className="text-sm text-gray-600 mb-5">
              การลบจะลบผู้ใช้และข้อมูลที่เกี่ยวข้องออกจากระบบถาวร ต้องการลบบัญชี{' '}
              <span className="font-medium text-gray-800">{deleteTargetUser?.username || deleteTargetUser?.email || ''}</span>{' '}
              ใช่หรือไม่?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelDeleteUser}
                disabled={deleteUserSubmitting}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                disabled={deleteUserSubmitting}
                className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleteUserSubmitting ? 'กำลังลบ…' : 'ลบบัญชี'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteGroupId !== null && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-6">
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">ยืนยันการลบกลุ่ม</h3>
            <p className="text-sm text-gray-600 mb-5">
              ต้องการลบกลุ่ม {deleteTargetGroup?.name || ''} ใช่ไหม?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelDeleteGroup}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteGroup}
                className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                ลบกลุ่ม
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
