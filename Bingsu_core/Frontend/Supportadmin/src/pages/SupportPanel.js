import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  HiSearch,
  HiFilter,
  HiPlus,
  HiUser,
  HiUserGroup,
  HiCalendar,
  HiEye,
  HiEyeOff,
  HiTrash,
  HiChevronDown,
  HiShieldCheck,
  HiOutlineClock,
  HiOutlineKey,
  HiOutlineUserRemove,
  HiOutlinePencil,
} from 'react-icons/hi';
import { api, mapAdminUserToDisplay, getStoredUser, normalizeDashboardRole } from '../services/api';

const BOT_LIMIT_PER_USER = 3;
const KNOWLEDGE_LIMIT_PER_USER = 5;

function SupportPanel({ users, setUsers, groups, setGroups, onRefreshPending }) {
  const normalizeGroup = (group) => {
    const name = String(group?.name || 'กลุ่ม').trim() || 'กลุ่ม';
    const members = Array.isArray(group?.members) ? group.members.map((id) => String(id)).filter(Boolean) : [];
    return {
      ...group,
      id: String(group?.id || ''),
      roomId: String(group?.roomId || group?.id || ''),
      name,
      description: String(group?.description || ''),
      members,
      memberCount: Number.isFinite(Number(group?.memberCount)) ? Number(group.memberCount) : members.length,
      avatar: (name[0] || 'ก').toUpperCase(),
    };
  };
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
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
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState(null);
  const [targetUserId, setTargetUserId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
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

  const [botCountByUserId, setBotCountByUserId] = useState({});
  const [knowledgeCountByUserId, setKnowledgeCountByUserId] = useState({});

  useEffect(() => {
    let cancelled = false;
    const loadUsageCounts = async () => {
      try {
        const [bots, docs] = await Promise.all([
          api.getAdminBots(),
          api.getAdminDocuments(),
        ]);
        const botCounts = (bots || []).reduce((acc, bot) => {
          const ownerId = bot?.owner?.id;
          if (!ownerId) return acc;
          acc[ownerId] = (acc[ownerId] || 0) + 1;
          return acc;
        }, {});
        const docCounts = (docs || []).reduce((acc, doc) => {
          const ownerId = doc?.owner?.id;
          if (!ownerId) return acc;
          acc[ownerId] = (acc[ownerId] || 0) + 1;
          return acc;
        }, {});
        if (!cancelled) {
          setBotCountByUserId(botCounts);
          setKnowledgeCountByUserId(docCounts);
        }
      } catch {
        if (!cancelled) {
          setBotCountByUserId({});
          setKnowledgeCountByUserId({});
        }
      }
    };
    loadUsageCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleStatus = (userId) => {
    setUsers(users.map(user => 
      user.id === userId ? { ...user, isEnabled: !user.isEnabled } : user
    ));
  };

  /** เลือกได้เฉพาะ 3 บทบาทหลัก (ไม่รวม admin_metrics ใน UI) */
  const getAssignableRoles = () => [
    { value: 'user', label: 'ผู้ใช้งาน', Icon: HiUser },
    { value: 'support', label: 'ผู้ดูแล', Icon: HiUserGroup },
    { value: 'admin', label: 'แอดมิน', Icon: HiShieldCheck },
  ];

  /** บทบาทจริงจาก session (login) — ไม่ใช่ค่า "Support/Admin" ใน Profile ที่ใช้สลับมุมมองรายการ */
  const getSessionRole = () => getStoredUser()?.role || '';

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
      alert(err?.message || 'เปลี่ยนบทบาทไม่สำเร็จ');
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

  const roleOptions = [
    { type: 'pending', label: 'รอดำเนินการ', color: 'bg-gray-200' },
    { type: 'user', label: 'ผู้ใช้งาน', color: 'bg-yellow-400' },
    { type: 'support', label: 'ผู้ดูแล', color: 'bg-blue-500' },
    { type: 'admin_metrics', label: 'แอดมิน (รายงาน)', color: 'bg-emerald-600' },
    { type: 'admin', label: 'แอดมิน', color: 'bg-green-400' },
  ];

  const expiryOptions = useMemo(() => [
    { type: '1-7', label: '1-7 วัน', min: 1, max: 7 },
    { type: '8-30', label: '8-30 วัน', min: 8, max: 30 },
    { type: '30+', label: 'มากกว่า 30 วัน', min: 31, max: Infinity },
    { type: 'expired', label: 'หมดอายุแล้ว', min: -Infinity, max: 0 }
  ], []);

  const parseThaiDate = useCallback((thaiDateStr) => {
    const thaiMonths = {
      'มกราคม': 0, 'กุมภาพันธ์': 1, 'มีนาคม': 2, 'เมษายน': 3,
      'พฤษภาคม': 4, 'มิถุนายน': 5, 'กรกฎาคม': 6, 'สิงหาคม': 7,
      'กันยายน': 8, 'ตุลาคม': 9, 'พฤศจิกายน': 10, 'ธันวาคม': 11
    };
    const parts = thaiDateStr.split(' ');
    const day = parseInt(parts[0]);
    const month = thaiMonths[parts[1]];
    const year = parseInt(parts[2]) - 543; // Convert Buddhist year to Christian year
    return new Date(year, month, day);
  }, []);

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

    setActiveTab('overview');
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
  }, [location.pathname, location.state, navigate, users, parseThaiDate]);

  const parseDisplayDateToDate = useCallback((value) => {
    if (!value || value === '-') return null;

    if (value.includes('/')) {
      const [day, month, shortYear] = value.split('/').map((part) => parseInt(part, 10));
      const buddhistYear = 2500 + shortYear;
      return new Date(buddhistYear - 543, month - 1, day);
    }

    return parseThaiDate(value);
  }, [parseThaiDate]);

  const formatShortDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String((date.getFullYear() + 543) % 100).padStart(2, '0');
    return `${day}/${month}/${year}`;
  };

  const formatThaiDate = (date) => {
    const thaiMonths = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
      'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
      'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const day = date.getDate();
    const month = thaiMonths[date.getMonth()];
    const year = date.getFullYear() + 543;
    return `${day} ${month} ${year}`;
  };

  const formatDisplayDate = (value) => {
    if (!value || value === '-') return '-';
    if (value.includes('/')) return value;
    return formatShortDate(parseThaiDate(value));
  };

  const getDaysUntilExpiry = useCallback((expiresAtValue) => {
    if (!expiresAtValue || expiresAtValue === '-') return null;
    const expiryDate = parseDisplayDateToDate(expiresAtValue);
    if (!expiryDate || Number.isNaN(expiryDate.getTime())) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);
    
    const diffTime = expiryDate.getTime() - today.getTime();
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return daysLeft;
  }, [parseDisplayDateToDate]);

  const isExpiryExpiredOrSoon = (expiresAtValue) => {
    const daysLeft = getDaysUntilExpiry(expiresAtValue);
    return daysLeft !== null && daysLeft <= 7;
  };

  const isExpiryToday = useCallback((expiresAtValue) => {
    const d = parseDisplayDateToDate(expiresAtValue);
    if (!d || Number.isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  }, [parseDisplayDateToDate]);

  const targetUser = useMemo(
    () => users.find((user) => user.id === targetUserId) || null,
    [users, targetUserId]
  );

  const deleteTargetUser = useMemo(
    () => users.find((user) => String(user.id) === String(confirmDeleteUserId)) || null,
    [users, confirmDeleteUserId]
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
  const badgeRoleKey = (user) => {
    if (user?.role === 'ผู้ดูแล') return 'support';
    return normalizeDashboardRole(user?.roleType);
  };

  /** สไตล์ป้ายบทบาท — ปุ่มกดได้ดูเป็นมืออาชีพ (ขอบ เงา โฟกัส) */
  const getRoleBadgeSurfaceClasses = (roleKey) => {
    const shell =
      'inline-flex items-center gap-1 rounded-full text-sm font-semibold tracking-tight px-3.5 py-1.5 border shadow-sm transition-all duration-200';
    switch (roleKey) {
      case 'pending':
        return `${shell} bg-gray-200 text-gray-600 border-gray-300/90`;
      case 'user':
        return `${shell} bg-yellow-400 text-gray-900 border-yellow-500/50`;
      case 'support':
        return `${shell} bg-blue-600 text-white border-blue-800/25`;
      case 'admin_metrics':
        return `${shell} bg-emerald-600 text-white border-emerald-800/30`;
      case 'admin':
        return `${shell} bg-green-600 text-white border-green-800/30`;
      default:
        return `${shell} bg-slate-500 text-white border-slate-600/40`;
    }
  };

  const getRoleBadgeInteractionClasses = (clickable, roleKey) =>
    clickable
      ? `cursor-pointer hover:shadow-md hover:-translate-y-px active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
          roleKey === 'user'
            ? 'hover:bg-yellow-500 focus-visible:ring-yellow-400'
            : roleKey === 'pending'
              ? 'hover:bg-gray-300 focus-visible:ring-gray-400'
              : 'focus-visible:ring-amber-400'
        }`
      : '';

  const ROLE_OPTION_HINTS = {
    user: 'ล็อกอินใช้งานบอทและคลังความรู้ในฐานะลูกค้า',
    support: 'ช่วยดูแลลูกค้า อนุมัติบัญชี และใช้แอป Support Admin',
    admin: 'จัดการระบบเต็มรูปแบบ รวมเปลี่ยนบทบาทและลบบัญชี',
  };

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
            const option = expiryOptions.find(opt => opt.type === filterType);
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
  }, [users, searchQuery, roleFilters, expiryFilters, expiryOptions, getDaysUntilExpiry, parseDisplayDateToDate, parseThaiDate]);

  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredUsers.slice(startIndex, endIndex);
  }, [filteredUsers, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);

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
    setTargetUserId(userId);
    setExtendDays('30');
    setOpenActionMenuUserId(null);
    setShowPasswordModal(false);
    setShowExtendModal(true);
  };

  const handleConfirmPasswordChange = () => {
    if (!newPassword || !confirmNewPassword) {
      setPasswordError('กรุณากรอกรหัสผ่านให้ครบทั้งสองช่อง');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setPasswordError('');
    setShowPasswordModal(false);
    setTargetUserId(null);
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
        alert(err?.message || 'ต่อวันหมดอายุไม่สำเร็จ');
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
      alert('ไม่สามารถลบบัญชีของตัวเองได้');
      return;
    }
    setDeleteUserSubmitting(true);
    try {
      await api.deleteAdminUser(confirmDeleteUserId);
      setUsers((prev) => prev.filter((user) => String(user.id) !== String(confirmDeleteUserId)));
      setConfirmDeleteUserId(null);
      if (typeof onRefreshPending === 'function') onRefreshPending();
    } catch (err) {
      alert(err?.message || 'ลบผู้ใช้ไม่สำเร็จ');
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
    if (confirmDeleteGroupId === null) return;
    try {
      await api.deleteAdminGroup(confirmDeleteGroupId);
      setGroups((prev) => prev.filter((group) => String(group.id) !== String(confirmDeleteGroupId)));
      setConfirmDeleteGroupId(null);
    } catch (err) {
      alert(err?.message || 'ลบกลุ่มไม่สำเร็จ');
    }
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
    const trimmedGroupName = newGroupName.trim();
    const trimmedGroupDescription = newGroupDescription.trim();

    if (!trimmedGroupName) {
      return;
    }
    try {
      const created = await api.createAdminGroup({ name: trimmedGroupName, description: trimmedGroupDescription, memberIds: [] });
      setGroups((prevGroups) => [normalizeGroup(created), ...prevGroups]);
      setShowCreateGroupModal(false);
    } catch (err) {
      alert(err?.message || 'สร้างกลุ่มไม่สำเร็จ');
    }
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
    if (!selectedGroupId) return;

    const trimmedName = groupProfileName.trim();
    try {
      const updated = await api.updateAdminGroup(selectedGroupId, {
        name: trimmedName || selectedGroup?.name || 'กลุ่ม',
        description: groupProfileDescription.trim(),
      });
      const normalized = normalizeGroup(updated);
      setGroups((previousGroups) =>
        previousGroups.map((group) =>
          String(group.id) === String(selectedGroupId) ? normalized : group
        )
      );
    } catch (err) {
      alert(err?.message || 'บันทึกข้อมูลกลุ่มไม่สำเร็จ');
    }
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
    if (!selectedGroupId) return;
    try {
      const updated = await api.updateAdminGroupMembers(selectedGroupId, selectedMemberIds);
      const normalized = normalizeGroup(updated);
      setGroups((previousGroups) =>
        previousGroups.map((group) =>
          String(group.id) === String(selectedGroupId) ? normalized : group
        )
      );
      setShowEditMembersModal(false);
    } catch (err) {
      alert(err?.message || 'บันทึกสมาชิกกลุ่มไม่สำเร็จ');
    }
  };

  return (
    <div className="w-full px-8 py-8">
      {/* Header with Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center space-x-2 pb-2 border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400'
            }`}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
            </svg>
            <span className="font-medium">Overview</span>
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex items-center space-x-2 pb-2 border-b-2 transition-colors ${
              activeTab === 'groups'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400'
            }`}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
            <span className="font-medium">Groups</span>
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        // Overview Tab Content
        <>
          {/* User Count */}
          <div className="mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">User <span className="font-normal">{filteredUsers.length}</span></h2>
          </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
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

      {/* Users Table */}
      <div className="bg-white rounded-lg overflow-visible">
        <div className="overflow-visible">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-white border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600">
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
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600">ชื่อ</th>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600">อีเมล</th>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600">Bot</th>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600">Knowledge</th>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600">
                <span className="block">ใช้งานล่าสุด</span>
              </th>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600">สร้างเมื่อ</th>
              <th className="px-4 py-3 text-left text-sm font-normal text-gray-600">
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
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3"></th>
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
                    : user.roleType === 'user' && !user.isEnabled
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
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-medium ${user.avatarColor}`}>
                      {user.avatar}
                    </div>
                    <span 
                      onClick={() => highlightedUserId && setHighlightedUserId(null)}
                      className="text-gray-900"
                    >
                      {user.username}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-gray-600">{user.email}</td>
                <td className="px-4 py-4 text-gray-600">
                  {user.roleType === 'user' ? `${botCountByUserId[user.id] || 0}/${BOT_LIMIT_PER_USER}` : '-'}
                </td>
                <td className="px-4 py-4 text-gray-600">
                  {user.roleType === 'user' ? `${knowledgeCountByUserId[user.id] || 0}/${KNOWLEDGE_LIMIT_PER_USER}` : '-'}
                </td>
                <td className="px-4 py-4 text-gray-600">
                  {user.roleType !== 'pending' ? (
                    <span className="text-sm text-gray-800 tabular-nums">{user.lastActive}</span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-4 text-gray-600">
                  {user.roleType !== 'pending' ? formatDisplayDate(user.createdAt) : '-'}
                </td>
                <td className={`px-4 py-4 ${
                  user.roleType === 'user' && isExpiryExpiredOrSoon(user.expiresAt) 
                    ? 'text-red-500 font-semibold' 
                    : 'text-gray-600'
                }`}>
                  {user.roleType === 'user' ? (
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{formatDisplayDate(user.expiresAt)}</span>
                      {isExpiryToday(user.expiresAt) ? (
                        <HiCalendar className="w-4 h-4 text-red-500" title="วันหมดอายุวันนี้" />
                      ) : null}
                    </div>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-4">
                  {(user.roleType === 'user' || user.roleType === 'pending') && (
                    <button
                      onClick={() => user.roleType === 'user' && handleToggleStatus(user.id)}
                      disabled={user.roleType === 'pending'}
                      className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${
                        user.roleType === 'pending'
                          ? 'bg-gray-300 cursor-not-allowed'
                          : user.isEnabled
                            ? 'bg-green-500'
                            : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                          user.roleType === 'pending'
                            ? 'translate-x-1'
                            : user.isEnabled
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
                    const isFullAdmin = sessionRole === 'admin';
                    const me = getStoredUser();
                    const canShowDelete = isFullAdmin && String(user.id) !== String(me?.id ?? '');
                    const hasMenuItems = user.roleType !== 'pending' || canShowDelete;
                    const canOpenUserActionMenu =
                      (isFullAdmin && hasMenuItems) ||
                      (['support', 'admin_metrics'].includes(sessionRole) &&
                        user.roleType !== 'pending' &&
                        user.isEnabled);
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
                            {user.roleType !== 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenPasswordModal(user.id)}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2"
                                >
                                  <HiOutlineKey className="w-4 h-4" />
                                  แก้ไขรหัสผ่าน
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenExtendModal(user.id)}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 inline-flex items-center gap-2"
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
                                  user.roleType !== 'pending' ? 'border-t border-gray-100' : ''
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
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center space-x-2 mt-6">
        <button
          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ก่อนหน้า
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
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
          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ถัดไป
        </button>
      </div>
        </>
      ) : (
        // Groups Tab Content
        <>
          {/* Group Count and Search */}
          <div className="mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">Group <span className="font-normal">{groups.length}</span></h2>
          </div>

          {/* Search and Create Button */}
          <div className="flex items-center justify-between mb-6">
            <div className="relative flex-1 mr-4">
              <HiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search Group"
                value={groupSearchQuery}
                onChange={(e) => setGroupSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-700 placeholder-gray-400"
              />
            </div>
            <button
              onClick={handleOpenCreateGroupModal}
              className="flex items-center space-x-2 bg-yellow-400 text-gray-900 px-4 py-2 rounded-lg hover:bg-yellow-500 transition-colors font-medium"
            >
              <span>Create group</span>
              <HiPlus className="w-5 h-5" />
            </button>
          </div>

          {/* Groups Table */}
          <div className="bg-white rounded-lg overflow-visible">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-normal text-gray-600">กลุ่ม</th>
                  <th className="px-4 py-3 text-left text-sm font-normal text-gray-600">คำอธิบาย</th>
                  <th className="px-4 py-3 text-left text-sm font-normal text-gray-600">จำนวนผู้ใช้</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groups
                  .filter(group => group.name.toLowerCase().includes(groupSearchQuery.toLowerCase()))
                  .map((group) => (
                    <tr key={group.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-medium">
                            {group.avatar}
                          </div>
                          <span className="text-gray-900">{group.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-600">{group.description || '-'}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center space-x-2 text-gray-700">
                          <HiUserGroup className="w-5 h-5" />
                          <span>{getGroupMemberCount(group)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="relative" ref={openGroupActionMenuId === group.id ? groupActionMenuRef : null}>
                          <button
                            onClick={() => setOpenGroupActionMenuId((previousId) => (previousId === group.id ? null : group.id))}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>

                          {openGroupActionMenuId === group.id && (
                            <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-[120] overflow-hidden">
                              <button
                                onClick={() => handleOpenGroupProfileModal(group.id)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2"
                              >
                                <HiOutlinePencil className="w-4 h-4" />
                                โปรไฟล์กลุ่ม
                              </button>
                              <button
                                onClick={() => handleOpenEditMembersModal(group.id)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 inline-flex items-center gap-2"
                              >
                                <HiOutlineUserRemove className="w-4 h-4" />
                                แก้ไขสมาชิก
                              </button>
                              {getSessionRole() === 'admin' && (
                                <button
                                  onClick={() => handleDeleteGroup(group.id)}
                                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 border-t border-gray-100 inline-flex items-center gap-2"
                                >
                                  <HiTrash className="w-4 h-4" />
                                  ลบกลุ่ม
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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
                  setShowPasswordModal(false);
                  setTargetUserId(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmPasswordChange}
                className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 transition-colors"
              >
                ยืนยัน
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
            <h3 className="text-3xl font-semibold text-gray-900 mb-6">โปรไฟล์กลุ่ม</h3>

            <div className="mb-5 text-lg text-gray-900">
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
              <p className="text-lg text-gray-900 mb-2">คำอธิบาย</p>
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
              <p className="text-lg text-gray-900 mb-3">สมาชิก</p>
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
            <h3 className="text-3xl font-semibold text-gray-900 mb-4">แก้ไขสมาชิก</h3>

            <div className="text-lg font-medium text-gray-900 mb-2">Users</div>
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
    </div>
  );
}

export default SupportPanel;
