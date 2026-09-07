import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HiSearch, HiSupport, HiRefresh } from 'react-icons/hi';
import { api, mapAdminUserToDisplay, getStoredUser, normalizeDashboardRole } from '../services/api';
import { useAdminSystemConfig } from '../context/AdminSystemConfigContext';
import {
  isEnabledFlag,
  EXPIRY_OPTIONS,
  parseThaiDate,
  parseDisplayDateToDate,
  formatShortDate,
  formatThaiDate,
  getDaysUntilExpiry,
} from './supportPanel/helpers';
import UserTable from './supportPanel/UserTable';
import SupportPanelModals from './supportPanel/SupportPanelModals';
import { useToast } from '../components/Toast';

function SupportPanel({ users, setUsers, groups = [], setGroups = () => {}, onRefreshPending }) {
  const { getCopy, getTextStyle } = useAdminSystemConfig();
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const tableScrollRef = useRef(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [showRoleChangeModal, setShowRoleChangeModal] = useState(false);
  const [roleChangeUserId, setRoleChangeUserId] = useState(null);
  const [roleChangeSelection, setRoleChangeSelection] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [roleFilters, setRoleFilters] = useState([]);
  const [showRoleFilter, setShowRoleFilter] = useState(false);
  const [expiryFilters, setExpiryFilters] = useState([]);
  const [showExpiryFilter, setShowExpiryFilter] = useState(false);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [highlightedUserId, setHighlightedUserId] = useState(null);
  const [openActionMenuUserId, setOpenActionMenuUserId] = useState(null);
  const [openGroupActionMenuId, setOpenGroupActionMenuId] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showGroupProfileModal, setShowGroupProfileModal] = useState(false);
  const [showEditMembersModal, setShowEditMembersModal] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupProfileName, setGroupProfileName] = useState('');
  const [groupProfileDescription, setGroupProfileDescription] = useState('');
  const [editMembersSearchQuery, setEditMembersSearchQuery] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState(null);
  const [deleteUserSubmitting, setDeleteUserSubmitting] = useState(false);
  const [confirmToggleUserId, setConfirmToggleUserId] = useState(null);
  const [toggleStatusSubmitting, setToggleStatusSubmitting] = useState(false);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState(null);
  const [targetUserId, setTargetUserId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [extendDays, setExtendDays] = useState('30');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const filterRef = useRef(null);
  const expiryFilterRef = useRef(null);
  const actionMenuRef = useRef(null);
  const groupActionMenuRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const itemsPerPage = 10;

  const requestToggleStatus = (userId) => {
    const sessionRole = getSessionRole();
    const canToggleStatus = ['support', 'admin', 'admin_metrics'].includes(sessionRole);
    if (!canToggleStatus) {
      toast('คุณไม่มีสิทธิ์เปลี่ยนสถานะผู้ใช้', 'error');
      return;
    }
    const target = users.find((user) => String(user.id) === String(userId));
    if (!target) return;
    setConfirmToggleUserId(userId);
  };

  const handleCancelToggleStatus = () => {
    if (toggleStatusSubmitting) return;
    setConfirmToggleUserId(null);
  };

  const handleConfirmToggleStatus = async () => {
    if (confirmToggleUserId == null) return;
    const sessionRole = getSessionRole();
    const canToggleStatus = ['support', 'admin', 'admin_metrics'].includes(sessionRole);
    if (!canToggleStatus) {
      toast('คุณไม่มีสิทธิ์เปลี่ยนสถานะผู้ใช้', 'error');
      setConfirmToggleUserId(null);
      return;
    }
    const target = users.find((user) => String(user.id) === String(confirmToggleUserId));
    if (!target) {
      setConfirmToggleUserId(null);
      return;
    }
    const nextIsActive = !isEnabledFlag(target.isEnabled);
    setToggleStatusSubmitting(true);
    try {
      const updated = await api.patchAdminUser(confirmToggleUserId, { isActive: nextIsActive });
      const mapped = mapAdminUserToDisplay(updated);
      setUsers((prev) =>
        prev.map((user) =>
          String(user.id) === String(confirmToggleUserId)
            ? { ...user, ...mapped, lastActive: user.lastActive }
            : user
        )
      );
      setConfirmToggleUserId(null);
      if (typeof onRefreshPending === 'function') onRefreshPending();
    } catch (err) {
      toast(err?.message || 'อัปเดตสถานะผู้ใช้ไม่สำเร็จ', 'error');
    } finally {
      setToggleStatusSubmitting(false);
    }
  };

  /** เลือกได้เฉพาะ 3 บทบาทหลัก (ไม่รวม admin_metrics ใน UI) */

  /** บทบาทจริงจาก session (normalize ให้เหลือคีย์มาตรฐานเสมอ) */
  const getSessionRole = () => normalizeDashboardRole(getStoredUser()?.role || '');

  const roleBadgeClickable = (user) => {
    const sessionRole = getSessionRole();
    if (user.roleType === 'pending') {
      return ['admin', 'support', 'admin_metrics'].includes(sessionRole);
    }
    return sessionRole === 'admin';
  };

  const handleRoleClick = (e, userId, roleType) => {
    e.stopPropagation();
    const sessionRole = getSessionRole();
    if (roleType === 'pending') {
      if (!['admin', 'support', 'admin_metrics'].includes(sessionRole)) return;
      setHighlightedUserId(null);
      setSelectedUserId(userId);
      setShowConfirmModal(true);
      return;
    }
    if (sessionRole !== 'admin') return;
    const targetUser = users.find((u) => String(u.id) === String(userId));
    if (!targetUser) return;
    setRoleChangeUserId(userId);
    const initialRole =
      targetUser.role === 'ผู้ดูแล'
        ? 'support'
        : normalizeDashboardRole(targetUser.roleType);
    const threeRoles = ['user', 'support', 'admin'];
    setRoleChangeSelection(threeRoles.includes(initialRole) ? initialRole : 'support');
    setShowRoleChangeModal(true);
  };

  const handleConfirmRoleChange = async () => {
    if (!roleChangeUserId) return;
    const target = users.find((u) => String(u.id) === String(roleChangeUserId));
    const currentApiRole =
      target?.role === 'ผู้ดูแล' ? 'support' : normalizeDashboardRole(target?.roleType);
    if (!target || currentApiRole === roleChangeSelection) {
      setShowRoleChangeModal(false);
      setRoleChangeUserId(null);
      setRoleChangeSelection('');
      return;
    }
    try {
      const updated = await api.patchAdminUser(roleChangeUserId, { role: roleChangeSelection });
      const mapped = mapAdminUserToDisplay(updated);
      setUsers((prev) =>
        prev.map((u) =>
          String(u.id) === String(roleChangeUserId) ? { ...u, ...mapped, lastActive: u.lastActive } : u
        )
      );
      if (typeof onRefreshPending === 'function') onRefreshPending();
    } catch (err) {
      console.error(err);
      toast(err?.message || 'เปลี่ยนบทบาทไม่สำเร็จ', 'error');
    } finally {
      setShowRoleChangeModal(false);
      setRoleChangeUserId(null);
      setRoleChangeSelection('');
    }
  };

  const handleCancelRoleChange = () => {
    setShowRoleChangeModal(false);
    setRoleChangeUserId(null);
    setRoleChangeSelection('');
  };

  const handleConfirmApprove = async () => {
    if (!selectedUserId) return;
    try {
      await api.updatePendingUser(selectedUserId, 'approved');
      if (typeof onRefreshPending === 'function') onRefreshPending();
    } catch {
      setUsers(users.map(user => {
        if (user.id === selectedUserId) {
          const today = new Date();
          const createdAt = formatThaiDate(today);
          const expiryDate = new Date(today);
          expiryDate.setDate(expiryDate.getDate() + 30);
          const expiresAt = formatShortDate(expiryDate);
          return { ...user, role: 'ผู้ใช้งาน', roleType: 'user', createdAt, expiresAt, isEnabled: true };
        }
        return user;
      }));
    }
    setShowConfirmModal(false);
    setSelectedUserId(null);
  };

  const handleCancelApprove = () => {
    setShowConfirmModal(false);
    setSelectedUserId(null);
  };

  const handleRoleFilterToggle = (roleType) => {
    setRoleFilters(prev => 
      prev.includes(roleType)
        ? prev.filter(r => r !== roleType)
        : [...prev, roleType]
    );
  };

  const handleExpiryFilterToggle = (filterType) => {
    setExpiryFilters(prev => 
      prev.includes(filterType)
        ? prev.filter(f => f !== filterType)
        : [...prev, filterType]
    );
  };


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setShowRoleFilter(false);
      }

      if (expiryFilterRef.current && !expiryFilterRef.current.contains(event.target)) {
        setShowExpiryFilter(false);
      }

      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target)) {
        setOpenActionMenuUserId(null);
      }

      if (groupActionMenuRef.current && !groupActionMenuRef.current.contains(event.target)) {
        setOpenGroupActionMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const focusUserId = location.state?.focusUserId;

    if (!focusUserId) {
      return;
    }

    setSearchQuery('');
    setRoleFilters([]);

    const sortedUsers = [...users].sort((a, b) => {
      // Handle pending users (createdAt is '-')
      if (a.createdAt === '-' && b.createdAt === '-') return 0;
      if (a.createdAt === '-') return 1; // Pending users go to end
      if (b.createdAt === '-') return -1;
      
      return parseThaiDate(b.createdAt) - parseThaiDate(a.createdAt);
    });
    const targetIndex = sortedUsers.findIndex((user) => user.id === focusUserId);

    if (targetIndex !== -1) {
      setCurrentPage(Math.floor(targetIndex / itemsPerPage) + 1);
      setHighlightedUserId(focusUserId);
    }

    navigate(location.pathname, { replace: true, state: null });

    const timer = setTimeout(() => {
      setHighlightedUserId(null);
    }, 3500);

    return () => clearTimeout(timer);
  }, [location.pathname, location.state, navigate, users]);


  const targetUser = useMemo(
    () => users.find((user) => user.id === targetUserId) || null,
    [users, targetUserId]
  );

  const deleteTargetUser = useMemo(
    () => users.find((user) => String(user.id) === String(confirmDeleteUserId)) || null,
    [users, confirmDeleteUserId]
  );

  const toggleTargetUser = useMemo(
    () => users.find((user) => String(user.id) === String(confirmToggleUserId)) || null,
    [users, confirmToggleUserId]
  );

  const deleteTargetGroup = useMemo(
    () => groups.find((group) => String(group.id) === String(confirmDeleteGroupId)) || null,
    [groups, confirmDeleteGroupId]
  );

  const calculatedExtendedDate = (() => {
    if (!targetUser) return null;

    const baseDate = parseDisplayDateToDate(targetUser.expiresAt);
    if (!baseDate || Number.isNaN(baseDate.getTime())) return null;

    const updatedDate = new Date(baseDate);
    updatedDate.setDate(updatedDate.getDate() + Number(extendDays));
    return updatedDate;
  })();

  /** ป้ายสี — ถ้าข้อความเป็น "ผู้ดูแล" ให้ถือว่า support (สีน้ำเงิน) แม้ roleType ใน state จะคลาดเคลื่อน */

  const canDeleteUserFromSupport = useCallback((user) => {
    const sessionRole = getSessionRole();
    const me = getStoredUser();
    const roleType = String(user?.roleType || '');
    const isSelf = String(user?.id || '') === String(me?.id || '');
    if (isSelf) return false;
    if (sessionRole === 'admin') return ['user', 'pending'].includes(roleType);
    return ['support', 'admin_metrics'].includes(sessionRole) && roleType === 'pending';
  }, []);

  const filteredUsers = useMemo(() => {
    const filtered = users.filter(user => {
      const matchesSearch = user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           user.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilters.length === 0 || roleFilters.includes(user.roleType);
      
      // Filter by expiry date (exclude pending users from expiry filter)
      let matchesExpiry = true;
      if (expiryFilters.length > 0) {
        // Pending users should not appear in expiry filter
        if (user.roleType === 'pending') {
          matchesExpiry = false;
        } else {
          const daysLeft = getDaysUntilExpiry(user.expiresAt);
          matchesExpiry = expiryFilters.some(filterType => {
            const option = EXPIRY_OPTIONS.find(opt => opt.type === filterType);
            if (!option) return false;
            
            if (daysLeft === null) return false;
            return daysLeft >= option.min && daysLeft <= option.max;
          });
        }
      }
      
      return matchesSearch && matchesRole && matchesExpiry;
    });

    // Sort by expiry date (soonest first) if filter is active
    if (expiryFilters.length > 0) {
      return filtered.sort((a, b) => {
        // Handle users without expiry date (show them last)
        if (!a.expiresAt || a.expiresAt === '-') return 1;
        if (!b.expiresAt || b.expiresAt === '-') return -1;

        const dateA = parseDisplayDateToDate(a.expiresAt);
        const dateB = parseDisplayDateToDate(b.expiresAt);
        
        if (!dateA || !dateB) return 0;
        return dateA - dateB; // Ascending order (expires soonest first)
      });
    }

    // Always sort by creation date (newest first)
    return filtered.sort((a, b) => {
      // Handle users without createdAt (pending)
      if (!a.createdAt || a.createdAt === '-') return 1;
      if (!b.createdAt || b.createdAt === '-') return -1;
      
      const dateA = parseThaiDate(a.createdAt);
      const dateB = parseThaiDate(b.createdAt);
      return dateB - dateA; // Descending order (newest first)
    });
  }, [users, searchQuery, roleFilters, expiryFilters]);

  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredUsers.slice(startIndex, endIndex);
  }, [filteredUsers, currentPage, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / itemsPerPage));

  // เปลี่ยนหน้าแล้วเลื่อนเฉพาะตาราง ไม่ขยับแถบเลขหน้า
  useEffect(() => {
    if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
  }, [currentPage]);

  const userByIdMap = useMemo(() => {
    return users.reduce((accumulator, user) => {
      accumulator[user.id] = user;
      return accumulator;
    }, {});
  }, [users]);

  const groupedUsers = useMemo(() => users.filter((user) => user.roleType === 'user'), [users]);

  const selectedGroup = useMemo(
    () => groups.find((group) => String(group.id) === String(selectedGroupId)) || null,
    [groups, selectedGroupId]
  );

  const selectedGroupMembers = useMemo(() => {
    if (!selectedGroup) return [];
    return (selectedGroup.members || [])
      .map((memberId) => userByIdMap[memberId])
      .filter(Boolean);
  }, [selectedGroup, userByIdMap]);

  const selectableMembers = useMemo(() => {
    if (!selectedGroup) return [];

    const currentGroupMemberIds = new Set(selectedGroup.members || []);
    const memberIdsInOtherGroups = new Set(
      groups
        .filter((group) => String(group.id) !== String(selectedGroup.id))
        .flatMap((group) => group.members || [])
    );

    const normalizedSearch = editMembersSearchQuery.trim().toLowerCase();

    return groupedUsers
      .filter((user) => {
        if (!currentGroupMemberIds.has(user.id) && memberIdsInOtherGroups.has(user.id)) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return (
          user.username.toLowerCase().includes(normalizedSearch) ||
          user.email.toLowerCase().includes(normalizedSearch)
        );
      })
      .sort((firstUser, secondUser) => firstUser.username.localeCompare(secondUser.username, 'th'));
  }, [editMembersSearchQuery, groupedUsers, groups, selectedGroup]);

  const orderedSelectableMembers = useMemo(() => {
    const selectedIds = new Set(selectedMemberIds);

    return [...selectableMembers].sort((firstUser, secondUser) => {
      const firstSelected = selectedIds.has(firstUser.id);
      const secondSelected = selectedIds.has(secondUser.id);

      if (firstSelected !== secondSelected) {
        return firstSelected ? -1 : 1;
      }

      return firstUser.username.localeCompare(secondUser.username, 'th');
    });
  }, [selectableMembers, selectedMemberIds]);

  const getGroupMemberCount = (group) => {
    if (Array.isArray(group.members)) {
      return group.members.length;
    }
    return group.memberCount || 0;
  };

  const handleOpenPasswordModal = (userId) => {
    setTargetUserId(userId);
    setOpenActionMenuUserId(null);
    setShowExtendModal(false);
    setShowPasswordModal(true);
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleOpenExtendModal = (userId) => {
    const sessionRole = getSessionRole();
    if (!['support', 'admin', 'admin_metrics'].includes(sessionRole)) return;
    setTargetUserId(userId);
    setExtendDays('30');
    setOpenActionMenuUserId(null);
    setShowPasswordModal(false);
    setShowExtendModal(true);
  };

  const handleConfirmPasswordChange = async () => {
    if (!newPassword || !confirmNewPassword) {
      setPasswordError('กรุณากรอกรหัสผ่านให้ครบทั้งสองช่อง');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    if (!targetUserId) {
      setPasswordError('ไม่พบบัญชีผู้ใช้ที่ต้องการแก้ไข');
      return;
    }

    setPasswordError('');
    setPasswordSubmitting(true);
    try {
      await api.resetAdminUserPassword(targetUserId, newPassword);
      setShowPasswordModal(false);
      setTargetUserId(null);
      setNewPassword('');
      setConfirmNewPassword('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      toast('รีเซ็ตรหัสผ่านสำเร็จ', 'success');
    } catch (err) {
      setPasswordError(err?.message || 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleConfirmExtendExpiry = () => {
    if (!targetUser || !calculatedExtendedDate) return;

    const extendDaysNum = Number(extendDays) || 30;
    api
      .renewUserExpiry(targetUser.id, extendDaysNum)
      .then((updated) => {
        const mapped = mapAdminUserToDisplay(updated);
        setUsers((prev) =>
          prev.map((u) =>
            String(u.id) === String(targetUser.id) ? { ...u, ...mapped, lastActive: u.lastActive } : u
          )
        );
        if (typeof onRefreshPending === 'function') onRefreshPending();
      })
      .catch((err) => {
        toast(err?.message || 'ต่อวันหมดอายุไม่สำเร็จ', 'error');
      })
      .finally(() => {
        setShowExtendModal(false);
        setTargetUserId(null);
      });
  };

  const handleDeleteUser = (userId) => {
    setConfirmDeleteUserId(userId);
    setOpenActionMenuUserId(null);
  };

  const handleConfirmDeleteUser = async () => {
    if (confirmDeleteUserId === null) return;
    const me = getStoredUser();
    if (String(me?.id ?? '') === String(confirmDeleteUserId)) {
      toast('ไม่สามารถลบบัญชีของตัวเองได้', 'error');
      return;
    }
    setDeleteUserSubmitting(true);
    try {
      await api.deleteSupportUser(confirmDeleteUserId);
      setUsers((prev) => prev.filter((user) => String(user.id) !== String(confirmDeleteUserId)));
      setConfirmDeleteUserId(null);
      if (typeof onRefreshPending === 'function') onRefreshPending();
    } catch (err) {
      toast(err?.message || 'ลบผู้ใช้ไม่สำเร็จ', 'error');
    } finally {
      setDeleteUserSubmitting(false);
    }
  };

  const handleCancelDeleteUser = () => {
    setConfirmDeleteUserId(null);
    setDeleteUserSubmitting(false);
  };

  const handleDeleteGroup = (groupId) => {
    setConfirmDeleteGroupId(groupId);
    setOpenGroupActionMenuId(null);
  };

  const handleConfirmDeleteGroup = async () => {
    setConfirmDeleteGroupId(null);
    toast('ฟีเจอร์กลุ่มถูกปิดแล้ว', 'info');
  };

  const handleCancelDeleteGroup = () => {
    setConfirmDeleteGroupId(null);
  };

  const handleOpenCreateGroupModal = () => {
    setNewGroupName('');
    setNewGroupDescription('');
    setShowCreateGroupModal(true);
  };

  const handleCloseCreateGroupModal = () => {
    setShowCreateGroupModal(false);
  };

  const handleCreateGroup = async () => {
    setShowCreateGroupModal(false);
    toast('ฟีเจอร์กลุ่มถูกปิดแล้ว', 'info');
  };

  const handleOpenGroupProfileModal = (groupId) => {
    const targetGroup = groups.find((group) => String(group.id) === String(groupId));
    if (!targetGroup) return;

    setSelectedGroupId(String(groupId));
    setGroupProfileName(targetGroup.name || '');
    setGroupProfileDescription(targetGroup.description || '');
    setOpenGroupActionMenuId(null);
    setShowGroupProfileModal(true);
  };

  const handleConfirmGroupDescription = async () => {
    toast('ฟีเจอร์กลุ่มถูกปิดแล้ว', 'info');
  };

  const handleOpenEditMembersModal = (groupId) => {
    const targetGroup = groups.find((group) => String(group.id) === String(groupId));
    if (!targetGroup) return;

    setSelectedGroupId(String(groupId));
    setSelectedMemberIds([...(targetGroup.members || [])].map((id) => String(id)));
    setEditMembersSearchQuery('');
    setOpenGroupActionMenuId(null);
    setShowEditMembersModal(true);
  };

  const handleToggleMemberSelection = (userId) => {
    setSelectedMemberIds((previousSelectedMemberIds) => {
      const normalizedUserId = String(userId);
      if (previousSelectedMemberIds.includes(normalizedUserId)) {
        return previousSelectedMemberIds.filter((memberId) => memberId !== normalizedUserId);
      }
      return [...previousSelectedMemberIds, normalizedUserId];
    });
  };

  const handleSaveGroupMembers = async () => {
    setShowEditMembersModal(false);
    toast('ฟีเจอร์กลุ่มถูกปิดแล้ว', 'info');
  };

  return (
    <div className="w-full h-[calc(100vh-7.5rem)] flex flex-col px-0 py-0">
      {/* Header — สไตล์เดียวกับหน้าอื่น */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-[#F5C200] rounded-xl p-3 shadow-lg">
            <HiSupport className="text-white text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800" style={getTextStyle('admin.supportPanel.title')}>
              {getCopy('admin.supportPanel.title', 'Support Panel')}
            </h1>
            <p className="text-sm text-gray-600" style={getTextStyle('admin.supportPanel.subtitle')}>
              {getCopy('admin.supportPanel.subtitle', 'จัดการผู้ใช้และอนุมัติบัญชี')}
            </p>
          </div>
        </div>
        {typeof onRefreshPending === 'function' && (
          <button
            type="button"
            onClick={() => onRefreshPending()}
            className="inline-flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 self-start"
          >
            <HiRefresh />
            รีเฟรช
          </button>
        )}
      </div>

      <div className="mb-3 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-900">
          User <span className="font-normal text-gray-600">{filteredUsers.length}</span>
        </h2>
        <div className="relative max-w-md w-full sm:w-80">
          <HiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search User"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400"
          />
        </div>
      </div>

      <UserTable
        tableScrollRef={tableScrollRef}
        filterRef={filterRef}
        expiryFilterRef={expiryFilterRef}
        actionMenuRef={actionMenuRef}
        showRoleFilter={showRoleFilter}
        setShowRoleFilter={setShowRoleFilter}
        roleFilters={roleFilters}
        setRoleFilters={setRoleFilters}
        handleRoleFilterToggle={handleRoleFilterToggle}
        showExpiryFilter={showExpiryFilter}
        setShowExpiryFilter={setShowExpiryFilter}
        expiryFilters={expiryFilters}
        setExpiryFilters={setExpiryFilters}
        handleExpiryFilterToggle={handleExpiryFilterToggle}
        paginatedUsers={paginatedUsers}
        highlightedUserId={highlightedUserId}
        setHighlightedUserId={setHighlightedUserId}
        roleBadgeClickable={roleBadgeClickable}
        handleRoleClick={handleRoleClick}
        requestToggleStatus={requestToggleStatus}
        getSessionRole={getSessionRole}
        canDeleteUserFromSupport={canDeleteUserFromSupport}
        openActionMenuUserId={openActionMenuUserId}
        setOpenActionMenuUserId={setOpenActionMenuUserId}
        handleOpenPasswordModal={handleOpenPasswordModal}
        handleOpenExtendModal={handleOpenExtendModal}
        handleDeleteUser={handleDeleteUser}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        totalPages={totalPages}
        searchQuery={searchQuery}
      />

      <SupportPanelModals
        users={users}
        showConfirmModal={showConfirmModal}
        selectedUserId={selectedUserId}
        handleCancelApprove={handleCancelApprove}
        handleConfirmApprove={handleConfirmApprove}
        showRoleChangeModal={showRoleChangeModal}
        roleChangeUserId={roleChangeUserId}
        roleChangeSelection={roleChangeSelection}
        setRoleChangeSelection={setRoleChangeSelection}
        handleCancelRoleChange={handleCancelRoleChange}
        handleConfirmRoleChange={handleConfirmRoleChange}
        showPasswordModal={showPasswordModal}
        showNewPassword={showNewPassword}
        setShowNewPassword={setShowNewPassword}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        confirmNewPassword={confirmNewPassword}
        setConfirmNewPassword={setConfirmNewPassword}
        showConfirmPassword={showConfirmPassword}
        setShowConfirmPassword={setShowConfirmPassword}
        passwordError={passwordError}
        passwordSubmitting={passwordSubmitting}
        setShowPasswordModal={setShowPasswordModal}
        setTargetUserId={setTargetUserId}
        handleConfirmPasswordChange={handleConfirmPasswordChange}
        showExtendModal={showExtendModal}
        extendDays={extendDays}
        setExtendDays={setExtendDays}
        calculatedExtendedDate={calculatedExtendedDate}
        setShowExtendModal={setShowExtendModal}
        handleConfirmExtendExpiry={handleConfirmExtendExpiry}
        showCreateGroupModal={showCreateGroupModal}
        handleCloseCreateGroupModal={handleCloseCreateGroupModal}
        newGroupName={newGroupName}
        setNewGroupName={setNewGroupName}
        newGroupDescription={newGroupDescription}
        setNewGroupDescription={setNewGroupDescription}
        handleCreateGroup={handleCreateGroup}
        showGroupProfileModal={showGroupProfileModal}
        selectedGroup={selectedGroup}
        setShowGroupProfileModal={setShowGroupProfileModal}
        groupProfileName={groupProfileName}
        setGroupProfileName={setGroupProfileName}
        groupProfileDescription={groupProfileDescription}
        setGroupProfileDescription={setGroupProfileDescription}
        handleConfirmGroupDescription={handleConfirmGroupDescription}
        selectedGroupMembers={selectedGroupMembers}
        showEditMembersModal={showEditMembersModal}
        setShowEditMembersModal={setShowEditMembersModal}
        editMembersSearchQuery={editMembersSearchQuery}
        setEditMembersSearchQuery={setEditMembersSearchQuery}
        orderedSelectableMembers={orderedSelectableMembers}
        selectedMemberIds={selectedMemberIds}
        handleToggleMemberSelection={handleToggleMemberSelection}
        handleSaveGroupMembers={handleSaveGroupMembers}
        confirmToggleUserId={confirmToggleUserId}
        handleCancelToggleStatus={handleCancelToggleStatus}
        toggleTargetUser={toggleTargetUser}
        toggleStatusSubmitting={toggleStatusSubmitting}
        handleConfirmToggleStatus={handleConfirmToggleStatus}
        confirmDeleteUserId={confirmDeleteUserId}
        deleteTargetUser={deleteTargetUser}
        handleCancelDeleteUser={handleCancelDeleteUser}
        deleteUserSubmitting={deleteUserSubmitting}
        handleConfirmDeleteUser={handleConfirmDeleteUser}
        confirmDeleteGroupId={confirmDeleteGroupId}
        deleteTargetGroup={deleteTargetGroup}
        handleCancelDeleteGroup={handleCancelDeleteGroup}
        handleConfirmDeleteGroup={handleConfirmDeleteGroup}
      />
    </div>
  );
}

export default SupportPanel;
